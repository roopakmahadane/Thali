import Anthropic from '@anthropic-ai/sdk'

const SYSTEM_PROMPT = `You are a nutrition pattern analyzer. You read a user's recent meal history and extract behavioral patterns about their eating habits.

Pattern categories:
- preference: foods they eat frequently or seem to prefer
- portion: typical serving sizes for specific foods
- time: what they tend to eat at specific meal times
- restriction: foods they never eat (potential dietary restrictions)

Rules:
- Only state patterns you are confident about from the data. Do not guess.
- Be specific: "Usually eats 2 rotis at dinner" not "eats rotis".
- Confidence: high = seen 5+ times consistently, medium = seen 3-4 times, low = seen 1-2 times.
- Do not repeat patterns already in existing_patterns unless confidence has increased.
- Return 3-5 new or updated patterns maximum. Do not return all patterns every time.

Respond ONLY with a valid JSON array. No markdown fences. No explanation.`

export type PatternResult = {
  pattern_text: string
  category: 'preference' | 'portion' | 'time' | 'restriction'
  confidence: 'low' | 'medium' | 'high'
}

export async function updateUserPatterns(
  _userId: string,
  recentMeals: Array<{
    meal_type: string
    eaten_at: string
    items: Array<{ item_name: string; quantity: number; unit: string }>
  }>,
  existingPatterns: Array<{ pattern_text: string; category: string; confidence: string }>
): Promise<PatternResult[]> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const mealLines = recentMeals
    .map((m) => {
      const itemList = m.items.map((i) => `${i.item_name} (${i.quantity} ${i.unit})`).join(', ')
      return `${m.meal_type.replace('_', ' ')} at ${m.eaten_at}: ${itemList}`
    })
    .join('\n')

  const patternLines = existingPatterns.length
    ? existingPatterns.map((p) => `[${p.category}] ${p.pattern_text} (${p.confidence})`).join('\n')
    : 'None yet'

  const userMessage = `Recent meals (last 20):
${mealLines}

Existing patterns already recorded:
${patternLines}

Identify new or updated patterns from the recent meals. Return JSON array:
[
  {
    "pattern_text": "string",
    "category": "preference" | "portion" | "time" | "restriction",
    "confidence": "low" | "medium" | "high"
  }
]`

  try {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
    })

    const block = response.content[0]
    if (block.type !== 'text') return []

    const rawText = block.text.trim()
    const jsonText = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
    return JSON.parse(jsonText) as PatternResult[]
  } catch {
    return []
  }
}
