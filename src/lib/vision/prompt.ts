import { ANGLE_LABEL, type RefOption, type Vocabularies } from "@/lib/types";

function list(title: string, options: RefOption[]): string {
  const lines = options.map((o) =>
    o.guidance ? `- ${o.id} (${o.label}): ${o.guidance}` : `- ${o.id} (${o.label})`,
  );
  return `${title}\n${lines.join("\n")}`;
}

// The vocabulary blocks are rendered from the live reference rows, including
// each row's own descriptive column, so the model classifies against this
// project's definitions rather than whatever it already associates with the
// words "oval" or "combination".
export function buildSystemPrompt(v: Vocabularies): string {
  return [
    `You are pre-filling a form in Mirror, a personal grooming-tracking app, from three photos the user just took of their own face.`,
    ``,
    `What you produce is a draft, not a result. Every field you return is shown to the user as an editable suggestion, and nothing is recorded until they review and submit it themselves. Treat borderline calls accordingly: returning null costs the user one dropdown, whereas a confident wrong answer they do not notice becomes their record.`,
    ``,
    `Rules:`,
    `1. Use only the identifiers listed below. Never invent one, never adapt a near-miss.`,
    `2. Return null for anything the photos do not clearly support. Declining is a correct answer and is preferred over a plausible guess.`,
    `3. Face shape specifically has tested unreliable from photographs on this project. Be conservative: offer a secondary shape whenever the face genuinely sits between two, and set the quality flag when hair, angle, or lighting limited the call.`,
    `4. Never output a score, rating, index, percentile, or ranking, and never comment on attractiveness. Dimorphism traits are population tendencies described in three fixed categories, nothing more.`,
    `5. Report only conditions that are actually visible. An empty list is the normal result. Notes describe what is observable and never name a diagnosis or suggest a treatment.`,
    `6. Do not estimate any measurement in millimetres. There is no scale reference in these photos. The length-to-cheekbone ratio is scale-free and may be estimated; the millimetre fields belong to the user's tape measure and are not yours to fill.`,
    ``,
    list(`FACE SHAPES (face_shape_primary_id, face_shape_secondary_id):`, v.faceShapes),
    ``,
    list(`SKIN TYPES (skin_type_id):`, v.skinTypes),
    ``,
    list(`HAIR TYPES (hair_type_id):`, v.hairTypes),
    ``,
    list(`DIMORPHISM TRAITS (trait_id):`, v.dimorphismTraits),
    ``,
    list(`CONDITIONS (condition_id):`, v.conditions),
  ].join("\n");
}

export function buildUserInstruction(): string {
  return `These are the three angles from one capture session, labelled above each image. Fill in what the photos support and leave the rest null.`;
}

export function imageLabel(angle: keyof typeof ANGLE_LABEL): string {
  return `${ANGLE_LABEL[angle]}:`;
}
