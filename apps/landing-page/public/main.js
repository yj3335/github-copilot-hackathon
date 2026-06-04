const browsers = [
  { browser: "chrome", label: "Chrome" },
  { browser: "edge", label: "Edge" },
  { browser: "firefox", label: "Firefox" },
  { browser: "safari", label: "Safari" }
];

const primaryButton = document.querySelector("#primary-download");
const alternateDownloads = document.querySelector("#alternate-downloads");

async function fetchBrowser() {
  const response = await fetch("/api/browser");

  if (!response.ok) {
    throw new Error("Could not detect browser");
  }

  return response.json();
}

async function handleDownload(browser) {
  const response = await fetch(`/api/download?browser=${browser}`);

  if (!response.ok) {
    return;
  }

  const payload = await response.json();
  window.location.href = payload.url;
}

function renderAlternates(primaryBrowser) {
  alternateDownloads.replaceChildren();

  for (const entry of browsers.filter((item) => item.browser !== primaryBrowser)) {
    const button = document.createElement("button");
    button.className = "secondary-action";
    button.type = "button";
    button.textContent = `Download for ${entry.label}`;
    button.addEventListener("click", () => handleDownload(entry.browser));
    alternateDownloads.append(button);
  }
}

fetchBrowser()
  .then((detected) => {
    const primary = browsers.find((item) => item.browser === detected.browser);

    if (!primary) {
      primaryButton.textContent = "Choose your browser";
      primaryButton.disabled = true;
      renderAlternates("");
      return;
    }

    primaryButton.textContent = `Download for ${primary.label}`;
    primaryButton.addEventListener("click", () => handleDownload(primary.browser));
    renderAlternates(primary.browser);
  })
  .catch(() => {
    primaryButton.textContent = "Choose your browser";
    primaryButton.disabled = true;
    renderAlternates("");
  });
