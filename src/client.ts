const BASE = "https://openrouter.ai/api/v1";

export class OpenRouterError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "OpenRouterError";
  }
}

export interface RequestOptions {
  query?: Record<string, string | number | undefined>;
  body?: unknown;
  /** Skip in-session cache for this GET. Default false. */
  noCache?: boolean;
}

export interface ClientOptions {
  /**
   * Retry transient failures (429, 5xx). Default 3. Set to 0 to disable.
   * Honors Retry-After header when present, otherwise exponential backoff: 1s, 2s, 4s.
   */
  maxRetries?: number;
  /**
   * Enable in-session GET cache. Default true. TTL configured per-path; non-cached
   * paths bypass the layer entirely. Disable to always hit upstream.
   */
  cache?: boolean;
  /** Override default cache TTL (ms). Default 60_000. */
  cacheTtlMs?: number;
  /** Sleep override for tests. */
  sleep?: (ms: number) => Promise<void>;
}

const DEFAULT_TTL_MS = 60_000;
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

// Paths whose responses are safe to cache within a single session. List endpoints
// (/keys, /credits, /key) only — never cache /activity or /generation results.
const CACHEABLE_PATHS = new Set(["/credits", "/key", "/keys"]);

interface CacheEntry {
  expiresAt: number;
  value: unknown;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export class OpenRouterClient {
  private readonly maxRetries: number;
  private readonly cacheEnabled: boolean;
  private readonly ttlMs: number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly cache = new Map<string, CacheEntry>();

  constructor(
    private key: string,
    options: ClientOptions = {},
  ) {
    if (!key) throw new Error("OpenRouterClient requires a non-empty key");
    this.maxRetries = options.maxRetries ?? 3;
    this.cacheEnabled = options.cache ?? true;
    this.ttlMs = options.cacheTtlMs ?? DEFAULT_TTL_MS;
    this.sleep = options.sleep ?? defaultSleep;
  }

  async request<T>(
    method: "GET" | "POST" | "PATCH" | "DELETE",
    path: string,
    opts: RequestOptions = {},
  ): Promise<T> {
    const url = this.buildUrl(path, opts.query);
    const cacheKey = method === "GET" ? url : null;
    const useCache =
      this.cacheEnabled && cacheKey !== null && !opts.noCache && this.isCacheablePath(path);

    if (useCache && cacheKey !== null) {
      const hit = this.cache.get(cacheKey);
      if (hit && hit.expiresAt > Date.now()) return hit.value as T;
    }

    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.key}`,
      Accept: "application/json",
    };
    const init: RequestInit = { method, headers };
    if (opts.body !== undefined) {
      headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(opts.body);
    }

    const result = await this.fetchWithRetry<T>(url, init);

    // Mutations on /keys invalidate cached lists.
    if (method !== "GET" && path.startsWith("/keys")) {
      this.invalidate("/keys");
    }

    if (useCache && cacheKey !== null) {
      this.cache.set(cacheKey, { expiresAt: Date.now() + this.ttlMs, value: result });
    }
    return result;
  }

  /** Drop cache entries for a given path prefix. Useful after writes. */
  invalidate(pathPrefix: string): void {
    const prefix = BASE + pathPrefix;
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) this.cache.delete(key);
    }
  }

  private isCacheablePath(path: string): boolean {
    if (CACHEABLE_PATHS.has(path)) return true;
    // /keys/{hash} also cacheable
    return path.startsWith("/keys/") && !path.includes("/", 6);
  }

  private buildUrl(path: string, query?: Record<string, string | number | undefined>): string {
    let url = BASE + path;
    if (query) {
      const qs = Object.entries(query)
        .filter(([, v]) => v !== undefined && v !== null && v !== "")
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
        .join("&");
      if (qs) url += `?${qs}`;
    }
    return url;
  }

  private async fetchWithRetry<T>(url: string, init: RequestInit): Promise<T> {
    let attempt = 0;
    let lastError: OpenRouterError | null = null;

    while (attempt <= this.maxRetries) {
      const res = await fetch(url, init);
      const text = await res.text();
      let payload: unknown = null;
      if (text) {
        try {
          payload = JSON.parse(text);
        } catch {
          payload = text;
        }
      }

      if (res.ok) {
        if (
          payload &&
          typeof payload === "object" &&
          "data" in (payload as Record<string, unknown>)
        ) {
          return (payload as { data: T }).data;
        }
        return payload as T;
      }

      const err = new OpenRouterError(res.status, this.formatError(res.status, payload));
      lastError = err;

      const retryable = RETRYABLE_STATUS.has(res.status);
      if (!retryable || attempt === this.maxRetries) throw err;

      const retryAfterMs = parseRetryAfter(res.headers.get("retry-after"));
      const backoffMs = retryAfterMs ?? Math.min(1000 * 2 ** attempt, 8000);
      await this.sleep(backoffMs);
      attempt++;
    }

    // Unreachable, but TS needs it.
    throw lastError ?? new OpenRouterError(0, "request failed");
  }

  private formatError(status: number, payload: unknown): string {
    const apiMsg = this.extractMessage(payload);
    switch (status) {
      case 401:
        return "Invalid or expired Provisioning key (401)";
      case 403:
        return "Provisioning key lacks required scope (403)";
      case 429:
        return "Rate limited by OpenRouter (429)";
      default: {
        const trunc = apiMsg.length > 300 ? `${apiMsg.slice(0, 300)}…` : apiMsg;
        return `OpenRouter ${status}: ${trunc || "(empty body)"}`;
      }
    }
  }

  private extractMessage(payload: unknown): string {
    if (!payload) return "";
    if (typeof payload === "string") return payload;
    const p = payload as Record<string, unknown>;
    if (p.error && typeof p.error === "object") {
      const e = p.error as Record<string, unknown>;
      if (typeof e.message === "string") return e.message;
    }
    if (typeof p.message === "string") return p.message;
    return JSON.stringify(payload);
  }
}

/** Parse Retry-After header (HTTP-date or delta-seconds) into milliseconds. */
function parseRetryAfter(header: string | null): number | null {
  if (!header) return null;
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const date = Date.parse(header);
  if (Number.isFinite(date)) {
    const delta = date - Date.now();
    return delta > 0 ? delta : 0;
  }
  return null;
}
