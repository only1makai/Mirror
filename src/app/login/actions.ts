"use server";

import { createClient } from "@/lib/supabase/server";

// Email OTP, not magic links. The code is typed into the app, so sign-in never
// depends on which browser context opens a link — magic links broke on mobile
// both via PKCE (missing verifier cookie) and implicit (fragment lost in the
// Mail -> Safari handoff), and link prefetching can burn a single-use token.
//
// Verification runs server-side so the session cookie is written by this
// action's response. Middleware then sees it on the next navigation, with no
// client-cookie/redirect race.

export async function sendCode(
  email: string,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();

  // No emailRedirectTo: nothing is clicked, so no redirect URL is involved.
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: true },
  });

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function verifyCode(
  email: string,
  token: string,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();

  const { error } = await supabase.auth.verifyOtp({
    email,
    token,
    type: "email",
  });

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
