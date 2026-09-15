import {
  DIMORPHISM_CLASSIFICATIONS,
  JAW_ANGLES,
  type DimorphismClassification,
  type JawAngle,
  type ReadingSuggestion,
  type Vocabularies,
} from "@/lib/types";

// Structured outputs already constrain the enums, so in the ordinary case
// nothing here changes anything. It runs anyway because the alternative to a
// second check is an insert that violates a foreign key at submit time —
// long after the model call, and in front of the user. Anything that is not
// an exact match becomes null; nothing here throws.
function pickId(value: unknown, allowed: Set<string>): string | null {
  return typeof value === "string" && allowed.has(value) ? value : null;
}

function str(value: unknown, max = 2000): string | null {
  if (typeof value !== "string") return null;
  const t = value.trim();
  return t === "" ? null : t.slice(0, max);
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function validateSuggestion(
  raw: unknown,
  v: Vocabularies,
): ReadingSuggestion {
  const o = (raw ?? {}) as Record<string, unknown>;

  const shapeIds = new Set(v.faceShapes.map((x) => x.id));
  const skinIds = new Set(v.skinTypes.map((x) => x.id));
  const hairIds = new Set(v.hairTypes.map((x) => x.id));
  const traitIds = new Set(v.dimorphismTraits.map((x) => x.id));
  const conditionIds = new Set(v.conditions.map((x) => x.id));

  const primary = pickId(o.face_shape_primary_id, shapeIds);
  let secondary = pickId(o.face_shape_secondary_id, shapeIds);
  // face_shape_primary_secondary_distinct, and a secondary with no primary
  // would have nothing to be secondary to.
  if (secondary !== null && (primary === null || secondary === primary)) {
    secondary = null;
  }

  const m = (o.face_shape_measurements ?? {}) as Record<string, unknown>;
  const jawAngle =
    typeof m.jaw_angle === "string" &&
    (JAW_ANGLES as readonly string[]).includes(m.jaw_angle)
      ? (m.jaw_angle as JawAngle)
      : null;

  // reading_dimorphism_findings_unique_trait: one row per trait per reading.
  // First mention wins if the model somehow repeats a trait.
  const seenTraits = new Set<string>();
  const dimorphism: ReadingSuggestion["dimorphism_findings"] = [];
  if (Array.isArray(o.dimorphism_findings)) {
    for (const entry of o.dimorphism_findings) {
      const e = (entry ?? {}) as Record<string, unknown>;
      const traitId = pickId(e.trait_id, traitIds);
      if (traitId === null || seenTraits.has(traitId)) continue;
      const c = e.classification;
      if (
        typeof c !== "string" ||
        !(DIMORPHISM_CLASSIFICATIONS as readonly string[]).includes(c)
      ) {
        continue;
      }
      seenTraits.add(traitId);
      dimorphism.push({
        trait_id: traitId,
        classification: c as DimorphismClassification,
      });
    }
  }

  // condition_findings has no unique constraint, but two rows for the same
  // condition on one reading is a duplicate, not a second observation.
  const seenConditions = new Set<string>();
  const conditions: ReadingSuggestion["condition_findings"] = [];
  if (Array.isArray(o.condition_findings)) {
    for (const entry of o.condition_findings) {
      const e = (entry ?? {}) as Record<string, unknown>;
      const conditionId = pickId(e.condition_id, conditionIds);
      if (conditionId === null || seenConditions.has(conditionId)) continue;
      seenConditions.add(conditionId);
      conditions.push({ condition_id: conditionId, notes: str(e.notes, 500) });
    }
  }

  return {
    face_shape_primary_id: primary,
    face_shape_secondary_id: secondary,
    face_shape_measurements: {
      // Never model-supplied — no scale reference exists in a photo. These
      // stay null until the user measures.
      forehead_width_mm: null,
      cheekbone_width_mm: null,
      jaw_width_mm: null,
      face_length_mm: null,
      jaw_angle: jawAngle,
      ratio_length_to_cheekbone: num(m.ratio_length_to_cheekbone),
      reasoning: str(m.reasoning, 1000),
    },
    face_shape_quality_flag: str(o.face_shape_quality_flag, 300),
    skin_type_id: pickId(o.skin_type_id, skinIds),
    skin_is_sensitive: o.skin_is_sensitive === true,
    skin_quality_flag: str(o.skin_quality_flag, 300),
    hair_type_id: pickId(o.hair_type_id, hairIds),
    hair_quality_flag: str(o.hair_quality_flag, 300),
    dimorphism_summary: str(o.dimorphism_summary, 500),
    dimorphism_findings: dimorphism,
    condition_findings: conditions,
  };
}
