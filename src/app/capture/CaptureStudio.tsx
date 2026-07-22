"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  ANGLES,
  ANGLE_LABEL,
  LIGHTING_WARN_THRESHOLD,
  PHOTO_BUCKET,
  type Angle,
} from "@/lib/types";
import {
  createSession,
  savePhotoRow,
  finalizeSession,
  discardSession,
} from "./actions";

type Capture = {
  url: string;
  blob: Blob;
  width: number;
  height: number;
  luminance: number;
};

const CHECKLIST = [
  "Natural light — face a window",
  "No flash",
  "Arm's length, phone at eye level",
  "Neutral expression",
  "Post-shower, hair as you usually wear it",
];

// Mean relative luminance (0–255) of a bitmap, sampled small for speed.
function meanLuminance(canvas: HTMLCanvasElement): number {
  const s = document.createElement("canvas");
  s.width = 48;
  s.height = 64;
  const ctx = s.getContext("2d")!;
  ctx.drawImage(canvas, 0, 0, s.width, s.height);
  const { data } = ctx.getImageData(0, 0, s.width, s.height);
  let sum = 0;
  const n = data.length / 4;
  for (let i = 0; i < data.length; i += 4) {
    sum += 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
  }
  return sum / n;
}

export default function CaptureStudio({
  ghosts,
  prevLighting,
  hasPrevSession,
}: {
  ghosts: Partial<Record<Angle, string>>;
  prevLighting: number | null;
  hasPrevSession: boolean;
}) {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [phase, setPhase] = useState<"checklist" | "capturing" | "saving">(
    hasPrevSession ? "capturing" : "checklist",
  );
  const [angle, setAngle] = useState<Angle>("front");
  const [captures, setCaptures] = useState<Partial<Record<Angle, Capture>>>({});
  const [mirror, setMirror] = useState(true);
  const [facing, setFacing] = useState<"user" | "environment">("user");
  const [ghostVisible, setGhostVisible] = useState(true);
  const [camError, setCamError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string>("");

  const startCamera = useCallback(async () => {
    setCamError(null);
    try {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: facing, width: { ideal: 1080 }, height: { ideal: 1440 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
    } catch (e) {
      setCamError(
        e instanceof Error ? e.message : "Camera unavailable. Grant permission.",
      );
    }
  }, [facing]);

  useEffect(() => {
    if (phase === "capturing") startCamera();
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, facing]);

  function shoot() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d")!;
    if (mirror) {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0);
    const luminance = meanLuminance(canvas);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        setCaptures((c) => ({
          ...c,
          [angle]: { url, blob, width: canvas.width, height: canvas.height, luminance },
        }));
      },
      "image/jpeg",
      0.9,
    );
  }

  function retake(a: Angle) {
    setCaptures((c) => {
      const next = { ...c };
      if (next[a]) URL.revokeObjectURL(next[a]!.url);
      delete next[a];
      return next;
    });
    setAngle(a);
  }

  const allCaptured = ANGLES.every((a) => captures[a]);
  const front = captures.front;
  const lightingDelta =
    front && prevLighting != null
      ? Math.abs(front.luminance - prevLighting)
      : null;
  const lightingWarn =
    lightingDelta != null && lightingDelta > LIGHTING_WARN_THRESHOLD;

  async function save() {
    setPhase("saving");
    setSaveError(null);
    setProgress("Creating session…");

    const created = await createSession();
    if (!created.ok) {
      setSaveError(created.error);
      setPhase("capturing");
      return;
    }
    const { sessionId, userId } = created;
    const supabase = createClient();

    try {
      for (const a of ANGLES) {
        const cap = captures[a]!;
        setProgress(`Uploading ${ANGLE_LABEL[a]}…`);
        const path = `${userId}/${sessionId}/${a}.jpg`;
        const { error: upErr } = await supabase.storage
          .from(PHOTO_BUCKET)
          .upload(path, cap.blob, { contentType: "image/jpeg", upsert: true });
        if (upErr) throw new Error(`Upload (${a}): ${upErr.message}`);

        const rowRes = await savePhotoRow(
          sessionId,
          a,
          path,
          cap.width,
          cap.height,
        );
        if (!rowRes.ok) throw new Error(`Save row (${a}): ${rowRes.error}`);
      }
      setProgress("Finishing…");
      await finalizeSession(sessionId, front ? front.luminance : null);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      router.push("/compare");
    } catch (e) {
      await discardSession(sessionId);
      setSaveError(e instanceof Error ? e.message : "Save failed");
      setPhase("capturing");
    }
  }

  if (phase === "checklist") {
    return (
      <div className="container">
        <h1>Capture</h1>
        <p className="muted">
          Same setup every time is the whole trick. Run through this once:
        </p>
        <div className="card">
          <ul className="checklist">
            {CHECKLIST.map((c) => (
              <li key={c}>
                <span style={{ color: "var(--accent)" }}>○</span>
                {c}
              </li>
            ))}
          </ul>
        </div>
        <button className="btn" onClick={() => setPhase("capturing")}>
          I'm set up — open camera
        </button>
      </div>
    );
  }

  const current = captures[angle];

  return (
    <div className="container">
      <h1>Capture</h1>

      {lightingWarn && (
        <div className="banner warn">
          Lighting looks different from your last session (luminance shifted{" "}
          {Math.round(lightingDelta!)} pts). Move toward similar light for a
          cleaner comparison.
        </div>
      )}
      {camError && <div className="banner danger">{camError}</div>}
      {saveError && <div className="banner danger">{saveError}</div>}

      <div className="angle-tabs">
        {ANGLES.map((a) => (
          <button
            key={a}
            className={
              captures[a] ? "done" : a === angle ? "current" : ""
            }
            onClick={() => setAngle(a)}
          >
            {captures[a] ? "✓ " : ""}
            {ANGLE_LABEL[a]}
          </button>
        ))}
      </div>

      <div className="camera-stage">
        {current ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={current.url} alt={`${angle} capture`} />
        ) : (
          <>
            <video
              ref={videoRef}
              playsInline
              muted
              style={{ transform: mirror ? "scaleX(-1)" : "none" }}
            />
            {ghostVisible && ghosts[angle] && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                className="ghost-overlay"
                src={ghosts[angle]}
                alt="Previous session alignment guide"
                style={{ opacity: 0.4, transform: mirror ? "scaleX(-1)" : "none" }}
              />
            )}
          </>
        )}
      </div>

      {!current && (
        <div className="row" style={{ marginTop: 10 }}>
          {ghosts[angle] && (
            <button
              className="btn ghost"
              onClick={() => setGhostVisible((v) => !v)}
            >
              {ghostVisible ? "Hide guide" : "Show guide"}
            </button>
          )}
          <button
            className="btn ghost"
            onClick={() => setFacing((f) => (f === "user" ? "environment" : "user"))}
          >
            Flip camera
          </button>
          <button className="btn ghost" onClick={() => setMirror((m) => !m)}>
            {mirror ? "Unmirror" : "Mirror"}
          </button>
        </div>
      )}

      <div style={{ marginTop: 12 }}>
        {current ? (
          <div className="row">
            <button className="btn secondary" onClick={() => retake(angle)}>
              Retake
            </button>
            {(() => {
              const nextAngle = ANGLES.find((a) => !captures[a]);
              if (nextAngle && nextAngle !== angle) {
                return (
                  <button className="btn" onClick={() => setAngle(nextAngle)}>
                    Next: {ANGLE_LABEL[nextAngle]}
                  </button>
                );
              }
              return null;
            })()}
          </div>
        ) : (
          <button className="btn" onClick={shoot} disabled={!!camError}>
            Capture {ANGLE_LABEL[angle]}
          </button>
        )}
      </div>

      {allCaptured && (
        <button
          className="btn"
          style={{ marginTop: 12 }}
          onClick={save}
          disabled={phase === "saving"}
        >
          {phase === "saving" ? (
            <>
              <span className="spinner" /> {progress}
            </>
          ) : (
            "Save session"
          )}
        </button>
      )}

      <p className="muted" style={{ marginTop: 14 }}>
        The faint overlay is your last session. Line yourself up to it before
        each shot — that's what keeps weeks comparable without any measurement.
      </p>
    </div>
  );
}
