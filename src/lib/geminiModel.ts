export const DEFAULT_GEMINI_MODEL = "gemini-3.8-flash";

export function getGeminiModel(modelName = localStorage.getItem("gemini_model")): string {
  const model = modelName?.trim().replace(/^models\//, "");
  return !model || model === "gemini-2.5-flash" ? DEFAULT_GEMINI_MODEL : model;
}
