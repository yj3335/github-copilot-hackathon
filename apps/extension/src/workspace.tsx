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

  const parsedRange = useMemo(() => {
    if (!summary) {
      return { valid: true, pages: [], invalidEntries: [] };
    }
    return parsePageRangeInput(rangeInput, summary.pageCount);
  }, [rangeInput, summary]);

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
    const file = files?.[0];
    if (!file) {
      return;
    }
    await processFile(file);
  };

  const onDrop = async (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    await handleFiles(event.dataTransfer.files);
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
          <div className="dropzone" onDragOver={(event) => event.preventDefault()} onDrop={onDrop}>
            <p><strong>Drop a PDF here</strong></p>
            <p className="muted">or choose a file from disk</p>
            <button className="button" onClick={() => fileInputRef.current?.click()} type="button">
              Select PDF
            </button>
            <input
              accept="application/pdf,.pdf"
              hidden
              ref={fileInputRef}
              type="file"
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

          {summary && parsedRange.pages.length > 0 ? (
            <div className="tag">{parsedRange.pages.length} pages selected from range input</div>
          ) : null}

          {!parsedRange.valid ? (
            <div className="notice">Invalid range entries: {parsedRange.invalidEntries.join(", ")}</div>
          ) : null}

          {notice ? <div className="notice">{notice}</div> : null}
        </aside>

        <section className="content panel">
          {loading ? <div className="tag">Loading PDF…</div> : null}

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
                  <article className="thumbnail-card" key={thumbnail.pageNumber}>
                    <div className="thumbnail-frame">
                      <img alt={`Page ${thumbnail.pageNumber} preview`} src={thumbnail.src} />
                    </div>
                    <p>Page {thumbnail.pageNumber}</p>
                  </article>
                ))}
              </div>
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
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<WorkspaceApp />);