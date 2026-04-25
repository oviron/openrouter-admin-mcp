import { describe, it, expect } from "vitest";
import { OpenRouterClient } from "../src/client.js";

describe("OpenRouterClient constructor", () => {
  it("rejects empty key", () => {
    expect(() => new OpenRouterClient("")).toThrow(/non-empty/);
  });
});
