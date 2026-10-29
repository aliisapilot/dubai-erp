/**
 * Dubai ERP: Safe Fetch & Non-JSON Response Parser
 * Prevents "Unexpected token '<' / 'R' ... is not valid JSON" crashes.
 * Gracefully handles Vercel 413 (Payload Too Large), 504 (Gateway Timeout),
 * 500, plain text, HTML, and empty responses with request tracking IDs.
 */

export interface SafeFetchResponse<T = unknown> {
  ok: boolean;
  status: number;
  statusText: string;
  data: T | null;
  error: string | null;
  requestId: string | null;
  contentType: string;
  isJson: boolean;
}

/**
 * Extracts a safe request ID from headers or Vercel error text.
 * Example Vercel ID: "bom1::4s7tw-1793268637444-ae2a1b46ecbb"
 */
export function extractSafeRequestId(res: Response, rawBodyText?: string): string | null {
  const headerId =
    res.headers.get("x-vercel-id") ||
    res.headers.get("cf-ray") ||
    res.headers.get("x-request-id") ||
    res.headers.get("traceparent");

  if (headerId) return headerId.trim();

  if (rawBodyText) {
    const vercelMatch = rawBodyText.match(/([a-z0-9]{3,4}\d?::[a-z0-9-]+)/i);
    if (vercelMatch) return vercelMatch[1];
  }

  return null;
}

/**
 * Strips sensitive data, HTML markup, and sanitizes error text for safe user display.
 */
export function sanitizeErrorMessage(text: string): string {
  if (!text) return "";
  let clean = text
    .replace(/<[^>]*>?/gm, " ") // Strip HTML tags
    .replace(/\s+/g, " ") // Normalize spaces
    .replace(/(?:bearer\s+[A-Za-z0-9._-]+)/gi, "[REDACTED_TOKEN]")
    .replace(/(?:service_role[A-Za-z0-9._-]+)/gi, "[REDACTED_KEY]")
    .replace(/(?:password[:=]\s*[^\s,]+)/gi, "password=[REDACTED]")
    .trim();

  if (clean.length > 250) {
    clean = clean.slice(0, 250) + "...";
  }
  return clean;
}

/**
 * Bulletproof HTTP fetch with mandatory status, Content-Type, and text fallback inspection.
 */
export async function safeFetchJson<T = unknown>(
  url: string,
  options?: RequestInit
): Promise<SafeFetchResponse<T>> {
  try {
    const res = await fetch(url, options);
    const contentType = res.headers.get("content-type") || "";
    const isJson = contentType.toLowerCase().includes("application/json");
    const rawText = await res.text();
    const requestId = extractSafeRequestId(res, rawText);

    // 1. Handle Vercel 413 Payload Too Large
    if (res.status === 413) {
      return {
        ok: false,
        status: 413,
        statusText: "Payload Too Large",
        data: null,
        error:
          "The uploaded file or payload exceeds the server request limit (HTTP 413). Files are automatically routed via secure cloud storage for bulk imports.",
        requestId,
        contentType,
        isJson,
      };
    }

    // 2. Handle 504 Gateway / Invocation Timeout
    if (res.status === 504) {
      return {
        ok: false,
        status: 504,
        statusText: "Gateway Timeout",
        data: null,
        error:
          "The server timed out while processing this document (HTTP 504). Please retry this document.",
        requestId,
        contentType,
        isJson,
      };
    }

    // 3. Handle JSON responses
    if (isJson) {
      if (!rawText.trim()) {
        return {
          ok: res.ok,
          status: res.status,
          statusText: res.statusText,
          data: null,
          error: res.ok ? null : `Server returned empty response (HTTP ${res.status}).`,
          requestId,
          contentType,
          isJson: true,
        };
      }

      try {
        const parsedData = JSON.parse(rawText) as T;
        const apiError =
          (parsedData as Record<string, unknown>)?.error ||
          (parsedData as Record<string, unknown>)?.message;

        return {
          ok: res.ok && !apiError,
          status: res.status,
          statusText: res.statusText,
          data: parsedData,
          error: res.ok ? (apiError ? String(apiError) : null) : String(apiError || `Request failed with HTTP ${res.status}`),
          requestId,
          contentType,
          isJson: true,
        };
      } catch {
        return {
          ok: false,
          status: res.status,
          statusText: res.statusText,
          data: null,
          error: `Malformed JSON response from server (HTTP ${res.status}).`,
          requestId,
          contentType,
          isJson: true,
        };
      }
    }

    // 4. Handle non-JSON (HTML / Plain text) responses
    const cleanText = sanitizeErrorMessage(rawText);
    const friendlyError = res.ok
      ? `Server returned non-JSON content (${contentType || "unknown type"}).`
      : cleanText || `Request failed with HTTP ${res.status} (${res.statusText || "Error"}).`;

    return {
      ok: false,
      status: res.status,
      statusText: res.statusText,
      data: null,
      error: friendlyError,
      requestId,
      contentType,
      isJson: false,
    };
  } catch (netErr: unknown) {
    const msg = netErr instanceof Error ? netErr.message : "Network request failed";
    return {
      ok: false,
      status: 0,
      statusText: "Network Error",
      data: null,
      error: `Network error: ${msg}. Please check your internet connection and retry.`,
      requestId: null,
      contentType: "",
      isJson: false,
    };
  }
}
