import { createRoot } from "react-dom/client";
import { useRef } from "react";

function openExtensionPage(page: "workspace" | "settings", query = "") {
  const target = chrome.runtime.getURL(`${page}.html${query}`);
  chrome.tabs.create({ url: target });
}

function PopupApp() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const mergeInputRef = useRef<HTMLInputElement | null>(null);

  const handleOpenPdf = () => {
    fileInputRef.current?.click();
  };

  const handleMergePdfs = () => {
    mergeInputRef.current?.click();
  };

  const handleSingleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    openExtensionPage("workspace", `?intent=open&name=${encodeURIComponent(file.name)}`);
    window.close();
  };

  const handleMergeFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    if (files.length === 0) {
      return;
    }

    openExtensionPage(
      "workspace",
      `?intent=merge&count=${files.length}&names=${encodeURIComponent(files.map((file) => file.name).join(", "))}`
    );
    window.close();
  };

  return (
    <main className="popup-shell">
      <section className="popup-card panel">
        <div>
          <div className="eyebrow">Local-first PDF toolkit</div>
          <h1 className="title">Edit privately.</h1>
        </div>
        <p className="muted">
          Open a workspace for local PDF extraction, merge preparation, and page review without sending files anywhere.
        </p>
        <div className="popup-actions">
          <button className="button" onClick={handleOpenPdf} type="button">
            Open PDF
          </button>
          <button className="button secondary" onClick={handleMergePdfs} type="button">
            Merge PDFs
          </button>
          <button className="button secondary" onClick={() => openExtensionPage("workspace")} type="button">
            Open Workspace
          </button>
        </div>
        <div className="muted">
          Version 0.1.0 · {" "}
          <button className="text-button" onClick={() => openExtensionPage("settings")} type="button">
            Settings
          </button>
        </div>
        <input accept="application/pdf,.pdf" hidden ref={fileInputRef} type="file" onChange={handleSingleFileChange} />
        <input accept="application/pdf,.pdf" hidden multiple ref={mergeInputRef} type="file" onChange={handleMergeFileChange} />
      </section>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<PopupApp />);