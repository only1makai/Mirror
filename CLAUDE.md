# CLAUDE.md — Mirror

Instructions for an autonomous coding agent working in `only1makai/Mirror`. Read this whole file before your first change. `ROADMAP.md` (shipped as `ROADMAP-Mirror.md`) is the work queue.

Last updated: 2026-11-17, against commit `0d326fa` on `main`.

---

## What it is

Mirror is a photo-tracking web app for grooming and skincare progress. A user captures three photos (front, left profile, right profile) against a ghost outline of their last session, so framing stays consistent week to week. They compare any two sessions, log skin, routine adherence and sleep daily, and track the products they use.

**It never scores a face.** No attractiveness rating, percentile, proportion ratio, phi mask, facial thirds, or canthal tilt. That isn't a missing feature; it is the reason the app exists. Scoring apps lean on facial-proportion norms that don't replicate across populations, and photo landmark error is about the same size as the variation those scores claim to measure. The rule is enforced in the schema: no score, rating, index or percentile column exists, and migration headers say any edit adding one is wrong.

## Who it's for

The owner first, then friends who want the same thing. Single-player by design. Multiplayer, social feeds, leaderboards and comparison to other users are permanently out of scope. It is also a portfolio project: the owner is a UCSC Technology & Information Management student, and the repo is public and read by recruiters, so code, commit messages and PR descriptions should read cleanly to an outsider.

## Tech stack

- **Next.js 16** (App Router, Turbopack in dev), React 19, TypeScript 5
- **Supabase**: Postgres, Auth (email OTP), Storage (private `photos` bucket)
- **Anthropic SDK** (`@anthropic-ai/sdk`) for the Readings vision route; model set in `src/lib/anthropic.ts` (`VISION_MODEL`)
- **sharp** for server-side image downscaling; **pg** for migration and verification scripts
- **Vercel** hosting, live at `mirror-tau-two.vercel.app`
- PWA (`public/manifest.webmanifest`, `public/sw.js`), no native app

## Install, run, test

```bash
npm install
npm run dev          # http://localhost:3000
npm run typecheck    # tsc --noEmit
npm run build        # production build
```

`.env.local` (gitignored, never committed):

| Variable | Used by | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | app, scripts | |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | app, scripts | |
| `ANTHROPIC_API_KEY` | `src/lib/anthropic.ts` only | Server-only. The client is built lazily, so a missing key becomes a handled error state, not a boot crash. |
| `SUPABASE_SERVICE_ROLE_KEY` | `scripts/seed-compare.mjs`, `scripts/verify.mjs` only | Never import into `src/`. |
| `DB_URL` | migration and verify scripts | Postgres connection string. |

**Testing, honestly:** there is no automated test suite yet (roadmap Phase 1 adds one). The current gates for any PR are:

1. `npm run typecheck` passes
2. `npm run build` passes
3. If you touched `src/lib/vision/` or `0002_reference.sql`: `node scripts/verify-vocab.mjs` passes. It needs network access to the Supabase project; if you can't reach it, say so in the PR instead of claiming it passed.

Paste raw command output into the PR description. The owner checks claims against raw output and rejects prose summaries of results.

The Supabase project is on the free tier and auto-pauses after about a week idle. "fetch failed" on every query usually means it's paused, not that the code is broken. Report it and stop; only the owner can resume it.

## Repo structure

```
mirror-prd.md                 Product spec (v0.1 + v1.1/v1.2 captured ideas). Source of intent.
supabase/migrations/          0001_init (core tables, RLS, bucket), 0002_reference (reference taxonomy + seed),
                              0003_readings (readings + two finding tables). Applied to production.
scripts/                      Node scripts: run-migration, verify-*, seed-compare, inventory-0b, wipe-0b,
                              otp-diagnose, gen-icons. Several touch production. See "Never".
src/middleware.ts             Session refresh. Uses a RELATIVE import on purpose (see Conventions).
src/app/
  page.tsx                    Home
  login/                      Email OTP sign-in
  capture/                    CaptureStudio: three-angle capture, ghost overlay, upload, lighting check
  compare/                    Side-by-side, slider, timeline scrub, PNG export
  log/                        Daily log
  stack/                      Product stack
  reading/[sessionId]/        Reading review form + submit action (the only writer of readings)
  api/readings/suggest/       Vision route: returns a draft, writes nothing
  account/                    Reset face history (two-stage confirm)
src/components/               Modal, LoadError, TabBar
src/lib/
  anthropic.ts                Lazy server-only client, timeouts, VISION_MODEL, READING_MODEL_VERSION
  vision/                     images (fetch + downscale), reference (live vocab), schema, prompt,
                              suggest (model call), validate
  supabase/                   client, server, middleware helpers, timeout-fetch
  photos.ts, types.ts, otp.ts
```

## Conventions

**Database**
- New schema change = new numbered migration file (`0004_*.sql`). Never edit an applied migration.
- Migrations are re-runnable: `if not exists`, `drop policy if exists`.
- RLS is default-deny and owner-only on every user table. One `for all` policy per table, matching `0001_init.sql`.
- Child tables carry no `user_id`. Ownership is derived with `EXISTS` back to `sessions.user_id`, so there is one copy of "who owns this."
- `reference_*` tables are world-readable (`for select using (true)`) and are the controlled vocabularies. Classification columns are real foreign keys into them.
- Header comment on every migration explaining what and why.

