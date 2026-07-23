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
