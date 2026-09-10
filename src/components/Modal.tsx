"use client";

// No shared modal existed anywhere in this codebase before this — built here
// (alongside TabBar.tsx) rather than inline in a single feature, since a
// confirm-style overlay is the kind of piece other destructive actions will
// want later. Click on the overlay closes; click inside the card doesn't.
export default function Modal({
  children,
  onClose,
}: {
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}
