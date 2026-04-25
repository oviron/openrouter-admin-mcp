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
}

export class OpenRouterClient {
  constructor(private key: string) {
    if (!key) throw new Error("OpenRouterClient requires a non-empty key");
  }

  async request<T>(
    method: "GET" | "POST" | "PATCH" | "DELETE",
    path: string,
    opts: RequestOptions = {},
  ): Promise<T> {
    let url = BASE + path;
    if (opts.query) {
      const qs = Object.entries(opts.query)
        .filter(([, v]) => v !== undefined && v !== null && v !== "")
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
        .join("&");
      if (qs) url += `?${qs}`;
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

    const res = await fetch(url, init);
    let payload: unknown = null;
    const text = await res.text();
    if (text) {
      try {
        payload = JSON.parse(text);
      } catch {
        payload = text;
      }
    }

    if (!res.ok) {
      throw new OpenRouterError(res.status, this.formatError(res.status, payload));
    }

    if (payload && typeof payload === "object" && "data" in (payload as Record<string, unknown>)) {
      return (payload as { data: T }).data;
    }
    return payload as T;
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
