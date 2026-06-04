import JSZip from "jszip";
import { PDFDocument, StandardFonts, degrees, rgb } from "pdf-lib";

const PDF_SIGNATURE = "%PDF-";

export interface FileValidationResult {
  valid: boolean;
  errors: string[];
  requiresConfirmation: boolean;
}

export interface ParsedRangeSegment {
  start: number;
  end: number;
}

export interface PageRangeParseResult {
  valid: boolean;
  pages: number[];
  invalidEntries: string[];
}

export interface PdfMutationResult {
  bytes: Uint8Array;
  filename: string;
  pageCount: number;
}

export interface PdfArchiveResult {
  bytes: Uint8Array;
  filename: string;
  entryCount: number;
}

export interface SplitRangeParseResult {
  valid: boolean;
  ranges: Array<{ start: number; end: number }>;
  invalidEntries: string[];
}

export interface PdfLoadOptions {
  password?: string;
}

export type CompressionLevel = "balanced" | "maximum";

export type WatermarkPosition = "center" | "top-left" | "top-right" | "bottom-left" | "bottom-right" | "custom";
export type WatermarkFont = "Helvetica" | "Times" | "Courier";

export interface TextWatermarkConfig {
  type: "text";
  text: string;
  fontSize: number;        // 8–144
  color: string;           // hex e.g. "#FF0000"
  opacity: number;         // 0–100
  rotation: number;        // 0–359
  position: WatermarkPosition;
  customX?: number;        // 0–100 percentage
  customY?: number;        // 0–100 percentage
  font?: WatermarkFont;
  pageNumbers: number[];   // which pages to apply to
}

export interface ImageWatermarkConfig {
  type: "image";
  imageBytes: Uint8Array;
  imageType: "png" | "jpeg";
  opacity: number;         // 0–100
  rotation: number;        // 0–359
  position: WatermarkPosition;
  customX?: number;
  customY?: number;
  widthPercent: number;    // 1–100 percent of page width
  pageNumbers: number[];
}

export type WatermarkConfig = TextWatermarkConfig | ImageWatermarkConfig;

export const MAX_INPUT_FILE_BYTES = 200 * 1024 * 1024;
export const PAGE_RANGE_PATTERN = /^[\d,\-\s]+$/;

export async function validatePdfFile(file: File): Promise<FileValidationResult> {
  const errors: string[] = [];

  if (!file.name.toLowerCase().endsWith(".pdf")) {
    errors.push("File extension must be .pdf.");
  }

  const header = await file.slice(0, 5).text();
  if (header !== PDF_SIGNATURE) {
    errors.push("File signature does not match a valid PDF header.");
  }

  return {
    valid: errors.length === 0,
    errors,
    requiresConfirmation: file.size > MAX_INPUT_FILE_BYTES
  };
}

