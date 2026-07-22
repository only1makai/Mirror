"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { type StackItem } from "@/lib/types";
import { addStackItem, endStackItem } from "./actions";

export default function StackManager({
  active,
  ended,
}: {
  active: StackItem[];
  ended: StackItem[];
}) {
  const router = useRouter();
  const today = new Date().toISOString().slice(0, 10);
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [schedule, setSchedule] = useState<"am" | "pm" | "both">("am");
  const [started, setStarted] = useState(today);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function add() {
    if (!name.trim()) return;
    setBusy(true);
    setErr(null);
    const res = await addStackItem({
      product_name: name.trim(),
      category: category.trim() || null,
      schedule,
      started_at: started || null,
    });
    setBusy(false);
    if (res.ok) {
      setName("");
      setCategory("");
      router.refresh();
    } else {
      setErr(res.error ?? "Failed");
    }
  }

  async function remove(id: string) {
    setBusy(true);
    await endStackItem(id);
    setBusy(false);
    router.refresh();
  }

  return (
    <div className="container">
      <h1>Stack</h1>
      <p className="muted">
        Your active products. Adherence checkboxes in Log come from this list.
      </p>

      {err && <div className="banner danger">{err}</div>}

      <div className="card">
        <div className="field">
          <label>Product</label>
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. The Ordinary Niacinamide 10%"
          />
        </div>
        <div className="row">
          <div className="field">
            <label>Category</label>
            <input
              className="input"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="serum"
            />
          </div>
          <div className="field">
            <label>Schedule</label>
            <select
              className="select"
              value={schedule}
              onChange={(e) =>
                setSchedule(e.target.value as "am" | "pm" | "both")
              }
            >
              <option value="am">AM</option>
              <option value="pm">PM</option>
              <option value="both">Both</option>
            </select>
          </div>
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>Start date</label>
          <input
            className="input"
            type="date"
            value={started}
            onChange={(e) => setStarted(e.target.value)}
          />
        </div>
        <button
          className="btn"
          style={{ marginTop: 14 }}
          onClick={add}
          disabled={busy || !name.trim()}
        >
          Add to stack
        </button>
      </div>

      <h2>Active</h2>
      {active.length === 0 ? (
        <p className="muted">Nothing yet.</p>
      ) : (
        <div className="card">
          {active.map((s) => (
            <div key={s.id} className="list-item">
              <div>
                <div style={{ fontWeight: 600 }}>{s.product_name}</div>
                <div className="muted">
                  {s.category ? `${s.category} · ` : ""}
                  {s.schedule?.toUpperCase()}
                  {s.started_at ? ` · since ${s.started_at}` : ""}
                </div>
              </div>
              <button
                className="linkbtn"
                onClick={() => remove(s.id)}
                disabled={busy}
              >
                End
              </button>
            </div>
          ))}
        </div>
      )}

      {ended.length > 0 && (
        <>
          <h2>Ended</h2>
          <div className="card">
            {ended.map((s) => (
              <div key={s.id} className="list-item">
                <div>
                  <div style={{ fontWeight: 600 }}>{s.product_name}</div>
                  <div className="muted">ended {s.ended_at}</div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
