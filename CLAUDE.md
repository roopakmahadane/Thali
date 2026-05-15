# Thali — Project Context for Claude Code

## What is this
Personal calorie and macro tracking PWA. Single user. Photo-first: snap a meal, Claude vision identifies food and calculates macros. Five meal slots per day. Agent memory learns eating patterns over time.

## Stack
- Next.js 14, App Router, TypeScript, Tailwind CSS
- Supabase: Postgres + Auth (magic-link) + Storage (meal photos)
- Anthropic Claude Sonnet 4 — vision analysis (`lib/vision.ts`), pattern reasoning, meal suggestions
- Vercel (deploy later, dev is local)

## Design system

### Colors
- Cream background: #F5F1E8
- Lime accent (CTAs, brand, progress): #D4F542
- Navy/Ink (text, dark surfaces): #0F1B2D
- White (cards): #FFFFFF
- Gray-500 (secondary text): #6B7280
- Gray-200 (borders, dividers): #E5E7EB

### Meal slot colors
- Breakfast: #F59E0B
- Morning snack: #FB923C
- Lunch: #DC2626
- Evening snack: #EC4899
- Dinner: #6366F1

### Typography
- Font: Geist Sans (Next.js default) everywhere
- Geist Mono for macro numbers on edit screens only
- Font weights: 400 regular, 500 medium only. Never 600 or 700.
- Sentence case throughout. MACRO LABELS use letter-spacing: 0.05em uppercase at 10-11px.
- Display numbers (calories, macros): 36px / 500 weight

### Component patterns
- Cards: white bg, border-radius 20px (large cards) or 16px (slot cards), no box-shadow
- Empty slots: dashed border #E5E7EB, outlined colored dot
- Filled slots: solid white card, filled colored dot, truncated subtitle
- CTA button: lime bg #D4F542, navy text #0F1B2D, border-radius 14px, 12px padding
- Progress bars: #E5E7EB track, #D4F542 fill for calories, #0F1B2D fill for macros
- Bottom nav: 4 tabs — Today, Calendar, Patterns, Profile

## DB schema

### profiles
user_id (uuid, FK auth.users, PK), name (text), age (int), height_cm (int), weight_kg (decimal),
gender (text), activity_level (text), goal (text), target_weight_kg (decimal),
timeline_weeks (int), diet_type (text), allergies (text), daily_calories (int),
daily_protein_g (int), daily_carbs_g (int), daily_fat_g (int), daily_fiber_g (int),
created_at (timestamptz), updated_at (timestamptz)

### meals
id (uuid PK), user_id (uuid FK), photo_url (text), meal_type (text — breakfast |
morning_snack | lunch | evening_snack | dinner), eaten_at (timestamptz),
total_calories (int), total_protein_g (decimal), total_carbs_g (decimal),
total_fat_g (decimal), total_fiber_g (decimal), total_sodium_mg (decimal),
total_iron_mg (decimal), total_calcium_mg (decimal), ai_notes (text), created_at (timestamptz)

### meal_items
id (uuid PK), meal_id (uuid FK meals.id), item_name (text), quantity (decimal),
unit (text), calories (int), protein_g (decimal), carbs_g (decimal), fat_g (decimal),
fiber_g (decimal), sodium_mg (decimal), source (text — ai | manual | library),
created_at (timestamptz)

### frequent_foods
id (uuid PK), user_id (uuid FK), name (text), typical_quantity (decimal),
typical_unit (text), macros_per_unit_json (jsonb), times_logged (int default 0),
last_logged_at (timestamptz), confirmed (boolean default false), created_at (timestamptz)

### user_patterns
id (uuid PK), user_id (uuid FK), pattern_text (text), category (text —
preference | portion | time | restriction), confidence (text — low | medium | high),
created_at (timestamptz), updated_at (timestamptz)

### weight_logs
id (uuid PK), user_id (uuid FK), weight_kg (decimal), logged_at (timestamptz)

### daily_summaries
id (uuid PK), user_id (uuid FK), date (date), calories_consumed (int default 0),
protein_g (decimal default 0), carbs_g (decimal default 0), fat_g (decimal default 0),
calories_target (int), created_at (timestamptz)

