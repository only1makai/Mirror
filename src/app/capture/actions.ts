"use server";

import { createClient } from "@/lib/supabase/server";
import { type Angle } from "@/lib/types";

export type CreateSessionResult =
  | { ok: true; sessionId: string; userId: string }
  | { ok: false; error: string };

export async function createSession(): Promise<CreateSessionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not authenticated" };

  const { data, error } = await supabase
    .from("sessions")
    .insert({ user_id: user.id })
    .select("id")
    .single();

  if (error) return { ok: false, error: error.message };
  return { ok: true, sessionId: data.id, userId: user.id };
}

export async function savePhotoRow(
  sessionId: string,
  angle: Angle,
  storagePath: string,
  width: number,
  height: number,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.from("photos").upsert(
    {
      session_id: sessionId,
      angle,
      storage_path: storagePath,
      width,
      height,
    },
    { onConflict: "session_id,angle" },
  );
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function finalizeSession(
  sessionId: string,
  lightingScore: number | null,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("sessions")
    .update({ lighting_score: lightingScore })
    .eq("id", sessionId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// If the user abandons mid-session, drop the empty session row.
export async function discardSession(sessionId: string): Promise<void> {
  const supabase = await createClient();
  await supabase.from("sessions").delete().eq("id", sessionId);
}
