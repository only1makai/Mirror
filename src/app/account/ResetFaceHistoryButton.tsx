"use client";

import { useState, useTransition } from "react";
import Modal from "@/components/Modal";
import { resetFaceHistory } from "./actions";

type Stage = "idle" | "confirm-1" | "confirm-2" | "success" | "error";

// Two-stage confirmation, per the repo owner's explicit spec: click opens a
// modal ("are you sure"), a second explicit click inside that modal is what
// actually triggers deletion. Not a typed-confirmation-phrase pattern —
// two distinct affirmative clicks, as requested.
export default function ResetFaceHistoryButton() {
  const [stage, setStage] = useState<Stage>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleConfirm() {
    startTransition(async () => {
      const result = await resetFaceHistory();
      if (result.ok) {
        setStage("success");
        setMessage(
          `Deleted ${result.sessionsDeleted} session${result.sessionsDeleted === 1 ? "" : "s"} and ${result.photosDeleted} photo${result.photosDeleted === 1 ? "" : "s"}.`,
        );
      } else {
        setStage("error");
        setMessage(result.message);
      }
    });
  }

  function reset() {
    setStage("idle");
    setMessage(null);
  }

  if (stage === "idle") {
    return (
      <button
        className="linkbtn"
        style={{ color: "var(--danger)" }}
        onClick={() => setStage("confirm-1")}
      >
        Reset face history
      </button>
    );
  }

  if (stage === "confirm-1") {
    return (
      <Modal onClose={reset}>
        <p>
          Are you sure you want to do this? This permanently deletes all of
          your capture sessions and photos. This can&apos;t be undone.
        </p>
        <div className="row">
          <button className="btn secondary" onClick={reset}>
            Cancel
          </button>
          <button className="btn danger" onClick={() => setStage("confirm-2")}>
            Continue
          </button>
        </div>
      </Modal>
    );
  }

  if (stage === "confirm-2") {
    return (
      <Modal onClose={reset}>
        <p>
          This is permanent. Your photos will be deleted from storage and
          cannot be recovered.
        </p>
        <div className="row">
          <button className="btn secondary" onClick={reset} disabled={isPending}>
            Cancel
          </button>
          <button className="btn danger" onClick={handleConfirm} disabled={isPending}>
            {isPending ? (
              <>
                <span className="spinner" /> Deleting…
              </>
            ) : (
              "Yes, permanently delete"
            )}
          </button>
        </div>
      </Modal>
    );
  }

  if (stage === "success") {
    return (
      <Modal onClose={reset}>
        <p>{message}</p>
        <button className="btn secondary" onClick={reset}>
          Close
        </button>
      </Modal>
    );
  }

  return (
    <Modal onClose={reset}>
      <div className="banner danger">{message}</div>
      <button className="btn secondary" onClick={reset}>
        Close
      </button>
    </Modal>
  );
}
