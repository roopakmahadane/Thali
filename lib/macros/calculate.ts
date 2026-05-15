export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'very_active' | 'extra_active'
export type Goal = 'lose_weight' | 'maintain' | 'recomp' | 'muscle_gain' | 'bulk'

export interface MacroInput {
  age: number
  height_cm: number
  weight_kg: number
  gender: 'male' | 'female'
  activity_level: ActivityLevel
  goal: Goal
}

export interface MacroOutput {
  bmr: number
  tdee: number
  daily_calories: number
  daily_protein_g: number
  daily_carbs_g: number
  daily_fat_g: number
  daily_fiber_g: number
}

export interface MacroBreakdown extends MacroOutput {
  activity_multiplier: number
  goal_kcal_delta: number
  protein_multiplier_g_per_kg: number
  protein_calories: number
  remaining_calories: number
  carb_pct: number
  fat_pct: number
}

const ACTIVITY_MULTIPLIERS: Record<ActivityLevel, number> = {
  sedentary:    1.2,
  light:        1.375,
  moderate:     1.55,
  very_active:  1.725,
  extra_active: 1.9,
}

export const GOAL_KCAL_DELTA: Record<Goal, number> = {
  lose_weight:  -500,
  maintain:        0,
  recomp:          0,
  muscle_gain:   300,
  bulk:          500,
}

export const PROTEIN_PER_KG: Record<Goal, number> = {
  lose_weight: 1.8,
  maintain:    1.6,
  recomp:      2.0,
  muscle_gain: 2.0,
  bulk:        2.2,
}

// Fraction of remaining-after-protein calories allocated to carbs
const CARB_SPLIT: Record<ActivityLevel, number> = {
  sedentary:    0.45,
  light:        0.50,
  moderate:     0.60,
  very_active:  0.65,
  extra_active: 0.70,
}

export function calculateBreakdown(input: MacroInput): MacroBreakdown {
  const { age, height_cm, weight_kg, gender, activity_level, goal } = input

  const bmr =
    gender === 'male'
      ? 10 * weight_kg + 6.25 * height_cm - 5 * age + 5
      : 10 * weight_kg + 6.25 * height_cm - 5 * age - 161

  const activity_multiplier  = ACTIVITY_MULTIPLIERS[activity_level]
  const tdee                 = bmr * activity_multiplier
  const goal_kcal_delta      = GOAL_KCAL_DELTA[goal]
  const daily_calories       = Math.round(tdee + goal_kcal_delta)

  const protein_multiplier_g_per_kg = PROTEIN_PER_KG[goal]
  const daily_protein_g      = Math.round(weight_kg * protein_multiplier_g_per_kg)
  const protein_calories     = daily_protein_g * 4
  const remaining_calories   = Math.max(0, daily_calories - protein_calories)

  const carb_pct             = CARB_SPLIT[activity_level]
  const fat_pct              = 1 - carb_pct
  const daily_carbs_g        = Math.round((remaining_calories * carb_pct) / 4)
  const daily_fat_g          = Math.round((remaining_calories * fat_pct) / 9)
  const daily_fiber_g        = 30

  return {
    bmr:                       Math.round(bmr),
    tdee:                      Math.round(tdee),
    activity_multiplier,
    goal_kcal_delta,
    daily_calories,
    protein_multiplier_g_per_kg,
    daily_protein_g,
    protein_calories,
    remaining_calories,
    carb_pct,
    fat_pct,
    daily_carbs_g,
    daily_fat_g,
    daily_fiber_g,
  }
}

export function calculateMacros(input: MacroInput): MacroOutput {
  const b = calculateBreakdown(input)
  return {
    bmr:            b.bmr,
    tdee:           b.tdee,
    daily_calories: b.daily_calories,
    daily_protein_g: b.daily_protein_g,
    daily_carbs_g:  b.daily_carbs_g,
    daily_fat_g:    b.daily_fat_g,
    daily_fiber_g:  b.daily_fiber_g,
  }
}
