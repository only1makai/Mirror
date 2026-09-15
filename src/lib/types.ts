export const ANGLES = ["front", "left", "right"] as const;
export type Angle = (typeof ANGLES)[number];

export const ANGLE_LABEL: Record<Angle, string> = {
  front: "Front",
  left: "Left profile",
  right: "Right profile",
};

// Luminance delta (0–255 scale) above which we warn that lighting has shifted
// enough to hurt comparability with the previous session.
export const LIGHTING_WARN_THRESHOLD = 35;

export type Session = {
  id: string;
  user_id: string;
  captured_at: string;
  lighting_score: number | null;
  notes: string | null;
  created_at: string;
};

export type Photo = {
  id: string;
  session_id: string;
  angle: Angle;
  storage_path: string;
  width: number | null;
  height: number | null;
  created_at: string;
};

export type Log = {
  id: string;
  user_id: string;
  date: string;
  sleep_hours: number | null;
  note: string | null;
  shine_tzone: number | null;
  shine_cheeks: number | null;
  breakout_count: number | null;
  breakout_zones: string[];
  dryness: number | null;
  irritation: boolean;
  created_at: string;
};

export type StackItem = {
  id: string;
  user_id: string;
  product_name: string;
  category: string | null;
  started_at: string | null;
  ended_at: string | null;
  schedule: "am" | "pm" | "both" | null;
  created_at: string;
};

export const PHOTO_BUCKET = "photos";
export const SIGNED_URL_TTL = 60 * 5; // 5 minutes — short-lived per privacy spec.

// ---------------------------------------------------------------------------
// Readings — Step 2 (0003_readings.sql)
// ---------------------------------------------------------------------------

// Fixed three-value descriptive category from
// reading_dimorphism_findings.classification's CHECK constraint. Not a scale,
// and deliberately not orderable — never sort or index these.
export const DIMORPHISM_CLASSIFICATIONS = [
  "masculine_typical",
  "feminine_typical",
  "mixed_or_neutral",
] as const;
export type DimorphismClassification =
  (typeof DIMORPHISM_CLASSIFICATIONS)[number];

export const DIMORPHISM_LABEL: Record<DimorphismClassification, string> = {
  masculine_typical: "Masculine-typical",
  feminine_typical: "Feminine-typical",
  mixed_or_neutral: "Mixed / neutral",
};

export const JAW_ANGLES = ["rounded", "defined"] as const;
export type JawAngle = (typeof JAW_ANGLES)[number];

// Shape of readings.face_shape_measurements, per its column comment in
// 0003_readings.sql. The four *_mm fields are tape-measure values the user
// enters; nothing derived from a photo is written into them (see
// lib/vision/prompt.ts for why).
export type FaceShapeMeasurements = {
  forehead_width_mm: number | null;
  cheekbone_width_mm: number | null;
  jaw_width_mm: number | null;
  face_length_mm: number | null;
  jaw_angle: JawAngle | null;
  ratio_length_to_cheekbone: number | null;
  reasoning: string | null;
};

// One allowed value from a reference_* table. `guidance` carries that row's
// own descriptive column so the model classifies against this project's
// definitions rather than its own priors.
export type RefOption = { id: string; label: string; guidance?: string };

export type Vocabularies = {
  faceShapes: RefOption[];
  skinTypes: RefOption[];
  hairTypes: RefOption[];
  dimorphismTraits: RefOption[];
  conditions: RefOption[];
};

// What the vision route returns. Every id here has already been checked
// against the live reference tables — anything that did not match exactly is
// null, so this is safe to render but is NOT a reading until the user
// confirms it through the form.
export type ReadingSuggestion = {
  face_shape_primary_id: string | null;
  face_shape_secondary_id: string | null;
  face_shape_measurements: FaceShapeMeasurements;
  face_shape_quality_flag: string | null;
  skin_type_id: string | null;
  skin_is_sensitive: boolean;
  skin_quality_flag: string | null;
  hair_type_id: string | null;
  hair_quality_flag: string | null;
  dimorphism_summary: string | null;
  dimorphism_findings: {
    trait_id: string;
    classification: DimorphismClassification;
  }[];
  condition_findings: { condition_id: string; notes: string | null }[];
};

export type SuggestStage = "auth" | "session" | "images" | "model" | "server";

export type SuggestResponse =
  | { ok: true; suggestion: ReadingSuggestion; modelVersion: string }
  | { ok: false; stage: SuggestStage; message: string };
