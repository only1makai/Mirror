"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { OTP_LENGTH } from "@/lib/otp";
import { sendCode, verifyCode } from "./actions";

export default function LoginPage() {
  const router = useRouter();
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submitEmail(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { ok, error } = await sendCode(email.trim());
    setBusy(false);
    if (ok) setStep("code");
    else setError(error ?? "Couldn't send the code. Try again.");
  }

  async function submitCode(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { ok, error } = await verifyCode(email.trim(), code.trim());
    if (ok) {
      // The action's response carried the session cookie; navigate so the
      // server re-renders (and middleware re-runs) with it.
      router.replace("/");
      router.refresh();
      return;
    }
    setBusy(false);
    setCode("");
    setError(error ?? "That code didn't work. Request a new one.");
  }

  async function resend() {
    setBusy(true);
    setError(null);
    const { ok, error } = await sendCode(email.trim());
    setBusy(false);
    if (!ok) setError(error ?? "Couldn't resend the code.");
  }

  return (
    <div className="app-shell">
      <div className="container" style={{ paddingTop: 64 }}>
        <h1>Mirror</h1>
        <p className="muted" style={{ marginBottom: 28 }}>
          Week 1 vs. week 12. Track what actually moves — skin, hair, sleep —
          and see the change.
        </p>

        {step === "email" ? (
          <form className="card" onSubmit={submitEmail}>
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
            <button className="btn" type="submit" disabled={busy || !email}>
              {busy ? <span className="spinner" /> : "Email me a code"}
            </button>
          </form>
        ) : (
          <form className="card" onSubmit={submitCode}>
            <div className="banner ok">Check your inbox.</div>
            <p className="muted">
              We sent a {OTP_LENGTH}-digit code to <b>{email}</b>. Enter it
              below — no link to open, so it works on any device.
            </p>
            <div className="field">
              <label htmlFor="code">{OTP_LENGTH}-digit code</label>
              <input
                id="code"
                className="input"
                type="text"
                inputMode="numeric"
                // Lets iOS Safari autofill the code straight from Mail.
                autoComplete="one-time-code"
                pattern="[0-9]*"
                maxLength={OTP_LENGTH}
                placeholder={"1234567890".slice(0, OTP_LENGTH)}
                value={code}
                onChange={(e) =>
                  setCode(e.target.value.replace(/\D/g, "").slice(0, OTP_LENGTH))
                }
                required
              />
            </div>
            {error && <div className="banner danger">{error}</div>}
            <button
              className="btn"
              type="submit"
              disabled={busy || code.length !== OTP_LENGTH}
            >
              {busy ? <span className="spinner" /> : "Sign in"}
            </button>
            <div className="row" style={{ marginTop: 10 }}>
              <button
                className="linkbtn"
                type="button"
                onClick={resend}
                disabled={busy}
              >
                Resend code
              </button>
              <button
                className="linkbtn"
                type="button"
                onClick={() => {
                  setStep("email");
                  setCode("");
                  setError(null);
                }}
                disabled={busy}
              >
                Use a different email
              </button>
            </div>
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
