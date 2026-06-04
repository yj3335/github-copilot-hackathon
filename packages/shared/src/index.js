const SAFE_FILENAME_PATTERN = /[^a-zA-Z0-9 _\-.]/g;
const PAGE_RANGE_PATTERN = /^[\d,\-\s]+$/;

export function sanitizeFilename(input) {
  const trimmed = String(input || "").trim();
  const sanitized = trimmed.replace(SAFE_FILENAME_PATTERN, "_").slice(0, 200);

  return sanitized || "document";
}

export function validatePageRangeInput(input) {
  const value = String(input || "").trim();

  if (!value) {
    return { valid: false, reason: "Enter at least one page or range." };
  }

  if (value.length > 500) {
    return { valid: false, reason: "Page range input cannot exceed 500 characters." };
  }

  if (!PAGE_RANGE_PATTERN.test(value)) {
    return {
      valid: false,
      reason: "Only digits, commas, hyphens, and spaces are allowed in page ranges."
    };
  }

  return { valid: true, reason: "" };
}

export function parsePageRange(input, totalPages) {
  const validation = validatePageRangeInput(input);

  if (!validation.valid) {
    return { pages: [], errors: [validation.reason] };
  }

  const pages = [];
  const errors = [];

  for (const rawToken of input.split(",")) {
    const token = rawToken.trim();

    if (!token) {
      continue;
    }

    if (token.includes("-")) {
      const [startText, endText] = token.split("-").map((part) => part.trim());
      const start = Number.parseInt(startText, 10);
      const end = Number.parseInt(endText, 10);

      if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < start) {
        errors.push(`Invalid range: ${token}`);
        continue;
      }

      for (let page = start; page <= end; page += 1) {
        if (page > totalPages) {
          errors.push(`Page ${page} exceeds document length (${totalPages}).`);
        } else {
          pages.push(page);
        }
      }

      continue;
    }

    const page = Number.parseInt(token, 10);

    if (!Number.isInteger(page) || page < 1) {
      errors.push(`Invalid page: ${token}`);
      continue;
    }

    if (page > totalPages) {
      errors.push(`Page ${page} exceeds document length (${totalPages}).`);
      continue;
    }

    pages.push(page);
  }

  return { pages, errors };
}

export function detectBrowser(userAgent) {
  const agent = String(userAgent || "").toLowerCase();

  if (agent.includes("edg/")) {
    return { browser: "edge", label: "Microsoft Edge", packageType: ".crx" };
  }

  if (agent.includes("firefox/")) {
    return { browser: "firefox", label: "Firefox", packageType: ".xpi" };
  }

  if (agent.includes("safari/") && agent.includes("version/") && !agent.includes("chrome/")) {
    return { browser: "safari", label: "Safari", packageType: ".safariextz" };
  }

  if (agent.includes("chrome/")) {
    return { browser: "chrome", label: "Chrome", packageType: ".crx" };
  }

  return { browser: "unknown", label: "Manual download", packageType: "" };
}

export function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB"];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** exponent;

  return `${value.toFixed(value >= 10 || exponent === 0 ? 0 : 1)} ${units[exponent]}`;
}