**Supabase calls**
- All clients go through `timeoutFetch` (15s ceiling). It aborts with an error *named* `AbortError` on purpose: postgrest-js retries anything else, which once stretched a 15s timeout to 67s. Don't switch it to `AbortSignal.timeout()`.
- Supabase reports failures in the `error` field and doesn't throw. Always check `error`. Render `LoadError` on failure; never let a failed query render as an empty state like "No captures yet."

**Readings / vision**
- The route returns a draft and writes nothing. The only writer is the reading form's submit action, after the user reviews.
- Nullable fields use `anyOf: [{type:"string", enum:[...]}, {type:"null"}]`, built through the shared helpers in `schema.ts`. Never `type: ["string","null"]` with an `enum`: structured outputs rejects it (this caused a live 400).
- Enums are generated at request time from live reference rows. `validate.ts` re-checks every id and nulls anything that doesn't match. Never hardcode vocabulary values.
- Millimetre measurement fields are absent from the model schema. A photo has no scale reference. Keep them out.
- Teeth is never model-populated; there is no fourth capture angle.
- `face_shape_source` is `model` only when the suggested shape is submitted untouched; any edit makes it `manual`.
- Bump the `READING_MODEL_VERSION` suffix whenever the prompt or schema changes shape.
- Anthropic client: 100s timeout, `maxRetries: 0`, under the route's 120s `maxDuration`. Retry is the user's choice via the "Try again" button.
- Partial failures name what failed (image vs. model, and which angle) and offer retry or a blank form.

**Code**
- `@/` path alias everywhere except `src/middleware.ts`, which must use relative imports (the Vercel Edge bundle doesn't resolve tsconfig paths).
- Server-only modules start with `import "server-only"`.
- Reuse existing CSS classes and components before adding new ones. No confidence meters, badges or "AI" labels on suggested values.
- Comments explain *why*, not what. The codebase already does this; match it.

**Git and PRs**
- Branch from `main` as `agent/<short-slug>`. One roadmap item per PR.
- PR description: which roadmap item, what changed, raw output of the gates, and anything you couldn't verify.
- Tick the roadmap checkbox in the same PR that completes the item.
- Commit messages: imperative subject, body explaining why.

## Decisions already made (don't relitigate)

| Decision | Why |
|---|---|
| No scoring, anywhere, enforced in schema | The product thesis. Scoring norms don't generalize; adding a number rebuilds the thing Mirror replaces. |
| Vision output is a suggestion, never an authoritative write | Photo-based face-shape classification tested unreliable on this project (see `0003_readings.sql`). The manual path is the trusted one. |
| `face_shape_source` records model vs. manual | Keeps the suggestion/override split in the data, not just the UI. |
| `face_shape_primary_id` is `NOT NULL` | A reading without a primary shape is incomplete; the form blocks submit on it. |
| No `user_id` on child tables | Ownership can't drift from the parent session. |
| Single-player only | Privacy. Multi-user would make privacy the hardest part of the build. |
| Private bucket, signed URLs (5-minute TTL), no third-party analytics on photo routes | Face photos are among the most sensitive data a person can hand an app. |
| Delete means delete, Storage objects first, then rows | Reset face history removes photos before session rows, so a failure leaves orphaned metadata rather than photos the user believes are gone. |
| Skin "sensitive" is a per-reading flag, not a fifth skin type | Sensitivity co-occurs with any base type. |
| Correlate shows observations, not causal claims, and is gated on data volume | n=1, uncontrolled, confounded. |
| Mirror Toy never grows a number | Stated in the PRD as the feature request to reject. |
| PWA, no native app | Ships faster; `getUserMedia` is enough. |

## Never

- **Never commit secrets.** No `.env*` files, keys, tokens, connection strings or service-role values, including in test fixtures, scripts, docs or PR text. If you find one already committed, stop and report it; don't rewrite history yourself.
- **Never push to `main`.** All work goes through a PR from an `agent/*` branch. No force-push to any shared branch.
- **Never change licensing.** There is no LICENSE file. Don't add, remove or edit one, and don't add license headers. That is the owner's decision.
- **Never delete data.** Don't run `scripts/wipe-0b.mjs` (with or without `--confirm`), `run-migration.mjs`, or any script with `DB_URL` or the service-role key against the production project. Don't write migrations that drop tables, drop columns or delete rows. Don't touch Storage objects.
- **Never add a score.** No rating, percentile, index, ratio, confidence number or ranking of faces, traits, skin or hair types, in the schema, UI, prompt or model output.
- **Never commit real face photos**, real readings, or the owner's personal data (email, sessions) to the repo, tests or screenshots. Use synthetic or placeholder images.
- Never add third-party analytics, trackers or external scripts.
- Never make the vision route write to the database.
- Never weaken RLS or make the `photos` bucket public.
- Never claim a check passed that you didn't run. "Not run, because X" is an acceptable PR line; an invented pass is not.

When an item needs something you can't do (setting a Vercel env var, resuming Supabase, applying a migration to production, a product decision), finish the code side, open the PR, and list the owner's manual step at the top of the description.
