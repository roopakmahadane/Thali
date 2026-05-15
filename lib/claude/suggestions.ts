import Anthropic from '@anthropic-ai/sdk'

const SYSTEM_PROMPT = `You are a personal nutrition advisor specializing in Indian cuisine. You suggest realistic Indian meals based on the user's remaining daily macro budget and eating patterns.

Rules:
- Suggest only Indian dishes the user would realistically cook or order.
- Match the meal slot (breakfast suggestions differ from dinner suggestions).
- Stay within the remaining calorie and macro budget — do not suggest meals that exceed it.
- Account for dietary type strictly: veg = no meat/fish/egg, eggetarian = veg + eggs ok, non-veg = anything, vegan = no animal products.
- Prefer meals the user has eaten before (from recent meals and patterns).
- Keep suggestions practical — dal-chawal, roti-sabzi, not elaborate recipes.
- Return exactly 3 suggestions.

Respond ONLY with a valid JSON array. No markdown fences. No explanation.`

export type Suggestion = {
  meal_name: string
  items: Array<{ item_name: string; quantity: number; unit: string }>
  estimated_calories: number
  estimated_protein_g: number
  estimated_carbs_g: number
  estimated_fat_g: number
  reason: string
}

export async function getMealSuggestions(
  remainingMacros: { calories: number; protein_g: number; carbs_g: number; fat_g: number },
  mealSlot: string,
  timeOfDay: string,
  recentMeals: string,
  patterns: string,
  dietType: string,
): Promise<Suggestion[]> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const userMessage = `Remaining today: ${remainingMacros.calories} kcal, protein ${remainingMacros.protein_g}g, carbs ${remainingMacros.carbs_g}g, fat ${remainingMacros.fat_g}g
Current time: ${timeOfDay}
Meal slot: ${mealSlot}
Diet type: ${dietType}
Recent meals: ${recentMeals || 'None yet'}
Eating patterns: ${patterns || 'None yet'}

Suggest 3 realistic Indian meals that fit within this budget. Return JSON array:
[
  {
    "meal_name": "string",
    "items": [{ "item_name": "string", "quantity": number, "unit": "string" }],
    "estimated_calories": number,
    "estimated_protein_g": number,
    "estimated_carbs_g": number,
    "estimated_fat_g": number,
    "reason": "string — one sentence"
  }
]`

  try {
    const response = await client.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system:     SYSTEM_PROMPT,
      messages:   [{ role: 'user', content: userMessage }],
    })

    const block = response.content[0]
    if (block.type !== 'text') return []

    const rawText  = block.text.trim()
    const jsonText = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
    return JSON.parse(jsonText) as Suggestion[]
  } catch {
    return []
  }
}
