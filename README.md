# Mirror

Mirror is a photo-tracking app for grooming and skincare progress. It does not score your appearance, rate your attractiveness, or compute facial proportions — that's not a missing feature, it's the reason the app exists.

## Why no score

Most apps in this category ("looksmaxxing" apps) sell you a number: an attractiveness score, usually built on the Marquardt phi mask or similar proportion-based facial measurement. That approach doesn't hold up. The ratios it's built on were derived from a narrow sample of fashion models, and they don't replicate across non-European populations — the error introduced by locating landmarks on a photo is close to the same size as the population variation the score is supposedly measuring. There's no signal there to build a product on.

The one part of those apps that's actually useful — looking at a photo of yourself now next to a photo from weeks ago — doesn't need a score attached to it. Mirror keeps that part and drops the rest. This isn't a UI decision; there's no rating, percentile, or proportion field anywhere in the database schema. It was left out at the data-model level, not just hidden from the screen.

## What it does

- **Capture** — a guided three-angle photo session (front, left profile, right profile). Each shot is taken against a ghost outline of your last session's photo, so you align the same way every time without anyone measuring anything. That alignment consistency is what makes the next feature possible.
- **Compare** — side-by-side and slider-overlay views between any two sessions, plus a timeline scrub across all your sessions for one angle.
- **Log** — a daily entry, meant to take under 15 seconds: skin condition by zone, breakouts, routine adherence for whatever's in your product stack, sleep hours, and a free-text note.
- **Stack** — your active products with start dates, so log data can eventually be tied back to what you were using when.

## What it deliberately doesn't do

- No attractiveness score, rating, or percentile
- No proportion or ratio measurement, phi mask, facial thirds, or canthal tilt
- No social feed, leaderboard, or comparison to other users

## Status

Capture, Compare, Log, and Stack are built and running. Three things aren't built end-to-end yet:

- **Readings** — per-session classification of face shape, skin type, hair type, and dimorphism traits against fixed reference categories. The schema and reference data are live in `supabase/migrations/`; there's no UI route for it under `src/app/` yet.
- **Correlate** — surfacing observed associations between log data and interventions (e.g. breakout trends after starting a product), gated on at least 8 weeks of data and presented as observations, not causal claims.
- **Mirror Toy** — a symmetry visualizer, pure novelty, explicitly scoped to never grow a number.

## Stack

Next.js (App Router), Supabase (Postgres + Storage + Auth), deployed on Vercel. PWA, installable, no native app.

## Local setup

```bash
git clone https://github.com/only1makai/Mirror.git
cd Mirror
npm install
```

Create `.env.local` with:

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

Then:

```bash
npm run dev
```

Migrations live in `supabase/migrations/` and can be applied with `scripts/run-migration.mjs` (needs a `DB_URL` Postgres connection string).

## Privacy

Face photos are sensitive. Storage is a private, RLS-locked bucket scoped to the owning user, with no third-party analytics on any route that renders a photo.
