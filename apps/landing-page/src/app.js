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
    maxAge: "24h",
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
    const detected = detectBrowser(request.get("user-agent"));
    const browser = requestedBrowser || detected.browser;

    if (!["chrome", "edge", "firefox", "safari"].includes(browser)) {
      response.status(400).json({ error: "Unsupported browser selection." });
      return;
    }

    response.json({
      browser,
      version: "0.1.0",
      url: `https://cdn.example.com/packages/v0.1.0/${browser}/extension${browser === "firefox" ? ".xpi" : browser === "safari" ? ".safariextz" : ".crx"}`
    });
  });

  app.get("*", (_request, response) => {
    response.sendFile(path.join(publicDir, "index.html"));
  });

  return app;
}
