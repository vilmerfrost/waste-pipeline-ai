// Multi-Model AI Clients
// Anthropic (Direct), Mistral (Direct), Gemini via OpenRouter

import Anthropic from "@anthropic-ai/sdk";
import { Mistral } from "@mistralai/mistralai";
import OpenAI from "openai";

// ═══════════════════════════════════════════════════════════════════════════
// ANTHROPIC (Direct) - Claude Sonnet 4.5 + Haiku 4.5
// ═══════════════════════════════════════════════════════════════════════════
let cachedAnthropic: Anthropic | null = null;
let cachedMistral: Mistral | null = null;
let cachedOpenRouter: OpenAI | null = null;

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(
      `Missing credentials. Please pass an apiKey, or set the ${key} environment variable.`
    );
  }
  return value;
}

export function getAnthropic(): Anthropic {
  if (!cachedAnthropic) {
    cachedAnthropic = new Anthropic({
      apiKey: requireEnv("ANTHROPIC_API_KEY"),
    });
  }
  return cachedAnthropic;
}

// ═══════════════════════════════════════════════════════════════════════════
// MISTRAL (Direct) - OCR 3
// ═══════════════════════════════════════════════════════════════════════════
export function getMistral(): Mistral {
  if (!cachedMistral) {
    cachedMistral = new Mistral({
      apiKey: requireEnv("MISTRAL_API_KEY"),
    });
  }
  return cachedMistral;
}

// ═══════════════════════════════════════════════════════════════════════════
// OPENROUTER (For Gemini 3 Flash)
// ═══════════════════════════════════════════════════════════════════════════
export function getOpenRouter(): OpenAI {
  if (!cachedOpenRouter) {
    cachedOpenRouter = new OpenAI({
      baseURL: "https://openrouter.ai/api/v1",
      apiKey: requireEnv("OPENROUTER_API_KEY"),
      defaultHeaders: {
        "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL || "https://localhost:3000",
        "X-Title": "Collecct Document Processor",
      },
    });
  }
  return cachedOpenRouter;
}

// ═══════════════════════════════════════════════════════════════════════════
// GEMINI 3 FLASH via OpenRouter
// ═══════════════════════════════════════════════════════════════════════════

// OpenRouter model ID for Gemini 3 Flash
const GEMINI_MODEL = "google/gemini-3-flash-preview";

interface GeminiResponse {
  content: string;
  finishReason: string;
}

/**
 * Call Gemini 3 Flash for text-only prompts
 */
export async function callGeminiFlash(prompt: string): Promise<GeminiResponse> {
  const response = await getOpenRouter().chat.completions.create({
    model: GEMINI_MODEL,
    messages: [{ role: "user", content: prompt }],
    max_tokens: 8192,
    temperature: 0,
  });

  return {
    content: response.choices[0]?.message?.content || "",
    finishReason: response.choices[0]?.finish_reason || "unknown",
  };
}

/**
 * Call Gemini 3 Flash with image/document input
 */
export async function callGeminiFlashWithVision(
  prompt: string,
  base64Data: string,
  mimeType: string = "application/pdf"
): Promise<GeminiResponse> {
  const response = await getOpenRouter().chat.completions.create({
    model: GEMINI_MODEL,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image_url",
            image_url: {
              url: `data:${mimeType};base64,${base64Data}`,
            },
          },
          {
            type: "text",
            text: prompt,
          },
        ],
      },
    ],
    max_tokens: 16384,
    temperature: 0,
  });

  return {
    content: response.choices[0]?.message?.content || "",
    finishReason: response.choices[0]?.finish_reason || "unknown",
  };
}

/**
 * Call Gemini 3 Flash with code execution enabled (Agentic Vision)
 * Note: OpenRouter doesn't support Gemini's code execution tool directly
 * We simulate agentic behavior with structured analysis prompting
 */
export async function callGeminiFlashAgentic(
  prompt: string,
  base64Data?: string,
  mimeType: string = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
): Promise<GeminiResponse> {
  // Enhance prompt with agentic reasoning structure
  const agenticPrompt = `You are an AI with analytical capabilities. 

TASK: ${prompt}

APPROACH:
1. THINK: Analyze the document structure carefully
2. PLAN: Describe your extraction strategy
3. EXTRACT: Execute the extraction following your plan
4. VERIFY: Check your output for consistency

Provide your response as valid JSON only.`;

  if (base64Data) {
    return callGeminiFlashWithVision(agenticPrompt, base64Data, mimeType);
  }
  
  return callGeminiFlash(agenticPrompt);
}

// ═══════════════════════════════════════════════════════════════════════════
// MODEL CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════
export const MODELS = {
  // Quality Assessment & Routing
  QUALITY_ASSESSMENT: GEMINI_MODEL,
  
  // Primary Extraction
  PDF_EXTRACTION: "mistral-ocr-latest",
  EXCEL_EXTRACTION: GEMINI_MODEL,
  
  // Verification (Always On)
  VERIFICATION: "claude-haiku-4-5-20251001",
  
  // Reconciliation (Confidence < 0.80)
  RECONCILIATION: "claude-sonnet-4-5-20250929",
  
  // Document Assistant
  ASSISTANT: "claude-haiku-4-5-20251001",
} as const;

// Threshold configuration
export const THRESHOLDS = {
  RECONCILIATION_TRIGGER: 0.80,
  AUTO_APPROVE_DEFAULT: 80,
  VERIFICATION_CONFIDENCE: 0.85,
} as const;
