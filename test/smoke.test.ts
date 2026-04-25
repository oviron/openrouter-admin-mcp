import { describe, expect, it } from "vitest";
import { OpenRouterClient } from "../src/client.js";

describe("OpenRouterClient constructor", () => {
  it("rejects empty key", () => {
    expect(() => new OpenRouterClient("")).toThrow(/non-empty/);
  });
});
