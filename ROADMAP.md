# ROADMAP — Mirror

Work queue for the coding agent. Read `CLAUDE.md` first. One unchecked item = one PR. Work phases in order and items top to bottom within a phase unless an item says it's blocked.

Last updated: 2026-11-17, against commit `0d326fa` on `main`.

**Definition of done:** Phases 1–5 complete. That is PRD v1 fully shipped (Capture, Compare, Log, Stack, Correlate, Mirror Toy), plus Readings, with CI and tests guarding it. Phase 6 is a backlog that needs owner decisions before any of it is work.

---

## Phase 0 — Shipped (verified)

- [x] Auth: email OTP sign-in (8-digit code, implicit flow)
- [x] Schema + RLS: `0001_init` (sessions, photos, logs, stack_items, log_adherence, private `photos` bucket with path-scoped policies)
- [x] Reference taxonomy: `0002_reference` (face shapes, skin types, hair types, dimorphism traits, conditions, teeth shades, products), world-readable
- [x] Readings tables: `0003_readings` (readings, reading_dimorphism_findings, condition_findings)
- [x] Capture: three angles, ghost-outline alignment, upload, lighting check
- [x] Compare: side-by-side, slider, timeline scrub, PNG export
- [x] Log: daily entry
- [x] Stack: product list with start dates
- [x] Readings: vision route returns a draft into an editable review form; submit is the only writer; `face_shape_source` tracks model vs. manual. Verified with a real three-angle capture on 2026-09-15 (suggestion returned, field edited, row saved with source `manual`, teeth null, no duplicate)
- [x] Structured-output schema fix: nullable enums via `anyOf` across all 15 call sites
- [x] Supabase 15s timeouts (AbortError-named) + visible `LoadError` banner instead of false empty states
- [x] Reset face history (Storage first, then rows; two-stage confirm)
- [x] README updated to list Readings as shipped

---

## Phase 1 — Guardrails (do first)

These protect what's shipped before anything new gets built on top.

- [x] **1.1 Fix README environment section**
  - README's `.env.local` block lists all five variables from the table in `CLAUDE.md`, says which are server-only, and that `SUPABASE_SERVICE_ROLE_KEY` and `DB_URL` are only for scripts.
  - Adds a "Running a Reading locally" note: needs `ANTHROPIC_API_KEY`; run `node scripts/verify-vocab.mjs` first.
  - No other README content changes.

