/**
 * Real upload progress (Phase 1b).
 *
 * `fetch()` cannot report upload progress, so uploads that show a
 * percentage go through `XMLHttpRequest` here instead. The percentage
 * comes from the browser's `upload.onprogress` events — never invented.
 * When the browser cannot compute the total (`lengthComputable` is
 * false) no progress callback fires and the caller must fall back to
 * an indeterminate indicator (Button loading state); it must never
 * show a made-up percentage.
 *
 * Only the percentage math is pure and unit-tested (node env has no
 * `XMLHttpRequest`); the XHR wrapper is verified by `tsc` + build.
 */

/** Pure percentage math: 0–100, rounded; 0 when the total is unknown. */
export function uploadProgressPercent(loaded: number, total: number): number {
  if (!Number.isFinite(loaded) || !Number.isFinite(total)) return 0;
  if (total <= 0 || loaded <= 0) return 0;
  return Math.min(100, Math.round((loaded / total) * 100));
}

export interface UploadProgressResult {
  ok: boolean;
  status: number;
  /** Parsed JSON body, or `null` when the response is not JSON. */
  json: unknown;
}

/**
 * POST a `FormData` body and report real upload progress. Same-origin
 * cookies are sent, exactly like `fetch`. Resolves (never throws) for
 * HTTP responses — check `ok`/`status` like a `fetch` response;
 * rejects only on network failure or abort. The response body is
 * parsed as JSON when possible.
 */
export function uploadWithProgress(
  url: string,
  body: FormData,
  onProgress?: (percent: number) => void,
): Promise<UploadProgressResult> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.responseType = "text";
    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable) {
        onProgress?.(uploadProgressPercent(e.loaded, e.total));
      }
    });
    xhr.addEventListener("load", () => {
      let json: unknown = null;
      try {
        json = xhr.responseText ? JSON.parse(xhr.responseText) : null;
      } catch {
        json = null;
      }
      resolve({ ok: xhr.status >= 200 && xhr.status < 300, status: xhr.status, json });
    });
    xhr.addEventListener("error", () =>
      reject(new Error("Network error — please check your connection and retry.")),
    );
    xhr.addEventListener("abort", () =>
      reject(new Error("Upload cancelled.")),
    );
    xhr.send(body);
  });
}
