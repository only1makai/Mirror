-- ============================================================================
-- MIRROR — Layer 1 Reference Database: Schema + Seed
-- Build Sequence Step 1 (see 07_BUILD_SEQUENCE.md)
--
-- Written once, self-hosted, zero per-query cost. No API dependency.
-- Content sourced from 04_RESEARCH_BACKGROUND.md and 05_GROOMING_EVIDENCE.md.
--
-- Hard constraints (reconstructed from 00_START_HERE.md's plain statement of
-- the rule, since 03_DESIGN_CONSTRAINTS.md's full text was confirmed absent
-- from disk on 2026-08-04 — reread 03 directly if it turns up later and this
-- header's constraint list is thinner than what's actually documented there):
-- no score/rating/index/percentile column exists anywhere in this file — if a
-- future edit adds one, that edit is wrong, not this comment.
--   - CHECK: evidence_tier IN ('established','promising','myth')
--   - CHECK: self_manageable = false requires non-null referral_note
--   - No numeric ranking of face shapes, dimorphism traits, skin types, or
--     hair types relative to one another.
--
-- Two corrections applied vs. the original schema sketch:
--   1. reference_skin_types drops the 5th 'sensitive' row. Per 04's finding,
--      sensitivity is a reactivity MODIFIER that can co-occur with any of the
--      four base types, not a fifth oil-profile category. Modeled here as a
--      boolean-compatible flag pattern in `sensitivity_note`, applied at the
--      reading layer (per-user), not baked into the reference row.
--   2. reference_hair_types stays at 4 rows (straight/wavy/curly/coily).
--      Andre Walker a/b/c subtypes explicitly excluded per 04 — curl-tightness
--      detail doesn't change face-reading or product-recommendation logic.
--
-- reference_conditions and reference_teeth_shades were specified in prose in
-- 05 but not yet reduced to SQL. Designed here following the same
-- evidence_tier / self_manageable / referral_note pattern used elsewhere.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. FACE SHAPES
-- ----------------------------------------------------------------------------

create table if not exists public.reference_face_shapes (
  id               text primary key,           -- 'oval','round','square','heart','oblong','diamond'
  display_name     text not null,
  definition       text not null,               -- ratio-based, descriptive, no "ideal"
  measurement_method text not null,              -- how the user self-verifies with a tape measure
  styling_notes    text,                         -- barber convention — labeled as such, not evidence
  source_note      text not null
);

comment on table public.reference_face_shapes is
  'Six classic shapes (Farkas taxonomy). Faces are a spectrum; the app supports '
  'primary + optional secondary shape at the readings layer rather than forcing '
  'single-category output. Never render these in a ranked list.';

insert into public.reference_face_shapes (id, display_name, definition, measurement_method, styling_notes, source_note)
values
(
  'oval',
  'Oval',
  'Face length roughly 1.5x face width. Jaw gently rounded, not angular. '
  'Cheekbones slightly wider than both forehead and jaw.',
  'Take five measurements: (1) forehead width at the widest point across the '
  'temples, (2) cheekbone width at the most prominent points, (3) jaw width at '
  'the mandibular angle — the corner where the jaw turns toward the chin, not '
  'across the chin tip, (4) face length from hairline to chin, (5) jaw angle/'
  'chin shape (pointed, rounded, or square). Divide face length by cheekbone '
  'width; compare forehead, cheekbone, and jaw widths to each other.',
  'Most cuts work on an oval face — it is the shape with the fewest styling '
  'constraints. Barber convention, not evidence.',
  'Farkas, Anthropometry of the Head and Face (2nd ed.), 1994; length-to-width '
  'ratio is the single most diagnostic measurement per 04_RESEARCH_BACKGROUND.md'
),
(
  'round',
  'Round',
  'Face length close to face width. Jaw angle soft, no defined corner — '
  'trace the jawline from below the ear toward the chin and it reads as one '
  'continuous curve.',
  'Same five measurements as oval. Round vs. square is the ambiguous pair: use '
  'the jaw-angle tie-breaker — a smooth continuous curve from ear to chin reads '
  'round, a distinct corner reads square.',
  'Add height on top, keep sides shorter, avoid a rounded fringe shape that '
  'echoes the face outline. Barber convention, not evidence.',
  'Farkas 1994; jaw-angle tie-breaker per 04_RESEARCH_BACKGROUND.md'
),
(
  'square',
  'Square',
  'Face length close to face width, same as round. Jaw angle defined and '
  'corner-like. Forehead and jaw read similar in width.',
  'Same five measurements. The jaw-angle tie-breaker separates this from round: '
  'a distinct corner at the mandibular angle, not a smooth curve.',
  'Textured top with a bit of length can soften angular corners. Barber '
  'convention, not evidence.',
  'Farkas 1994; jaw-angle tie-breaker per 04_RESEARCH_BACKGROUND.md'
),
(
  'heart',
  'Heart',
  'Forehead notably wider than the jaw. Jaw narrows to a pointed chin.',
  'Same five measurements. The forehead-to-jaw width ratio is the diagnostic '
  'signal here; chin shape (pointed) confirms it.',
  'Volume balanced at the crown rather than piled on top; avoid a heavy fringe '
  'that widens the forehead further. Barber convention, not evidence.',
  'Farkas 1994'
),
(
  'diamond',
  'Diamond',
  'Forehead narrow, cheekbones the widest point on the face, jaw narrow.',
  'Same five measurements. Diamond is diagnosed when cheekbone width clearly '
  'exceeds both forehead and jaw width.',
  'Fringe or texture at the forehead, minimal added volume at cheekbone level '
  'since that is already the widest point. Barber convention, not evidence.',
  'Farkas 1994'
),
(
  'oblong',
  'Oblong',
  'Face length more than 1.6x face width. Forehead, cheeks, and jaw read '
  'similar widths to each other — the defining ratio is length, not width '
  'variance between zones.',
  'Same five measurements. Face-length-to-width ratio above ~1.6 is the '
  'diagnostic threshold distinguishing oblong from oval.',
  'Avoid excessive height on top, which lengthens the face further; add width '
  'visually with texture on the sides. Barber convention, not evidence.',
  'Farkas 1994'
)
on conflict (id) do update set
  display_name = excluded.display_name,
  definition = excluded.definition,
  measurement_method = excluded.measurement_method,
  styling_notes = excluded.styling_notes,
  source_note = excluded.source_note;

