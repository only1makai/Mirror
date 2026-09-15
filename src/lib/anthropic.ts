import "server-only";
import Anthropic from "@anthropic-ai/sdk";

// Constructed lazily. A missing key then surfaces inside the route, where it
// becomes a handled error state the user can retry or skip past, instead of a
// module-load throw that takes down every page importing this file.
let client: Anthropic | null = null;

// The SDK defaults to a 10 minute timeout and 2 retries, which can outlast the
// route's own maxDuration of 120s by a wide margin. When that happens the
// platform kills the function mid-flight and the user gets a dead request
// instead of the error state the form knows how to render.
//
// One attempt, capped below maxDuration, so the failure is always ours to
// report. Retrying is the user's call — the form has a "Try again" button, and
// a second silent attempt on a vision request is not cheap.
const REQUEST_TIMEOUT_MS = 100_000;

export function getAnthropic(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set on the server.");
  client ??= new Anthropic({
    apiKey,
    timeout: REQUEST_TIMEOUT_MS, // milliseconds in the TS SDK
    maxRetries: 0,
  });
  return client;
}

export const VISION_MODEL = "claude-opus-5";

// Written to readings.model_version for debugging and audit only — never
// surfaced to the user, and never treated as a confidence signal. Bump the
// suffix whenever the prompt or the output schema changes shape, so an old
// row stays traceable to what produced it.
export const READING_MODEL_VERSION = `${VISION_MODEL}/suggest-v1`;
