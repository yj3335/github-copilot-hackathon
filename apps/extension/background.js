const extensionApi = globalThis.browser || globalThis.chrome;

function openWorkspace(query = "") {
  extensionApi.tabs.create({ url: `workspace.html${query}` });
}

extensionApi.runtime.onMessage.addListener((message) => {
  if (message?.type === "OPEN_WORKSPACE") {
    openWorkspace(message.query || "");
  }
});
