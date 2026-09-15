"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  DIMORPHISM_CLASSIFICATIONS,
  DIMORPHISM_LABEL,
  JAW_ANGLES,
  type DimorphismClassification,
  type ReadingSuggestion,
  type SuggestResponse,
  type Vocabularies,
} from "@/lib/types";
import { saveReading } from "./actions";

type ShapeChoice = { primary: string; secondary: string };

// Every field below is an ordinary editable control with a value already in
// it. There is deliberately no confidence badge, no "AI suggested" chrome and
// no accept/reject affordance: the photos pre-fill the form, the user edits
// what they disagree with, and pressing Save is the only thing that records
// anything. Face shape tested unreliable from photographs on this project, so
// treating the model's answer as a starting value rather than an answer is
// the whole design, not a hedge.
export default function ReadingForm({
  sessionId,
  vocab,
  alreadyRead,
}: {
  sessionId: string;
  vocab: Vocabularies;
  alreadyRead: boolean;
}) {
  const router = useRouter();

  const [status, setStatus] = useState<"loading" | "ready" | "failed">(
    "loading",
  );
  const [suggestError, setSuggestError] = useState<string | null>(null);
  const [modelVersion, setModelVersion] = useState<string | null>(null);
  const [suggestedShape, setSuggestedShape] = useState<ShapeChoice | null>(null);

  const [primary, setPrimary] = useState("");
  const [secondary, setSecondary] = useState("");
  const [foreheadMm, setForeheadMm] = useState("");
  const [cheekboneMm, setCheekboneMm] = useState("");
  const [jawMm, setJawMm] = useState("");
  const [lengthMm, setLengthMm] = useState("");
  const [jawAngle, setJawAngle] = useState("");
  const [ratio, setRatio] = useState("");
  const [reasoning, setReasoning] = useState("");
  const [shapeFlag, setShapeFlag] = useState("");

  const [skinType, setSkinType] = useState("");
  const [sensitive, setSensitive] = useState(false);
  const [skinFlag, setSkinFlag] = useState("");

  const [hairType, setHairType] = useState("");
  const [hairFlag, setHairFlag] = useState("");

  const [summary, setSummary] = useState("");
  const [traits, setTraits] = useState<
    Record<string, DimorphismClassification | "">
  >({});
  const [conditions, setConditions] = useState<
    Record<string, { on: boolean; notes: string }>
  >({});

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  function applySuggestion(s: ReadingSuggestion) {
    setPrimary(s.face_shape_primary_id ?? "");
    setSecondary(s.face_shape_secondary_id ?? "");
    setSuggestedShape({
      primary: s.face_shape_primary_id ?? "",
      secondary: s.face_shape_secondary_id ?? "",
    });
    const m = s.face_shape_measurements;
    setJawAngle(m.jaw_angle ?? "");
    setRatio(
      m.ratio_length_to_cheekbone != null
        ? String(m.ratio_length_to_cheekbone)
        : "",
    );
    setReasoning(m.reasoning ?? "");
    setShapeFlag(s.face_shape_quality_flag ?? "");
    setSkinType(s.skin_type_id ?? "");
    setSensitive(s.skin_is_sensitive);
    setSkinFlag(s.skin_quality_flag ?? "");
    setHairType(s.hair_type_id ?? "");
    setHairFlag(s.hair_quality_flag ?? "");
    setSummary(s.dimorphism_summary ?? "");
    setTraits(
      Object.fromEntries(
        s.dimorphism_findings.map((f) => [f.trait_id, f.classification]),
      ),
    );
    setConditions(
      Object.fromEntries(
        s.condition_findings.map((f) => [
          f.condition_id,
          { on: true, notes: f.notes ?? "" },
        ]),
      ),
    );
  }

  const runSuggestion = useCallback(async () => {
    setStatus("loading");
    setSuggestError(null);
    try {
      const res = await fetch("/api/readings/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId }),
      });
      const body = (await res.json()) as SuggestResponse;
      if (!body.ok) {
        setSuggestError(body.message);
        setStatus("failed");
        return;
      }
      applySuggestion(body.suggestion);
      setModelVersion(body.modelVersion);
      setStatus("ready");
    } catch {
      setSuggestError(
        "Could not reach the server to read your photos. Check your connection.",
      );
      setStatus("failed");
    }
  }, [sessionId]);

  useEffect(() => {
    if (alreadyRead) setStatus("ready");
    else runSuggestion();
  }, [alreadyRead, runSuggestion]);

  // 'model' only survives an untouched face shape. Any edit and this is the
  // user's classification, which is exactly what face_shape_source records.
  function faceShapeSource(): "model" | "manual" {
    if (!suggestedShape) return "manual";
    return suggestedShape.primary === primary &&
      suggestedShape.secondary === secondary
      ? "model"
      : "manual";
  }

  function numOrNull(v: string): number | null {
    if (v.trim() === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  async function submit() {
    setSaving(true);
    setSaveError(null);
    const res = await saveReading({
      sessionId,
      face_shape_primary_id: primary === "" ? null : primary,
      face_shape_secondary_id: secondary === "" ? null : secondary,
      face_shape_source: faceShapeSource(),
      face_shape_measurements: {
        forehead_width_mm: numOrNull(foreheadMm),
        cheekbone_width_mm: numOrNull(cheekboneMm),
        jaw_width_mm: numOrNull(jawMm),
        face_length_mm: numOrNull(lengthMm),
        jaw_angle: jawAngle === "" ? null : (jawAngle as "rounded" | "defined"),
        ratio_length_to_cheekbone: numOrNull(ratio),
        reasoning: reasoning.trim() === "" ? null : reasoning.trim(),
      },
      face_shape_quality_flag: shapeFlag.trim() === "" ? null : shapeFlag.trim(),
      skin_type_id: skinType === "" ? null : skinType,
      skin_is_sensitive: sensitive,
      skin_quality_flag: skinFlag.trim() === "" ? null : skinFlag.trim(),
      hair_type_id: hairType === "" ? null : hairType,
      hair_quality_flag: hairFlag.trim() === "" ? null : hairFlag.trim(),
      dimorphism_summary: summary.trim() === "" ? null : summary.trim(),
      dimorphism_findings: Object.entries(traits)
        .filter(([, c]) => c !== "")
        .map(([trait_id, c]) => ({ trait_id, classification: c as string })),
      condition_findings: Object.entries(conditions)
        .filter(([, v]) => v.on)
        .map(([condition_id, v]) => ({
          condition_id,
          notes: v.notes.trim() === "" ? null : v.notes.trim(),
        })),
      model_version: modelVersion,
    });
    setSaving(false);
    if (res.ok) router.push("/compare");
    else setSaveError(res.message);
  }

  if (alreadyRead) {
    return (
      <div className="container">
        <h1>Reading</h1>
        <div className="banner warn">
          This session already has a reading. Capture a new session to record
          another one.
        </div>
        <button className="btn" onClick={() => router.push("/compare")}>
          Back to compare
        </button>
      </div>
    );
  }

  if (status === "loading") {
    return (
      <div className="container">
        <h1>Reading</h1>
        <div className="card">
          <p className="muted" style={{ margin: 0 }}>
            <span className="spinner" /> Reading your three photos. This takes a
            few moments.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <h1>Reading</h1>

      {status === "failed" && (
        <div className="banner danger">
          {suggestError}
          <div className="row" style={{ marginTop: 12 }}>
            <button className="btn secondary" onClick={runSuggestion}>
              Try again
            </button>
            <button className="btn ghost" onClick={() => setStatus("ready")}>
              Fill in manually
            </button>
          </div>
        </div>
      )}

      {status === "ready" && modelVersion && (
        <p className="muted">
          Filled in from your photos. Change anything that looks wrong. Nothing
          is recorded until you save.
        </p>
      )}

      {saveError && <div className="banner danger">{saveError}</div>}

      <h2>Face shape</h2>
      <div className="card">
        <div className="field">
          <label>Primary</label>
          <select
            className="select"
            value={primary}
            onChange={(e) => setPrimary(e.target.value)}
          >
            <option value="">Not set</option>
            {vocab.faceShapes.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label>Secondary (optional)</label>
          <select
            className="select"
            value={secondary}
            onChange={(e) => setSecondary(e.target.value)}
          >
            <option value="">None</option>
            {vocab.faceShapes
              .filter((o) => o.id !== primary)
              .map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
          </select>
        </div>

        <div className="field">
          <label>Jaw angle</label>
          <select
            className="select"
            value={jawAngle}
            onChange={(e) => setJawAngle(e.target.value)}
          >
            <option value="">Not set</option>
            {JAW_ANGLES.map((a) => (
              <option key={a} value={a}>
                {a === "rounded"
                  ? "Rounded, one continuous curve"
                  : "Defined, a distinct corner"}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label>Length divided by cheekbone width</label>
          <input
            className="input"
            inputMode="decimal"
            value={ratio}
            onChange={(e) => setRatio(e.target.value)}
            placeholder="e.g. 1.5"
          />
        </div>

        <div className="field">
          <label>Notes on the shape call</label>
          <textarea
            className="textarea"
            rows={3}
            value={reasoning}
            onChange={(e) => setReasoning(e.target.value)}
          />
        </div>

        <div className="field" style={{ marginBottom: 0 }}>
          <label>Photo quality note</label>
          <input
            className="input"
            value={shapeFlag}
            onChange={(e) => setShapeFlag(e.target.value)}
            placeholder="Anything that made this hard to judge"
          />
        </div>
      </div>

      <h2>Measurements</h2>
      <div className="card">
        <p className="muted" style={{ marginTop: 0 }}>
          Tape measure, in millimetres. A photo carries no scale reference, so
          these are never filled in for you, and they are the measurement this
          project actually trusts.
        </p>
        <div className="row">
          <div className="field">
            <label>Forehead width</label>
            <input
              className="input"
              inputMode="numeric"
              value={foreheadMm}
              onChange={(e) => setForeheadMm(e.target.value)}
            />
          </div>
          <div className="field">
            <label>Cheekbone width</label>
            <input
              className="input"
              inputMode="numeric"
              value={cheekboneMm}
              onChange={(e) => setCheekboneMm(e.target.value)}
            />
          </div>
        </div>
        <div className="row">
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Jaw width</label>
            <input
              className="input"
              inputMode="numeric"
              value={jawMm}
              onChange={(e) => setJawMm(e.target.value)}
            />
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Face length</label>
            <input
              className="input"
              inputMode="numeric"
              value={lengthMm}
              onChange={(e) => setLengthMm(e.target.value)}
            />
          </div>
        </div>
      </div>

      <h2>Skin</h2>
      <div className="card">
        <div className="field">
          <label>Type</label>
          <select
            className="select"
            value={skinType}
            onChange={(e) => setSkinType(e.target.value)}
          >
            <option value="">Not set</option>
            {vocab.skinTypes.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label className="toggle">
            <input
              type="checkbox"
              checked={sensitive}
              onChange={(e) => setSensitive(e.target.checked)}
            />
            Reacts easily (can apply to any type)
          </label>
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>Photo quality note</label>
          <input
            className="input"
            value={skinFlag}
            onChange={(e) => setSkinFlag(e.target.value)}
          />
        </div>
      </div>

      <h2>Hair</h2>
      <div className="card">
        <div className="field">
          <label>Type</label>
          <select
            className="select"
            value={hairType}
            onChange={(e) => setHairType(e.target.value)}
          >
            <option value="">Not set</option>
            {vocab.hairTypes.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>Photo quality note</label>
          <input
            className="input"
            value={hairFlag}
            onChange={(e) => setHairFlag(e.target.value)}
          />
        </div>
      </div>

      <h2>Dimorphism</h2>
      <div className="card">
        <p className="muted" style={{ marginTop: 0 }}>
          Population tendencies in three fixed categories. Not a scale, and
          nothing here ranks anything. Leave a trait unset if the photos do not
          show it clearly.
        </p>
        <div className="field">
          <label>Summary</label>
          <textarea
            className="textarea"
            rows={2}
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
          />
        </div>
        {vocab.dimorphismTraits.map((t) => (
          <div className="field" key={t.id}>
            <label>{t.label}</label>
            <div className="scale">
              <button
                type="button"
                className={!traits[t.id] ? "on" : ""}
                onClick={() => setTraits((cur) => ({ ...cur, [t.id]: "" }))}
              >
                Unset
              </button>
              {DIMORPHISM_CLASSIFICATIONS.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={traits[t.id] === c ? "on" : ""}
                  onClick={() => setTraits((cur) => ({ ...cur, [t.id]: c }))}
                >
                  {DIMORPHISM_LABEL[c].replace("-typical", "")}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <h2>Conditions</h2>
      <div className="card">
        <p className="muted" style={{ marginTop: 0 }}>
          Only what is actually visible. Nothing selected is the normal result.
        </p>
        {vocab.conditions.map((c) => {
          const state = conditions[c.id] ?? { on: false, notes: "" };
          return (
            <div className="field" key={c.id}>
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={state.on}
                  onChange={(e) =>
                    setConditions((cur) => ({
                      ...cur,
                      [c.id]: { ...state, on: e.target.checked },
                    }))
                  }
                />
                {c.label}
              </label>
              {state.on && (
                <input
                  className="input"
                  style={{ marginTop: 8 }}
                  value={state.notes}
                  placeholder="What you can see"
                  onChange={(e) =>
                    setConditions((cur) => ({
                      ...cur,
                      [c.id]: { ...state, notes: e.target.value },
                    }))
                  }
                />
              )}
            </div>
          );
        })}
      </div>

      <button
        className="btn"
        style={{ marginTop: 12 }}
        onClick={submit}
        disabled={saving}
      >
        {saving ? (
          <>
            <span className="spinner" /> Saving
          </>
        ) : (
          "Save reading"
        )}
      </button>

      <p className="muted" style={{ marginTop: 14 }}>
        Teeth shade is not part of this reading. It needs a fourth photo the
        capture flow does not take yet.
      </p>
    </div>
  );
}
