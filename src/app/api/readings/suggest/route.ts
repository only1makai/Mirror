import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { loadVocabularies } from "@/lib/vision/reference";
import { ImagePrepError, prepareSessionImages } from "@/lib/vision/images";
import { ModelError, requestSuggestion } from "@/lib/vision/suggest";
import { READING_MODEL_VERSION } from "@/lib/anthropic";
import type { SuggestResponse, SuggestStage } from "@/lib/types";

// Node runtime, not edge: sharp is a native binary.
export const runtime = "nodejs";
// A vision call over three images takes a while. Well clear of the default so
// a slow response is a slow response, not a platform timeout the user reads
// as a crash.
export const maxDuration = 120;

function fail(stage: SuggestStage, message: string, status: number) {
  return NextResponse.json<SuggestResponse>(
    { ok: false, stage, message },
    { status },
  );
}

// Returns a suggestion. Writes nothing. Every path out of here either hands
// back a validated draft or an error the form can render — a reading row is
// only ever created by the user submitting the form.
export async function POST(request: Request) {
  let sessionId: string;
  try {
    const body = (await request.json()) as { sessionId?: unknown };
    if (typeof body.sessionId !== "string" || body.sessionId === "") {
      return fail("session", "No capture session was specified.", 400);
    }
    sessionId = body.sessionId;
  } catch {
    return fail("server", "Malformed request.", 400);
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return fail("auth", "You are not signed in.", 401);

  // RLS would filter this anyway. The explicit lookup exists so a bad id
  // returns "we can't find that session" rather than an image error three
  // steps later.
  const { data: session, error: sessionError } = await supabase
    .from("sessions")
    .select("id")
    .eq("id", sessionId)
    .maybeSingle();

  if (sessionError) return fail("session", sessionError.message, 500);
  if (!session) return fail("session", "That capture session was not found.", 404);

  try {
    // Vocabularies and images are independent; no reason to wait twice.
    const [vocab, images] = await Promise.all([
      loadVocabularies(),
      prepareSessionImages(sessionId),
    ]);

    const suggestion = await requestSuggestion(images, vocab);

    return NextResponse.json<SuggestResponse>({
      ok: true,
      suggestion,
      modelVersion: READING_MODEL_VERSION,
    });
  } catch (e) {
    if (e instanceof ImagePrepError) return fail("images", e.message, 502);
    if (e instanceof ModelError) return fail("model", e.message, 502);
    return fail(
      "server",
      e instanceof Error ? e.message : "Something went wrong preparing your reading.",
      500,
    );
  }
}