-- ----------------------------------------------------------------------------
-- 2. SEXUAL DIMORPHISM TRAITS
-- ----------------------------------------------------------------------------

create table if not exists public.reference_dimorphism_traits (
  id                            text primary key,
  display_name                  text not null,
  masculine_typical_description text,             -- nullable: eye_size and canthal_tilt have no masculine-typical entry
  feminine_typical_description  text not null,
  evidence_strength              text not null check (evidence_strength in ('strong','moderate','weak')),
  research_note                 text not null      -- citation + explicit population-tendency caveat, mandatory
);

comment on table public.reference_dimorphism_traits is
  'Population-level tendencies only, described in plain language. Never a '
  'target, never a score. No numeric axis exists on this table by design.';

insert into public.reference_dimorphism_traits
  (id, display_name, masculine_typical_description, feminine_typical_description, evidence_strength, research_note)
values
(
  'brow_ridge',
  'Brow ridge',
  'More prominent supraorbital rim and glabella; this development is '
  'testosterone-linked at puberty.',
  'Smoother, less pronounced, sits higher on the face.',
  'strong',
  'Da Silva et al. 2026, Journal of Anatomy, 3D geomorphometric study. '
  'Describes a population-level tendency, not a target for any individual.'
),
(
  'jaw_width',
  'Jaw width',
  'Wider mandible, more angular, sharper mandibular angle.',
  'Softer, more rounded, less prominent angle.',
  'strong',
  'Da Silva et al. 2026; Cady & Hill 2024 (UW Anthropology facial masculinity '
  'review). Population-level tendency, not a target.'
),
(
  'cheekbone_prominence',
  'Cheekbone prominence',
  'Flatter cheeks relative to the rest of the face.',
  'Higher, rounder, more prominent cheekbones.',
  'strong',
  'Replicated across four large samples (three European, one African) per '
  '04_RESEARCH_BACKGROUND.md fWHR re-analysis. Population-level tendency.'
),
(
  'chin_shape',
  'Chin size / shape',
  'Broader, more projected chin.',
  'Smaller, more pointed chin.',
  'strong',
  'Cady & Hill 2024. Population-level tendency, not a target.'
),
(
  'lip_proportion',
  'Lip proportion',
  'Larger absolute lip dimensions (upper lip height, mouth width, philtrum '
  'width, total labial volume all measured larger in men across multiple '
  'population studies).',
  'Higher vermilion-height-to-mouth-width RATIO — a proportion, not an '
  'absolute size. Absolute lip size is larger in men; this is the corrected '
  'direction, see 04_RESEARCH_BACKGROUND.md Correction 1.',
  'strong',
  'Gujarati medical student sample n=250; Nigerian young-adult sample; 3D '
  'electromagnetic digitizer study n=918 ages 4-73 (all labial volumes '
  'p<0.01). Da Silva 2026 additionally found greater philtrum/upper-lip '
  'projection in men after decomposing the allometric component. Direction '
  'was corrected after an earlier pass recorded it backwards — see '
  '04_RESEARCH_BACKGROUND.md.'
),
(
  'nose_size_bridge',
  'Nose size / bridge width',
  'Wider, longer, more projecting nose and nasal bridge.',
  'Shorter, narrower nose and nasal bridge.',
  'strong',
  'Da Silva et al. 2026 — the nasal root showed the greatest sex difference '
  'of any facial region measured in that study. Population-level tendency.'
),
(
  'eyebrow_position_thickness',
  'Eyebrow position / thickness',
  'Lower-set, thicker, straighter brows.',
  'Higher-set, thinner, more arched brows.',
  'strong',
  'Conjoint ranking study, N=922 (PMC6290027). Population-level tendency.'
),
(
  'eye_size',
  'Eye size (relative to face)',
  null,
  'Larger apparent eye size relative to the rest of the face.',
  'moderate',
  'Conjoint ranking study, N=922 (PMC6290027) — smaller effect size than '
  'jaw width or eyebrow thickness in the same study. Population-level '
  'tendency.'
),
(
  'canthal_tilt',
  'Canthal tilt',
  null,
  'Mildly positive (upward-outer) tilt is associated with a feminine/'
  'youth-coded cluster in forced-choice preference studies.',
  'weak',
  'Evidence intentionally graded weak for app purposes despite a strong '
  'single-study effect (93% preference, 2007 forced-choice study), because '
  'that study used Photoshop-modified stimuli, a forced-choice paradigm, and '
  'female faces only. Tilt itself varies substantially by population: JAMA '
  'Facial Plastic Surgery (n=400) found -3 to +8 degree range with '
  'significantly different group means across Asian/Black/Hispanic/White '
  'samples; an 18-ethnic-group anthropometric study (n=1,500, 2005) and a '
  '1981 four-race study found the same pattern; cross-cultural preference '
  'research (1995) found preferences themselves vary by culture. Any single '
  '"ideal" tilt would be an ethnicity-calibrated beauty standard, which this '
  'app structurally excludes. No target angle is stored or displayed '
  'anywhere in the product for this trait. See 04_RESEARCH_BACKGROUND.md — '
  'periorbital skin quality is the more actionable, non-geometric finding '
  'surfaced instead.'
)
on conflict (id) do update set
  display_name = excluded.display_name,
  masculine_typical_description = excluded.masculine_typical_description,
  feminine_typical_description = excluded.feminine_typical_description,
  evidence_strength = excluded.evidence_strength,
  research_note = excluded.research_note;

