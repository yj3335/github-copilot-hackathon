import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { detectBrowser } from "@pdf-toolkit/shared";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, "../public");

export function createApp() {
  const app = express();

  app.disable("x-powered-by");
  app.use(express.static(publicDir, {
    maxAge: 0,
    extensions: ["html"]
  }));

  app.get("/health", (_request, response) => {
    response.status(200).json({ status: "ok" });
  });

  app.get("/api/browser", (request, response) => {
    response.json(detectBrowser(request.get("user-agent")));
  });

  app.get("/api/download", (request, response) => {
    const requestedBrowser = String(request.query.browser || "").toLowerCase();
    const browser = detectBrowser(request.get("user-agent"));
    const targetBrowser = requestedBrowser || browser.name;

    let packagePath = "";
    if (targetBrowser.includes("chrome")) {
      packagePath = `/packages/local-pdf-toolkit-chrome-v0.1.0.zip`;
    } else if (targetBrowser.includes("firefox")) {
      packagePath = `/packages/local-pdf-toolkit-firefox-v0.1.0.zip`;
    } else if (targetBrowser.includes("edge")) {
      packagePath = `/packages/local-pdf-toolkit-edge-v0.1.0.zip`;
    } else if (targetBrowser.includes("safari")) {
      packagePath = `/packages/local-pdf-toolkit-safari-v0.1.0.zip`;
    } else {
      packagePath = `/packages/local-pdf-toolkit-chrome-v0.1.0.zip`;
    }

    // Append timestamp to bypass aggressive browser cache
    response.json({ url: `${packagePath}?t=${Date.now()}` });
  });

  // Using direct Blob Storage URL since Azure Front Door is blocked on Free/Student subscriptions
  const CDN_BASE_URL = process.env.CDN_URL || "https://pdfstorewfqdnxorez.blob.core.windows.net";

  app.get("/api/updates/:browser.xml", (request, response) => {
    const browser = String(request.params.browser).toLowerCase();
    const ext = browser === "firefox" ? ".xpi" : browser === "safari" ? ".safariextz" : ".crx";
    const downloadUrl = `${CDN_BASE_URL}/packages/v0.1.0/${browser}/extension${ext}`;
    
    response.type('application/xml');
    response.send(`<?xml version='1.0' encoding='UTF-8'?>
<gupdate xmlns='http://www.google.com/update2/response' protocol='2.0'>
  <app appid='your-extension-id-here'>
    <updatecheck codebase='${downloadUrl}' version='0.1.0' />
  </app>
</gupdate>`);
  });

  app.get("*", (_request, response) => {
    response.sendFile(path.join(publicDir, "index.html"));
  });

  return app;
}
