# Thali

I got tired of paying for calorie tracking apps that had no idea what I was eating.

Try logging dal chawal on MyFitnessPal. Either it doesn't exist, or you find seventeen community-submitted entries with macros ranging from "suspiciously low" to "that's physically impossible." Besan chilla? Good luck. Poha? Maybe. Kadhi pakoda? Forget it. These apps were built for someone eating chicken breast and broccoli in a suburb of Ohio, and the Indian food database is clearly an afterthought maintained by people who have never been within 500 metres of an actual Indian kitchen.

As someone who trains seriously and actually wants to track nutrition — not just vaguely gesture at it — paying ₹2000/year for an app that thinks ghee is optional felt like a bad joke.

So I built Thali.

---

## What it does

Snap a photo of your plate. The AI (Claude Sonnet 4) figures out what's on it — not just "Indian curry" but actually: besan chilla, kadhi pakoda, poha, rajma, bhindi sabzi, whatever. It estimates macros. You correct anything that's off. You're done in under a minute.

Named after the one thing that actually represents how Indian people eat: a thali. Everything on one plate, none of it chicken and broccoli.

A few other things it does, since I use them daily:

- **Barcode scanner** — for packaged stuff like protein powder, biscuits, chips. Pulls from Open Food Facts, no manual entry needed.
- **Learns your habits** — keeps track of what you eat and gets smarter about your patterns over time. Log the same breakfast five times and it remembers.
- **Meal suggestions** — end of the day, 300 calories left, what should you eat? It knows your macros, it knows your history, it suggests something sensible.
- **Calendar view** — see exactly how badly you did last Tuesday. Useful for accountability, mildly distressing.
- **Weight log** — log your weight, it recalculates your daily targets automatically. No manual updating.

---

## Honest disclaimer

AI macro estimates are not lab-accurate. Expect roughly 15–20% error, sometimes more — especially with oil and ghee (Indian cooking uses more of both than it looks like, and the AI knows this and tries to account for it, but it's still an estimate). It is directionally correct. Good enough for real life. Not good enough for a clinical trial.

If you need exact numbers, weigh everything on a food scale like a professional athlete. If you want to be roughly right without the insanity of weighing every spoonful of dal, this works.

---

## Stack

- Next.js 16, TypeScript
- Supabase (Postgres + Auth)
- Claude Sonnet 4 — vision analysis, pattern learning, meal suggestions
- Vercel

---

## Live

[https://thali-nu.vercel.app](https://thali-nu.vercel.app)

---

Built for myself. Open to anyone who actually eats Indian food and is serious about their health — not the kind of "serious" that means eating the same four foods on rotation, but the kind that means you want real data on real meals without spending forty-five minutes logging them.
