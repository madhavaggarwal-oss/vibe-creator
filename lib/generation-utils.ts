// Re-export shared post-processing utilities from gemini.ts
// This barrel file allows other providers (e.g. openai.ts) to import utils
// without depending on gemini-specific code.
export {
  parseAIJson,
  sanitizeCssFiles,
  fixImageClassNames,
  resolveCustomColors,
} from "./gemini";
