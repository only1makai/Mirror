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

  let { error } = await supabase.auth.verifyOtp({ email, token, type: "email" });

  // TEMPORARY FALLBACK — every other explanation for otp_expired has been
  // ruled out with hard evidence from the logging above (correct email,
  // correct 6-digit token, no whitespace/casing issues), on an address whose
  // first-ever OTP send only just succeeded once SMTP started working. The
  // installed SDK's own docs say "email" covers both signup and signin, but
  // that's a client-side contract; GoTrue is the one actually validating the
  // token server-side, and may still be storing this account's first OTP
  // under its legacy "signup" record type regardless of what the docs
  // promise. A failed verifyOtp does not appear to consume the token —
  // Supabase's own community documents "try email, then retry signup on
  // failure" as a working pattern — so retrying with the same code is safe.
  // Remove this once we know which type this project's GoTrue actually
  // needs, and call that one directly instead of guessing twice.
  if (error?.code === "otp_expired") {
    console.log(
      "[auth/verify] type=email failed with otp_expired, retrying type=signup",
    );
    const retry = await supabase.auth.verifyOtp({ email, token, type: "signup" });
    error = retry.error;
    console.log(
      error
        ? "[auth/verify] type=signup also failed — not a type mismatch"
        : "[auth/verify] type=signup succeeded — this account needed signup, not email",
    );
  }

  if (error) return { ok: false, error: describeAuthError("verify", error) };

  console.log("[auth/verify] success");
  return { ok: true };
}
