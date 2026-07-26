"use client";

import { createBrowserClient } from "@supabase/ssr";

// Browser client — reads the auth session from cookies written by the server.
// Storage uploads made through this client are authenticated as the signed-in
// user, so Storage RLS ({user_id}/... path ownership) is enforced.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