-- ----------------------------------------------------------------------------
-- 3. SKIN TYPES
-- ----------------------------------------------------------------------------

create table if not exists public.reference_skin_types (
  id                    text primary key,   -- 'dry','oily','combination','normal' — NOT 'sensitive', see header note
  display_name          text not null,
  indicators            text not null,
  common_concerns       text[] not null,
  product_category_ids  text[],             -- loose FK to reference_products.category
  sensitivity_note       text not null       -- how is_sensitive (a per-user flag, not a row here) modifies this type
);

comment on table public.reference_skin_types is
  'Four base types only. Sensitivity is a reactivity modifier that can '
  'co-occur with any of these four — deliberately not a fifth row, per '
  '04_RESEARCH_BACKGROUND.md. Treat is_sensitive as a boolean captured at the '
  'reading/user level that filters product recommendations across whichever '
  'base type applies, not as its own category.';

-- product_category_ids below intentionally lists only categories that have a
-- seeded row in reference_products today (verified against the 18 seeded
-- categories, not aspirational). A prior draft of this file referenced 14
-- categories with no matching product row — dangling FK-style references
-- that wouldn't error (it's a loose array, not a real FK) but would make
-- recommendation lookups silently return empty. Add the category here only
-- once reference_products actually has a row for it — don't get ahead of
-- the seed data. Cleanser and moisturizer categories in particular (gentle_
-- cleanser, oil_control_serum, gel_cleanser, balancing_cleanser, light_
-- moisturizer) are real gaps in the starter product list worth filling in a
-- follow-up pass.
insert into public.reference_skin_types (id, display_name, indicators, common_concerns, product_category_ids, sensitivity_note)
values
(
  'dry',
  'Dry',
  'Tight feeling after cleansing, flaking or visible dry patches, dull '
  'texture, minimal shine across all zones.',
  array['flaking','fine lines from dehydration','irritation from over-exfoliation'],
  array['hydrating_serum','ceramide_moisturizer','spf_daily'],
  'Dry-and-sensitive is common: harsh actives (high-percent retinoids, '
  'strong acids) compound barrier damage. Filter these out when the '
  'sensitivity flag is set regardless of base type.'
),
(
  'oily',
  'Oily',
  'Visible shine across most of the face within a few hours of cleansing, '
  'enlarged-looking pores, prone to breakouts.',
  array['acne','enlarged pores','makeup or product sliding off'],
  array['niacinamide_serum'],
  'Oily-and-sensitive exists and is easy to mis-treat — stripping cleansers '
  'marketed for oily skin can trigger a compensatory oil response in '
  'someone whose barrier is also reactive. Filter accordingly.'
),
(
  'combination',
  'Combination',
  'Oily T-zone (forehead, nose, chin), normal-to-dry cheeks. The most '
  'common self-reported type.',
  array['T-zone breakouts','cheek dryness or flaking','zone-dependent product mismatch'],
  array['niacinamide_serum'],
  'Combination-and-sensitive may need different product intensity by zone, '
  'not a single blanket recommendation.'
),
(
  'normal',
  'Normal',
  'Balanced oil production, minimal visible pores, few chronic concerns, '
  'skin generally tolerates a range of products well.',
  array['occasional seasonal dryness or shine'],
  array['spf_daily'],
  'Normal-and-sensitive still exists — reactivity is independent of oil '
  'balance. Do not assume "normal" implies "no sensitivity flag."'
)
on conflict (id) do update set
  display_name = excluded.display_name,
  indicators = excluded.indicators,
  common_concerns = excluded.common_concerns,
  product_category_ids = excluded.product_category_ids,
  sensitivity_note = excluded.sensitivity_note;

-- ----------------------------------------------------------------------------
-- 4. HAIR TYPES
-- ----------------------------------------------------------------------------

create table if not exists public.reference_hair_types (
  id             text primary key,   -- 'straight','wavy','curly','coily' — no a/b/c subtypes, see header note
  display_name   text not null,
  indicators     text not null,
  care_notes     text not null,
  product_category_ids text[]
);

comment on table public.reference_hair_types is
  'Andre Walker system, four main types only. Sub-type (a/b/c curl-tightness) '
  'split deliberately excluded per 04_RESEARCH_BACKGROUND.md — it affects '
  'curl-specific styling detail only, not face-reading or broad product '
  'logic. Revisit if curl-specific styling guidance is added later.';

