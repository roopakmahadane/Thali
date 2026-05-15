export const MEAL_SLOTS = [
  { key: 'breakfast',     label: 'Breakfast',     color: '#F59E0B', defaultHour: 8  },
  { key: 'morning_snack', label: 'Morning snack', color: '#FB923C', defaultHour: 10 },
  { key: 'lunch',         label: 'Lunch',         color: '#DC2626', defaultHour: 13 },
  { key: 'evening_snack', label: 'Evening snack', color: '#EC4899', defaultHour: 17 },
  { key: 'dinner',        label: 'Dinner',        color: '#6366F1', defaultHour: 20 },
] as const

export type MealSlotKey = typeof MEAL_SLOTS[number]['key']
