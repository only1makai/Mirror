import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

// Server client — bound to the request's cookies. Used in Server Components,
// Route Handlers, and Server Actions. Auth is the signed-in user (anon key +
// their session), so all queries run under RLS as that user.
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      // NOTE: you cannot make this client implicit. createServerClient sets
      // flowType: "pkce" *after* spreading options.auth, so any flowType passed
      // here is silently overwritten. That is why sending the OTP uses its own
      // client — see createOtpSendClient below.
      //
      // This client is still correct for verifyOtp: /verify carries no
      // code_challenge under either flow, and this is the client that writes
      // the session cookie on success.
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(
          cookiesToSet: {
            name: string;
            value: string;
            options?: Record<string, unknown>;
          }[],
        ) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Called from a Server Component — cookies are read-only here.
            // Session refresh is handled by middleware, so this is safe to ignore.
          }
        },
      },
    },
  );
}

// Client used ONLY to send the email OTP.
//
// This exists because @supabase/ssr forces flowType: "pkce", and under PKCE
// signInWithOtp sends a code_challenge. GoTrue responds by storing a
// "pkce_"-prefixed token in recovery_token — a value meant to be redeemed by
// exchangeCodeForSession, never by a typed code. It never writes the
// sha224(email + otp) hash that verifyOtp looks up. Since every OTP type
// recomputes that same absent hash, all of them fail identically with a 403
// otp_expired, which is also exactly what GoTrue returns for "no token found".
// That overloading is what disguised this as an expiry problem.
//
// Bypassing @supabase/ssr with a plain supabase-js client is what lets the flow
// actually be implicit: no code_challenge is sent, so GoTrue stores a real,
// verifiable OTP hash. No cookies are needed here — sending a code establishes
// no session; verifyOtp on the SSR client above is what writes it.
export function createOtpSendClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { flowType: "implicit", persistSession: false } },
  );
}
