"use client";

import { createBrowserClient } from "@supabase/ssr";
import { timeoutFetch } from "./timeout-fetch";

// Browser client — reads the auth session from cookies written by the server.
// No auth flow runs through here: sign-in is a Server Action, so the flowType
// that matters is the one on the server client (see server.ts). Left at the
// @supabase/ssr default deliberately — changing it here has no effect on OTP.
// Storage uploads made through this client are authenticated as the signed-in
// user, so Storage RLS ({user_id}/... path ownership) is enforced.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    // Bounds the capture uploads too — a stalled upload otherwise leaves the
    // capture screen on "Uploading…" with no way out but a reload.
    { global: { fetch: timeoutFetch } },
  );
}
