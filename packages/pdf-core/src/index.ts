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