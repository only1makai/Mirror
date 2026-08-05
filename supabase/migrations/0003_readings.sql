-- ============================================================================
-- MIRROR — Step 2: readings + reading_dimorphism_findings + condition_findings
-- Build Sequence Step 2 (see 07_BUILD_SEQUENCE.md)
--
-- Second draft. First draft's RLS did not match 0001_init.sql in three ways
-- (Claude Code's review, applied here):
--   1. Policy granularity — collapsed from 4 per-action policies per table
--      down to 1 `for all` policy per table, matching 0001's style exactly.
--   2. Ownership derivation — 0001 stores NO redundant user_id on its child
--      tables (photos, log_adherence); ownership is derived via EXISTS back
--      to the parent, so there is exactly one copy of "who owns this" per
--      lineage and no way for it to drift out of sync. First draft
--      denormalized user_id onto readings AND both new child tables, which
--      is a real correctness gap: nothing would have stopped a row's
--      user_id from disagreeing with its parent's. Fixed here by dropping
--      user_id from all three new tables and deriving ownership the same
--      way 0001 does — EXISTS chained back to sessions.user_id.
--   3. face_shape_primary_id is now genuinely NOT NULL (first draft's header
--      comment claimed this but the column definition didn't enforce it,
--      which also let the primary/secondary distinctness CHECK silently
--      pass when primary was null). Fixed — header and DDL now agree, and
--      the CHECK can't be bypassed via NULL anymore.
--
-- Design decisions resolved here (both were open in 04/07):
--   1. readings supports a PRIMARY (not null) + OPTIONAL SECONDARY face
--      shape. Recommendation from 04/07 was "yes" — many faces genuinely
--      sit between categories, forcing a single output manufactures false
--      precision.
--   2. Dimorphism findings are their own table (one row per trait per
--      reading), not nine columns on `readings`.
--
-- Constraint carried forward, unchanged: no score/rating/index/percentile
-- column anywhere in this file. Classification values are constrained to
-- fixed descriptive categories via CHECK, never a numeric scale. Every
-- *_id column referencing a reference_* table is a real foreign key —
-- the belt-and-braces validation 07_BUILD_SEQUENCE.md calls for is enforced
-- by Postgres itself, not application-layer trust.
--
-- Explicitly NOT stored anywhere in this file: raw model responses, per
-- 07_BUILD_SEQUENCE.md's logging prohibition. Only the final, validated,
-- structured classification is persisted.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. READINGS — one row per capture-session analysis
-- ----------------------------------------------------------------------------

create table if not exists public.readings (
  id                        uuid primary key default gen_random_uuid(),
  session_id                uuid not null references public.sessions(id) on delete cascade,
  created_at                timestamptz not null default now(),

  -- Face shape: primary (required) + optional secondary.
  face_shape_primary_id     text not null references public.reference_face_shapes(id),
  face_shape_secondary_id   text references public.reference_face_shapes(id),
  face_shape_source         text check (face_shape_source in ('model','manual')),
  -- 'manual' exists because 04_RESEARCH_BACKGROUND.md found photo-based face
  -- shape classification unreliable in repeated testing on this project
  -- specifically, and recommended manual tape-measure entry as the more
  -- trustworthy path. The app should offer both, not just the model path.
  face_shape_measurements   jsonb,
  -- Freeform structured storage for the five measurements and the reasoning
  -- behind the classification — not a score, a record of what was measured
  -- and why. Shape: {"forehead_width_mm": ..., "cheekbone_width_mm": ...,
  -- "jaw_width_mm": ..., "face_length_mm": ..., "jaw_angle":
  -- "rounded"|"defined", "ratio_length_to_cheekbone": ..., "reasoning": "..."}
  face_shape_quality_flag   text,

  -- Skin
  skin_type_id              text references public.reference_skin_types(id),
  skin_is_sensitive         boolean not null default false,
  -- Per the correction in 04/0002: sensitivity is a reactivity modifier that
  -- can co-occur with any base skin type, not its own reference row. This is
  -- where that per-user flag actually lives.
  skin_quality_flag         text,

  -- Hair
  hair_type_id               text references public.reference_hair_types(id),
  hair_quality_flag          text,

  -- Teeth (optional — tied to the not-yet-built optional 4th "smile" capture
  -- angle per 06_UI_UX_SPEC.md; nullable because most sessions won't have it)
  teeth_shade_id              text references public.reference_teeth_shades(id),
  teeth_quality_flag          text,

  -- Dimorphism gets a brief summary line here for the summary screen
  -- (06_UI_UX_SPEC.md: "Dimorphism — brief summary line"); full per-trait
  -- detail lives in reading_dimorphism_findings below.
  dimorphism_summary          text,

  model_version                text,
  -- Which model/prompt version produced this reading, for debugging and
  -- audit only — never surfaced to the user as any kind of confidence score.

  constraint face_shape_primary_secondary_distinct
    check (face_shape_secondary_id is null or face_shape_secondary_id <> face_shape_primary_id)
  -- Now actually enforced end to end: face_shape_primary_id is not null, so
  -- this comparison can never silently evaluate to NULL-passes-as-true.
);

comment on table public.readings is
  'One row per capture-session analysis. No user_id column, by design — '
  'ownership is derived via EXISTS back to sessions.user_id, matching '
  '0001_init.sql''s pattern on photos/log_adherence exactly, so there is '
  'exactly one copy of "who owns this" and no way for it to drift out of '
  'sync with its parent session. Every classification column is a real '
  'foreign key into a reference_* table. Quality flags are per-category '
  '(soft-warning, never a hard block) per 06_UI_UX_SPEC.md.';

create index if not exists readings_session_idx on public.readings(session_id);

-- ----------------------------------------------------------------------------
-- 2. READING DIMORPHISM FINDINGS — one row per trait per reading (9 max)
-- ----------------------------------------------------------------------------

create table if not exists public.reading_dimorphism_findings (
  id             uuid primary key default gen_random_uuid(),
  reading_id     uuid not null references public.readings(id) on delete cascade,
  trait_id       text not null references public.reference_dimorphism_traits(id),
  classification text not null check (
    classification in ('masculine_typical','feminine_typical','mixed_or_neutral')
  ),
  -- Three fixed descriptive categories, no numeric axis. 'mixed_or_neutral'
  -- exists because forcing every trait into a binary masculine/feminine
  -- bucket would manufacture precision the underlying research doesn't
  -- support — these are population tendencies, not everyone falls cleanly
  -- on one side.
  quality_flag   text,
  created_at     timestamptz not null default now(),

  constraint reading_dimorphism_findings_unique_trait unique (reading_id, trait_id)
);

comment on table public.reading_dimorphism_findings is
  'Up to nine rows per reading, one per trait in reference_dimorphism_traits. '
  'No user_id column — ownership derives via EXISTS chained through '
  'readings.session_id back to sessions.user_id, same single-source-of-truth '
  'pattern as readings itself. classification is a fixed three-value '
  'descriptive category — never a numeric score, never a masculinity/'
  'femininity index.';

create index if not exists reading_dimorphism_findings_reading_idx
  on public.reading_dimorphism_findings(reading_id);

-- ----------------------------------------------------------------------------
-- 3. CONDITION FINDINGS — zero or more per reading
-- ----------------------------------------------------------------------------

create table if not exists public.condition_findings (
  id             uuid primary key default gen_random_uuid(),
  reading_id     uuid not null references public.readings(id) on delete cascade,
  condition_id   text not null references public.reference_conditions(id),
  notes          text,
  -- Optional per-instance observation detail, kept strictly descriptive —
  -- "cracking present at both mouth corners," not a diagnosis beyond what
  -- reference_conditions.presentation already states. Never a substitute
  -- for the reference table's evidence_tier/self_manageable/referral_note
  -- fields, which the app should always join through to rather than
  -- duplicate here.
  quality_flag   text,
  created_at     timestamptz not null default now()
);

comment on table public.condition_findings is
  'Zero or more per reading. No user_id column — same EXISTS-derivation '
  'ownership pattern as reading_dimorphism_findings. self_manageable and '
  'referral_note are NOT duplicated here — always join to '
  'reference_conditions for those, so there is exactly one place a referral '
  'rule can be correct or wrong. Per 06_UI_UX_SPEC.md: when '
  'self_manageable = false, the UI must show the referral note and must '
  'NOT offer a product as the primary action.';

create index if not exists condition_findings_reading_idx on public.condition_findings(reading_id);

-- ----------------------------------------------------------------------------
-- 4. RLS — default-deny, owner-only, EXISTS-derived, matching 0001_init.sql
-- ----------------------------------------------------------------------------

alter table public.readings enable row level security;
alter table public.reading_dimorphism_findings enable row level security;
alter table public.condition_findings enable row level security;

-- Every policy below spells out both `using` and `with check` explicitly,
-- even though for a `for all` policy Postgres would reuse `using` as the
-- check for new rows if `with check` were omitted. Matching 0001's style —
-- and avoiding a footgun where someone adds a `with check` later for an
-- unrelated reason and silently changes insert behavior on the other
-- actions as a side effect.

drop policy if exists readings_owner_all on public.readings;
create policy readings_owner_all on public.readings
  for all
  using (
    exists (
      select 1 from public.sessions s
      where s.id = readings.session_id and s.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.sessions s
      where s.id = readings.session_id and s.user_id = auth.uid()
    )
  );

drop policy if exists reading_dimorphism_findings_owner_all on public.reading_dimorphism_findings;
create policy reading_dimorphism_findings_owner_all on public.reading_dimorphism_findings
  for all
  using (
    exists (
      select 1 from public.readings r
      join public.sessions s on s.id = r.session_id
      where r.id = reading_dimorphism_findings.reading_id and s.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.readings r
      join public.sessions s on s.id = r.session_id
      where r.id = reading_dimorphism_findings.reading_id and s.user_id = auth.uid()
    )
  );

drop policy if exists condition_findings_owner_all on public.condition_findings;
create policy condition_findings_owner_all on public.condition_findings
  for all
  using (
    exists (
      select 1 from public.readings r
      join public.sessions s on s.id = r.session_id
      where r.id = condition_findings.reading_id and s.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.readings r
      join public.sessions s on s.id = r.session_id
      where r.id = condition_findings.reading_id and s.user_id = auth.uid()
    )
  );

-- ============================================================================
-- Adversarial testing required before this ships, per 07_BUILD_SEQUENCE.md
-- Step 2 — same standard the original five tables were held to:
--   - Cross-user row access. SELECT/UPDATE/DELETE are FILTERED by the USING
--     expression, not refused — they return zero rows, not an error, so
--     there is no SQLSTATE to capture for those three actions. INSERT is
--     the one action that raises (42501). Verify the PAIR for reads: the
--     owner sees the row AND a non-owner doesn't. Zero rows alone proves
--     nothing — a policy broken so it hides rows from everyone looks
--     identical to a correctly working one; only the pair distinguishes them.
--   - Path guessing (exact-id lookup by a non-owner, expect 0 rows)
-- Two-level EXISTS chains (reading_dimorphism_findings/condition_findings ->
-- readings -> sessions) are worth testing explicitly for performance too,
-- not just correctness — RLS re-derives ownership at each level (the
-- readings.session_id subquery is itself filtered by readings_owner_all,
-- which queries sessions again), so confirm query plans use the indexes
-- above rather than sequential-scanning sessions on every row check once
-- there's enough data for it to matter.
-- ============================================================================
