import test from "node:test";
import assert from "node:assert/strict";

import { createApp } from "../src/app.js";

test("health endpoint returns ok", async () => {
  const app = createApp();
  const server = app.listen(0);
  const { port } = server.address();

  try {
    const response = await fetch(`http://127.0.0.1:${port}/health`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: "ok" });
  } finally {
    server.close();
  }
});

test("download endpoint maps firefox package", async () => {
  const app = createApp();
  const server = app.listen(0);
  const { port } = server.address();

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/download?browser=firefox`);
    const payload = await response.json();
    assert.equal(response.status, 200);
    assert.match(payload.url, /firefox\/extension\.xpi$/);
  } finally {
    server.close();
  }
});

test("landing page renders PRIVAPDF scaffold", async () => {
  const app = createApp();
  const server = app.listen(0);
  const { port } = server.address();

  try {
    const response = await fetch(`http://127.0.0.1:${port}/`);
    const html = await response.text();
    assert.equal(response.status, 200);
    assert.match(html, /PRIVAPDF/);
    assert.match(html, /Cross-browser, local-first PDF toolkit platform\./);
    assert.match(html, /Download extension/);
  } finally {
    server.close();
  }
});
