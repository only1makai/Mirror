import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { getAnthropic, VISION_MODEL } from "@/lib/anthropic";
import type { ReadingSuggestion, Vocabularies } from "@/lib/types";
import type { PreparedImage } from "./images";
import { buildReadingSchema } from "./schema";
import { buildSystemPrompt, buildUserInstruction, imageLabel } from "./prompt";
import { validateSuggestion } from "./validate";

export class ModelError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ModelError";
  }
}

export async function requestSuggestion(
  images: PreparedImage[],
  vocab: Vocabularies,
): Promise<ReadingSuggestion> {
  const client = getAnthropic();

  const content: Anthropic.Beta.BetaContentBlockParam[] = [];
  for (const img of images) {
    // Label before image so the model knows which angle it is looking at.
    content.push({ type: "text", text: imageLabel(img.angle) });
    content.push({
      type: "image",
      source: { type: "base64", media_type: img.mediaType, data: img.base64 },
    });
  }
  content.push({ type: "text", text: buildUserInstruction() });

  let response: Anthropic.Beta.BetaMessage;
  try {
    response = await client.beta.messages.create({
      model: VISION_MODEL,
      max_tokens: 8000,
      // A face-analysis prompt is the kind of request a safety classifier can
      // decline. Server-side fallback re-runs the same request on a substitute
      // model inside this call, so an occasional decline costs the user
      // nothing instead of dropping them into the blank-form path.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      thinking: { type: "adaptive" },
      output_config: {
        effort: "high",
        format: { type: "json_schema", schema: buildReadingSchema(vocab) },
      },
      system: buildSystemPrompt(vocab),
      messages: [{ role: "user", content }],
    });
  } catch (e) {
    // Deliberately not logging the error object wholesale: request bodies in
    // this flow carry the user's face. 07_BUILD_SEQUENCE.md's logging
    // prohibition covers model responses; the same reasoning covers inputs.
    throw new ModelError(e instanceof Error ? e.message : "Model request failed.");
  }

  if (response.stop_reason === "refusal") {
    throw new ModelError(
      "The model declined to analyse these photos. You can fill the form in yourself.",
    );
  }

  const text = response.content.find((b) => b.type === "text");
  if (!text || text.type !== "text" || text.text.trim() === "") {
    throw new ModelError("The model returned no readable output.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text.text);
  } catch {
    throw new ModelError("The model returned output this app could not read.");
  }

  // Raw responses are never persisted or logged, per 07_BUILD_SEQUENCE.md.
  // Only the validated, structured suggestion leaves this function.
  return validateSuggestion(parsed, vocab);
}
