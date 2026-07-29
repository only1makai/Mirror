"use server";

import { createClient } from "@/lib/supabase/server";
import { type AuthError } from "@supabase/supabase-js";

// Email OTP, not magic links. The code is typed into the app, so sign-in never
// depends on which browser context opens a link — magic links broke on mobile
// both via PKCE (missing verifier cookie) and implicit (fragment lost in the
// Mail -> Safari handoff), and link prefetching can burn a single-use token.
//
// Verification runs server-side so the session cookie is written by this
// action's response. Middleware then sees it on the next navigation, with no
// client-cookie/redirect race.

// @supabase/auth-js treats any 5xx from the auth API as a generic "retryable"
// error and throws before parsing the response body, so `error.message` for a
// 500 (e.g. the mailer/SMTP failing) is `JSON.stringify(rawFetchResponse)`,
// which is literally the string "{}" — not the real message ("Error sending
// magic link email") that Supabase actually returned. Log the status/code so
// the real cause is visible in Vercel logs, and never surface that "{}" to
// the user.
function describeAuthError(action: "send" | "verify", error: AuthError): string {
  console.error(`[auth/${action}] failed`, {
    message: error.message,
    status: error.status,
    code: error.code,
    name: error.name,
    // Full serialization as a fallback in case there's a field the four
    // above don't cover — AuthError's own properties are non-enumerable,
    // so a plain console.error(error) or JSON.stringify(error) elsewhere
    // would silently print "{}" (see the 500-handling note above).
    raw: JSON.stringify(error, Object.getOwnPropertyNames(error)),
  });

  if (error.status && error.status >= 500) {
    return `Email service error (HTTP ${error.status}). This usually means SMTP isn't configured correctly — check Supabase Authentication → Logs.`;
  }
  return error.message || `Something went wrong (${error.name}).`;
}

export async function sendCode(
  email: string,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();

  // TEMPORARY DEBUG LOGGING — remove once the "Token has expired or is
  // invalid" mystery is resolved. Logged so the email actually sent to
  // signInWithOtp can be diffed against what verifyCode later receives, to
  // rule out a stale/mismatched email between the two calls.
  console.log("[auth/send] params", {
    email: JSON.stringify(email),
    emailLength: email.length,
  });

  // No emailRedirectTo: nothing is clicked, so no redirect URL is involved.
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: true },
  });

  if (error) return { ok: false, error: describeAuthError("send", error) };
  return { ok: true };
}

export async function verifyCode(
  email: string,
  token: string,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();

  // TEMPORARY DEBUG LOGGING — remove once the "Token has expired or is
  // invalid" mystery is resolved. JSON.stringify on email/token surfaces
  // whitespace, newlines, or other invisible characters (they show up as
  // escape sequences instead of vanishing into the log line); charCodes
  // pins down exactly what each character is in case something non-ASCII
  // snuck in via copy-paste (e.g. a non-breaking space, U+00A0).
  console.log("[auth/verify] params", {
    email: JSON.stringify(email),
    emailLength: email.length,
    token: JSON.stringify(token),
    tokenLength: token.length,
    tokenTrimmedLength: token.trim().length,
    tokenCharCodes: Array.from(token).map((c) => c.charCodeAt(0)),
    type: "email",
  });

  const { error } = await supabase.auth.verifyOtp({
    email,
    token,
    type: "email",
  });

  if (error) return { ok: false, error: describeAuthError("verify", error) };

  console.log("[auth/verify] success");
  return { ok: true };
}