## File structure
```
/app
  /(auth)
    /login/page.tsx         — magic-link login page
    /auth/callback/route.ts — Supabase auth callback handler
  /(app)                    — protected, requires session
    /layout.tsx             — bottom nav shell
    /dashboard/page.tsx     — today view (5 slots + totals)
    /meal/new/page.tsx      — add meal (photo + manual)
    /meal/[id]/page.tsx     — view/edit past meal
    /calendar/page.tsx      — month calendar view
    /patterns/page.tsx      — learned patterns list
    /profile/page.tsx       — edit profile, weight log
  /api
    /onboarding/route.ts    — POST: save profile, return computed targets
    /meals/analyze/route.ts — POST: send photo to Claude vision, return JSON
    /meals/save/route.ts    — POST: save meal + items to DB
    /meals/[id]/route.ts    — GET/PUT/DELETE single meal
    /dashboard/route.ts     — GET: today's summary
    /weight/route.ts        — GET/POST: fetch logs, log new weight
    /weight/[id]/route.ts   — PATCH/DELETE: edit or remove a log entry
    /suggestions/route.ts   — GET: meal suggestions for now
    /patterns/route.ts      — GET/POST/DELETE patterns
/lib
  /supabase
    /client.ts              — browser Supabase client
    /server.ts              — server Supabase client (cookies)
    /middleware.ts          — session refresh + route protection
  /claude
    /vision.ts              — Claude vision call + prompt (was lib/claude/vision.ts)
    /patterns.ts            — pattern updater call + prompt
    /suggestions.ts         — suggestion call + prompt
  /macros
    /calculate.ts           — BMR, TDEE, macro split functions
  /types
    /index.ts               — shared TypeScript types for all tables
/supabase
  /migrations
    /001_initial_schema.sql — full schema creation
```

## Environment variables
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
ANTHROPIC_API_KEY=
```

## Macro calculation rules (Mifflin-St Jeor)
BMR male   = 10 × weight_kg + 6.25 × height_cm − 5 × age + 5
BMR female = 10 × weight_kg + 6.25 × height_cm − 5 × age − 161

Activity multipliers:
  sedentary = 1.2, light = 1.375, moderate = 1.55, very_active = 1.725, extra_active = 1.9

Goal kcal adjustments (applied to TDEE):
  lose_weight → −500, maintain → 0, recomp → 0, muscle_gain → +300, bulk → +500

Protein (g per kg bodyweight):
  lose_weight → 1.8, maintain → 1.6, recomp → 2.0, muscle_gain → 2.0, bulk → 2.2

Carb fraction of remaining calories (after protein):
  sedentary → 45%, light → 50%, moderate → 60%, very_active → 65%, extra_active → 70%
  Fat takes the remainder. Remaining = max(0, daily_calories − protein_g × 4).

Protein and carbs = 4 kcal/g, fat = 9 kcal/g.
Store computed targets in profiles.daily_calories, daily_protein_g, daily_carbs_g, daily_fat_g.
daily_fiber_g = 30g for all goals (standard daily recommendation).

`calculateBreakdown(input)` returns full detail (bmr, tdee, multipliers, remaining_calories, carb_pct, fat_pct, etc.).
`calculateMacros(input)` calls breakdown internally, returns the MacroOutput subset only.
Profile page section 2 renders the breakdown for the user.

## Meal slot config
```ts
export const MEAL_SLOTS = [
  { key: 'breakfast',     label: 'Breakfast',      color: '#F59E0B', defaultHour: 8  },
  { key: 'morning_snack', label: 'Morning snack',  color: '#FB923C', defaultHour: 10 },
  { key: 'lunch',         label: 'Lunch',           color: '#DC2626', defaultHour: 13 },
  { key: 'evening_snack', label: 'Evening snack',  color: '#EC4899', defaultHour: 17 },
  { key: 'dinner',        label: 'Dinner',          color: '#6366F1', defaultHour: 20 },
] as const
```

## Day boundary
4 AM IST. Meals logged between midnight and 4 AM count toward the previous day.
Use this when grouping meals by date everywhere.

## Workflow rules (non-negotiable)
1. State assumptions and present a step-by-step plan before writing any code.
2. Wait for explicit approval before implementing.
3. Reference exact file paths in every response.
4. Fix one issue at a time, highest priority first.
5. After approved changes: run `npx tsc --noEmit` first. If clean, run the dev server and describe what to test.
6. Debug by adding console.logs, not by guessing. Paste logs back before fixing.
7. Do not touch code outside the files relevant to the current task.
8. Do not add abstractions, error handling, or features beyond what was asked.
9. If a simpler approach exists, say so before implementing the complex one.
10. If confused, stop and ask. Do not implement to resolve confusion.

## What's built so far
Track this section as phases complete.
- [x] Phase 1a: project scaffold + schema + auth + onboarding
- [x] Phase 1b: today view + 5 slot cards + bottom nav
- [x] Phase 1c: photo capture + Claude vision + edit screen + save
- [x] Phase 2: pattern updater + frequent foods + patterns view + manual entry
- [x] Phase 3: history views + weight log (GET/POST/PATCH/DELETE) + suggestion engine + weekly check-in
- [x] Macro recalc: recomp goal, protein-per-kg logic, calculateBreakdown export
- [x] Profile page: 3-section rewrite (goal+targets, breakdown, weight log with edit/delete)

## Vision prompt decisions
- Model: Claude Sonnet 4 (claude-sonnet-4-20250514)
- Ambiguous items: named with slash between options (e.g. "palak corn / palak dal"), midpoint macros, confidence set to "medium"
- Calories and fat: 10% upper bound applied both in system prompt instruction and in code after JSON.parse
- dishHint: optional user-typed field on capture screen, passed as primary identification anchor to the vision call
- Photo: used for vision call only, discarded after, never stored
