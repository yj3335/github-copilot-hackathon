import { createRoot } from "react-dom/client";
import { useEffect, useMemo, useRef, useState } from "react";
import { GlobalWorkerOptions, getDocument } from "pdfjs-dist";
import {
  formatFileSize,
  parsePageRangeInput,
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

async function renderThumbnail(file: File, pageNumber: number): Promise<ThumbnailItem> {
  const buffer = await file.arrayBuffer();
  const pdf = await getDocument({ data: buffer }).promise;
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

async function loadPdfSummary(file: File): Promise<LoadedPdfSummary> {
  const buffer = await file.arrayBuffer();
  const documentTask = getDocument({ data: buffer });
  const pdf = await documentTask.promise;
  const metadata = await pdf.getMetadata().catch(() => undefined);
  const info = metadata?.info as Record<string, string | undefined> | undefined;

  return {
    file,
    title: info?.Title || file.name,
    author: info?.Author || "Unknown",
    createdAt: info?.CreationDate || "Unknown",
    modifiedAt: info?.ModDate || "Unknown",
    pageCount: pdf.numPages
  };
}

function WorkspaceApp() {
  const [summary, setSummary] = useState<LoadedPdfSummary | null>(null);
  const [thumbnails, setThumbnails] = useState<ThumbnailItem[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
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

  const renderedPageNumbers = useMemo(
    () => thumbnails.map((thumbnail) => thumbnail.pageNumber).sort((left, right) => left - right),
    [thumbnails]
  );

  const selectedPageSet = useMemo(() => new Set(selectedPages), [selectedPages]);

  const selectedRangeSummary = useMemo(() => {
    if (selectedPages.length === 0) {
      return "";
    }

    return [...selectedPages].sort((left, right) => left - right).join(", ");
  }, [selectedPages]);

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
    if (parsedRange.pages.length > 0) {
      return parsedRange.pages;
    }

    return selectedPages;
  };

  const stageOperation = (name: string) => {
    if (!summary) {
      setNotice("Load a PDF before staging an operation.");
      return;
    }

    if (!parsedRange.valid) {
      setNotice("Fix the invalid page range before staging an operation.");
      return;
    }

    const targetPages = getTargetPages();
    if (targetPages.length === 0) {
      setNotice("Select pages or enter a page range before staging an operation.");
      return;
    }

    const progressSteps = [20, 45, 70, 100];
    let currentStep = 0;
    setOperationProgress({ name, percent: progressSteps[0] });

    const timer = window.setInterval(() => {
      currentStep += 1;

      if (currentStep >= progressSteps.length) {
        window.clearInterval(timer);
        setOperationProgress(null);
        setNotice(`${name} staged for pages ${targetPages.join(", ")}. Connect this to the PDF worker next.`);
        setOperationHistory((current) => [
          {
            id: `${name}-${Date.now()}`,
            name,
            pages: targetPages.join(", "),
            timestamp: new Date().toLocaleTimeString()
          },
          ...current
        ].slice(0, 10));
        return;
      }

      setOperationProgress({ name, percent: progressSteps[currentStep] });
    }, 140);
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

      const pdfSummary = await loadPdfSummary(file);
      setSummary(pdfSummary);
      setSelectedPages([]);
      setLastSelectedPage(null);
      setPreviewThumbnail(null);

      const previewPages = Array.from(
        { length: Math.min(pdfSummary.pageCount, 12) },
        (_, index) => index + 1
      );
      const rendered = await Promise.all(previewPages.map((pageNumber) => renderThumbnail(file, pageNumber)));
      setThumbnails(rendered);
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

    if (launchIntent === "merge") {
      const totalBytes = selectedFiles.reduce((sum, file) => sum + file.size, 0);
      if (totalBytes > 500 * 1024 * 1024) {
        setNotice("Selected merge files exceed the 500 MB limit. Reduce the selection and try again.");
        return;
      }

      setMergeCandidates(selectedFiles);
      setSummary(null);
      setThumbnails([]);
      setSelectedPages([]);
      setLastSelectedPage(null);
      setPreviewThumbnail(null);
      setNotice(`Merge staging ready for ${selectedFiles.length} PDFs. Wire this list into the merge engine next.`);
      return;
    }

    setMergeCandidates([]);
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

          <div className="field">
            <label htmlFor="page-range">Page range</label>
            <input
              id="page-range"
              placeholder="1-3, 5, 7-9"
              value={rangeInput}
              onChange={(event) => setRangeInput(event.target.value)}
            />
          </div>

          <div className="operation-actions">
            <button className="button" onClick={() => stageOperation("Extract")} type="button">
              Extract
            </button>
            <button className="button secondary" onClick={() => stageOperation("Delete")} type="button">
              Delete
            </button>
            <button className="button secondary" onClick={() => stageOperation("Rotate 90°")} type="button">
              Rotate 90°
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
                This shell now captures the popup merge intent and validates the file-size cap locally. The merge engine and drag reordering flow can build on this staged list.
              </p>
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
                This shell is set up for local file validation, metadata parsing, and thumbnail rendering as the foundation for extract, split, merge, reorder, and rotate flows.
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