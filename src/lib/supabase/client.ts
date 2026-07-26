"use client";

import { createBrowserClient } from "@supabase/ssr";

// Browser client — reads the auth session from cookies written by the server.
// Storage uploads made through this client are authenticated as the signed-in
// user, so Storage RLS ({user_id}/... path ownership) is enforced.
//
// flowType "implicit": magic links return the session in the URL fragment
// instead of a PKCE `code`. PKCE needs a code-verifier cookie stored on the
// device that requested the link — which breaks when the link is opened in a
// different browser context (e.g. an in-app email browser on mobile), failing
// with `pkce_code_verifier_not_found`. Implicit carries no local secret, so it
// works cross-context. detectSessionInUrl (default true) parses the fragment
// on the callback page and persists the session to cookies.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        flowType: "implicit",
        detectSessionInUrl: true,
      },
    },
  );
}
