import OpenAI from "openai";
import {
  SYSTEM_PROMPT,
  CLONE_SYSTEM_PROMPT,
  IMAGE_CLONE_SYSTEM_PROMPT,
  EDIT_SYSTEM_PROMPT,
} from "./system-prompts";
import {
  parseAIJson,
  sanitizeCssFiles,
  fixImageClassNames,
  resolveCustomColors,
} from "./generation-utils";
import { processImageMarkers } from "./image-gen";
import { getActiveTrace } from "./langfuse";
import { validateAndRepairFiles } from "./syntax-repair";
import type { ScrapeDataForGeneration } from "./gemini";

const RETRY_DELAYS = [3000, 6000, 12000];

async function withRetry<T>(
  fn: () => Promise<T>,
  signal?: AbortSignal
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (error) {
      const isRetryable =
        error instanceof Error &&
        (error.message.includes("429") ||
          error.message.includes("rate_limit") ||
          error.message.includes("overloaded") ||
          error.message.includes("503") ||
          error.message.includes("server_error"));

      if (!isRetryable || attempt >= RETRY_DELAYS.length || signal?.aborted) {
        throw error;
      }

      console.warn(
        `[OpenAI] Retryable error (attempt ${attempt + 1}/${RETRY_DELAYS.length}): ${(error as Error).message}. Retrying in ${RETRY_DELAYS[attempt] / 1000}s...`
      );
      await new Promise((r) => setTimeout(r, RETRY_DELAYS[attempt]));
    }
  }
}

interface ResponsesInputItem {
  type: "message";
  role: "system" | "user" | "assistant";
  content: string | ResponsesContentPart[];
}

interface ResponsesContentPart {
  type: "input_text" | "input_image";
  text?: string;
  image_url?: string;
  detail?: "high" | "low" | "auto";
}

function imagesToContentParts(images: string[]): ResponsesContentPart[] {
  return images.map((dataUrl) => ({
    type: "input_image" as const,
    image_url: dataUrl,
    detail: "high" as const,
  }));
}

function addGptPromptAddendum(systemPrompt: string): string {
  return systemPrompt + `

═══════════════════════════════════════
  CRITICAL CODE QUALITY RULES
═══════════════════════════════════════

- NEVER redefine or shadow imported names. If you import { NavLink } from "react-router-dom", do NOT declare a local function/const named NavLink. Use a different name like NavItem or NavLinkStyled.
- NEVER import a named export as default or vice versa. If a file uses "export default function Foo", import it as "import Foo from ...", NOT "import { Foo } from ...".
- Every component file MUST have exactly one default export matching the component name.
- Do NOT define multiple components with the same name across different scopes in the same file.
- When using lucide-react icons, make sure the icon names you import actually exist in the library.`;
}

