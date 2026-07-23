"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ANGLES, ANGLE_LABEL, type Angle } from "@/lib/types";

export type SessionView = {
  id: string;
  captured_at: string;
  urls: Partial<Record<Angle, string>>;
};

function fmt(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function CompareView({ sessions }: { sessions: SessionView[] }) {
  const [angle, setAngle] = useState<Angle>("front");

  // Sessions that actually have the chosen angle.
  const usable = useMemo(
    () => sessions.filter((s) => s.urls[angle]),
    [sessions, angle],
  );

  const [aIdx, setAIdx] = useState(0);
  const [bIdx, setBIdx] = useState(Math.max(0, sessions.length - 1));
  const [mode, setMode] = useState<"side" | "slider">("slider");
  const [split, setSplit] = useState(50);
  const [exporting, setExporting] = useState(false);
  const [exportMsg, setExportMsg] = useState<string | null>(null);
  const sliderRef = useRef<HTMLDivElement>(null);

  if (sessions.length === 0) {
    return (
      <div className="container">
        <h1>Compare</h1>
        <div className="card">
          <p className="muted">
            No sessions yet. Capture at least two to see change over time.
          </p>
        </div>
        <Link href="/capture">
          <button className="btn">Start capturing</button>
        </Link>
      </div>
    );
  }

  const clampA = Math.min(aIdx, sessions.length - 1);
  const clampB = Math.min(bIdx, sessions.length - 1);
  const a = sessions[clampA];
  const b = sessions[clampB];
  const aUrl = a.urls[angle];
  const bUrl = b.urls[angle];
  const bothPresent = aUrl && bUrl;

  function onDrag(clientX: number) {
    const el = sliderRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const pct = ((clientX - rect.left) / rect.width) * 100;
    setSplit(Math.max(0, Math.min(100, pct)));
  }

  async function exportImage() {
    if (!aUrl || !bUrl) return;
    setExporting(true);
    setExportMsg(null);
    try {
      const [imgA, imgB] = await Promise.all([loadImg(aUrl), loadImg(bUrl)]);
      const cellW = 720;
      const cellH = Math.round((cellW * 4) / 3);
      const pad = 24;
      const labelH = 56;
      const canvas = document.createElement("canvas");
      canvas.width = cellW * 2 + pad * 3;
      canvas.height = cellH + labelH + pad * 2;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#0d0e12";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      drawCover(ctx, imgA, pad, pad, cellW, cellH);
      drawCover(ctx, imgB, pad * 2 + cellW, pad, cellW, cellH);
      ctx.fillStyle = "#e8eaf0";
      ctx.font = "600 30px -apple-system, Segoe UI, sans-serif";
      ctx.textBaseline = "middle";
      ctx.fillText(fmt(a.captured_at), pad + 4, pad + cellH + labelH / 2);
      ctx.fillText(
        fmt(b.captured_at),
        pad * 2 + cellW + 4,
        pad + cellH + labelH / 2,
      );
      ctx.fillStyle = "#6ea8fe";
      ctx.font = "600 22px -apple-system, Segoe UI, sans-serif";
      ctx.textAlign = "right";
      ctx.fillText(
        `Mirror · ${ANGLE_LABEL[angle]}`,
        canvas.width - pad - 4,
        pad + cellH + labelH / 2,
      );

      const blob = await new Promise<Blob | null>((res) =>
        canvas.toBlob(res, "image/png"),
      );
      if (!blob) throw new Error("Encode failed");
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `mirror-${angle}-${a.captured_at.slice(0, 10)}-vs-${b.captured_at.slice(0, 10)}.png`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(link.href), 4000);
      setExportMsg("Saved to your device.");
    } catch (e) {
      setExportMsg(
        e instanceof Error ? `Export failed: ${e.message}` : "Export failed",
      );
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="container">
      <div className="topbar">
        <h1>Compare</h1>
        <span className="pill">{sessions.length} sessions</span>
      </div>

      <div className="angle-tabs">
        {ANGLES.map((ang) => (
          <button
            key={ang}
            className={ang === angle ? "current" : ""}
            onClick={() => setAngle(ang)}
          >
            {ANGLE_LABEL[ang]}
          </button>
        ))}
      </div>

      {!bothPresent ? (
        <div className="banner warn">
          One of the selected sessions has no {ANGLE_LABEL[angle].toLowerCase()}{" "}
          photo. Pick another pair or angle.
        </div>
      ) : null}

      <div className="row" style={{ marginBottom: 12 }}>
        <button
          className={mode === "slider" ? "btn" : "btn secondary"}
          onClick={() => setMode("slider")}
        >
          Slider
        </button>
        <button
          className={mode === "side" ? "btn" : "btn secondary"}
          onClick={() => setMode("side")}
        >
          Side by side
        </button>
      </div>

      {bothPresent && mode === "slider" && (
        <div
          ref={sliderRef}
          className="compare-slider"
          style={{ ["--split" as string]: `${split}%` }}
          onPointerDown={(e) => {
            (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
            onDrag(e.clientX);
          }}
          onPointerMove={(e) => {
            if (e.buttons === 1) onDrag(e.clientX);
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={aUrl} alt="A" draggable={false} />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="top-layer" src={bUrl} alt="B" draggable={false} />
          <div className="compare-handle" style={{ left: `${split}%` }} />
        </div>
      )}

      {bothPresent && mode === "side" && (
        <div className="side-by-side">
          <div className="frame">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={aUrl} alt="A" />
          </div>
          <div className="frame">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={bUrl} alt="B" />
          </div>
        </div>
      )}

      <div className="row" style={{ marginTop: 10 }}>
        <div>
          <label>Left — {fmt(a.captured_at)}</label>
          <select
            className="select"
            value={clampA}
            onChange={(e) => setAIdx(Number(e.target.value))}
          >
            {sessions.map((s, i) => (
              <option key={s.id} value={i} disabled={!s.urls[angle]}>
                {fmt(s.captured_at)}
                {s.urls[angle] ? "" : " (no photo)"}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label>Right — {fmt(b.captured_at)}</label>
          <select
            className="select"
            value={clampB}
            onChange={(e) => setBIdx(Number(e.target.value))}
          >
            {sessions.map((s, i) => (
              <option key={s.id} value={i} disabled={!s.urls[angle]}>
                {fmt(s.captured_at)}
                {s.urls[angle] ? "" : " (no photo)"}
              </option>
            ))}
          </select>
        </div>
      </div>

      {usable.length > 1 && (
        <div style={{ marginTop: 16 }}>
          <label>Timeline scrub (moves the right image)</label>
          <input
            type="range"
            min={0}
            max={sessions.length - 1}
            value={clampB}
            step={1}
            style={{ width: "100%" }}
            onChange={(e) => setBIdx(Number(e.target.value))}
          />
        </div>
      )}

      <button
        className="btn secondary"
        style={{ marginTop: 16 }}
        onClick={exportImage}
        disabled={!bothPresent || exporting}
      >
        {exporting ? <span className="spinner" /> : "Export comparison image"}
      </button>
      {exportMsg && (
        <p className="muted" style={{ marginTop: 8 }}>
          {exportMsg}
        </p>
      )}
    </div>
  );
}

function loadImg(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image load"));
    img.src = url;
  });
}

function drawCover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  dx: number,
  dy: number,
  dw: number,
  dh: number,
) {
  const ir = img.width / img.height;
  const dr = dw / dh;
  let sx = 0,
    sy = 0,
    sw = img.width,
    sh = img.height;
  if (ir > dr) {
    sw = img.height * dr;
    sx = (img.width - sw) / 2;
  } else {
    sh = img.width / dr;
    sy = (img.height - sh) / 2;
  }
  ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
}
