# Mirror — PRD v0.1

**One-liner:** A grooming progress tracker that shows you week 1 vs. week 12, logs what you actually did, and tells you which of it worked.

**Why it exists:** Looksmaxxing apps sell a score. The score is generated from the Marquardt phi mask, which is empirically invalid across non-European populations and was derived from fashion models. The one genuinely valuable thing those apps do — longitudinal photo comparison — is buried under the scoring theater. Mirror ships that feature alone, plus the correlation layer nobody builds.

**Core thesis:** The only facial variables that move are skin, hair, body composition, and sleep. Everything else is bone. So track the movable things, correlate them against interventions, and show change over time.

---

## Non-goals (explicit)

- No attractiveness score, no "rating," no percentile
- No proportion/ratio measurement (photo landmark error ≈ population SD; the signal doesn't exist)
- No phi mask, no facial thirds, no canthal tilt measurement
- No social feed, no leaderboard, no comparison to other users

These are non-goals because they're broken, not because they're out of scope for v1.

---

## Users

Primary: you. Secondary: friends who want the same thing. Design for single-player; multiplayer is not on the roadmap.

---

## Features

### 1. Capture (P0)
Guided three-angle photo session.

- Camera overlay with ghost outline from your **last** session — user aligns to it before shooting. This is the whole trick: alignment consistency without measurement.
- Angles: front, left profile, right profile
- Capture checklist enforced in UI: natural light, no flash, arm's length, neutral expression, post-shower
- Session metadata: timestamp, auto-detected lighting warning (mean luminance delta vs. last session > threshold → warn)
- Photos stored in Supabase Storage, private bucket, RLS-locked to owner

**Acceptance:** Two sessions 30 days apart are visually comparable without manual cropping.

### 2. Compare (P0)
The reason the app exists.

- Side-by-side and slider-overlay views
- Pick any two sessions, any angle
- Timeline scrub across all sessions for one angle
- Export a comparison image (this is the shareable moment; it's also the retention hook)

**Acceptance:** Slider comparison between two arbitrary sessions in ≤3 taps.

### 3. Log (P0)
Daily, 15 seconds max. If it takes longer, it won't get done.

- Skin: shine by zone (T-zone / cheeks), breakouts (count + location tap-map), dryness/irritation flags
- Routine adherence: checkboxes for each product in your active stack (AM/PM)
- Sleep hours (manual, or HealthKit import if you build native later)
- Free-text note

**Acceptance:** A full day's log entry in under 15 seconds.

### 4. Stack (P1)
Your active product list, with start dates.

- Add/remove products, mark start date
- Skincare has a ~6–12 week signal delay. The app should know this and refuse to show conclusions before then.
- "Changed something?" prompt when you add a product mid-experiment — warns you that you've just confounded the variable

### 5. Correlate (P1)
The differentiator. Nobody else builds this.

- After ≥8 weeks of log data, surface simple observed associations:
  - "Breakout count is down 40% since you started adapalene (week 3 → week 11)"
  - "Shine reports cluster on days following <6h sleep"
- Present as **observations, not causal claims.** n=1, uncontrolled, confounded. The UI should say so — one line, not a wall of disclaimer.
- Hard rule: never surface a correlation with <4 weeks of data on both sides.

### 6. Mirror Toy (P2)
Symmetry visualizer. Mirror left-half and right-half into two full faces, display side by side.

- Pure novelty. No score, no "asymmetry index," no percentage.
- Ships with one line of copy: everyone is asymmetric; the composites always look wrong; that's the point.
- If you find yourself wanting to add a number here, that's the feature request to reject.

---

## Stack

Reuse what you know from Campus Sandbox:

- **Next.js** (App Router) — PWA, installable, camera via `getUserMedia`
- **Supabase** — Postgres + Storage + Auth
- **Vercel** — deploy
- No native app in v1. PWA camera is good enough and you ship in a weekend instead of a month.

### Schema sketch

```
sessions
  id, user_id, captured_at, lighting_score, notes

photos
  id, session_id, angle ('front'|'left'|'right'), storage_path, width, height

logs
  id, user_id, date, sleep_hours, note
  shine_tzone (0-3), shine_cheeks (0-3)
  breakout_count, breakout_zones (jsonb)
  dryness (0-3), irritation (bool)

stack_items
  id, user_id, product_name, category, started_at, ended_at, schedule ('am'|'pm'|'both')

log_adherence
  log_id, stack_item_id, taken (bool)
```

RLS: default-deny, owner-only on every table. Same pattern as Campus Sandbox — you already have the migration muscle memory.

---

## Privacy

Face photos are among the most sensitive data a person can hand an app. Non-negotiable:

- Private Storage bucket, signed URLs only, short TTL
- No third-party analytics on any route that renders a photo
- Local-only export option
- Delete = actually delete, including Storage objects

If this ever goes multi-user, this section becomes the hardest part of the build, not the easiest.

---

## Build order

| Session | Scope |
|---|---|
| 1 | Auth, schema, RLS, Supabase Storage bucket |
| 2 | Capture flow + ghost-outline alignment overlay |
| 3 | Compare (side-by-side + slider) |
| 4 | Log (daily entry, 15-second target) |
| 5 | Stack + adherence |
| 6 | Correlate (gated on ≥8 weeks data) |
| 7 | Mirror toy, polish, PWA install |

Sessions 1–3 are the actual product. Everything after is upside.

---

## The one thing that kills this app

Scope creep toward scoring. Every user who tries it will ask for a number. The answer is no, and the reason is in the "why it exists" section. If you add the number, you've built the thing you were trying to replace.

---

## v1.1 additions (captured, not yet built)

Everything below was scoped in conversation. Grouped so it's clear what's real/buildable now vs. what needs a calibration note attached so it doesn't quietly turn back into scoring.

### 7. Extended Capture Protocol (P1)
Add to the existing front/left/right set:
- **Hair-back shot** (hairline and forehead fully visible, hair pushed back) — genuinely improves face-shape accuracy over hair-down photos. Good catch, not scope creep.
- **Hair texture close-up** — strand-level shot for texture/density/porosity, separate from the styling-angle photos.

### 8. Tiered Cut Recommendations (P1)
From face shape + texture + hair behavior, output:
- **S-tier**: best structural fit given proportions and how the hair actually behaves
- **A-tier**: strong alternatives, different aesthetic direction, still well-suited
- **B-tier**: wearable but fights texture or proportions somewhat

Calibration note: frame as barber-logic / styling heuristics, not "scientific." No clinical literature ranks haircuts by face shape — this is the same reasoning a skilled barber uses, real expertise, just not a controlled-trial kind of claim.

### 9. Styling How-To (P1)
Not just product names — actual technique: drying direction, tools, product amount, application order, heat setting. Already demonstrated live in conversation (comb-over example). Write it the same way per cut recommendation.

### 10. Grooming Layer (P1)
- Eyebrows: shape/density assessment, trim vs. thread vs. leave-natural
- Nose/ear hair: flag if visible, simple trim note
- Dermaplaning: technique + frequency, when it's a fit
- Facial hair: whether beard/mustache would balance jaw/face shape, current growth pattern from photos

### 11. Teeth (P1)
Shade/staining assessment from photo → whitening product recommendation. Flag anything beyond cosmetic (alignment, visible dental issues) as "see a dentist."

### 12. Product Recommendation Engine (P1)
Concern-in, category-out, with a **handful (3-4) of named product options per concern**, not one definitive pick — same pattern as the tiered cuts, applied to skincare. E.g. for an oily T-zone: category is "oil-control serum," then 3-4 named options across price points (e.g. The Ordinary Niacinamide 10%, Paula's Choice equivalent, a drugstore option) rather than a single verdict.

Tied to skin log data over time, not a one-off read.

Caveats to build in explicitly:
- Named products come from general knowledge, not a live catalog — correct for well-known, stable products, but not guaranteed current on formulation/price/availability. Any time it matters (actives, % concentration, discontinued status), that's a search-the-web moment for the app/agent building it, not a recall-from-memory one.
- Some concerns don't respond to product at all and the app should say so rather than force a recommendation — under-eye puffiness (fluid/fat pad, not skin texture) is the clearest example already flagged.

### 13. Temporary/Cosmetic Tools — labeled honestly (P2)
Real effects, all short-duration, none structural:
- **Ice/cold water:** de-puffing, redness reduction, lasts hours. Does not shrink pores permanently.
- **Gua sha:** lymphatic drainage, temporary de-puff/"sculpt" look, hours only. No structural/bone change despite marketing claims.
- **Jade rolling:** mildest of the three, mostly sensory, smallest and shortest de-puffing effect.
- **Vaseline/slugging:** legitimate occlusive for lips (locks in moisture). On brows/lashes: shine/gloss only, no growth effect — say this explicitly.

Own labeled category so these never get confused with the routine-building, structural parts of the app.

### 14. Date-Day Protocol (P2)
Distinct, explicitly-labeled mode bundling only the temporary/cosmetic tools (§13) plus same-day styling (§9) into a pre-event checklist — e.g. "2 hours before: cold water rinse, gua sha 5 min, style per your S-tier cut, Vaseline on lips." Explicitly NOT where structural/routine features live — no routine-building, no cut recommendations requiring a barber visit, nothing multi-week. Same-day, reversible, low-effort only.

### Still explicitly excluded (holding the line from earlier passes)
- Any attractiveness score/rating, phi mask, proportion-to-average scoring
- Mewing, jaw "reshaping" exercises, chin-tuck-for-jawline (structural claims with no adult evidence)
- Hair catalog with sourced/licensed reference images — good future idea, bigger build than anything above, not v1.1

### Not yet decided
Whether §7–14 get built now or queued after. Recommend: finish verifying capture→storage→compare against the real Supabase backend first — building five new feature areas on top of an unverified core compounds the thing already in progress.

---

## v1.2 usability additions

Sized by rough effort. Nothing here touches Capture/Compare/Log core logic — all additive.

**Easy (single session, works off existing schema):**
- **Consult Mode** — one-page printable/shareable summary (face shape, hair texture, S-tier cuts, current skin concerns) to bring to a barber or dermatologist
- **Barber cadence reminder** — date math off `sessions.captured_at`, notify when a cut's likely grown out
- **Cost-per-product tracker** — add `price` to `stack_items`, surface spend vs. adherence/results over time
- **Capture frequency soft cap** — block a new full Capture session before N days have passed since the last one; Log stays open daily regardless. This is a deliberate usability/wellbeing guardrail, not just a feature — see note below.

**Medium (new but standard integration):**
- **Sleep via HealthKit** — auto-feed `logs.sleep_hours` instead of manual entry
- **Monthly digest** — scheduled summary (not a score) pushed once a month; first piece of infra requiring a scheduled job (cron/edge function) rather than on-demand queries

**Harder (external dependency, most moving parts):**
- **Weather-adaptive skincare nudge** — weather API + location permission + a rules layer mapping conditions (humidity/UV) to routine tweaks (lighter product in humidity, reinforced SPF reminder, etc.)

**Note on the frequency cap:** this one isn't just about build effort — it's a deliberate design choice, not an optional nice-to-have. The whole point of Mirror over a looksmaxxing app is weekly-cadence signal, not on-demand checking. Building the cap into the product is more reliable than relying on discipline in the moment. Keep it in scope even if everything else in this section gets deprioritized.
