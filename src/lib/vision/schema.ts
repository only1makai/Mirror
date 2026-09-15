import {
  DIMORPHISM_CLASSIFICATIONS,
  JAW_ANGLES,
  type Vocabularies,
} from "@/lib/types";

// Null is a first-class allowed value on most of these fields: the model
// declining to classify is a correct outcome we want back, not a failure.
//
// How that gets expressed matters. Structured outputs does not accept a union
// type array — `{"type": ["string", "null"], "enum": [...ids, null]}` is
// rejected at schema-compile time with
//
//   Invalid schema: Enum value 'diamond' does not match declared type
//   ['string', 'null']
//
// because each enum member is checked against the declared type and a bare
// string is not a `["string","null"]`. `anyOf` IS supported, so a nullable
// field is two branches: the real schema, or null. The enum then lives on the
// string branch alone and contains no null member.
//
// Everything nullable in this file goes through these helpers, so the pattern
// is fixed in one place rather than per field.
type Schema = Record<string, unknown>;

function nullable(schema: Schema, description?: string): Schema {
  const wrapped: Schema = { anyOf: [schema, { type: "null" }] };
  // Annotation stays at field level, outside the branches, so it describes the
  // field rather than one arm of the union.
  if (description) wrapped.description = description;
  return wrapped;
}

function nullableEnum(values: readonly string[], description?: string): Schema {
  return nullable({ type: "string", enum: [...values] }, description);
}

function nullableString(description?: string): Schema {
  return nullable({ type: "string" }, description);
}

function nullableNumber(description?: string): Schema {
  return nullable({ type: "number" }, description);
}

// The output schema is generated from the vocabularies that were just read
// out of the reference tables, so the enums are whatever is seeded right now.
//
// Note what is absent: the four *_mm fields of face_shape_measurements. A
// photo carries no scale reference, so any millimetre figure derived from one
// is invented. Leaving those fields out of the schema means the model has no
// slot to invent them into — they stay the user's tape-measure entry, which
// is the path 04_RESEARCH_BACKGROUND.md actually trusts. Teeth shade is
// absent for a different reason: it needs a fourth "smile" angle that the
// capture flow does not shoot.
export function buildReadingSchema(v: Vocabularies) {
  return {
    type: "object",
    additionalProperties: false,
    required: [
      "face_shape_primary_id",
      "face_shape_secondary_id",
      "face_shape_measurements",
      "face_shape_quality_flag",
      "skin_type_id",
      "skin_is_sensitive",
      "skin_quality_flag",
      "hair_type_id",
      "hair_quality_flag",
      "dimorphism_summary",
      "dimorphism_findings",
      "condition_findings",
    ],
    properties: {
      face_shape_primary_id: nullableEnum(v.faceShapes.map((o) => o.id)),
      face_shape_secondary_id: nullableEnum(v.faceShapes.map((o) => o.id)),
      face_shape_measurements: {
        type: "object",
        additionalProperties: false,
        required: ["jaw_angle", "ratio_length_to_cheekbone", "reasoning"],
        properties: {
          jaw_angle: nullableEnum(JAW_ANGLES),
          // Scale-free, so it survives the absence of a reference object in
          // frame. Still an estimate, and still the user's to correct.
          ratio_length_to_cheekbone: nullableNumber(),
          reasoning: nullableString(
            "What in the photos led to the shape call, in one or two plain sentences.",
          ),
        },
      },
      face_shape_quality_flag: nullableString(
        "Short plain-language note if photo quality limited this call, e.g. hair covering the jawline. Null when nothing got in the way.",
      ),
      skin_type_id: nullableEnum(v.skinTypes.map((o) => o.id)),
      skin_is_sensitive: {
        type: "boolean",
        description:
          "A reactivity modifier that can co-occur with any base type, not a type of its own.",
      },
      skin_quality_flag: nullableString(),
      hair_type_id: nullableEnum(v.hairTypes.map((o) => o.id)),
      hair_quality_flag: nullableString(),
      dimorphism_summary: nullableString(
        "One neutral descriptive sentence for the summary screen. Never a score, ranking, or judgement of attractiveness.",
      ),
      dimorphism_findings: {
        type: "array",
        description:
          "At most one entry per trait. Omit any trait the photos do not show clearly rather than guessing.",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["trait_id", "classification"],
          properties: {
            // Not nullable: an entry that names no trait is not a finding, so
            // the model omits the entry instead of nulling the field.
            trait_id: {
              type: "string",
              enum: v.dimorphismTraits.map((o) => o.id),
            },
            classification: {
              type: "string",
              enum: [...DIMORPHISM_CLASSIFICATIONS],
            },
          },
        },
      },
      condition_findings: {
        type: "array",
        description:
          "Only conditions actually visible. An empty array is the expected result for most sessions.",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["condition_id", "notes"],
          properties: {
            condition_id: {
              type: "string",
              enum: v.conditions.map((o) => o.id),
            },
            notes: nullableString(
              "Strictly what is observable, e.g. 'cracking at both mouth corners'. Never a diagnosis or a treatment suggestion.",
            ),
          },
        },
      },
    },
  };
}