-- Same rule as reference_skin_types above: product_category_ids lists only
-- categories with a seeded reference_products row today. sulfate_free_shampoo,
-- texture_powder, lightweight_cream, mousse, leave_in_conditioner, curl_cream,
-- deep_conditioner, and sealing_oil are real, correctly-identified product
-- gaps (wavy/curly/coily currently have zero seeded products, which is a
-- thinner starter list than skin got) — fill them in a follow-up pass rather
-- than referencing categories that don't exist yet.
insert into public.reference_hair_types (id, display_name, indicators, care_notes, product_category_ids)
values
(
  'straight',
  'Straight',
  'No natural curl pattern, lies flat from root to tip, tends to show oil '
  'and product build-up faster than curl patterns since oil travels the '
  'length unobstructed.',
  'Wash 2-3x/week, not daily — daily washing strips natural oils without '
  'benefit. Sulfate-free shampoo recommended if using daily styling product '
  '(build-up). Avoid heavy waxes/creams that weigh it flat; texturizing '
  'powder or sea salt spray for volume holds better on this type.',
  array['sea_salt_spray','matte_clay']
),
(
  'wavy',
  'Wavy',
  'Loose S-pattern, more defined than straight but looser than curly, '
  'often a mix of textures across one head.',
  'Wash 2-3x/week. Lightweight cream or mousse to define without weighing '
  'down; scrunching damp hair encourages the natural pattern instead of '
  'fighting it with heavy brushing.',
  array[]::text[]
),
(
  'curly',
  'Curly',
  'Well-defined spiral or corkscrew pattern, more prone to frizz and '
  'dryness since natural oils travel the curl shaft less efficiently than '
  'straight hair.',
  'Wash less frequently than straight hair (dryness risk is higher); '
  'conditioner every wash, focused mid-length to ends. Detangle wet, with '
  'conditioner in, to reduce breakage.',
  array[]::text[]
),
(
  'coily',
  'Coily',
  'Tight, densely packed curl or zigzag pattern, highest tendency toward '
  'dryness of the four types since natural oils travel the shaft least '
  'efficiently here.',
  'Lowest wash frequency of the four types is typically appropriate for '
  'scalp and strand health; deep conditioning and sealing with oil/butter '
  'after moisturizing helps retain hydration.',
  array[]::text[]
)
on conflict (id) do update set
  display_name = excluded.display_name,
  indicators = excluded.indicators,
  care_notes = excluded.care_notes,
  product_category_ids = excluded.product_category_ids;

-- ----------------------------------------------------------------------------
-- 5. CONDITIONS (lips, lashes, brows, skin — grooming-relevant findings)
-- ----------------------------------------------------------------------------

create table if not exists public.reference_conditions (
  id                text primary key,
  display_name      text not null,
  category          text not null check (category in ('lips','lashes','brows','skin')),
  presentation       text not null,
  evidence_tier      text not null check (evidence_tier in ('established','promising','myth')),
  self_manageable    boolean not null,
  referral_note      text,
  safety_warning     text,
  notes              text,
  constraint self_manageable_requires_referral
    check (self_manageable = true or referral_note is not null)
);

comment on table public.reference_conditions is
  'self_manageable = false requires referral_note (enforced by CHECK, not '
  'convention). Myths are stored as explicit corrections, never omitted.';

insert into public.reference_conditions
  (id, display_name, category, presentation, evidence_tier, self_manageable, referral_note, safety_warning, notes)
