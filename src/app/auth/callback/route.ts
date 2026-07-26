import { NextResponse } from "next/server";
import { type EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

// Handles the magic-link redirect. Supports both the PKCE `code` flow (default
// for the browser client) and the `token_hash` verifyOtp flow.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = searchParams.get("next") ?? "/";

  // These logs surface in Vercel's runtime logs for this route. They reveal
  // whether the callback is even reached and, if so, the real exchange error
  // instead of a silent bounce. `error_description` in the query means Supabase
  // itself rejected before redirecting here (e.g. expired/invalid link).
  console.log("[auth/callback] hit", {
    origin,
    hasCode: Boolean(code),
    hasTokenHash: Boolean(tokenHash),
    type,
    providerError: searchParams.get("error"),
    providerErrorDescription: searchParams.get("error_description"),
  });

  const supabase = await createClient();

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      console.log("[auth/callback] exchangeCodeForSession OK");
      return NextResponse.redirect(`${origin}${next}`);
    }
    console.error("[auth/callback] exchangeCodeForSession FAILED", {
      message: error.message,
      status: error.status,
      code: error.code,
    });
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(error.message)}`,
    );
  }

  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({
      type,
      token_hash: tokenHash,
    });
    if (!error) {
      console.log("[auth/callback] verifyOtp OK");
      return NextResponse.redirect(`${origin}${next}`);
    }
    console.error("[auth/callback] verifyOtp FAILED", {
      message: error.message,
      status: error.status,
      code: error.code,
    });
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(error.message)}`,
    );
  }

  // Neither param present: the link did not carry a code. Almost always means
  // the redirect URL was not allow-listed in Supabase, so Supabase fell back to
  // the Site URL and stripped the code before reaching here.
  console.error("[auth/callback] missing code and token_hash", {
    allParams: Object.fromEntries(searchParams.entries()),
  });
  return NextResponse.redirect(`${origin}/login?error=missing_code`);
}
