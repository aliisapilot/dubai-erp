/**
 * Dubai ERP: Smart Import - ZIP Archive Parser
 * Securely extracts ZIP files with directory traversal (Zip Slip) protection,
 * file size limits, and format filtering.
 */

import JSZip from "jszip";
import type { SupportedFileType } from "../types";

export interface UnpackedFile {
  name: string;
  relativePath: string;
  fileType: SupportedFileType;
  buffer: ArrayBuffer;
  size: number;
}

const MAX_TOTAL_DECOMPRESSED_BYTES = 50 * 1024 * 1024; // 50 MB
const MAX_SINGLE_FILE_BYTES = 15 * 1024 * 1024; // 15 MB
const MAX_FILES_COUNT = 100;

export function sanitizePath(entryName: string): string {
  // Prevent Zip Slip / directory traversal
  const normalized = entryName.replace(/\\/g, "/");
  const segments = normalized.split("/").filter(s => s.length > 0);
  
  if (segments.some(s => s === ".." || s === ".")) {
    throw new Error(`Potentially malicious ZIP path detected: ${entryName}`);
  }
  return segments.join("/");
}

export function detectFileType(filename: string): SupportedFileType | null {
  const ext = filename.split(".").pop()?.toLowerCase() || "";
  switch (ext) {
    case "docx":
      return "docx";
    case "doc":
      return "doc";
    case "xlsx":
      return "xlsx";
    case "xls":
      return "xls";
    case "csv":
      return "csv";
    case "pdf":
      return "pdf";
    case "zip":
      return "zip";
    default:
      return null;
  }
}

export async function unpackZipArchive(arrayBuffer: ArrayBuffer): Promise<UnpackedFile[]> {
  const zip = await JSZip.loadAsync(arrayBuffer);
  const unpacked: UnpackedFile[] = [];
  let totalDecompressedSize = 0;

  const entries = Object.entries(zip.files);
  if (entries.length > MAX_FILES_COUNT) {
    throw new Error(`ZIP contains too many files (${entries.length} > ${MAX_FILES_COUNT} allowed).`);
  }

  for (const [rawPath, fileEntry] of entries) {
    if (fileEntry.dir) continue;

    // Ignore macOS metadata & hidden files
    if (rawPath.startsWith("__MACOSX/") || rawPath.split("/").some(part => part.startsWith("."))) {
      continue;
    }

    const cleanPath = sanitizePath(rawPath);
    const fileName = cleanPath.split("/").pop() || cleanPath;
    const detectedType = detectFileType(fileName);

    if (!detectedType || detectedType === "zip") {
      // Skip unsupported files inside zip
      continue;
    }

    const fileBuffer = await fileEntry.async("arraybuffer");
    const fileSize = fileBuffer.byteLength;

    if (fileSize > MAX_SINGLE_FILE_BYTES) {
      throw new Error(`File ${cleanPath} exceeds maximum single file limit of 15MB.`);
    }

    totalDecompressedSize += fileSize;
    if (totalDecompressedSize > MAX_TOTAL_DECOMPRESSED_BYTES) {
      throw new Error(`Total decompressed size of ZIP exceeds safety limit of 50MB.`);
    }

    unpacked.push({
      name: fileName,
      relativePath: cleanPath,
      fileType: detectedType,
      buffer: fileBuffer,
      size: fileSize,
    });
  }

  return unpacked;
}
