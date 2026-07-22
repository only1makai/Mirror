"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { type Log, type StackItem } from "@/lib/types";
import { saveLog } from "./actions";

const ZONES = ["Forehead", "Nose", "L cheek", "R cheek", "Chin", "Jaw"];

function Scale({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (v: number) => void;
}) {
  return (
    <div className="scale">
      {[0, 1, 2, 3].map((n) => (
        <button
          key={n}
          type="button"
          className={value === n ? "on" : ""}
          onClick={() => onChange(n)}
        >
          {n}
        </button>
      ))}
    </div>
  );
}

export default function LogForm({
  date,
  existing,
  stack,
  adherence,
}: {
  date: string;
  existing: Log | null;
  stack: StackItem[];
  adherence: Record<string, boolean>;
}) {
  const router = useRouter();
  const [tzone, setTzone] = useState<number | null>(existing?.shine_tzone ?? null);
  const [cheeks, setCheeks] = useState<number | null>(
    existing?.shine_cheeks ?? null,
  );
  const [dryness, setDryness] = useState<number | null>(existing?.dryness ?? null);
  const [irritation, setIrritation] = useState<boolean>(
    existing?.irritation ?? false,
  );
  const [breakoutCount, setBreakoutCount] = useState<number>(
    existing?.breakout_count ?? 0,
  );
  const [zones, setZones] = useState<string[]>(existing?.breakout_zones ?? []);
  const [sleep, setSleep] = useState<string>(
    existing?.sleep_hours != null ? String(existing.sleep_hours) : "",
  );
  const [note, setNote] = useState<string>(existing?.note ?? "");
  const [adh, setAdh] = useState<Record<string, boolean>>(adherence);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  function toggleZone(z: string) {
    setZones((cur) =>
      cur.includes(z) ? cur.filter((x) => x !== z) : [...cur, z],
    );
  }

  async function submit() {
    setSaving(true);
    setErr(null);
    setMsg(null);
    const res = await saveLog({
      date,
      sleep_hours: sleep === "" ? null : Number(sleep),
      note: note.trim() === "" ? null : note.trim(),
      shine_tzone: tzone,
      shine_cheeks: cheeks,
      breakout_count: breakoutCount,
      breakout_zones: zones,
      dryness,
      irritation,
      adherence: stack.map((s) => ({
        stack_item_id: s.id,
        taken: !!adh[s.id],
      })),
    });
    setSaving(false);
    if (res.ok) {
      setMsg("Saved.");
      router.refresh();
    } else {
      setErr(res.error ?? "Save failed");
    }
  }

  return (
    <div className="container">
      <div className="topbar">
        <h1>Today</h1>
        <span className="pill">{date}</span>
      </div>
      <p className="muted">Fast. Tap what changed, leave the rest.</p>

      {msg && <div className="banner ok">{msg}</div>}
      {err && <div className="banner danger">{err}</div>}

      <div className="card">
        <div className="field">
          <label>Shine — T-zone</label>
          <Scale value={tzone} onChange={setTzone} />
        </div>
        <div className="field">
          <label>Shine — cheeks</label>
          <Scale value={cheeks} onChange={setCheeks} />
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>Dryness</label>
          <Scale value={dryness} onChange={setDryness} />
        </div>
      </div>

      <div className="card">
        <div className="field">
          <label>Breakouts</label>
          <div className="row" style={{ alignItems: "center" }}>
            <button
              type="button"
              className="btn secondary"
              onClick={() => setBreakoutCount((c) => Math.max(0, c - 1))}
            >
              −
            </button>
            <div
              style={{ textAlign: "center", fontSize: 22, fontWeight: 600 }}
            >
              {breakoutCount}
            </div>
            <button
              type="button"
              className="btn secondary"
              onClick={() => setBreakoutCount((c) => c + 1)}
            >
              +
            </button>
          </div>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {ZONES.map((z) => (
            <button
              key={z}
              type="button"
              className="pill"
              onClick={() => toggleZone(z)}
              style={
                zones.includes(z)
                  ? {
                      borderColor: "var(--accent)",
                      color: "var(--text)",
                      background: "rgba(74,137,255,0.15)",
                    }
                  : undefined
              }
            >
              {z}
            </button>
          ))}
        </div>
        <label className="toggle" style={{ marginTop: 14 }}>
          <input
            type="checkbox"
            checked={irritation}
            onChange={(e) => setIrritation(e.target.checked)}
          />
          Irritation / redness today
        </label>
      </div>

      <div className="card">
        <div className="field" style={{ marginBottom: 0 }}>
          <label>Sleep (hours)</label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {["5", "6", "7", "8", "9"].map((h) => (
              <button
                key={h}
                type="button"
                className="pill"
                onClick={() => setSleep(h)}
                style={
                  sleep === h
                    ? {
                        borderColor: "var(--accent)",
                        color: "var(--text)",
                        background: "rgba(74,137,255,0.15)",
                      }
                    : undefined
                }
              >
                {h}h
              </button>
            ))}
            <input
              className="input"
              style={{ width: 80 }}
              inputMode="decimal"
              placeholder="—"
              value={sleep}
              onChange={(e) => setSleep(e.target.value)}
            />
          </div>
        </div>
      </div>

      {stack.length > 0 && (
        <div className="card">
          <label>Routine adherence</label>
          {stack.map((s) => (
            <label key={s.id} className="toggle" style={{ padding: "8px 0" }}>
              <input
                type="checkbox"
                checked={!!adh[s.id]}
                onChange={(e) =>
                  setAdh((a) => ({ ...a, [s.id]: e.target.checked }))
                }
              />
              <span>
                {s.product_name}{" "}
                {s.schedule && (
                  <span className="muted">· {s.schedule.toUpperCase()}</span>
                )}
              </span>
            </label>
          ))}
        </div>
      )}

      <div className="card">
        <div className="field" style={{ marginBottom: 0 }}>
          <label>Note</label>
          <textarea
            className="textarea"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Anything worth remembering…"
          />
        </div>
      </div>

      <button className="btn" onClick={submit} disabled={saving}>
        {saving ? <span className="spinner" /> : existing ? "Update log" : "Save log"}
      </button>
    </div>
  );
}