values
(
  'chapped_lips',
  'Chapped lips (cheilitis simplex / xerosis)',
  'lips',
  'Cracking, fissuring, scaling, usually the lower lip. Caused by weather, '
  'sun exposure, or lip-licking/biting.',
  'established',
  true,
  null,
  null,
  'Petrolatum-based occlusives are the established fix — see reference_products. '
  'Aggressive barrier lubricant use typically produces dramatic improvement.'
),
(
  'angular_cheilitis',
  'Angular cheilitis (perleche)',
  'lips',
  'Inflammation and cracking at the corners of the mouth; usually Candida, '
  'sometimes with Staph co-infection. Promoted by saliva pooling, ill-'
  'fitting dentures or braces, or nutritional deficiency (iron, zinc, B '
  'vitamins).',
  'established',
  true,
  null,
  null,
  'Self-manageable initially with topical antifungal (clotrimazole, '
  'miconazole, nystatin) plus a petrolatum barrier, +/- 1% hydrocortisone. '
  'If refractory or recurrent, this becomes a doctor visit — workup for '
  'diabetes, nutritional deficiency, or HIV. The app should surface that '
  'escalation path in copy even though this row is marked self-manageable.'
),
(
  'actinic_cheilitis',
  'Actinic cheilitis',
  'lips',
  'Rough or scaly patches on the lower lip vermilion, from chronic UV '
  'exposure. Precancerous.',
  'established',
  false,
  'See a doctor. This is precancerous and a meaningful proportion of lip '
  'squamous cell carcinomas arise from it — lip SCC carries an 11% chance '
  'of metastasis versus 1% for other body locations (StatPearls NBK551553). '
  'Do not treat with a product recommendation.',
  'Any persistent rough, scaly, or indurated lower-lip patch is a referral '
  'trigger regardless of how mild it looks.',
  null
),
(
  'contact_dermatitis_lip',
  'Contact dermatitis from lip products',
  'lips',
  'Scaling, fissuring, itching or burning of the vermilion, sometimes '
  'extending to perioral skin. Symmetric involvement of both lips suggests '
  'an allergen in a shared product.',
  'established',
  true,
  null,
  null,
  'Identify and remove the culprit ingredient (common allergens: lanolin, '
  'propolis, propyl gallate, fragrance mix, balsam of Peru, flavorings). '
  'Patch testing (lip series) if it persists after removal.'
),
(
  'perioral_dermatitis',
  'Perioral dermatitis',
  'lips',
  'Red papules and pustules around the mouth, typically sparing the '
  'vermilion border itself. Strongly associated with topical steroid use.',
  'established',
  false,
  'See a doctor. Strongly linked to topical steroid use, which makes '
  'self-treatment risky — the instinct to apply more steroid cream often '
  'worsens it. Do not recommend a steroid-containing product for this.',
  null,
  null
),
(
  'eyelash_hypotrichosis',
  'Sparse or thin eyelashes',
  'lashes',
  'Lashes shorter, sparser, or less full than desired; idiopathic or from '
  'prior chemotherapy, extension damage, or chronic mechanical stress.',
  'established',
  true,
  null,
  'Prescription bimatoprost (Latisse) is the only FDA-approved treatment '
  'and carries real risks: increased brown iris pigmentation is LIKELY '
  'PERMANENT; also documented are eyelid/periorbital darkening (usually '
  'reversible), adjacent-skin hypertrichosis, and prostaglandin-associated '
  'orbital fat atrophy. OTC "lash growth" serums using isopropyl '
  'cloprostenate or similar prostaglandin analogs carry the same class of '
  'risk without medical supervision — the FDA issued a warning letter over '
  'exactly this (Lifetech Resources LLC, 2011) and Canada has banned '
  'isopropyl cloprostenate in cosmetics. Flag this prominently any time a '
  'prostaglandin-analog product surfaces in a recommendation.',
  'Peptide serums are a gentler, prostaglandin-free option but evidence is '
  'thin (the one dedicated trial was open-label, uncontrolled, n=30, ~8% '
  'length gain versus bimatoprost''s 25-50% in RCTs). Present as promising, '
  'not proven. Petrolatum and castor oil condition and reduce breakage but '
  'do not grow lashes — that specific growth claim is a myth, see '
  'reference_products for both.'
),
(
  'demodex_blepharitis',
  'Demodex blepharitis',
  'lashes',
  'Lid margin irritation, crusting, itching associated with Demodex mite '
  'overgrowth at the lash base.',
  'established',
  true,
  null,
  'Tea tree oil can itself cause ocular irritation — use with care around '
  'the eyes.',
  'Evidence for tea tree oil (active: terpinen-4-ol) lid hygiene is real '
  'but the 2020 Cochrane review (Savla et al., CD013333) graded certainty '
  'as VERY LOW. Represent that honestly rather than overstating confidence. '
  'A newer prescription option, lotilaner ophthalmic solution 0.25%, is '
  'FDA-approved specifically for this.'
),
(
  'eyebrow_hypotrichosis',
  'Sparse or thin eyebrows',
  'brows',
  'Brows thinner or sparser than desired; from over-plucking history, age, '
  'or natural growth pattern.',
  'promising',
  true,
  null,
  'Off-label minoxidil causes local irritation and unwanted growth on '
  'adjacent skin; off-label bimatoprost on brows carries the same '
  'prostaglandin-class risks as lash use and needs care to avoid eye '
  'migration.',
  'Small RCTs support both off-label minoxidil (1-2%) and off-label '
  'bimatoprost (0.01-0.03%) for eyebrow hypotrichosis, with no significant '
  'difference between them in a 2023 head-to-head RCT. "Promising," not '
  '"established," because these are off-label uses of drugs developed for '
  'other indications, evaluated in small trials.'
),
(
  'pseudofolliculitis_barbae',
  'Ingrown hairs / folliculitis from hair removal',
  'skin',
  'Inflammatory reaction to hairs re-entering the skin after shaving, '
  'plucking, or waxing; most common with coarse, curly hair. The infected '
  'counterpart (folliculitis barbae, often Staph aureus) is a related but '
  'distinct presentation.',
  'promising',
  true,
  null,
  null,
  'Management: stop the traumatic hair-removal method until lesions clear, '
  'warm compresses, gentle release of embedded tips, topical hydrocortisone '
  'or antibiotics for inflammation. Graded "promising" rather than '
  '"established" because the Merck Manual notes strong evidence is lacking '
  'for most specific treatments — regimens rest largely on clinical '
  'convention, not controlled trials. Represent as convention, not proof.'
),
(
  'eyebrow_overplucking_traction',
  'Chronic over-plucking (traction-type damage)',
  'brows',
  'Thinner hairs or scarring alopecia in a brow area from sustained '
  'plucking of the same spot over months to years. A single or occasional '
  'pluck does not cause this — the dermal papilla regenerates from '
  'occasional grooming.',
  'established',
  true,
  null,
  null,
  'Mechanistically similar to traction alopecia: reversible early, '
  'potentially permanent once scarring sets in. Reassure that ordinary '
  'grooming is safe; the app should flag a pattern of chronic, same-spot '
  'over-grooming specifically, not routine brow maintenance.'
)
on conflict (id) do update set
  display_name = excluded.display_name,
  category = excluded.category,
  presentation = excluded.presentation,
  evidence_tier = excluded.evidence_tier,
  self_manageable = excluded.self_manageable,
  referral_note = excluded.referral_note,
  safety_warning = excluded.safety_warning,
  notes = excluded.notes;

-- ----------------------------------------------------------------------------
-- 6. TEETH SHADES (VITA Classical)
-- ----------------------------------------------------------------------------

create table if not exists public.reference_teeth_shades (
  id            text primary key,   -- e.g. 'A1', 'B2', 'C3', 'D4'
  hue_group     text not null check (hue_group in ('A','B','C','D')),
  hue_label     text not null,      -- 'reddish-brown','reddish-yellow','gray','reddish-gray'
  subdivision   int not null,
  relative_note text not null       -- descriptive only — no lightness "ranking" across the whole 16
);

comment on table public.reference_teeth_shades is
  'Standard reference for self-tracking only. UI must carry the caveat that '
  'matching under uncontrolled home lighting is imprecise (ambient light, '
  'angle, eye fatigue, and tab aging all affect the match) — see '
  '05_GROOMING_EVIDENCE.md and 06_UI_UX_SPEC.md.';

