export const MODELS = [
  { id: "gemini-3-pro-preview", label: "Gemini 3 Pro", provider: "gemini" },
  { id: "gpt-5.4", label: "GPT 5.4", provider: "openai" },
] as const;

export const DEFAULT_MODEL = MODELS[0];
export const DUAL_MODEL = MODELS[1];
