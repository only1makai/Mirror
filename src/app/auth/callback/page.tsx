"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// Magic-link landing page. With the implicit flow, Supabase redirects here with
// the session in the URL fragment (#access_token=...&refresh_token=...). The
// fragment is only visible to client JS, so this must be a client component.
// The browser client (detectSessionInUrl) parses it and writes the session to
// cookies; once that lands we hand off to the app, where middleware sees the
// session cookie. Errors (expired/used link) arrive as error_description in the
// fragment or query and are surfaced on /login.
export default function AuthCallbackPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    let handled = false;

    const finish = (path: string) => {
      if (handled) return;
      handled = true;
      router.replace(path);
    };

    const hashParams = new URLSearchParams(
      window.location.hash.replace(/^#/, ""),
    );
    const queryParams = new URLSearchParams(window.location.search);
    const errDescription =
      hashParams.get("error_description") ??
      queryParams.get("error_description");

    if (errDescription) {
      setError(errDescription);
      finish(`/login?error=${encodeURIComponent(errDescription)}`);
      return;
    }

    // detectSessionInUrl fires SIGNED_IN once it has parsed the fragment and
    // persisted the session. Confirm the session is readable (cookies written)
    // before navigating, so middleware doesn't bounce us back to /login.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session) {
        await supabase.auth.getSession();
        finish("/");
      }
    });

    // Fallback: if a session already exists, or none appears in time, resolve.
    const timer = setTimeout(async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      finish(session ? "/" : "/login?error=sign_in_failed");
    }, 4000);

    return () => {
      subscription.unsubscribe();
      clearTimeout(timer);
    };
  }, [router]);

  return (
    <div className="app-shell">
      <div className="container" style={{ paddingTop: 64 }}>
        {error ? (
          <div className="banner danger">{error}</div>
        ) : (
          <p className="muted">Signing you in…</p>
        )}
      </div>
    </div>
  );
}
