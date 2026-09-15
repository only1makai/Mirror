"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { loadVocabularies } from "@/lib/vision/reference";
import {
  DIMORPHISM_CLASSIFICATIONS,
  JAW_ANGLES,
  type DimorphismClassification,
  type FaceShapeMeasurements,
} from "@/lib/types";

export type ReadingInput = {
  sessionId: string;
  face_shape_primary_id: string | null;
  face_shape_secondary_id: string | null;
  // 'model' only when the user submitted the suggested shape untouched.
  // Editing it makes the reading theirs, and the column should say so.
  face_shape_source: "model" | "manual";
  face_shape_measurements: FaceShapeMeasurements;
  face_shape_quality_flag: string | null;
  skin_type_id: string | null;
  skin_is_sensitive: boolean;
  skin_quality_flag: string | null;
  hair_type_id: string | null;
  hair_quality_flag: string | null;
  dimorphism_summary: string | null;
  dimorphism_findings: { trait_id: string; classification: string }[];
  condition_findings: { condition_id: string; notes: string | null }[];
  // Null when the user filled the form with no model involvement at all.
  model_version: string | null;
};

export type SaveReadingResult =
  | { ok: true; readingId: string }
  | { ok: false; message: string };

function clean(value: string | null, max: number): string | null {
  if (typeof value !== "string") return null;
  const t = value.trim();
  return t === "" ? null : t.slice(0, max);
}

function finiteOrNull(value: number | null): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

// Everything arriving here is re-checked against the live reference tables,
// including values that came from the suggestion route and were already
// checked once. This is the last point before the insert, and it is the only
// check that sees what the client actually posted.
export async function saveReading(
  input: ReadingInput,
): Promise<SaveReadingResult> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "You are not signed in." };

  const { data: session, error: sessionError } = await supabase
    .from("sessions")
    .select("id")
    .eq("id", input.sessionId)
    .maybeSingle();

  if (sessionError) return { ok: false, message: sessionError.message };
  if (!session) return { ok: false, message: "That capture session was not found." };

  const vocab = await loadVocabularies();
  const shapeIds = new Set(vocab.faceShapes.map((o) => o.id));
  const skinIds = new Set(vocab.skinTypes.map((o) => o.id));
  const hairIds = new Set(vocab.hairTypes.map((o) => o.id));
  const traitIds = new Set(vocab.dimorphismTraits.map((o) => o.id));
  const conditionIds = new Set(vocab.conditions.map((o) => o.id));

  const primary =
    input.face_shape_primary_id && shapeIds.has(input.face_shape_primary_id)
      ? input.face_shape_primary_id
      : null;

  // readings.face_shape_primary_id is NOT NULL, so this is the one field the
  // form genuinely cannot submit without.
  if (!primary) {
    return { ok: false, message: "Choose a primary face shape before saving." };
  }

  let secondary =
    input.face_shape_secondary_id && shapeIds.has(input.face_shape_secondary_id)
      ? input.face_shape_secondary_id
      : null;
  if (secondary === primary) secondary = null;

  const m = input.face_shape_measurements ?? ({} as FaceShapeMeasurements);
  const measurements: FaceShapeMeasurements = {
    forehead_width_mm: finiteOrNull(m.forehead_width_mm),
    cheekbone_width_mm: finiteOrNull(m.cheekbone_width_mm),
    jaw_width_mm: finiteOrNull(m.jaw_width_mm),
    face_length_mm: finiteOrNull(m.face_length_mm),
    jaw_angle:
      m.jaw_angle && (JAW_ANGLES as readonly string[]).includes(m.jaw_angle)
        ? m.jaw_angle
        : null,
    ratio_length_to_cheekbone: finiteOrNull(m.ratio_length_to_cheekbone),
    reasoning: clean(m.reasoning, 1000),
  };
  const hasMeasurements = Object.values(measurements).some((x) => x !== null);

  const { data: reading, error: readingError } = await supabase
    .from("readings")
    .insert({
      session_id: input.sessionId,
      face_shape_primary_id: primary,
      face_shape_secondary_id: secondary,
      face_shape_source: input.face_shape_source === "model" ? "model" : "manual",
      face_shape_measurements: hasMeasurements ? measurements : null,
      face_shape_quality_flag: clean(input.face_shape_quality_flag, 300),
      skin_type_id:
        input.skin_type_id && skinIds.has(input.skin_type_id)
          ? input.skin_type_id
          : null,
      skin_is_sensitive: input.skin_is_sensitive === true,
      skin_quality_flag: clean(input.skin_quality_flag, 300),
      hair_type_id:
        input.hair_type_id && hairIds.has(input.hair_type_id)
          ? input.hair_type_id
          : null,
      hair_quality_flag: clean(input.hair_quality_flag, 300),
      // Teeth stays null: reading it needs a fourth "smile" angle that the
      // capture flow does not shoot. Not an oversight — see 06_UI_UX_SPEC.md.
      teeth_shade_id: null,
      teeth_quality_flag: null,
      dimorphism_summary: clean(input.dimorphism_summary, 500),
      model_version: clean(input.model_version, 100),
    })
    .select("id")
    .single();

  if (readingError) return { ok: false, message: readingError.message };
  const readingId = reading.id as string;

  // From here on, any failure has to take the parent row with it. A readings
  // row whose findings silently failed to insert reads, forever after, as a
  // reading where nothing was found — which is a different claim than the
  // one the user submitted.
  async function rollback(message: string): Promise<SaveReadingResult> {
    await supabase.from("readings").delete().eq("id", readingId);
    return { ok: false, message };
  }

  const seenTraits = new Set<string>();
  const dimorphismRows = (input.dimorphism_findings ?? [])
    .filter((f) => {
      if (!traitIds.has(f.trait_id) || seenTraits.has(f.trait_id)) return false;
      if (
        !(DIMORPHISM_CLASSIFICATIONS as readonly string[]).includes(
          f.classification,
        )
      ) {
        return false;
      }
      seenTraits.add(f.trait_id);
      return true;
    })
    .map((f) => ({
      reading_id: readingId,
      trait_id: f.trait_id,
      classification: f.classification as DimorphismClassification,
    }));

  if (dimorphismRows.length > 0) {
    const { error } = await supabase
      .from("reading_dimorphism_findings")
      .insert(dimorphismRows);
    if (error) {
      return rollback(`Saving the dimorphism findings failed: ${error.message}`);
    }
  }

  const seenConditions = new Set<string>();
  const conditionRows = (input.condition_findings ?? [])
    .filter((f) => {
      if (!conditionIds.has(f.condition_id) || seenConditions.has(f.condition_id)) {
        return false;
      }
      seenConditions.add(f.condition_id);
      return true;
    })
    .map((f) => ({
      reading_id: readingId,
      condition_id: f.condition_id,
      notes: clean(f.notes, 500),
    }));

  if (conditionRows.length > 0) {
    const { error } = await supabase
      .from("condition_findings")
      .insert(conditionRows);
    if (error) {
      return rollback(`Saving the condition findings failed: ${error.message}`);
    }
  }

  revalidatePath("/");
  revalidatePath("/compare");

  return { ok: true, readingId };
}
