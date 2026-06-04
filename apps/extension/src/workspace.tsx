import { createRoot } from "react-dom/client";
import { useEffect, useMemo, useRef, useState } from "react";
import { GlobalWorkerOptions, getDocument } from "pdfjs-dist";
import {
  compressPdf,
  type CompressionLevel,
  deletePdfPages,
  extractPdfPages,
  formatFileSize,
  getCanonicalPdfBaseName,
  getCanonicalPdfFilename,
  mergePdfFiles,
  parseSplitRangeInput,
  parsePageRangeInput,
  rotatePdfPages,
  splitPdfByRanges,
  splitPdfEveryNPages,
  splitPdfIntoEqualParts,
  validatePdfFile
} from "../../../packages/pdf-core/src/index";

GlobalWorkerOptions.workerSrc = chrome.runtime.getURL("pdf.worker.mjs");

interface LoadedPdfSummary {
  file: File;
  title: string;
  author: string;
  createdAt: string;
  modifiedAt: string;
  pageCount: number;
}

interface ThumbnailItem {
  pageNumber: number;
  src: string;
  width: number;
  height: number;
}

type LaunchIntent = "idle" | "open" | "merge";

interface OperationProgress {
  name: string;
  percent: number;
}

interface OperationHistoryEntry {
  id: string;
  name: string;
  pages: string;
  timestamp: string;
}

type ExecutableOperation = "Extract" | "Delete" | "Rotate 90°" | "Rotate 180°" | "Rotate 270°";
type SplitMode = "ranges" | "equal-parts" | "every-n-pages";
type ToolMode = "extract" | "delete" | "rotate" | "split" | "compress";
type RotateAngle = 90 | 180 | 270;

type PdfPageReader = {
  getPage(pageNumber: number): Promise<{
    getViewport(options: { scale: number }): { width: number; height: number };
    render(options: { canvasContext: CanvasRenderingContext2D; viewport: { width: number; height: number } }): {
      promise: Promise<void>;
    };
  }>;
};

function formatPdfDate(rawValue: string | undefined): string {
  if (!rawValue) {
    return "Unknown";
  }

  const match = rawValue.match(/^D:(\d{4})(\d{2})?(\d{2})?(\d{2})?(\d{2})?(\d{2})?/);
  if (!match) {
    return rawValue;
  }

  const [, year, month = "01", day = "01", hour = "00", minute = "00", second = "00"] = match;
  const parsed = new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second)
  );

  if (Number.isNaN(parsed.getTime())) {
    return rawValue;
  }

  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(parsed);
}

async function renderThumbnailFromPdf(pdf: PdfPageReader, pageNumber: number): Promise<ThumbnailItem> {
  const page = await pdf.getPage(pageNumber);
  const viewport = page.getViewport({ scale: 1 });
  const scale = 200 / Math.max(viewport.width, viewport.height);
  const scaledViewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Canvas context unavailable.");
  }

  canvas.width = Math.round(scaledViewport.width);
  canvas.height = Math.round(scaledViewport.height);

  await page.render({ canvasContext: context, viewport: scaledViewport }).promise;

  return {
    pageNumber,
    src: canvas.toDataURL("image/png"),
    width: canvas.width,
    height: canvas.height
  };
}

async function renderAllThumbnails(
  file: File,
  pageCount: number,
  onBatchRendered: (items: ThumbnailItem[]) => void,
  password?: string
) {
  const buffer = await file.arrayBuffer();
  const pdf = await getDocument({ data: buffer, password }).promise;
  const batchSize = 8;

  for (let start = 1; start <= pageCount; start += batchSize) {
    const end = Math.min(start + batchSize - 1, pageCount);
    const batchItems = await Promise.all(
      Array.from({ length: end - start + 1 }, (_, index) => renderThumbnailFromPdf(pdf, start + index))
    );
    onBatchRendered(batchItems);
  }
}

async function loadPdfSummary(file: File, password?: string): Promise<LoadedPdfSummary> {
  const buffer = await file.arrayBuffer();
  const documentTask = getDocument({ data: buffer, password });
  const pdf = await documentTask.promise;
  const metadata = await pdf.getMetadata().catch(() => undefined);
  const info = metadata?.info as Record<string, string | undefined> | undefined;

  return {
    file,
    title: info?.Title || file.name,
    author: info?.Author || "Unknown",
    createdAt: formatPdfDate(info?.CreationDate),
    modifiedAt: formatPdfDate(info?.ModDate),
    pageCount: pdf.numPages
  };
}

function isPdfPasswordError(error: unknown): error is { name?: string; code?: number } {
  if (!error || typeof error !== "object") {
    return false;
  }

  const candidate = error as { name?: string; code?: number };
  return candidate.name === "PasswordException" || candidate.code === 1 || candidate.code === 2;
}

