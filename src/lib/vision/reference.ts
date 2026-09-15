import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { RefOption, Vocabularies } from "@/lib/types";

// Allowed values are read from the reference tables at request time, never
// hardcoded here. Each one is a real foreign key on readings /
// reading_dimorphism_findings / condition_findings, so a list that drifts
// from the seed data produces an insert that fails at the database — after
// the model call has already been paid for. Reading the live table is the
// only version that cannot drift.
//
// The reference_* tables are world-readable (0002_reference.sql grants
// `for select using (true)` on all seven), so the ordinary request-scoped
// client is enough; no service-role key is involved anywhere in this flow.
export async function loadVocabularies(): Promise<Vocabularies> {
  const supabase = await createClient();

  const [shapes, skin, hair, traits, conditions] = await Promise.all([
    supabase
      .from("reference_face_shapes")
      .select("id, display_name, definition")
      .order("id"),
    supabase
      .from("reference_skin_types")
      .select("id, display_name, indicators")
      .order("id"),
    supabase
      .from("reference_hair_types")
      .select("id, display_name, indicators")
      .order("id"),
    supabase
      .from("reference_dimorphism_traits")
      .select(
        "id, display_name, masculine_typical_description, feminine_typical_description",
      )
      .order("id"),
    supabase
      .from("reference_conditions")
      .select("id, display_name, presentation")
      .order("id"),
  ]);

  for (const r of [shapes, skin, hair, traits, conditions]) {
    if (r.error) throw new Error(`Reference load failed: ${r.error.message}`);
  }

  const simple = (
    rows: { id: string; display_name: string }[],
    guidanceKey?: string,
  ): RefOption[] =>
    rows.map((r) => ({
      id: r.id,
      label: r.display_name,
      guidance: guidanceKey
        ? ((r as Record<string, unknown>)[guidanceKey] as string | undefined)
        : undefined,
    }));

  type TraitRow = {
    id: string;
    display_name: string;
    masculine_typical_description: string | null;
    feminine_typical_description: string;
  };

  return {
    faceShapes: simple(shapes.data ?? [], "definition"),
    skinTypes: simple(skin.data ?? [], "indicators"),
    hairTypes: simple(hair.data ?? [], "indicators"),
    conditions: simple(conditions.data ?? [], "presentation"),
    dimorphismTraits: ((traits.data ?? []) as TraitRow[]).map((t) => ({
      id: t.id,
      label: t.display_name,
      // Both poles in one line so the model is choosing between this
      // project's own descriptions, not a general notion of the words.
      guidance: [
        t.masculine_typical_description
          ? `masculine-typical: ${t.masculine_typical_description}`
          : null,
        `feminine-typical: ${t.feminine_typical_description}`,
      ]
        .filter(Boolean)
        .join(" | "),
    })),
  };
}