export function formatFileSize(bytes: number): string {
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value.toFixed(value >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

export function sanitizeFilename(input: string): string {
  return input.replace(/[^a-zA-Z0-9 _\-.]/g, "").slice(0, 200).trim() || "document";
}

export function getCanonicalPdfBaseName(filename: string): string {
  let normalized = sanitizeFilename(filename.replace(/\.pdf$/i, ""));
  const suffixPattern = /(?:-(?:extract|delete|merged|rotate-(?:90|180|270)|split-(?:ranges|equal|pages)))+$/i;

  while (suffixPattern.test(normalized)) {
    normalized = normalized.replace(suffixPattern, "");
  }

  return normalized || "document";
}

export function getCanonicalPdfFilename(filename: string): string {
  return `${getCanonicalPdfBaseName(filename)}.pdf`;
}

function getBaseFilename(file: File): string {
  return getCanonicalPdfBaseName(file.name);
}

function buildFilename(file: File, suffix: string): string {
  return `${getBaseFilename(file)}-${suffix}.pdf`;
}

function buildArchiveFilename(file: File, suffix: string): string {
  return `${getBaseFilename(file)}-${suffix}.zip`;
}

async function loadPdfDocument(file: File, options?: PdfLoadOptions): Promise<PDFDocument> {
  const buffer = await file.arrayBuffer();

  // pdf-lib does not natively support password-based decryption.
  // It can only load encrypted PDFs with ignoreEncryption: true (which strips encryption
  // metadata and loads the document structure). This works for owner-password-only PDFs
  // where content is readable but permissions are restricted.
  //
  // For user-password-encrypted PDFs (where content is actually encrypted), pdf-lib
  // cannot decrypt. We detect this case and report it.

  try {
    // First attempt: normal load (works for unencrypted PDFs)
    return await PDFDocument.load(buffer);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    const isEncryptionError = msg.toLowerCase().includes("encrypt") ||
      msg.toLowerCase().includes("password") ||
      msg.toLowerCase().includes("decrypt");

    if (isEncryptionError && options?.password) {
      // Attempt to load with ignoreEncryption — this handles owner-password-only
      // PDFs where content isn't actually encrypted, just permission-restricted
      try {
        return await PDFDocument.load(buffer, { ignoreEncryption: true });
      } catch {
        throw new Error("This PDF uses content encryption that cannot be processed locally. The document's content is fully encrypted and requires a decryption engine beyond what is available in-browser.");
      }
    }

    if (isEncryptionError) {
      throw new Error("PDF_REQUIRES_PASSWORD");
    }

    // Non-encryption error — rethrow
    throw err;
  }
}

export async function extractPdfPages(
  file: File,
  pageNumbers: number[],
  options?: PdfLoadOptions
): Promise<PdfMutationResult> {
  const source = await loadPdfDocument(file, options);
  const output = await PDFDocument.create();
  const copiedPages = await output.copyPages(
    source,
    pageNumbers.map((pageNumber) => pageNumber - 1)
  );

  for (const page of copiedPages) {
    output.addPage(page);
  }

  const bytes = await output.save();
  return {
    bytes,
    filename: buildFilename(file, "extract"),
    pageCount: output.getPageCount()
  };
}

export async function deletePdfPages(
  file: File,
  pageNumbers: number[],
  options?: PdfLoadOptions
): Promise<PdfMutationResult> {
  const source = await loadPdfDocument(file, options);
  const removeSet = new Set(pageNumbers);
  const keepPages = Array.from({ length: source.getPageCount() }, (_, index) => index + 1).filter(
    (pageNumber) => !removeSet.has(pageNumber)
  );

  if (keepPages.length === 0) {
    throw new Error("At least one page must remain in the document.");
  }

  const output = await PDFDocument.create();
  const copiedPages = await output.copyPages(
    source,
    keepPages.map((pageNumber) => pageNumber - 1)
  );

  for (const page of copiedPages) {
    output.addPage(page);
  }

  const bytes = await output.save();
  return {
    bytes,
    filename: buildFilename(file, "delete"),
    pageCount: output.getPageCount()
  };
}

export async function rotatePdfPages(
  file: File,
  pageNumbers: number[],
  angle: 90 | 180 | 270,
  options?: PdfLoadOptions
): Promise<PdfMutationResult> {
  const source = await loadPdfDocument(file, options);
  const rotateSet = new Set(pageNumbers);

  source.getPages().forEach((page, index) => {
    const pageNumber = index + 1;
    if (!rotateSet.has(pageNumber)) {
      return;
    }

    const currentRotation = page.getRotation().angle;
    page.setRotation(degrees((currentRotation + angle) % 360));
  });

  const bytes = await source.save();
  return {
    bytes,
    filename: buildFilename(file, `rotate-${angle}`),
    pageCount: source.getPageCount()
  };
}

export async function mergePdfFiles(files: File[]): Promise<PdfMutationResult> {
  const output = await PDFDocument.create();

  for (const file of files) {
    const source = await loadPdfDocument(file);
    const pageIndexes = Array.from({ length: source.getPageCount() }, (_, index) => index);
    const copiedPages = await output.copyPages(source, pageIndexes);

    for (const page of copiedPages) {
      output.addPage(page);
    }
  }

  const firstFile = files[0] ?? new File([], "merged.pdf", { type: "application/pdf" });
  const bytes = await output.save();
  return {
    bytes,
    filename: buildFilename(firstFile, "merged"),
    pageCount: output.getPageCount()
  };
}

export async function compressPdf(
  file: File,
  level: CompressionLevel,
  options?: PdfLoadOptions
): Promise<PdfMutationResult> {
  const source = await loadPdfDocument(file, options);

  if (level === "maximum") {
    const output = await PDFDocument.create();
    const pageIndexes = Array.from({ length: source.getPageCount() }, (_, index) => index);
    const copiedPages = await output.copyPages(source, pageIndexes);

    for (const page of copiedPages) {
      output.addPage(page);
    }

    const bytes = await output.save({
      useObjectStreams: true,
      updateFieldAppearances: false
    });

    return {
      bytes,
      filename: buildFilename(file, "compress-max"),
      pageCount: output.getPageCount()
    };
  }

  const bytes = await source.save({
    useObjectStreams: true,
    updateFieldAppearances: false
  });

  return {
    bytes,
    filename: buildFilename(file, "compress"),
    pageCount: source.getPageCount()
  };
}

export function parseSplitRangeInput(input: string, pageCount: number): SplitRangeParseResult {
  const trimmed = input.trim();

  if (!trimmed) {
    return {
      valid: false,
      ranges: [],
      invalidEntries: ["Enter one or more split ranges."]
    };
  }

  const ranges: Array<{ start: number; end: number }> = [];
  const invalidEntries: string[] = [];
  const usedPages = new Set<number>();

  for (const rawSegment of trimmed.split(",")) {
    const segment = rawSegment.trim();
    if (!segment) {
      invalidEntries.push(rawSegment);
      continue;
    }

    const parts = segment.split("-").map((part) => part.trim());
    const start = Number(parts[0]);
    const end = Number(parts[1] ?? parts[0]);

    if (
      parts.length > 2 ||
      !Number.isInteger(start) ||
      !Number.isInteger(end) ||
      start <= 0 ||
      end <= 0 ||
      start > end ||
      end > pageCount
    ) {
      invalidEntries.push(segment);
      continue;
    }

    let overlaps = false;
    for (let page = start; page <= end; page += 1) {
      if (usedPages.has(page)) {
        overlaps = true;
        break;
      }
      usedPages.add(page);
    }

    if (overlaps) {
      invalidEntries.push(`${segment} overlaps another range`);
      continue;
    }

    ranges.push({ start, end });
  }

  return {
    valid: invalidEntries.length === 0,
    ranges,
    invalidEntries
  };
}

async function createArchiveFromSegments(
  file: File,
  segments: Array<{ name: string; pages: number[] }>,
  suffix: string,
  options?: PdfLoadOptions
): Promise<PdfArchiveResult> {
  const source = await loadPdfDocument(file, options);
  const zip = new JSZip();

  for (const segment of segments) {
    const output = await PDFDocument.create();
    const copiedPages = await output.copyPages(
      source,
      segment.pages.map((pageNumber) => pageNumber - 1)
    );

    for (const page of copiedPages) {
      output.addPage(page);
    }

    zip.file(segment.name, await output.save());
  }

  return {
    bytes: await zip.generateAsync({ type: "uint8array" }),
    filename: buildArchiveFilename(file, suffix),
    entryCount: segments.length
  };
}

export async function splitPdfByRanges(
  file: File,
  input: string,
  options?: PdfLoadOptions
): Promise<PdfArchiveResult> {
  const source = await loadPdfDocument(file, options);
  const parsed = parseSplitRangeInput(input, source.getPageCount());

  if (!parsed.valid) {
    throw new Error(parsed.invalidEntries.join("; "));
  }

  const segments = parsed.ranges.map((range, index) => ({
    name: `${getBaseFilename(file)}_${index + 1}.pdf`,
    pages: Array.from({ length: range.end - range.start + 1 }, (_, offset) => range.start + offset)
  }));

  return createArchiveFromSegments(file, segments, "split-ranges", options);
}

export async function splitPdfIntoEqualParts(
  file: File,
  partCount: number,
  options?: PdfLoadOptions
): Promise<PdfArchiveResult> {
  const source = await loadPdfDocument(file, options);
  const totalPages = source.getPageCount();

  if (!Number.isInteger(partCount) || partCount < 2 || partCount > totalPages) {
    throw new Error("Equal-parts split count must be between 2 and the total page count.");
  }

  const baseSize = Math.floor(totalPages / partCount);
  const remainder = totalPages % partCount;
  let currentPage = 1;
  const segments: Array<{ name: string; pages: number[] }> = [];

  for (let index = 0; index < partCount; index += 1) {
    const size = index === partCount - 1 ? baseSize + remainder : baseSize;
    const pages = Array.from({ length: size }, (_, offset) => currentPage + offset);
    currentPage += size;
    segments.push({ name: `${getBaseFilename(file)}_${index + 1}.pdf`, pages });
  }

  return createArchiveFromSegments(file, segments, "split-equal", options);
}

export async function splitPdfEveryNPages(
  file: File,
  segmentSize: number,
  options?: PdfLoadOptions
): Promise<PdfArchiveResult> {
  const source = await loadPdfDocument(file, options);
  const totalPages = source.getPageCount();

  if (!Number.isInteger(segmentSize) || segmentSize < 1 || segmentSize >= totalPages) {
    throw new Error("Split size must be between 1 and one less than the total page count.");
  }

  const segments: Array<{ name: string; pages: number[] }> = [];
  let segmentIndex = 1;
  for (let start = 1; start <= totalPages; start += segmentSize) {
    const end = Math.min(start + segmentSize - 1, totalPages);
    segments.push({
      name: `${getBaseFilename(file)}_${segmentIndex}.pdf`,
      pages: Array.from({ length: end - start + 1 }, (_, offset) => start + offset)
    });
    segmentIndex += 1;
  }

  return createArchiveFromSegments(file, segments, "split-pages", options);
}

export function parsePageRangeInput(input: string, pageCount: number): PageRangeParseResult {
  const trimmed = input.trim();

  if (!trimmed) {
    return {
      valid: true,
      pages: [],
      invalidEntries: []
    };
  }

  if (!PAGE_RANGE_PATTERN.test(trimmed) || trimmed.length > 500) {
    return {
      valid: false,
      pages: [],
      invalidEntries: [trimmed]
    };
  }

  const invalidEntries: string[] = [];
  const pages: number[] = [];

  for (const rawSegment of trimmed.split(",")) {
    const segment = rawSegment.trim();
    if (!segment) {
      invalidEntries.push(rawSegment);
      continue;
    }

    if (segment.includes("-")) {
      const [startToken, endToken, extraToken] = segment.split("-").map((part) => part.trim());
      const start = Number(startToken);
      const end = Number(endToken);

      if (
        extraToken !== undefined ||
        !Number.isInteger(start) ||
        !Number.isInteger(end) ||
        start <= 0 ||
        end <= 0 ||
        start > end ||
        end > pageCount
      ) {
        invalidEntries.push(segment);
        continue;
      }

      for (let page = start; page <= end; page += 1) {
        pages.push(page);
      }
      continue;
    }

    const page = Number(segment);
    if (!Number.isInteger(page) || page <= 0 || page > pageCount) {
      invalidEntries.push(segment);
      continue;
    }

    pages.push(page);
  }

  return {
    valid: invalidEntries.length === 0,
    pages,
    invalidEntries
  };
}


// ──────────────────────────────────────────────────────────────────────────────
// Watermark
// ──────────────────────────────────────────────────────────────────────────────

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const cleaned = hex.replace(/^#/, "");
  const bigint = parseInt(cleaned.length === 3
    ? cleaned.split("").map(c => c + c).join("")
    : cleaned, 16);
  return {
    r: ((bigint >> 16) & 255) / 255,
    g: ((bigint >> 8) & 255) / 255,
    b: (bigint & 255) / 255
  };
}

function resolveFont(fontName?: WatermarkFont): typeof StandardFonts[keyof typeof StandardFonts] {
  switch (fontName) {
    case "Times": return StandardFonts.TimesRoman;
    case "Courier": return StandardFonts.Courier;
    default: return StandardFonts.Helvetica;
  }
}

function getWatermarkPosition(
  position: WatermarkPosition,
  pageWidth: number,
  pageHeight: number,
  contentWidth: number,
  contentHeight: number,
  customX?: number,
  customY?: number
): { x: number; y: number } {
  switch (position) {
    case "top-left":
      return { x: pageWidth * 0.05, y: pageHeight - contentHeight - pageHeight * 0.05 };
    case "top-right":
      return { x: pageWidth - contentWidth - pageWidth * 0.05, y: pageHeight - contentHeight - pageHeight * 0.05 };
    case "bottom-left":
      return { x: pageWidth * 0.05, y: pageHeight * 0.05 };
    case "bottom-right":
      return { x: pageWidth - contentWidth - pageWidth * 0.05, y: pageHeight * 0.05 };
    case "custom":
      return {
        x: (customX ?? 50) / 100 * pageWidth - contentWidth / 2,
        y: (customY ?? 50) / 100 * pageHeight - contentHeight / 2
      };
    case "center":
    default:
      return {
        x: (pageWidth - contentWidth) / 2,
        y: (pageHeight - contentHeight) / 2
      };
  }
}

export async function watermarkPdf(
  file: File,
  config: WatermarkConfig,
  options?: PdfLoadOptions
): Promise<PdfMutationResult> {
  const source = await loadPdfDocument(file, options);
  const pages = source.getPages();
  const targetSet = new Set(config.pageNumbers);
  const opacity = config.opacity / 100;

  if (config.type === "text") {
    if (!config.text.trim()) {
      throw new Error("Watermark text cannot be empty.");
    }
    if (opacity <= 0) {
      throw new Error("Watermark opacity must be greater than 0%.");
    }

    const fontRef = resolveFont(config.font);
    const font = await source.embedFont(fontRef);
    const fontSize = Math.max(8, Math.min(144, config.fontSize));
    const { r, g, b } = hexToRgb(config.color || "#000000");
    const textWidth = font.widthOfTextAtSize(config.text, fontSize);
    const textHeight = fontSize;

    for (let i = 0; i < pages.length; i++) {
      const pageNumber = i + 1;
      if (!targetSet.has(pageNumber)) continue;

      const page = pages[i];
      const { width, height } = page.getSize();
      const pos = getWatermarkPosition(config.position, width, height, textWidth, textHeight, config.customX, config.customY);

      page.drawText(config.text, {
        x: pos.x,
        y: pos.y,
        size: fontSize,
        font,
        color: rgb(r, g, b),
        opacity,
        rotate: degrees(config.rotation || 0)
      });
    }
  } else {
    // Image watermark
    if (!config.imageBytes || config.imageBytes.length === 0) {
      throw new Error("No image provided for watermark.");
    }
    if (config.imageBytes.length > 5 * 1024 * 1024) {
      throw new Error("Watermark image exceeds 5MB limit.");
    }

    let image;
    if (config.imageType === "png") {
      image = await source.embedPng(config.imageBytes);
    } else {
      image = await source.embedJpg(config.imageBytes);
    }

    const widthPercent = Math.max(1, Math.min(100, config.widthPercent)) / 100;

    for (let i = 0; i < pages.length; i++) {
      const pageNumber = i + 1;
      if (!targetSet.has(pageNumber)) continue;

      const page = pages[i];
      const { width: pageWidth, height: pageHeight } = page.getSize();
      const drawWidth = pageWidth * widthPercent;
      const drawHeight = drawWidth * (image.height / image.width);
      const pos = getWatermarkPosition(config.position, pageWidth, pageHeight, drawWidth, drawHeight, config.customX, config.customY);

      page.drawImage(image, {
        x: pos.x,
        y: pos.y,
        width: drawWidth,
        height: drawHeight,
        opacity,
        rotate: degrees(config.rotation || 0)
      });
    }
  }

  const bytes = await source.save();
  return {
    bytes,
    filename: buildFilename(file, "watermark"),
    pageCount: source.getPageCount()
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// Remove Password / Strip Protection
// ──────────────────────────────────────────────────────────────────────────────

export async function removePassword(file: File, password: string): Promise<PdfMutationResult> {
  if (!password) {
    throw new Error("A password is required to unlock this document.");
  }

  const buffer = await file.arrayBuffer();

  // Load the encrypted PDF with ignoreEncryption to strip permission restrictions.
  // This works for owner-password-only PDFs where content is readable but locked.
  let source: PDFDocument;
  try {
    source = await PDFDocument.load(buffer);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    const isEncryptionError = msg.toLowerCase().includes("encrypt") ||
      msg.toLowerCase().includes("password") ||
      msg.toLowerCase().includes("decrypt");

    if (isEncryptionError) {
      try {
        source = await PDFDocument.load(buffer, { ignoreEncryption: true });
      } catch {
        throw new Error("This PDF's password protection cannot be removed locally. The content is fully encrypted.");
      }
    } else {
      throw err;
    }
  }

  // Copy all pages to a fresh document — this strips any encryption/permission metadata
  const output = await PDFDocument.create();
  const pageIndexes = Array.from({ length: source.getPageCount() }, (_, i) => i);
  const copiedPages = await output.copyPages(source, pageIndexes);

  for (const page of copiedPages) {
    output.addPage(page);
  }

  const bytes = await output.save();
  return {
    bytes,
    filename: buildFilename(file, "unlocked"),
    pageCount: output.getPageCount()
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// Encrypt / Add Password
// ──────────────────────────────────────────────────────────────────────────────

export async function addPasswordProtection(file: File, password: string, loadOptions?: PdfLoadOptions): Promise<PdfMutationResult> {
  if (!password || password.length < 4) {
    throw new Error("Password must be at least 4 characters.");
  }
  if (password.length > 128) {
    throw new Error("Password must not exceed 128 characters.");
  }

  const source = await loadPdfDocument(file, loadOptions);

  // Save unprotected bytes first, then reload with the encrypt-capable fork
  const unprotectedBytes = await source.save();

  // Use pdf-lib-plus-encrypt which extends PDFDocument.save() with password options
  const { PDFDocument: PDFDocEncrypt } = await import("pdf-lib-plus-encrypt");
  const encDoc = await PDFDocEncrypt.load(unprotectedBytes, { ignoreEncryption: true });

  const bytes = await encDoc.save({
    userPassword: password,
    ownerPassword: password
  } as any);

  return {
    bytes: bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes),
    filename: buildFilename(file, "protected"),
    pageCount: encDoc.getPageCount()
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// Page Reorder
// ──────────────────────────────────────────────────────────────────────────────

export async function reorderPdfPages(
  file: File,
  newOrder: number[],
  options?: PdfLoadOptions
): Promise<PdfMutationResult> {
  const source = await loadPdfDocument(file, options);
  const totalPages = source.getPageCount();

  if (newOrder.length !== totalPages) {
    throw new Error(`New order must contain exactly ${totalPages} page numbers.`);
  }

  const seen = new Set<number>();
  for (const pageNum of newOrder) {
    if (pageNum < 1 || pageNum > totalPages) {
      throw new Error(`Page number ${pageNum} is out of range (1-${totalPages}).`);
    }
    if (seen.has(pageNum)) {
      throw new Error(`Duplicate page number ${pageNum} in reorder list.`);
    }
    seen.add(pageNum);
  }

  const output = await PDFDocument.create();
  const copiedPages = await output.copyPages(
    source,
    newOrder.map((p) => p - 1)
  );

  for (const page of copiedPages) {
    output.addPage(page);
  }

  const bytes = await output.save();
  return {
    bytes,
    filename: buildFilename(file, "reorder"),
    pageCount: output.getPageCount()
  };
}
