import test from "node:test";
import assert from "node:assert/strict";
import { getGeminiModel } from "../src/lib/geminiModel.ts";

test("uses the current Gemini model for missing or legacy settings and preserves custom models", () => {
  for (const model of [null, "", "  ", "gemini-2.5-flash", " models/gemini-2.5-flash "]) {
    assert.equal(getGeminiModel(model), "gemini-3.8-flash");
  }
  assert.equal(getGeminiModel("gemini-3.8-flash"), "gemini-3.8-flash");
  assert.equal(getGeminiModel(" models/custom-model "), "custom-model");
  const original = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: { getItem: (key: string) => key === "gemini_model" ? "gemini-2.5-flash" : null },
  });
  try {
    assert.equal(getGeminiModel(), "gemini-3.8-flash");
  } finally {
    if (original) Object.defineProperty(globalThis, "localStorage", original);
    else Reflect.deleteProperty(globalThis, "localStorage");
  }
});
