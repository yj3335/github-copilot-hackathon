import JSZip from "jszip";
import { PDFDocument, degrees } from "pdf-lib";

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

async function loadPdfDocument(file: File): Promise<PDFDocument> {
  return PDFDocument.load(await file.arrayBuffer());
}

export async function extractPdfPages(file: File, pageNumbers: number[]): Promise<PdfMutationResult> {
  const source = await loadPdfDocument(file);
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

export async function deletePdfPages(file: File, pageNumbers: number[]): Promise<PdfMutationResult> {
  const source = await loadPdfDocument(file);
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
  angle: 90 | 180 | 270
): Promise<PdfMutationResult> {
  const source = await loadPdfDocument(file);
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
  suffix: string
): Promise<PdfArchiveResult> {
  const source = await loadPdfDocument(file);
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

export async function splitPdfByRanges(file: File, input: string): Promise<PdfArchiveResult> {
  const source = await loadPdfDocument(file);
  const parsed = parseSplitRangeInput(input, source.getPageCount());

  if (!parsed.valid) {
    throw new Error(parsed.invalidEntries.join("; "));
  }

  const segments = parsed.ranges.map((range, index) => ({
    name: `${getBaseFilename(file)}_${index + 1}.pdf`,
    pages: Array.from({ length: range.end - range.start + 1 }, (_, offset) => range.start + offset)
  }));

  return createArchiveFromSegments(file, segments, "split-ranges");
}

export async function splitPdfIntoEqualParts(file: File, partCount: number): Promise<PdfArchiveResult> {
  const source = await loadPdfDocument(file);
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

  return createArchiveFromSegments(file, segments, "split-equal");
}

export async function splitPdfEveryNPages(file: File, segmentSize: number): Promise<PdfArchiveResult> {
  const source = await loadPdfDocument(file);
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

  return createArchiveFromSegments(file, segments, "split-pages");
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