export async function generateFunnel(
  prompt: string,
  modelId: string,
  images?: string[],
  scrapeData?: ScrapeDataForGeneration,
  signal?: AbortSignal,
  isImageClone?: boolean
): Promise<{ files: Record<string, string>; hasCalendar: boolean }> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY environment variable is not set");
  }

  const openai = new OpenAI({ apiKey });

  const isUrlCloneMode = !!scrapeData;
  const isImageCloneMode = !isUrlCloneMode && !!isImageClone && !!images && images.length > 0;
  const pipeline = isImageCloneMode ? "IMAGE_CLONE" : isUrlCloneMode ? "URL_CLONE" : "NORMAL_GENERATION";
  console.log(`[generateFunnel:openai] Pipeline: ${pipeline} | Model: ${modelId} | API: Responses (effort=none)`);

  // Select system prompt
  let systemPrompt: string;
  if (isImageCloneMode) {
    systemPrompt = IMAGE_CLONE_SYSTEM_PROMPT;
  } else if (isUrlCloneMode) {
    systemPrompt = CLONE_SYSTEM_PROMPT;
  } else {
    systemPrompt = SYSTEM_PROMPT;
  }
  systemPrompt = addGptPromptAddendum(systemPrompt);

  // Build input items for Responses API
  const inputItems: ResponsesInputItem[] = [
    { type: "message", role: "system", content: systemPrompt },
  ];

  // Build user message content parts
  const userContent: ResponsesContentPart[] = [];

  if (isImageCloneMode) {
    userContent.push(...imagesToContentParts(images!));
    const imageCount = images!.length;
    const imageContext = imageCount === 1
      ? "I've provided a screenshot of a website. Clone it exactly as shown."
      : `I've provided ${imageCount} screenshots. Analyze all of them and recreate the complete website.`;
    userContent.push({ type: "input_text", text: `${imageContext}\n\nUser instructions: ${prompt}` });
  } else if (isUrlCloneMode) {
    const brandingSection = scrapeData.branding
      ? `## Branding\nColors: ${JSON.stringify(scrapeData.branding.colors)}\nFonts: ${JSON.stringify(scrapeData.branding.fonts)}\nTypography: ${JSON.stringify(scrapeData.branding.typography)}\nSpacing: ${JSON.stringify(scrapeData.branding.spacing)}`
      : "## Branding\nNo branding data available. Infer colors, fonts, and spacing from the screenshot.";

    const sourceImages = scrapeData.images && scrapeData.images.length > 0
      ? `## Source Image URLs (use these EXACT URLs in your code)\n${scrapeData.images.slice(0, 50).map((url: string, i: number) => `${i + 1}. ${url}`).join("\n")}`
      : "## Source Image URLs\nNo source images extracted. Use __IMG:description__ markers for all images visible in the screenshot.";

    const cloneMessage = `Clone this website. Here is the scraped data:

## Page Title: ${scrapeData.metadata.title || "Unknown"}
## Page Description: ${scrapeData.metadata.description || ""}

${brandingSection}

${sourceImages}

## Content (Markdown)
${scrapeData.markdown.slice(0, 60000)}

## HTML Structure (for layout reference)
${scrapeData.html.slice(0, 50000)}

## User Instructions
${prompt || "Clone this website exactly as shown in the screenshot."}`;

    userContent.push({ type: "input_text", text: cloneMessage });

    if (images && images.length > 0) {
      userContent.push(...imagesToContentParts(images));
    }
  } else {
    userContent.push({ type: "input_text", text: `Create a website for: ${prompt}` });

    if (images && images.length > 0) {
      userContent.push(...imagesToContentParts(images));
    }
  }

  inputItems.push({ type: "message", role: "user", content: userContent });

  // Langfuse tracing
  const trace = getActiveTrace();
  const langfuseGen = trace?.generation({
    name: "openai-generate-funnel",
    model: modelId,
    input: userContent.map((p) =>
      p.type === "input_text" ? { text: p.text } : { image: "input_image" }
    ),
    metadata: { isCloneMode: isUrlCloneMode, isImageCloneMode, api: "responses", effort: "none" },
  });

  console.log(`[generateFunnel:openai] Sending Responses API request (${modelId}, effort=none)...`);
  const t0 = Date.now();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = await withRetry(async () => {
    const response = await (openai as any).responses.create({
      model: modelId,
      input: inputItems,
      reasoning: { effort: "none" },
      text: { format: { type: "json_object" } },
      temperature: 1,
      max_output_tokens: 100000,
    });
    return response;
  }, signal);

  console.log(`[generateFunnel:openai] OpenAI responded in ${Date.now() - t0}ms`);

  // Extract text from Responses API output
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const outputItems = (result as any).output || [];
  let text = "";
  for (const item of outputItems) {
    if (item.type === "message" && item.content) {
      for (const part of item.content) {
        if (part.type === "output_text") {
          text += part.text;
        }
      }
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const status = (result as any).status;
  if (status && status !== "completed") {
    console.warn(`[generateFunnel:openai] Response status: ${status} (output may be truncated)`);
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const usage = (result as any).usage;
  console.log(`[generateFunnel:openai] Response length: ${text.length} chars, status: ${status}`);
  console.log(`[generateFunnel:openai] Tokens — input: ${usage?.input_tokens}, output: ${usage?.output_tokens}, total: ${(usage?.input_tokens || 0) + (usage?.output_tokens || 0)}`);

  langfuseGen?.end({
    output: text,
    usage: {
      input: usage?.input_tokens,
      output: usage?.output_tokens,
      total: (usage?.input_tokens || 0) + (usage?.output_tokens || 0),
    },
    metadata: { status, responseLength: text.length },
  });

  console.log("[generateFunnel:openai] Parsing AI response...", text.length, "chars");
  const parsed = parseAIJson(text) as Record<string, unknown>;
  console.log("[generateFunnel:openai] Parsed successfully");

  const hasCalendar = parsed.hasCalendar === true;
  console.log(`[generateFunnel:openai] hasCalendar: ${hasCalendar}`);

  if (!parsed.files || typeof parsed.files !== "object") {
    throw new Error("Invalid response from AI: expected { files: {...} }");
  }

  const rawFiles = parsed.files as Record<string, unknown>;
  const files: Record<string, string> = {};
  for (const [path, content] of Object.entries(rawFiles)) {
    if (typeof content === "string") {
      files[path] = content;
    }
  }
  console.log("[generateFunnel:openai] Filtered files:", Object.keys(files).length);

  const essentialFiles = ["/src/App.tsx", "/src/main.tsx", "/package.json"];
  for (const f of essentialFiles) {
    if (!files[f]) {
      throw new Error(`Missing essential file: ${f}`);
    }
  }

  if (signal?.aborted) {
    throw new DOMException("Generation cancelled", "AbortError");
  }

  console.log("[generateFunnel:openai] Processing image markers...");
  const filesWithImages = await processImageMarkers(files);
  console.log("[generateFunnel:openai] Image markers done");

  const sanitizedFiles = sanitizeCssFiles(filesWithImages);
  const fixedFiles = fixImageClassNames(sanitizedFiles);
  const resolvedFiles = resolveCustomColors(fixedFiles);
  const repairedFiles = await validateAndRepairFiles(resolvedFiles);
  return { files: repairedFiles, hasCalendar };
}

export async function editFunnel(
  currentFiles: Record<string, string>,
  instruction: string,
  chatHistory: { role: string; content: string }[],
  modelId: string,
  images?: string[],
  signal?: AbortSignal
): Promise<{
  message: string;
  files: Record<string, string | null>;
  hasCalendar: boolean;
}> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY environment variable is not set");
  }

  const openai = new OpenAI({ apiKey });

  const currentState = JSON.stringify(currentFiles);

  const historyContext =
    chatHistory.length > 0
      ? "\n\nPrevious conversation:\n" +
        chatHistory
          .slice(-10)
          .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
          .join("\n")
      : "";

  const editSystemPrompt = addGptPromptAddendum(EDIT_SYSTEM_PROMPT);

  // Build input items for Responses API
  const userContent: ResponsesContentPart[] = [
    {
      type: "input_text",
      text: `Here are the current project files:\n${currentState}${historyContext}\n\nUser's edit instruction: ${instruction}`,
    },
  ];
  if (images && images.length > 0) {
    userContent.push(...imagesToContentParts(images));
  }

  const inputItems: ResponsesInputItem[] = [
    { type: "message", role: "system", content: editSystemPrompt },
    { type: "message", role: "user", content: userContent },
  ];

  const trace = getActiveTrace();
  const langfuseGen = trace?.generation({
    name: "openai-edit-funnel",
    model: modelId,
    input: userContent.map((p) =>
      p.type === "input_text" ? { text: p.text } : { image: "input_image" }
    ),
    metadata: { api: "responses", effort: "none" },
  });

  console.log(`[editFunnel:openai] Sending Responses API edit request (${modelId}, effort=none)...`);
  const t0 = Date.now();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = await withRetry(async () => {
    const response = await (openai as any).responses.create({
      model: modelId,
      input: inputItems,
      reasoning: { effort: "none" },
      text: { format: { type: "json_object" } },
      temperature: 1,
      max_output_tokens: 100000,
    });
    return response;
  }, signal);

  console.log(`[editFunnel:openai] OpenAI responded in ${Date.now() - t0}ms`);

  // Extract text from Responses API output
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const outputItems = (result as any).output || [];
  let text = "";
  for (const item of outputItems) {
    if (item.type === "message" && item.content) {
      for (const part of item.content) {
        if (part.type === "output_text") {
          text += part.text;
        }
      }
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const usage = (result as any).usage;
  langfuseGen?.end({
    output: text,
    usage: {
      input: usage?.input_tokens,
      output: usage?.output_tokens,
      total: (usage?.input_tokens || 0) + (usage?.output_tokens || 0),
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    metadata: { status: (result as any).status },
  });

  const parsed = parseAIJson(text) as Record<string, unknown>;

  const hasCalendar = parsed.hasCalendar === true;

  if (!parsed.files || typeof parsed.files !== "object") {
    throw new Error("Invalid response from AI: expected { files: {...} }");
  }

  const message = typeof parsed.message === "string"
    ? parsed.message
    : parsed.message != null
      ? String(parsed.message)
      : "Changes applied.";

  const rawFiles = parsed.files as Record<string, string | null>;
  const codeFiles: Record<string, string> = {};
  const otherFiles: Record<string, string | null> = {};
  for (const [k, v] of Object.entries(rawFiles)) {
    if (v === null) {
      otherFiles[k] = null;
    } else if (typeof v === "string") {
      codeFiles[k] = v;
    }
  }
  const sanitizedFiles = sanitizeCssFiles(codeFiles);
  const fixedFiles = fixImageClassNames(sanitizedFiles);
  const resolvedFiles = resolveCustomColors(fixedFiles);
  const repairedFiles = await validateAndRepairFiles(resolvedFiles);

  return { message, files: { ...repairedFiles, ...otherFiles }, hasCalendar };
}
