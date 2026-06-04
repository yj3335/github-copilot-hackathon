const browsers = [
  { browser: "chrome", label: "Chrome" },
  { browser: "edge", label: "Edge" },
  { browser: "firefox", label: "Firefox" },
  { browser: "safari", label: "Safari" }
];

const primaryButton = document.querySelector("#primary-download");
const revealTargets = Array.from(
  document.querySelectorAll(".hero, .section, .card, .app-shell, .footer")
);

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

if (revealTargets.length > 0) {
  const viewportHeight = window.innerHeight || 0;
  revealTargets.forEach((element, index) => {
    element.classList.add("reveal");
    element.style.setProperty("--reveal-delay", `${index * 80}ms`);
    if (element.getBoundingClientRect().top < viewportHeight * 0.9) {
      element.classList.add("is-visible");
    }
  });

  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (!prefersReducedMotion && "IntersectionObserver" in window) {
    const observer = new IntersectionObserver(
      (entries, current) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            current.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15 }
    );

    revealTargets.forEach((element) => observer.observe(element));
  } else {
    revealTargets.forEach((element) => element.classList.add("is-visible"));
  }
}