insert into public.reference_teeth_shades (id, hue_group, hue_label, subdivision, relative_note)
values
('A1','A','reddish-brown',1,'Lightest of the reddish-brown group.'),
('A2','A','reddish-brown',2,'Common natural adult shade within the reddish-brown group.'),
('A3','A','reddish-brown',3,'Deeper value, higher chroma than A2.'),
('A3.5','A','reddish-brown',4,'Between A3 and A4; deeper still.'),
('A4','A','reddish-brown',5,'Deepest of the reddish-brown group.'),
('B1','B','reddish-yellow',1,'Lightest shade in the entire VITA Classical set.'),
('B2','B','reddish-yellow',2,'Common natural adult shade within the reddish-yellow group.'),
('B3','B','reddish-yellow',3,'Deeper value than B2.'),
('B4','B','reddish-yellow',4,'Deepest of the reddish-yellow group.'),
('C1','C','gray',1,'Lightest of the gray group.'),
('C2','C','gray',2,'Mid-range gray group shade.'),
('C3','C','gray',3,'Deeper gray-group shade.'),
('C4','C','gray',4,'Deepest of the gray group.'),
('D2','D','reddish-gray',2,'VITA Classical has no D1; D2 is the lightest reddish-gray shade offered.'),
('D3','D','reddish-gray',3,'Mid reddish-gray shade.'),
('D4','D','reddish-gray',4,'Deepest reddish-gray shade.')
on conflict (id) do update set
  hue_group = excluded.hue_group,
  hue_label = excluded.hue_label,
  subdivision = excluded.subdivision,
  relative_note = excluded.relative_note;

-- ----------------------------------------------------------------------------
-- 7. PRODUCTS — 3-4 named options per concern, never a single verdict
-- ----------------------------------------------------------------------------

create table if not exists public.reference_products (
  id                    uuid primary key default gen_random_uuid(),
  category              text not null,       -- natural key for re-run safety, enforced via
                                                -- the idempotent constraint block below rather
                                                -- than inline, since `create table if not
                                                -- exists` silently no-ops the whole column
                                                -- definition (including any inline `unique`) on
                                                -- a table that already exists — this table has
                                                -- never been applied anywhere yet, so it's moot
                                                -- today, but the pattern is wrong to repeat in
                                                -- Step 2's tables, so fixing it here properly.
                                                -- Also what product_category_ids arrays above
                                                -- reference. Currently one row per category
                                                -- (starter-list stage) — if a category ever
                                                -- needs >1 product, this constraint has to come
                                                -- off and the on-conflict strategy changes with it.
  name                  text not null,
  applies_to_skin_types text[],
  applies_to_hair_types text[],
  applies_to_condition_ids text[],
  evidence_tier         text not null check (evidence_tier in ('established','promising','myth')),
  safety_warning        text,
  notes                 text not null,
  price_tier            text check (price_tier in ('budget','mid','premium')),
  source_note           text not null
);

-- Idempotent constraint add: works whether this table was just created above
-- or already existed from an earlier, pre-constraint version of this
-- migration. `alter table ... add constraint` has no native `if not exists`
-- in Postgres, so this checks pg_constraint directly instead of relying on
-- create-table-time column syntax that a re-run could silently skip.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'reference_products_category_key'
      and conrelid = 'public.reference_products'::regclass
  ) then
    alter table public.reference_products
      add constraint reference_products_category_key unique (category);
  end if;
end $$;

comment on table public.reference_products is
  'Named products are general-knowledge starter data, not a live catalog — '
  'correct for well-known stable products but not guaranteed current on '
  'formulation, price, or availability. Re-verify via web search at the point '
  'a recommendation is served if the active ingredient, concentration, or '
  'discontinued status matters. Myths ship as corrections, never omitted.';

insert into public.reference_products
  (category, name, applies_to_skin_types, applies_to_hair_types, applies_to_condition_ids,
   evidence_tier, safety_warning, notes, price_tier, source_note)
values
-- Lip care
(
  'lip_balm_occlusive', 'Vaseline / plain petrolatum jelly',
  null, null, array['chapped_lips'],
  'established', null,
  'Gold standard occlusive — reduces transepidermal water loss >98% at '
  'minimum 5% concentration. No fragrance/menthol/camphor to trigger the '
  'irritant reapplication cycle some flavored balms cause.',
  'budget',
  'Ghadially, Halkier-Sorensen & Elias, J Am Acad Dermatol 1992;26:387-396'
),
(
  'lip_balm_spf', 'Aquaphor Lip Repair or any petrolatum-based SPF 30+ lip balm',
  null, null, array['chapped_lips','actinic_cheilitis'],
  'established', null,
  'Lip epithelium is thinner and less UV-protected than facial skin. '
  'Moderate-quality evidence supports SPF lip products for preventing '
  'actinic cheilitis and recurrent herpes labialis. Reapply frequently — '
  'a single morning application does not last all day.',
  'budget',
  'PRISMA systematic review, Open Dentistry Journal 2021'
),
(
  'lip_balm_lanolin_alt', 'Ceramide-based lip balm (e.g. CeraVe Healing Ointment)',
  null, null, array['chapped_lips','contact_dermatitis_lip'],
  'established', null,
  'Reasonable alternative for people who react to lanolin, a common lip '
  'allergen present in many "moisturizing" balms, or who dislike the '
  'greasy feel of straight petrolatum.',
  'budget',
  '05_GROOMING_EVIDENCE.md ingredient/allergen review'
),

