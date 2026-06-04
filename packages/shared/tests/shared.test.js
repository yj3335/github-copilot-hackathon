import test from "node:test";
import assert from "node:assert/strict";

import {
  detectBrowser,
  parsePageRange,
  sanitizeFilename,
  validatePageRangeInput
} from "../src/index.js";

test("sanitizeFilename replaces unsupported characters", () => {
  assert.equal(sanitizeFilename("report:/2026?.pdf"), "report__2026_.pdf");
});

test("validatePageRangeInput rejects invalid characters", () => {
  const result = validatePageRangeInput("1-3,a");
  assert.equal(result.valid, false);
});

test("parsePageRange preserves duplicate pages and order", () => {
  const result = parsePageRange("1-2, 2, 4", 5);
  assert.deepEqual(result.pages, [1, 2, 2, 4]);
  assert.deepEqual(result.errors, []);
});

test("detectBrowser identifies supported browsers", () => {
  assert.equal(detectBrowser("Mozilla/5.0 Chrome/123.0 Safari/537.36").browser, "chrome");
  assert.equal(detectBrowser("Mozilla/5.0 Firefox/125.0").browser, "firefox");
});
