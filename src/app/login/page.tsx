"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">(
    "idle",
  );
  const [error, setError] = useState<string | null>(null);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    if (error) {
      setError(error.message);
      setStatus("error");
    } else {
      setStatus("sent");
    }
  }

  return (
    <div className="app-shell">
      <div className="container" style={{ paddingTop: 64 }}>
        <h1>Mirror</h1>
        <p className="muted" style={{ marginBottom: 28 }}>
          Week 1 vs. week 12. Track what actually moves — skin, hair, sleep —
          and see the change.
        </p>

        {status === "sent" ? (
          <div className="card">
            <div className="banner ok">Check your inbox.</div>
            <p className="muted">
              We sent a magic link to <b>{email}</b>. Open it on this device to
              sign in. The link expires shortly.
            </p>
          </div>
        ) : (
          <form className="card" onSubmit={send}>
            <div className="field">
              <label htmlFor="email">Email</label>
              <input
                id="email"
                className="input"
                type="email"
                inputMode="email"
                autoComplete="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            {error && <div className="banner danger">{error}</div>}
            <button
              className="btn"
              type="submit"
              disabled={status === "sending" || !email}
            >
              {status === "sending" ? (
                <span className="spinner" />
              ) : (
                "Send magic link"
              )}
            </button>
          </form>
        )}
        <p className="muted" style={{ marginTop: 20 }}>
          Your face photos are private. Stored encrypted, owner-locked, never
          shared. No score, no rating.
        </p>
      </div>
    </div>
  );
}