-- Lashes
(
  'lash_growth_prescription', 'Bimatoprost (Latisse), prescription only',
  null, null, array['eyelash_hypotrichosis'],
  'established',
  'Increased brown iris pigmentation is LIKELY PERMANENT. Also: eyelid/'
  'periorbital darkening (usually reversible), adjacent hypertrichosis, '
  'prostaglandin-associated orbital fat atrophy. Requires ongoing use; '
  'effect fades ~4-6 months after stopping.',
  'The only FDA-approved (2008) lash growth treatment. RCT-confirmed '
  'length/thickness/darkness gains. Route through an ophthalmologist or '
  'dermatologist, never as a self-serve product recommendation.',
  'premium',
  'FDA LATISSE label 2021'
),
(
  'lash_serum_peptide', 'Peptide lash serum (non-prostaglandin, e.g. formulas using Myristoyl Pentapeptide-17)',
  null, null, array['eyelash_hypotrichosis'],
  'promising', null,
  'Prostaglandin-free, gentler safety profile than the class below, but the '
  'lash-specific evidence is thin — the one dedicated trial was open-label, '
  'uncontrolled, n=30, ~8% length gain (versus bimatoprost''s 25-50% in '
  'RCTs). Present as "may help," not "will grow lashes."',
  'mid',
  'Fernandez-Gonzalez et al., J Cosmet Dermatol 2024;23(7):2170-2180; '
  'Baiyasi et al. review, J Cosmet Dermatol 2024;23(7):2328-2344'
),
(
  'lash_serum_prostaglandin_otc', 'OTC "lash growth" serum containing isopropyl cloprostenate or similar',
  null, null, array['eyelash_hypotrichosis'],
  'established',
  'SAFETY FLAG — same drug class and risk profile as prescription '
  'bimatoprost but sold without medical supervision. FDA warning letter '
  'issued over exactly this (Lifetech Resources LLC, 2011): ocular '
  'irritation, hyperemia, iris color change, macular edema, glaucoma-'
  'therapy interference. Canada has banned isopropyl cloprostenate in '
  'cosmetics; the EU Scientific Committee on Consumer Safety concluded '
  'these ingredients cannot be considered safe for cosmetic use.',
  'Effective, but this row exists specifically so the app can flag it '
  'prominently rather than present it as a routine OTC option.',
  'mid',
  'FDA Warning Letter to Lifetech Resources LLC, April 18 2011'
),
(
  'lash_conditioning_myth_castor', 'Castor oil (as a lash growth product)',
  null, null, array['eyelash_hypotrichosis'],
  'myth', null,
  'MYTH, stored as a correction: no high-quality RCT shows castor oil '
  'grows lashes. Ricinoleic acid does condition and may reduce breakage, '
  'giving lashes a fuller LOOK without changing growth. The one relevant '
  'RCT (pilot, n~26) measured blepharitis/meibomian symptoms, not lash '
  'length or density at all.',
  'budget',
  'Muntz, Lacey & Craig, Clin Exp Optom 2021;104(3):315-322'
),

-- Brows
(
  'brow_growth_minoxidil', 'Minoxidil 1-2%, applied off-label to brows',
  null, null, array['eyebrow_hypotrichosis'],
  'promising',
  'Local irritation and unwanted hair growth on adjacent skin are '
  'documented side effects.',
  'Split-face RCT found 1% minoxidil significantly superior to placebo '
  'across photographic assessment, hair diameter, hair count, and '
  'satisfaction over 16 weeks. Off-label use, small trial — "promising" '
  'not "established."',
  'budget',
  'Suwanchatchai et al., J Med Assoc Thai'
),
(
  'brow_conditioning_myth_vaseline', 'Vaseline / castor oil (as a brow growth product)',
  null, null, array['eyebrow_hypotrichosis'],
  'myth', null,
  'MYTH, stored as a correction: conditions and moisturizes brow hairs, '
  'reduces breakage, can give a temporarily fuller look — does not '
  'stimulate new growth. Say this explicitly rather than letting the '
  'shine/gloss effect get mistaken for growth.',
  'budget',
  '05_GROOMING_EVIDENCE.md, Section 1'
),

-- Teeth
(
  'teeth_whitening_strips', 'Peroxide-based whitening strips (e.g. Crest 3D White)',
  null, null, null,
  'established',
  'Sensitivity is the real adverse effect — one clinical comparison found '
  '55% of patients reported tooth sensitivity and/or gingival irritation '
  'with 10% carbamide peroxide, and 20% of those discontinued because of '
  'discomfort. Usually transient (up to ~4 days).',
  'Genuine intrinsic and extrinsic whitening via oxygen-radical breakdown '
  'of chromogens. Enamel-safety meta-analyses show no clinically '
  'meaningful microhardness change at recommended concentrations/times.',
  'budget',
  'British Dental Journal review; 2024 systematic review and meta-analysis'
),
(
  'teeth_whitening_purple_toothpaste', 'Purple / color-correcting toothpaste (blue covarine)',
  null, null, null,
  'myth', null,
  'MYTH as whitening, stored as a correction: produces a real but purely '
  'OPTICAL surface effect (blue pigment neutralizing yellow tones) that '
  'washes off within hours — not structural whitening. A double-blind RCT '
  'found no significant shade difference between color-correcting and '
  'regular toothpaste over 2 weeks, both far below bleaching. Legitimate '
  'as a same-day cosmetic quick-fix; not a whitening product.',
  'budget',
  'Vaz et al., J Appl Oral Sci 2019;27:e20180051'
),

