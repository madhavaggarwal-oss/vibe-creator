// Re-export system prompts from gemini.ts (where they are defined)
// This barrel file allows other providers (e.g. openai.ts) to import prompts
// without depending on gemini-specific code.
export {
  SYSTEM_PROMPT,
  CLONE_SYSTEM_PROMPT,
  IMAGE_CLONE_SYSTEM_PROMPT,
  EDIT_SYSTEM_PROMPT,
} from "./gemini";