function triggerDownload(bytes: Uint8Array, filename: string, mimeType = "application/pdf") {
  const payload = Uint8Array.from(bytes);
  const blob = new Blob([payload], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 0);
}

function WorkspaceApp() {
  const [summary, setSummary] = useState<LoadedPdfSummary | null>(null);
  const [thumbnails, setThumbnails] = useState<ThumbnailItem[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [activePdfPassword, setActivePdfPassword] = useState<string | undefined>(undefined);
  const [rangeInput, setRangeInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [launchIntent, setLaunchIntent] = useState<LaunchIntent>("idle");
  const [launchContext, setLaunchContext] = useState<string | null>(null);
  const [mergeCandidates, setMergeCandidates] = useState<File[]>([]);
  const [selectedPages, setSelectedPages] = useState<number[]>([]);
  const [lastSelectedPage, setLastSelectedPage] = useState<number | null>(null);
  const [previewThumbnail, setPreviewThumbnail] = useState<ThumbnailItem | null>(null);
  const [operationProgress, setOperationProgress] = useState<OperationProgress | null>(null);
  const [operationHistory, setOperationHistory] = useState<OperationHistoryEntry[]>([]);
  const [undoStack, setUndoStack] = useState<File[]>([]);
  const [activeTool, setActiveTool] = useState<ToolMode>("extract");
  const [rotateAngle, setRotateAngle] = useState<RotateAngle>(90);
  const [compressionLevel, setCompressionLevel] = useState<CompressionLevel>("balanced");
  const [splitMode, setSplitMode] = useState<SplitMode>("ranges");
  const [splitValue, setSplitValue] = useState("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const link = document.createElement("link");
    link.rel = "modulepreload";
    link.href = chrome.runtime.getURL("pdf.worker.mjs");
    document.head.append(link);
    return () => {
      link.remove();
    };
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const intent = params.get("intent");

    if (intent === "open") {
      setLaunchIntent("open");
      setLaunchContext(params.get("name") || "PDF selected from popup");
      queueMicrotask(() => {
        fileInputRef.current?.click();
      });
      return;
    }

    if (intent === "merge") {
      setLaunchIntent("merge");
      const count = params.get("count");
      const names = params.get("names");
      setLaunchContext(
        count && names
          ? `Popup selected ${count} PDFs. Re-select them here to begin merge staging: ${names}`
          : "Re-select PDF files here to begin merge staging."
      );
      queueMicrotask(() => {
        fileInputRef.current?.click();
      });
      return;
    }

    setLaunchIntent("idle");
    setLaunchContext(null);
  }, []);

  const parsedRange = useMemo(() => {
    if (!summary) {
      return { valid: true, pages: [], invalidEntries: [] };
    }
    return parsePageRangeInput(rangeInput, summary.pageCount);
  }, [rangeInput, summary]);

  const parsedSplitRanges = useMemo(() => {
    if (!summary || splitMode !== "ranges") {
      return { valid: true, ranges: [], invalidEntries: [] };
    }

    return parseSplitRangeInput(splitValue, summary.pageCount);
  }, [splitMode, splitValue, summary]);

  useEffect(() => {
    if (!previewThumbnail) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setPreviewThumbnail(null);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [previewThumbnail]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement
      ) {
        return;
      }

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        void runUndo();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  });

  const renderedPageNumbers = useMemo(
    () => thumbnails.map((thumbnail) => thumbnail.pageNumber).sort((left, right) => left - right),
    [thumbnails]
  );

  const selectedPageSet = useMemo(() => new Set(selectedPages), [selectedPages]);
  const effectiveTargetPages = useMemo(
    () => (parsedRange.pages.length > 0 ? parsedRange.pages : selectedPages),
    [parsedRange.pages, selectedPages]
  );
  const pageSelectionSource = parsedRange.pages.length > 0 ? "range" : "thumbnails";

  const selectedRangeSummary = useMemo(() => {
    if (selectedPages.length === 0) {
      return "";
    }

    return [...selectedPages].sort((left, right) => left - right).join(", ");
  }, [selectedPages]);

  const targetPageSummary = useMemo(() => {
    if (!summary) {
      return "Load a PDF to target pages.";
    }

    if (effectiveTargetPages.length === 0) {
      return "No pages targeted yet. Select thumbnails or enter a page range.";
    }

    return `${effectiveTargetPages.length} page${effectiveTargetPages.length === 1 ? "" : "s"} targeted from ${pageSelectionSource}: ${effectiveTargetPages.join(", ")}`;
  }, [effectiveTargetPages, pageSelectionSource, summary]);

  const splitSummary = useMemo(() => {
    if (!summary) {
      return "Load a PDF to configure split output.";
    }

    if (!splitValue.trim()) {
      return splitMode === "ranges"
        ? "Enter split ranges like 1-3, 4-6, 7-9."
        : splitMode === "equal-parts"
          ? "Choose how many equal parts to create."
          : "Choose how many pages each split should contain.";
    }

    if (splitMode === "ranges") {
      if (!parsedSplitRanges.valid) {
        return `Invalid split ranges: ${parsedSplitRanges.invalidEntries.join(", ")}`;
      }

      return `${parsedSplitRanges.ranges.length} split group${parsedSplitRanges.ranges.length === 1 ? "" : "s"} configured.`;
    }

    return splitMode === "equal-parts"
      ? `Document will be divided into ${splitValue} parts.`
      : `A new PDF will be created every ${splitValue} pages.`;
  }, [parsedSplitRanges.invalidEntries, parsedSplitRanges.ranges.length, parsedSplitRanges.valid, splitMode, splitValue, summary]);

  const compressionSummary = useMemo(() => {
    if (!summary) {
      return "Load a PDF to prepare compression output.";
    }

    return compressionLevel === "balanced"
      ? "Balanced keeps document fidelity while reducing container overhead."
      : "Maximum rewrites pages into a fresh document for stronger size reduction.";
  }, [compressionLevel, summary]);

  const activeToolTitle =
    activeTool === "extract"
      ? "Extract"
      : activeTool === "delete"
        ? "Delete"
        : activeTool === "rotate"
          ? "Rotate"
          : activeTool === "split"
            ? "Split"
            : "Compress";

  const activeToolDescription =
    activeTool === "extract"
      ? "Create a new PDF from the pages currently targeted."
      : activeTool === "delete"
        ? "Remove the targeted pages and keep the rest of the document."
        : activeTool === "rotate"
          ? "Rotate the targeted pages in place and refresh the working document."
          : activeTool === "split"
            ? "Download a ZIP containing multiple PDFs based on your split settings."
            : "Re-save the PDF with optimized object streams to reduce file size locally.";

  const handleThumbnailSelection = (
    event: React.MouseEvent<HTMLButtonElement>,
    pageNumber: number
  ) => {
    if (event.shiftKey && lastSelectedPage !== null) {
      const start = Math.min(lastSelectedPage, pageNumber);
      const end = Math.max(lastSelectedPage, pageNumber);
      const rangeSelection = renderedPageNumbers.filter((page) => page >= start && page <= end);
      setSelectedPages(rangeSelection);
      return;
    }

    if (event.metaKey || event.ctrlKey) {
      setSelectedPages((current) => {
        const next = new Set(current);
        if (next.has(pageNumber)) {
          next.delete(pageNumber);
        } else {
          next.add(pageNumber);
        }
        return [...next].sort((left, right) => left - right);
      });
      setLastSelectedPage(pageNumber);
      return;
    }

    setSelectedPages([pageNumber]);
    setLastSelectedPage(pageNumber);
  };

  const openPreview = (pageNumber: number) => {
    const thumbnail = thumbnails.find((entry) => entry.pageNumber === pageNumber) || null;
    setPreviewThumbnail(thumbnail);
  };

  const getTargetPages = () => {
    return effectiveTargetPages;
  };

  const runActiveTool = async () => {
    if (activeTool === "split") {
      await runSplit();
      return;
    }

    if (activeTool === "compress") {
      await runCompress();
      return;
    }

    if (activeTool === "extract") {
      await runOperation("Extract");
      return;
    }

    if (activeTool === "delete") {
      await runOperation("Delete");
      return;
    }

    const rotationOperation: Record<RotateAngle, ExecutableOperation> = {
      90: "Rotate 90°",
      180: "Rotate 180°",
      270: "Rotate 270°"
    };

    await runOperation(rotationOperation[rotateAngle]);
  };

  const applyMutatedDocument = async (bytes: Uint8Array, filename: string) => {
    const payload = Uint8Array.from(bytes);
    const nextFile = new File([payload], getCanonicalPdfFilename(filename), { type: "application/pdf" });
    await processFile(nextFile);
  };

  const pushUndoState = (file: File) => {
    setUndoStack((current) => [...current, file].slice(-10));
  };

  const runUndo = async () => {
    const previousFile = undoStack.at(-1);
    if (!previousFile) {
      setNotice("No undoable operations remain.");
      return;
    }

    setUndoStack((current) => current.slice(0, -1));
    setOperationProgress({ name: "Undo", percent: 40 });

    try {
      await processFile(previousFile);
      setOperationProgress({ name: "Undo", percent: 100 });
      setNotice(`Restored ${previousFile.name}.`);
      setOperationHistory((current) => [
        {
          id: `Undo-${Date.now()}`,
          name: "Undo",
          pages: "Previous document state",
          timestamp: new Date().toLocaleTimeString()
        },
        ...current
      ].slice(0, 10));
    } catch (error) {
      console.error("undo_failed", { timestamp: new Date().toISOString(), error });
      setNotice("The previous document state could not be restored.");
    } finally {
      setOperationProgress(null);
    }
  };

  const runOperation = async (name: ExecutableOperation) => {
    if (!summary) {
      setNotice("Load a PDF before running an operation.");
      return;
    }

    if (!parsedRange.valid) {
      setNotice("Fix the invalid page range before running an operation.");
      return;
    }

    const targetPages = getTargetPages();
    if (targetPages.length === 0) {
      setNotice("Select pages or enter a page range before running an operation.");
      return;
    }

    if (name === "Delete" && targetPages.length >= summary.pageCount) {
      setNotice("At least one page must remain in the document.");
      return;
    }

    setOperationProgress({ name, percent: 15 });
    setNotice(null);

    try {
      const baseName = getCanonicalPdfBaseName(summary.file.name);
      setOperationProgress({ name, percent: 45 });

      if (name === "Extract") {
        const result = await extractPdfPages(summary.file, targetPages, { password: activePdfPassword });
        setOperationProgress({ name, percent: 100 });
        triggerDownload(result.bytes, result.filename || `${baseName}-extract.pdf`);
        setNotice(`Extracted ${result.pageCount} pages and started the download.`);
      }

      if (name === "Delete") {
        const confirmed = window.confirm(`Delete pages ${targetPages.join(", ")}?`);
        if (!confirmed) {
          setOperationProgress(null);
          setNotice("Delete operation cancelled.");
          return;
        }

        pushUndoState(summary.file);
        const result = await deletePdfPages(summary.file, targetPages, { password: activePdfPassword });
        setOperationProgress({ name, percent: 100 });
        await applyMutatedDocument(result.bytes, result.filename || `${baseName}-delete.pdf`);
        setNotice(`Deleted ${targetPages.length} pages and refreshed the workspace.`);
      }

      if (name === "Rotate 90°") {
        pushUndoState(summary.file);
        const result = await rotatePdfPages(summary.file, targetPages, 90, { password: activePdfPassword });
        setOperationProgress({ name, percent: 100 });
        await applyMutatedDocument(result.bytes, result.filename || `${baseName}-rotate-90.pdf`);
        setNotice(`Rotated pages ${targetPages.join(", ")} and refreshed the workspace.`);
      }

      if (name === "Rotate 180°") {
        pushUndoState(summary.file);
        const result = await rotatePdfPages(summary.file, targetPages, 180, { password: activePdfPassword });
        setOperationProgress({ name, percent: 100 });
        await applyMutatedDocument(result.bytes, result.filename || `${baseName}-rotate-180.pdf`);
        setNotice(`Rotated pages ${targetPages.join(", ")} and refreshed the workspace.`);
      }

      if (name === "Rotate 270°") {
        pushUndoState(summary.file);
        const result = await rotatePdfPages(summary.file, targetPages, 270, { password: activePdfPassword });
        setOperationProgress({ name, percent: 100 });
        await applyMutatedDocument(result.bytes, result.filename || `${baseName}-rotate-270.pdf`);
        setNotice(`Rotated pages ${targetPages.join(", ")} and refreshed the workspace.`);
      }

      setOperationHistory((current) => [
        {
          id: `${name}-${Date.now()}`,
          name,
          pages: targetPages.join(", "),
          timestamp: new Date().toLocaleTimeString()
        },
        ...current
      ].slice(0, 10));
    } catch (error) {
      console.error("operation_failed", { operation: name, timestamp: new Date().toISOString(), error });
      setNotice(`The ${name.toLowerCase()} operation could not be completed locally.`);
    } finally {
      setOperationProgress(null);
    }
  };

  const processFile = async (file: File) => {
    setLoading(true);
    setNotice(null);

    try {
      const validation = await validatePdfFile(file);
      if (!validation.valid) {
        setNotice(validation.errors.join(" "));
        return;
      }

      if (validation.requiresConfirmation) {
        const confirmed = window.confirm(
          "This file exceeds 200 MB and may impact performance. Continue loading it locally?"
        );
        if (!confirmed) {
          return;
        }
      }

      let resolvedPassword: string | undefined;
      let pdfSummary: LoadedPdfSummary | null = null;

      while (!pdfSummary) {
        try {
          pdfSummary = await loadPdfSummary(file, resolvedPassword);
        } catch (error) {
          if (!isPdfPasswordError(error)) {
            throw error;
          }

          const promptLabel = resolvedPassword
            ? "Incorrect password. Enter the PDF password to continue:"
            : "This PDF is password protected. Enter the password to continue:";
          const enteredPassword = window.prompt(promptLabel, "") ?? null;

          if (enteredPassword === null) {
            setNotice("Password entry cancelled. The PDF was not loaded.");
            return;
          }

          resolvedPassword = enteredPassword;
        }
      }

      setSummary(pdfSummary);
      setActivePdfPassword(resolvedPassword);
      setThumbnails([]);
      setSelectedPages([]);
      setLastSelectedPage(null);
      setPreviewThumbnail(null);

      await renderAllThumbnails(file, pdfSummary.pageCount, (batchItems) => {
        setThumbnails((current) => [...current, ...batchItems]);
      }, resolvedPassword);
    } catch (error) {
      console.error("load_failed", { timestamp: new Date().toISOString(), error });
      setNotice("The selected PDF could not be processed locally. Check that the file is a valid PDF.");
    } finally {
      setLoading(false);
    }
  };

  const handleFiles = async (files: FileList | null) => {
    const selectedFiles = Array.from(files ?? []);

    if (selectedFiles.length === 0) {
      return;
    }

    setLaunchContext(null);

    if (launchIntent === "merge") {
      const totalBytes = selectedFiles.reduce((sum, file) => sum + file.size, 0);
      if (totalBytes > 500 * 1024 * 1024) {
        setNotice("Selected merge files exceed the 500 MB limit. Reduce the selection and try again.");
        return;
      }

      setMergeCandidates(selectedFiles);
      setActivePdfPassword(undefined);
      setSummary(null);
      setThumbnails([]);
      setSelectedPages([]);
      setLastSelectedPage(null);
      setPreviewThumbnail(null);
      setNotice(`Merge staging ready for ${selectedFiles.length} PDFs. Reorder the list if needed, then run Merge and download.`);
      return;
    }

    setMergeCandidates([]);
    setActivePdfPassword(undefined);
    await processFile(selectedFiles[0]);
  };

  const onDrop = async (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    await handleFiles(event.dataTransfer.files);
  };

  const moveMergeCandidate = (index: number, direction: -1 | 1) => {
    setMergeCandidates((current) => {
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= current.length) {
        return current;
      }

      const reordered = [...current];
      const [movedFile] = reordered.splice(index, 1);
      reordered.splice(nextIndex, 0, movedFile);
      return reordered;
    });
  };

  const runMerge = async () => {
    if (mergeCandidates.length < 2) {
      setNotice("Select at least two PDFs before running merge.");
      return;
    }

    setOperationProgress({ name: "Merge", percent: 20 });
    setNotice(null);

    try {
      setOperationProgress({ name: "Merge", percent: 55 });
      const result = await mergePdfFiles(mergeCandidates);
      setOperationProgress({ name: "Merge", percent: 100 });
      triggerDownload(result.bytes, result.filename || "merged.pdf");
      setNotice(`Merged ${mergeCandidates.length} PDFs and started the download.`);
      setOperationHistory((current) => [
        {
          id: `Merge-${Date.now()}`,
          name: "Merge",
          pages: `${mergeCandidates.length} files`,
          timestamp: new Date().toLocaleTimeString()
        },
        ...current
      ].slice(0, 10));
    } catch (error) {
      console.error("operation_failed", { operation: "Merge", timestamp: new Date().toISOString(), error });
      setNotice("The merge operation could not be completed locally.");
    } finally {
      setOperationProgress(null);
    }
  };

  const runSplit = async () => {
    if (!summary) {
      setNotice("Load a PDF before running split.");
      return;
    }

    setOperationProgress({ name: "Split", percent: 20 });
    setNotice(null);

    try {
      let result;

      if (splitMode === "ranges") {
        if (!parsedSplitRanges.valid) {
          setNotice(`Invalid split ranges: ${parsedSplitRanges.invalidEntries.join(", ")}`);
          setOperationProgress(null);
          return;
        }
        setOperationProgress({ name: "Split", percent: 50 });
        result = await splitPdfByRanges(summary.file, splitValue, { password: activePdfPassword });
      } else if (splitMode === "equal-parts") {
        const partCount = Number(splitValue);
        setOperationProgress({ name: "Split", percent: 50 });
        result = await splitPdfIntoEqualParts(summary.file, partCount, { password: activePdfPassword });
      } else {
        const segmentSize = Number(splitValue);
        setOperationProgress({ name: "Split", percent: 50 });
        result = await splitPdfEveryNPages(summary.file, segmentSize, { password: activePdfPassword });
      }

      setOperationProgress({ name: "Split", percent: 100 });
      triggerDownload(result.bytes, result.filename, "application/zip");
      setNotice(`Created ${result.entryCount} split PDFs and started the ZIP download.`);
      setOperationHistory((current) => [
        {
          id: `Split-${Date.now()}`,
          name: "Split",
          pages: splitMode === "ranges" ? splitValue : `${splitMode}: ${splitValue}`,
          timestamp: new Date().toLocaleTimeString()
        },
        ...current
      ].slice(0, 10));
    } catch (error) {
      console.error("operation_failed", { operation: "Split", timestamp: new Date().toISOString(), error });
      setNotice(error instanceof Error ? error.message : "The split operation could not be completed locally.");
    } finally {
      setOperationProgress(null);
    }
  };

  const runCompress = async () => {
    if (!summary) {
      setNotice("Load a PDF before running compression.");
      return;
    }

    setOperationProgress({ name: "Compress", percent: 20 });
    setNotice(null);

    try {
      const originalSize = summary.file.size;
      setOperationProgress({ name: "Compress", percent: 55 });
      const result = await compressPdf(summary.file, compressionLevel, { password: activePdfPassword });
      setOperationProgress({ name: "Compress", percent: 100 });

      const compressedSize = result.bytes.length;
      const savedBytes = Math.max(0, originalSize - compressedSize);
      const percentSaved = originalSize > 0 ? (savedBytes / originalSize) * 100 : 0;

      pushUndoState(summary.file);
      await applyMutatedDocument(result.bytes, result.filename);

      setOperationHistory((current) => [
        {
          id: `Compress-${Date.now()}`,
          name: "Compress",
          pages: `${compressionLevel} (${formatFileSize(originalSize)} -> ${formatFileSize(compressedSize)})`,
          timestamp: new Date().toLocaleTimeString()
        },
        ...current
      ].slice(0, 10));

      setNotice(
        savedBytes > 0
          ? `Compression complete: saved ${formatFileSize(savedBytes)} (${percentSaved.toFixed(1)}%).`
          : "Compression complete. No size reduction was detected for this file."
      );
    } catch (error) {
      console.error("operation_failed", { operation: "Compress", timestamp: new Date().toISOString(), error });
      setNotice("The compression operation could not be completed locally.");
    } finally {
      setOperationProgress(null);
    }
  };

  return (
    <main className="workspace-shell">
      <div className="workspace-layout">
        <aside className="sidebar panel">
          <div className="eyebrow">Workspace</div>
          <h1 className="title">Prepare locally</h1>
          <p className="muted">
            Load a PDF from disk, inspect document metadata, and stage page-range driven operations without any upload.
          </p>
          {launchContext ? <div className="notice">{launchContext}</div> : null}
          <div className="dropzone" onDragOver={(event) => event.preventDefault()} onDrop={onDrop}>
            <p><strong>Drop a PDF here</strong></p>
            <p className="muted">
              {launchIntent === "merge" ? "or choose multiple PDFs from disk" : "or choose a file from disk"}
            </p>
            <button className="button" onClick={() => fileInputRef.current?.click()} type="button">
              {launchIntent === "merge" ? "Select PDFs" : "Select PDF"}
            </button>
            <input
              accept="application/pdf,.pdf"
              hidden
              ref={fileInputRef}
              type="file"
              multiple={launchIntent === "merge"}
              onChange={(event) => {
                void handleFiles(event.target.files);
              }}
            />
          </div>

          {summary ? (
            <div className="loaded-file-card panel-subtle">
              <div className="eyebrow">Current file</div>
              <strong>{summary.file.name}</strong>
              <div className="muted">
                {summary.pageCount} pages · {formatFileSize(summary.file.size)}
              </div>
            </div>
          ) : null}

          <div className="field">
            <label htmlFor="page-range">Page range</label>
            <input
              id="page-range"
              placeholder="1-3, 5, 7-9"
              value={rangeInput}
              onChange={(event) => setRangeInput(event.target.value)}
            />
          </div>

          <div className="tool-toolbar" role="tablist" aria-label="PDF tools">
            <button
              aria-selected={activeTool === "extract"}
              className={`button secondary tool-tab${activeTool === "extract" ? " is-active" : ""}`}
              onClick={() => setActiveTool("extract")}
              role="tab"
              type="button"
            >
              Extract
            </button>
            <button
              aria-selected={activeTool === "delete"}
              className={`button secondary tool-tab${activeTool === "delete" ? " is-active" : ""}`}
              onClick={() => setActiveTool("delete")}
              role="tab"
              type="button"
            >
              Delete
            </button>
            <button
              aria-selected={activeTool === "rotate"}
              className={`button secondary tool-tab${activeTool === "rotate" ? " is-active" : ""}`}
              onClick={() => setActiveTool("rotate")}
              role="tab"
              type="button"
            >
              Rotate
            </button>
            <button
              aria-selected={activeTool === "split"}
              className={`button secondary tool-tab${activeTool === "split" ? " is-active" : ""}`}
              onClick={() => setActiveTool("split")}
              role="tab"
              type="button"
            >
              Split
            </button>
            <button
              aria-selected={activeTool === "compress"}
              className={`button secondary tool-tab${activeTool === "compress" ? " is-active" : ""}`}
              onClick={() => setActiveTool("compress")}
              role="tab"
              type="button"
            >
              Compress
            </button>
          </div>

          <div className="tool-panel">
            <div className="eyebrow">Active tool</div>
            <div className="tool-panel-header">
              <strong>{activeToolTitle}</strong>
              <span className="tag">{activeTool === "split" ? "ZIP output" : "PDF output"}</span>
            </div>
            <p className="muted tool-description">{activeToolDescription}</p>

            {activeTool === "rotate" ? (
              <div className="field">
                <label htmlFor="rotate-angle">Rotation</label>
                <select
                  id="rotate-angle"
                  value={rotateAngle}
                  onChange={(event) => setRotateAngle(Number(event.target.value) as RotateAngle)}
                >
                  <option value="90">90 degrees</option>
                  <option value="180">180 degrees</option>
                  <option value="270">270 degrees</option>
                </select>
              </div>
            ) : null}

            {activeTool === "split" ? (
              <div className="split-panel">
                <div className="field">
                  <label htmlFor="split-mode">Split mode</label>
                  <select
                    id="split-mode"
                    value={splitMode}
                    onChange={(event) => setSplitMode(event.target.value as SplitMode)}
                  >
                    <option value="ranges">By ranges</option>
                    <option value="equal-parts">Equal parts</option>
                    <option value="every-n-pages">Every N pages</option>
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="split-value">
                    {splitMode === "ranges" ? "Ranges" : splitMode === "equal-parts" ? "Number of parts" : "Pages per split"}
                  </label>
                  <input
                    id="split-value"
                    inputMode={splitMode === "ranges" ? "text" : "numeric"}
                    placeholder={
                      splitMode === "ranges"
                        ? "1-3, 4-6, 7-10"
                        : splitMode === "equal-parts"
                          ? "3"
                          : "5"
                    }
                    value={splitValue}
                    onChange={(event) => setSplitValue(event.target.value)}
                  />
                </div>
                <div className="tool-summary">{splitSummary}</div>
              </div>
            ) : activeTool === "compress" ? (
              <div className="split-panel">
                <div className="field">
                  <label htmlFor="compression-level">Compression level</label>
                  <select
                    id="compression-level"
                    value={compressionLevel}
                    onChange={(event) => setCompressionLevel(event.target.value as CompressionLevel)}
                  >
                    <option value="balanced">Balanced</option>
                    <option value="maximum">Maximum</option>
                  </select>
                </div>
                <div className="tool-summary">{compressionSummary}</div>
              </div>
            ) : (
              <div className="tool-summary">{targetPageSummary}</div>
            )}

            <div className="operation-actions">
              <button className="button" onClick={() => void runActiveTool()} type="button">
                {activeTool === "extract"
                  ? "Extract selected pages"
                  : activeTool === "delete"
                    ? "Delete selected pages"
                    : activeTool === "rotate"
                      ? `Rotate selected pages ${rotateAngle}°`
                      : activeTool === "split"
                        ? "Split and download ZIP"
                        : `Compress PDF (${compressionLevel})`}
              </button>
            </div>

            {summary && parsedRange.pages.length > 0 ? (
              <div className="tag">{parsedRange.pages.length} pages selected from range input</div>
            ) : null}

            {selectedPages.length > 0 ? (
              <div className="tag">Selected pages: {selectedRangeSummary}</div>
            ) : null}

            {!parsedRange.valid ? (
              <div className="notice">Invalid range entries: {parsedRange.invalidEntries.join(", ")}</div>
            ) : null}

            <button
              className="button secondary"
              disabled={undoStack.length === 0}
              onClick={() => void runUndo()}
              type="button"
            >
              Undo
            </button>
          </div>

          {notice ? <div className="notice">{notice}</div> : null}
        </aside>

        <section className="content panel">
          {loading ? <div className="tag">Loading PDF…</div> : null}
          {operationProgress ? (
            <div className="progress-panel">
              <div className="progress-header">
                <strong>{operationProgress.name}</strong>
                <span>{operationProgress.percent}%</span>
              </div>
              <div aria-hidden="true" className="progress-track">
                <div className="progress-bar" style={{ width: `${operationProgress.percent}%` }} />
              </div>
            </div>
          ) : null}

          {mergeCandidates.length > 0 ? (
            <>
              <div className="eyebrow">Merge staging</div>
              <h2>Ready to order {mergeCandidates.length} files</h2>
              <p className="muted">
                Reorder your staged PDFs to control merge order, then run a local merge and download the combined file.
              </p>
              <div className="merge-toolbar">
                <button className="button" onClick={() => void runMerge()} type="button">
                  Merge and download
                </button>
              </div>
              <div className="merge-list">
                {mergeCandidates.map((file, index) => (
                  <article className="merge-card" key={`${file.name}-${index}`}>
                    <div className="merge-card-header">
                      <div>
                        <strong>{index + 1}. {file.name}</strong>
                        <div className="muted">{formatFileSize(file.size)}</div>
                      </div>
                      <div className="merge-card-actions">
                        <button
                          aria-label={`Move ${file.name} up`}
                          className="button secondary"
                          disabled={index === 0}
                          onClick={() => moveMergeCandidate(index, -1)}
                          type="button"
                        >
                          Up
                        </button>
                        <button
                          aria-label={`Move ${file.name} down`}
                          className="button secondary"
                          disabled={index === mergeCandidates.length - 1}
                          onClick={() => moveMergeCandidate(index, 1)}
                          type="button"
                        >
                          Down
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </>
          ) : null}

          {summary ? (
            <>
              <div className="header-grid">
                <div className="metric">
                  <div className="muted">File</div>
                  <strong>{summary.file.name}</strong>
                </div>
                <div className="metric">
                  <div className="muted">Pages</div>
                  <strong>{summary.pageCount}</strong>
                </div>
                <div className="metric">
                  <div className="muted">Size</div>
                  <strong>{formatFileSize(summary.file.size)}</strong>
                </div>
              </div>

              <div className="header-grid">
                <div className="metric">
                  <div className="muted">Title</div>
                  <strong>{summary.title}</strong>
                </div>
                <div className="metric">
                  <div className="muted">Author</div>
                  <strong>{summary.author}</strong>
                </div>
                <div className="metric">
                  <div className="muted">Dates</div>
                  <strong>{summary.createdAt}</strong>
                  <div className="muted">Updated {summary.modifiedAt}</div>
                </div>
              </div>

              <div className="thumbnail-grid">
                {thumbnails.map((thumbnail) => (
                  <button
                    aria-label={`Preview page ${thumbnail.pageNumber}`}
                    aria-pressed={selectedPageSet.has(thumbnail.pageNumber)}
                    className="thumbnail-card"
                    data-selected={selectedPageSet.has(thumbnail.pageNumber) ? "true" : "false"}
                    key={thumbnail.pageNumber}
                    onClick={(event) => handleThumbnailSelection(event, thumbnail.pageNumber)}
                    onDoubleClick={() => openPreview(thumbnail.pageNumber)}
                    type="button"
                  >
                    <div className="thumbnail-frame">
                      <img alt={`Page ${thumbnail.pageNumber} preview`} src={thumbnail.src} />
                    </div>
                    <p>Page {thumbnail.pageNumber}</p>
                  </button>
                ))}
              </div>

              {operationHistory.length > 0 ? (
                <div className="history-panel">
                  <div className="eyebrow">Operation history</div>
                  <div className="history-list">
                    {operationHistory.map((entry) => (
                      <article className="history-card" key={entry.id}>
                        <strong>{entry.name}</strong>
                        <div className="muted">Pages {entry.pages}</div>
                        <div className="muted">{entry.timestamp}</div>
                      </article>
                    ))}
                  </div>
                </div>
              ) : null}
            </>
          ) : (
            <div>
              <div className="eyebrow">Ready</div>
              <h2>Open a local PDF to begin.</h2>
              <p className="muted">
                Local processing is enabled for extract, delete, rotate, split, and merge workflows with no upload required.
              </p>
            </div>
          )}
        </section>
      </div>

      {previewThumbnail ? (
        <div
          aria-modal="true"
          className="preview-overlay"
          onClick={() => setPreviewThumbnail(null)}
          role="dialog"
        >
          <div className="preview-panel panel" onClick={(event) => event.stopPropagation()}>
            <div className="preview-header">
              <div>
                <div className="eyebrow">Preview</div>
                <h2>Page {previewThumbnail.pageNumber}</h2>
              </div>
              <button className="button secondary" onClick={() => setPreviewThumbnail(null)} type="button">
                Close
              </button>
            </div>
            <div className="preview-image-frame">
              <img alt={`Full preview for page ${previewThumbnail.pageNumber}`} src={previewThumbnail.src} />
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<WorkspaceApp />);