-- Skin (from 09_PERSONAL_GROOMING_SYSTEM.md, general-knowledge starter set)
(
  'hydrating_serum', 'Hyaluronic acid serum (e.g. The Ordinary Hyaluronic Acid 2% + B5)',
  array['dry','combination','normal'], null, null,
  'established', null,
  'Apply to damp skin so it draws in water rather than pulling moisture '
  'from lower skin layers on a dry face.',
  'budget',
  '09_PERSONAL_GROOMING_SYSTEM.md'
),
(
  'ceramide_moisturizer', 'Ceramide moisturizer (e.g. CeraVe Moisturizing Cream, La Roche-Posay Toleriane)',
  array['dry','combination','normal'], null, null,
  'established', null,
  'Barrier-repair focused; a reasonable daily moisturizer for most skin '
  'types outside active breakouts.',
  'budget',
  '09_PERSONAL_GROOMING_SYSTEM.md'
),
(
  'niacinamide_serum', 'Niacinamide serum (e.g. The Ordinary Niacinamide 10% + Zinc 1%)',
  array['oily','combination'], null, null,
  'established', null,
  'Barrier support and tone-evening; commonly recommended for T-zone oil '
  'control. Introduce gradually (2-3x/week to start).',
  'budget',
  '09_PERSONAL_GROOMING_SYSTEM.md'
),
(
  'retinoid_adapalene', 'Adapalene 0.1% (OTC retinoid, e.g. Differin)',
  array['oily','combination','normal'], null, null,
  'established', null,
  'The one ingredient in this starter set with the strongest long-term '
  'evidence for skin texture/tone. Night use only, build up slowly '
  '(2-3x/week to start), always follow with moisturizer.',
  'budget',
  '09_PERSONAL_GROOMING_SYSTEM.md'
),
(
  'spf_daily', 'SPF 30+ daily sunscreen',
  array['dry','oily','combination','normal'], null, null,
  'established', null,
  'Single biggest lever for long-term skin quality — UV exposure is the '
  'primary driver of premature skin aging. Non-negotiable daily step '
  'regardless of skin type.',
  'budget',
  '09_PERSONAL_GROOMING_SYSTEM.md'
),

-- Hair
(
  'sea_salt_spray', 'Sea salt spray (texture/volume)',
  null, array['straight','wavy'], null,
  'established', null,
  'Adds texture and volume without weighing straight or wavy hair flat, '
  'unlike heavier creams.',
  'budget',
  '09_PERSONAL_GROOMING_SYSTEM.md'
),
(
  'matte_clay', 'Matte clay (hold without shine)',
  null, array['straight','wavy'], null,
  'established', null,
  'Hold without stiffness or the greasy/helmet-like look heavy wax or gel '
  'can produce by midday on straight hair.',
  'budget',
  '09_PERSONAL_GROOMING_SYSTEM.md'
)
on conflict (category) do update set
  name = excluded.name,
  applies_to_skin_types = excluded.applies_to_skin_types,
  applies_to_hair_types = excluded.applies_to_hair_types,
  applies_to_condition_ids = excluded.applies_to_condition_ids,
  evidence_tier = excluded.evidence_tier,
  safety_warning = excluded.safety_warning,
  notes = excluded.notes,
  price_tier = excluded.price_tier,
  source_note = excluded.source_note;

-- ----------------------------------------------------------------------------
-- 8. RLS — reference tables are read-only for everyone, writable by nobody
--    at the application layer (seeding happens via this script / dashboard,
--    not via the app). This mirrors the default-deny posture used on the
--    user-data tables, just with a public SELECT policy since none of this
--    content is user-specific or sensitive.
-- ----------------------------------------------------------------------------

alter table public.reference_face_shapes enable row level security;
alter table public.reference_dimorphism_traits enable row level security;
alter table public.reference_skin_types enable row level security;
alter table public.reference_hair_types enable row level security;
alter table public.reference_conditions enable row level security;
alter table public.reference_teeth_shades enable row level security;
alter table public.reference_products enable row level security;

drop policy if exists reference_face_shapes_public_read on public.reference_face_shapes;
create policy reference_face_shapes_public_read on public.reference_face_shapes for select using (true);

drop policy if exists reference_dimorphism_traits_public_read on public.reference_dimorphism_traits;
create policy reference_dimorphism_traits_public_read on public.reference_dimorphism_traits for select using (true);

drop policy if exists reference_skin_types_public_read on public.reference_skin_types;
create policy reference_skin_types_public_read on public.reference_skin_types for select using (true);

drop policy if exists reference_hair_types_public_read on public.reference_hair_types;
create policy reference_hair_types_public_read on public.reference_hair_types for select using (true);

drop policy if exists reference_conditions_public_read on public.reference_conditions;
create policy reference_conditions_public_read on public.reference_conditions for select using (true);

drop policy if exists reference_teeth_shades_public_read on public.reference_teeth_shades;
create policy reference_teeth_shades_public_read on public.reference_teeth_shades for select using (true);

drop policy if exists reference_products_public_read on public.reference_products;
create policy reference_products_public_read on public.reference_products for select using (true);

-- No insert/update/delete policies are defined, which means those actions
-- are denied by default under RLS. Seed/update this data by running this
-- script directly against the database (Supabase SQL editor or migration),
-- never through an app-facing endpoint.

-- ============================================================================
-- Still outstanding after this file (per 07_BUILD_SEQUENCE.md Step 1):
--   - Nothing content-wise remains unsequenced from 04/05 for the seven
--     tables above.
--   - Open design decision NOT resolved here: whether readings.face_shape_id
--     supports primary + optional secondary shape. That belongs in Step 2
--     (readings + condition_findings tables), not this reference layer.
-- ============================================================================
