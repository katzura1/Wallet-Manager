export const DEFAULT_AI_MODEL = "sonnet";

export function getAIModel(modelName = localStorage.getItem("gemini_model")): string {
  const model = modelName?.trim().replace(/^models\//, "");
  return !model || model.startsWith("gemini") ? DEFAULT_AI_MODEL : model;
}
