const extensionApi = globalThis.browser || globalThis.chrome;

function sendOpenWorkspace(query = "") {
  extensionApi.runtime.sendMessage({ type: "OPEN_WORKSPACE", query });
}

document.querySelector('[data-action="open-workspace"]').addEventListener("click", () => {
  sendOpenWorkspace();
});

document.querySelector('[data-action="open-pdf"]').addEventListener("click", () => {
  sendOpenWorkspace("?intent=open");
  window.close();
});

document.querySelector('[data-action="merge-pdfs"]').addEventListener("click", () => {
  sendOpenWorkspace("?intent=merge");
  window.close();
});
