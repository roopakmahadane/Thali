export interface Profile {
  user_id: string
  name: string | null
  age: number
  height_cm: number
  weight_kg: number
  gender: string
  activity_level: string
  goal: string
  target_weight_kg: number | null
  timeline_weeks: number | null
  diet_type: string
  allergies: string | null
  daily_calories: number
  daily_protein_g: number
  daily_carbs_g: number
  daily_fat_g: number
  daily_fiber_g: number
  created_at: string
  updated_at: string
}

export type MealType = 'breakfast' | 'morning_snack' | 'lunch' | 'evening_snack' | 'dinner'

export interface Meal {
  id: string
  user_id: string
  photo_url: string | null
  meal_type: MealType
  eaten_at: string | null
  total_calories: number | null
  total_protein_g: number | null
  total_carbs_g: number | null
  total_fat_g: number | null
  total_fiber_g: number | null
  total_sodium_mg: number | null
  total_iron_mg: number | null
  total_calcium_mg: number | null
  ai_notes: string | null
  created_at: string
}

export type MealItemSource = 'ai' | 'manual' | 'library'

export interface MealItem {
  id: string
  meal_id: string
  item_name: string
  quantity: number | null
  unit: string | null
  calories: number | null
  protein_g: number | null
  carbs_g: number | null
  fat_g: number | null
  fiber_g: number | null
  sodium_mg: number | null
  source: MealItemSource | null
  created_at: string
}

export interface FrequentFood {
  id: string
  user_id: string
  name: string
  typical_quantity: number | null
  typical_unit: string | null
  macros_per_unit_json: Record<string, number> | null
  times_logged: number
  last_logged_at: string | null
  confirmed: boolean
  created_at: string
}

export type PatternCategory = 'preference' | 'portion' | 'time' | 'restriction'
export type PatternConfidence = 'low' | 'medium' | 'high'

export interface UserPattern {
  id: string
  user_id: string
  pattern_text: string
  category: PatternCategory | null
  confidence: PatternConfidence | null
  created_at: string
  updated_at: string
}

export interface WeightLog {
  id: string
  user_id: string
  weight_kg: number
  logged_at: string
}

export interface DailySummary {
  id: string
  user_id: string
  date: string
  calories_consumed: number
  protein_g: number
  carbs_g: number
  fat_g: number
  calories_target: number | null
  created_at: string
}
