import {
  formatBytes,
  parsePageRange,
  validatePageRangeInput
} from "../../../packages/shared/src/index.js";

const DEFAULT_STATE = {
  file: null,
  pageCount: 0,
  selectedPages: new Set(),
  layout: "grid"
};

const state = { ...DEFAULT_STATE };
const pdfInput = document.querySelector("#pdf-input");
const dropzone = document.querySelector("#dropzone");
const summary = document.querySelector("#document-summary");
const thumbnailGrid = document.querySelector("#thumbnail-grid");
const pageRangeInput = document.querySelector("#page-range");
const pageRangeMessage = document.querySelector("#page-range-message");
const statusBanner = document.querySelector("#status-banner");
const previewModal = document.querySelector("#preview-modal");
const previewContent = document.querySelector("#preview-content");

function setStatus(message, isError = false) {
  statusBanner.textContent = message;
  statusBanner.dataset.error = String(isError);
}

function validatePdfFile(file) {
  if (!file) {
    return { valid: false, message: "Choose a PDF file." };
  }

  if (!file.name.toLowerCase().endsWith(".pdf")) {
    return { valid: false, message: "Only PDF files are supported." };
  }

  if (file.size > 200 * 1024 * 1024) {
    const shouldContinue = window.confirm(
      "This PDF exceeds 200MB and may cause performance issues. Continue loading it locally?"
    );

    if (!shouldContinue) {
      return { valid: false, message: "PDF loading cancelled." };
    }
  }

  return { valid: true, message: "" };
}

async function ensurePdfSignature(file) {
  const header = await file.slice(0, 5).text();
  return header === "%PDF-";
}

function renderPlaceholders(pageCount) {
  thumbnailGrid.replaceChildren();

  for (let page = 1; page <= pageCount; page += 1) {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "thumbnail-card";
    card.dataset.page = String(page);
    card.innerHTML = `
      <div class="thumbnail-frame">
        <span>Page ${page}</span>
      </div>
      <strong>${page}</strong>
    `;
    card.addEventListener("click", (event) => handleThumbnailClick(event, page));
    card.addEventListener("dblclick", () => openPreview(page));
    thumbnailGrid.append(card);
  }
}

function handleThumbnailClick(event, page) {
  if (event.metaKey || event.ctrlKey) {
    if (state.selectedPages.has(page)) {
      state.selectedPages.delete(page);
    } else {
      state.selectedPages.add(page);
    }
  } else {
    state.selectedPages.clear();
    state.selectedPages.add(page);
  }

  syncSelectionUi();
}

function syncSelectionUi() {
  for (const card of thumbnailGrid.querySelectorAll(".thumbnail-card")) {
    const page = Number.parseInt(card.dataset.page, 10);
    card.dataset.selected = String(state.selectedPages.has(page));
  }
}

function openPreview(page) {
  previewContent.textContent = `Preview placeholder for page ${page}`;
  previewModal.showModal();
}

async function loadFile(file) {
  const validation = validatePdfFile(file);

  if (!validation.valid) {
    setStatus(validation.message, true);
    return;
  }

  const hasPdfSignature = await ensurePdfSignature(file);

  if (!hasPdfSignature) {
    setStatus("Only PDF files are supported.", true);
    return;
  }

  state.file = file;
  state.pageCount = Math.max(1, Math.ceil(file.size / (1024 * 1024)));
  state.selectedPages.clear();
  summary.textContent = `${file.name} • ${formatBytes(file.size)} • ${state.pageCount} estimated pages`;
  renderPlaceholders(Math.min(state.pageCount, 24));
  setStatus("PDF loaded locally. Integrate the PDF engine next to replace placeholder thumbnails.");
}

function handleRangeInput() {
  if (!pageRangeInput.value.trim()) {
    pageRangeMessage.textContent = "";
    return;
  }

  const validation = validatePageRangeInput(pageRangeInput.value);
  pageRangeMessage.textContent = validation.valid ? "" : validation.reason;
}

function handleOperationClick(operation) {
  if (!state.file) {
    setStatus("Load a PDF before running operations.", true);
    return;
  }

  const selectedPages = [...state.selectedPages].sort((left, right) => left - right);
  const parsed = pageRangeInput.value.trim()
    ? parsePageRange(pageRangeInput.value, state.pageCount)
    : { pages: [], errors: [] };

  if (parsed.errors.length > 0) {
    setStatus(parsed.errors.join(" "), true);
    return;
  }

  const targetPages = parsed.pages.length > 0 ? parsed.pages : selectedPages;

  if (targetPages.length === 0) {
    setStatus("Select at least one page or enter a page range.", true);
    return;
  }

  setStatus(`${operation} is staged for pages ${targetPages.join(", ")}. Hook this into the PDF worker next.`);
}

pdfInput.addEventListener("change", (event) => {
  loadFile(event.target.files?.[0]);
});

dropzone.addEventListener("dragover", (event) => {
  event.preventDefault();
  dropzone.dataset.active = "true";
});

dropzone.addEventListener("dragleave", () => {
  dropzone.dataset.active = "false";
});

dropzone.addEventListener("drop", (event) => {
  event.preventDefault();
  dropzone.dataset.active = "false";
  loadFile(event.dataTransfer.files?.[0]);
});

pageRangeInput.addEventListener("input", handleRangeInput);

for (const button of document.querySelectorAll("[data-op]")) {
  button.addEventListener("click", () => handleOperationClick(button.dataset.op));
}

document.querySelector("#settings-link").addEventListener("click", () => {
  window.location.href = "settings.html";
});

if (new URLSearchParams(window.location.search).get("intent") === "open") {
  pdfInput.click();
}
