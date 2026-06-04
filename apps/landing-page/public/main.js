const browsers = [
  { browser: "chrome", label: "Chrome" },
  { browser: "edge", label: "Edge" },
  { browser: "firefox", label: "Firefox" },
  { browser: "safari", label: "Safari" }
];

const primaryButton = document.querySelector("#primary-download");

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

fetchBrowser()
  .then((detected) => {
    const primary = browsers.find((item) => item.browser === detected.browser);

    if (!primary) {
      primaryButton.textContent = "Download extension";
      primaryButton.addEventListener("click", () => handleDownload(""));
      return;
    }

    primaryButton.textContent = `Download for ${primary.label}`;
    primaryButton.addEventListener("click", () => handleDownload(primary.browser));
  })
  .catch(() => {
    primaryButton.textContent = "Download extension";
    primaryButton.addEventListener("click", () => handleDownload(""));
  });