- [ ] **1.2 Add unit tests for the vision schema and validator**
  - Adds a lightweight test runner (prefer Node's built-in `node:test` or Vitest; justify the choice in the PR). New `npm test` script.
  - Tests run with no network and no env vars, using a fixture vocabulary object.
  - Covers: no `type` array anywhere in the built schema; every nullable enum is `anyOf` with no `null` inside `enum`; millimetre fields are absent from the schema; teeth is absent or always null; validator nulls an id not in the vocabulary and keeps one that is.
  - `npm test`, `npm run typecheck`, `npm run build` pass; raw output in PR.

- [ ] **1.3 Add CI on pull requests**
  - GitHub Actions workflow runs `npm ci`, `npm run typecheck`, `npm test`, `npm run build` on every PR to `main`.
  - Needs no repository secrets. If the build requires `NEXT_PUBLIC_*` values, use obvious placeholders in the workflow (e.g. `https://example.supabase.co`), never real ones.
  - The PR that adds it shows a green run.

- [ ] **1.4 Migrate `middleware.ts` to the Next 16 `proxy` convention**
  - Dev server no longer prints the "middleware file convention is deprecated" warning.
  - Session refresh still works: signed-in user stays signed in across navigation; signed-out user hitting `/capture` is redirected to `/login`.
  - Keeps relative imports (Edge bundle constraint) and the same matcher.
  - Owner step in PR: confirm on the Vercel preview that sign-in still works.

---

## Phase 2 — Readings in production

- [ ] **2.1 Document the production setup for Readings** (owner step required)
  - README "Deploy" section lists the Vercel env vars production needs, including `ANTHROPIC_API_KEY`.
  - PR description tells the owner to add the key in Vercel and redeploy. The agent does not set it.
  - Blocked on Open question Q2 for verification.

- [ ] **2.2 Reduce camera-flip friction between capture angles**
  - Owner reported having to flip the camera back and forth when moving between angles.
  - Investigate how `CaptureStudio.tsx` picks `facingMode` / the device between shots; keep the chosen camera across all three angles in one session.
  - Acceptance: on a phone, after choosing the front camera for the first angle, the second and third angles open on the same camera with no manual flip. Ghost overlay and upload unchanged.
  - Owner step: test on his phone over the dev server's Network URL.

- [ ] **2.3 Readings history on the reading page**
  - If a session already has a saved reading, `/reading/[sessionId]` shows it read-only instead of re-running the model, with an explicit "New reading" action.
  - Never shows `model_version` or any confidence value to the user.
  - Acceptance: revisiting a session with a reading makes zero calls to `/api/readings/suggest` (check the dev-server log).

---

## Phase 3 — PRD gaps in shipped features

- [ ] **3.1 Stack: "Changed something?" confound warning** (PRD §4)
  - Adding a product while another product started within the last 6 weeks shows a one-line warning that the new product confounds the earlier one.
  - Warning only; it never blocks the add.

- [ ] **3.2 Stack: signal-delay notice** (PRD §4)
  - First, check whether anything already tells the user skincare takes ~6–12 weeks to show; report what you find.
  - If absent, each stack item younger than 6 weeks shows "too early to judge" copy. No numbers about effectiveness.

- [ ] **3.3 Capture frequency soft cap** (PRD v1.2, marked "keep in scope")
  - Starting a new capture session before N days since the last one shows a block with the date it reopens. Log stays open daily.
  - N comes from a single constant. **Blocked on Q5** (value of N); until answered, open the PR with N = 7 and flag it.

---

## Phase 4 — Correlate (PRD §5)

Observations, never causal claims. Hard rule: no association is shown unless there are at least 4 weeks of data on both sides of the change, and the feature stays hidden until 8 weeks of log data exist.

- [ ] **4.1 Correlate data layer**
  - Pure functions (no UI) that take logs, adherence and stack items and return candidate observations: metric change before vs. after a product start; shine reports vs. prior-night sleep under 6 hours.
  - Enforces both gates in code. Unit tests with synthetic data cover: under 8 weeks returns nothing; under 4 weeks on either side returns nothing; a clear before/after change is returned.

- [ ] **4.2 Correlate page**
  - `/correlate` page and tab entry, rendering 4.1's observations as plain sentences ("Breakout count is down since you started X, week 3 → week 11").
  - One line of caveat (n=1, uncontrolled), not a wall of disclaimer.
  - Before 8 weeks: shows how many weeks of data exist and when the page unlocks.
  - No scores, grades or percentages framed as quality.

---

## Phase 5 — Mirror Toy (PRD §6) and PWA polish

- [ ] **5.1 Mirror Toy**
  - Takes a front photo and shows two composites (left half mirrored, right half mirrored) side by side.
  - Ships with one line of copy: everyone is asymmetric; the composites always look wrong; that's the point.
  - No number, index or percentage anywhere. Rendering happens client-side; composites are never uploaded or stored.

- [ ] **5.2 PWA install check**
  - App installs to a phone home screen, opens standalone, icons render. Fix whatever doesn't.
  - Owner step: confirm on his phone.

---

## Phase 6 — Backlog (owner decision required before any of this is work)

Do not start these. They need a decision recorded here first (see Q7, Q8).

- Teeth: optional fourth "smile" capture angle so `teeth_shade_id` can be filled (PRD v1.1 §11)
- Extended capture protocol: hair-back shot, hair texture close-up (§7)
- Tiered cut recommendations + styling how-to (§8, §9)
- Grooming layer (§10), product recommendations (§12), temporary/cosmetic tools (§13), date-day protocol (§14)
- v1.2: Consult Mode, barber cadence reminder, cost-per-product, HealthKit sleep, monthly digest, weather nudge

---

## Open questions (for the owner — don't guess)

- **Q1. License.** The repo is public with no LICENSE file, so it's all-rights-reserved by default. Which license, if any?
- **Q2. Is `ANTHROPIC_API_KEY` set in Vercel production?** As of mid-September it wasn't. Until it is, Readings fails with a handled error on the live site.
- **Q3. Should a face-photo app's repo stay public?** It contains no photos or secrets, but this was flagged as worth deciding on purpose.
- **Q4. Research citation.** README grounds no-scoring in the Marquardt phi mask; earlier planning notes cited Farkas's craniofacial anthropometry norms. Keep one, both, or reconcile?
- **Q5. Capture cap value.** How many days between full capture sessions (3.3)? Weekly is the stated cadence, so 7 is the placeholder.
- **Q6. Missing planning docs.** Migration headers reference `00_START_HERE.md`, `03_DESIGN_CONSTRAINTS.md`, `04_RESEARCH_BACKGROUND.md`, `06_UI_UX_SPEC.md`, `07_BUILD_SEQUENCE.md`. None are in the repo, and `03` was noted missing on 2026-08-04. Where do they live, and should they be committed?
- **Q7. Teeth.** Build the fourth capture angle, or leave teeth permanently manual/null?
- **Q8. v1.1 / v1.2 scope.** Which Phase 6 items, if any, become real work, and in what order?
- **Q9. One-off scripts.** Keep, move to `scripts/archive/`, or delete `otp-diagnose.mjs`, `inventory-0b.mjs`, `wipe-0b.mjs`, `seed-compare.mjs`? Has `wipe-0b` already been run, and were its six Storage objects removed by hand?
- **Q10. A non-production database.** There is only the production Supabase project, so the agent can't test migrations or DB-touching scripts. Create a dev project, or keep all DB changes owner-applied?
- **Q11. Supabase auto-pause.** Accept the free-tier pause (owner resumes manually), add a keep-alive ping, or upgrade?
- **Q12. Vision model.** `VISION_MODEL` is pinned and the call uses a beta header (`server-side-fallback-2026-07-01`). Keep as is, or move to a cheaper model / drop the beta?
