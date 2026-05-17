import Anthropic from '@anthropic-ai/sdk'
import type { VisionResult } from '@/lib/vision'

const SYSTEM_PROMPT = `You are a nutrition analysis expert specializing in Indian cuisine. You identify all food items from text descriptions and estimate their macronutrients accurately.

Rules:
- Default to Indian dishes, ingredients, and typical home-cooked portions unless the description clearly states otherwise.
- For mixed dishes (dal, sabzi, curry), estimate based on standard home-cooked serving sizes.
- Calorie and fat estimation: Indian home cooking has highly variable oil, ghee, and portion sizes that are consistently underestimated. Bake a buffer into your estimates based on your confidence — lean toward the upper end of your plausible range: high confidence items 5–10% above your midpoint estimate, medium confidence 15–20% above your midpoint, low confidence 20–25% above your midpoint. Apply this primarily to calories and fat. These buffers must already be baked into the numbers you return.
- Be conservative with oils — Indian cooking uses more oil than it appears. When in doubt, assume more oil was used.
- Quantities and units: apply this reasoning to pick the unit — ask "would someone say I had 2 of them, or I had some of it?" If "2 of them": use piece as the unit. If "some of it": use ml for liquids and gravies, grams for loose dry or cooked ingredients that are scooped or weighed. The only valid units are: piece, g, ml, cup, bowl, tbsp, tsp, slice.
- If the user specifies a quantity (e.g. "3 roti", "1 cup rice"), use it directly. Do not second-guess explicit counts.
- If confidence is low for an item, still include it but mark confidence as "low".
- When you cannot determine which of two dishes something is (genuine ambiguity in the description), name it as "option A / option B", use midpoint macros, set confidence to "medium", and note the uncertainty in ai_notes. Use slash format only for genuine uncertainty — not to append an English translation to a dish you have already identified confidently.
- Micros (sodium, fiber): provide best estimates, these are rough.

Respond ONLY with a valid JSON object. No markdown fences. No explanation. No preamble.`

export async function analyzeMealText(
  description: string,
  mealSlot: string,
  recentMealsContext: string,
  dishHint?: string,
): Promise<VisionResult> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const contextLine = recentMealsContext ? `\n\n${recentMealsContext}` : ''
  const dishHintLine = dishHint
    ? `\nAdditional context from user: "${dishHint}".`
    : ''

  const userText = `This is my ${mealSlot} meal. The user described what they ate as: "${description}"${dishHintLine}${contextLine}

Identify every food item from the description and estimate macros.

Return this exact JSON structure:
{
  "items": [
    {
      "item_name": "string",
      "quantity": number,
      "unit": "string",
      "calories": number,
      "protein_g": number,
      "carbs_g": number,
      "fat_g": number,
      "fiber_g": number,
      "sodium_mg": number,
      "confidence": "high" | "medium" | "low"
    }
  ],
  "total_calories": number,
  "total_protein_g": number,
  "total_carbs_g": number,
  "total_fat_g": number,
  "total_fiber_g": number,
  "total_sodium_mg": number,
  "ai_notes": "string — one sentence about anything uncertain or notable"
}`

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: userText,
      },
    ],
  })

  const block = response.content[0]
  if (block.type !== 'text') {
    throw new Error('Unexpected response block type: ' + block.type)
  }

  const rawText = block.text.trim()
  const jsonText = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()

  let parsed: VisionResult
  try {
    parsed = JSON.parse(jsonText) as VisionResult
  } catch {
    throw new Error('JSON parse failed. Raw response: ' + rawText)
  }

  return parsed
}
