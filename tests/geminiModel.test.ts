import test from "node:test";
import assert from "node:assert/strict";
import { getAIModel } from "../src/lib/geminiModel.ts";

test("migrates legacy or missing model settings to deepseek-flash and preserves custom models", () => {
  for (const model of [null, "", "  ", "gemini-2.5-flash", " models/gemini-2.5-flash ", "sonnet"]) {
    assert.equal(getAIModel(model), "deepseek-flash");
  }
  assert.equal(getAIModel("deepseek-chat"), "deepseek-chat");
  assert.equal(getAIModel(" custom-model "), "custom-model");
  const original = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: { getItem: (key: string) => key === "gemini_model" ? "gemini-2.5-flash" : null },
  });
  try {
    assert.equal(getAIModel(), "deepseek-flash");
  } finally {
    if (original) Object.defineProperty(globalThis, "localStorage", original);
    else Reflect.deleteProperty(globalThis, "localStorage");
  }
});
