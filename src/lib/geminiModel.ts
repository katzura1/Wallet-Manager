export const DEFAULT_AI_MODEL = "deepseek-flash";

// Pilihan model gateway lama (Gemini/Claude) tidak dikenal DeepSeek, jadi migrasikan ke default.
const LEGACY_MODEL_PATTERN = /^(?:gemini|haiku$|sonnet$|opus$)/;

export function getAIModel(
  modelName = localStorage.getItem("deepseek_model") ?? localStorage.getItem("gemini_model"),
): string {
  const model = modelName?.trim().replace(/^models\//, "");
  return !model || LEGACY_MODEL_PATTERN.test(model) ? DEFAULT_AI_MODEL : model;
}
