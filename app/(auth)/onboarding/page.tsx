'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  calculateMacros,
  GOAL_KCAL_DELTA,
  PROTEIN_PER_KG,
  type ActivityLevel,
  type Goal,
  type MacroOutput,
} from '@/lib/macros/calculate'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Step1 {
  name: string
  age: string
  gender: 'male' | 'female' | ''
  height_cm: string
  weight_kg: string
}

interface Step2 {
  goal: Goal | ''
  target_weight_kg: string
  timeline_weeks: string
  activity_level: ActivityLevel | ''
  diet_type: string
  allergies: string
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Label({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs mb-1" style={{ color: '#6B7280', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
      {children}
    </p>
  )
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className="w-full px-4 py-3 text-sm outline-none border"
      style={{ borderRadius: 12, borderColor: '#E5E7EB', color: '#0F1B2D', ...props.style }}
    />
  )
}

function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className="w-full px-4 py-3 text-sm outline-none border appearance-none"
      style={{ borderRadius: 12, borderColor: '#E5E7EB', color: '#0F1B2D', backgroundColor: '#fff', ...props.style }}
    />
  )
}

function GoalCard({
  label, value, selected, onClick, line1, line2,
}: {
  label: string; value: string; selected: boolean; onClick: () => void
  line1?: string; line2?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full px-4 py-3 text-sm text-left"
      style={{
        borderRadius: 12,
        border: `1.5px solid ${selected ? '#D4F542' : '#E5E7EB'}`,
        backgroundColor: selected ? '#F9FFD6' : '#fff',
        color: '#0F1B2D',
        fontWeight: selected ? 500 : 400,
      }}
    >
      <p style={{ marginBottom: line1 ? 2 : 0 }}>{label}</p>
      {line1 && <p style={{ fontSize: 11, color: '#6B7280', fontWeight: 400 }}>{line1}</p>}
      {line2 && <p style={{ fontSize: 11, color: '#6B7280', fontWeight: 400 }}>{line2}</p>}
    </button>
  )
}

function ProgressDots({ step }: { step: number }) {
  return (
    <div className="flex items-center justify-center gap-2 mb-8">
      {[1, 2, 3].map((s) => (
        <div
          key={s}
          style={{
            width: s === step ? 24 : 8,
            height: 8,
            borderRadius: 999,
            backgroundColor: s <= step ? '#D4F542' : '#E5E7EB',
            transition: 'all 0.2s',
          }}
        />
      ))}
    </div>
  )
}

function MacroRow({ label, value, unit }: { label: string; value: number; unit: string }) {
  return (
    <div className="flex items-center justify-between py-3" style={{ borderBottom: '1px solid #E5E7EB' }}>
      <p className="text-xs" style={{ color: '#6B7280', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
        {label}
      </p>
      <p style={{ color: '#0F1B2D', fontWeight: 500 }}>
        {value}
        <span className="text-xs ml-1" style={{ color: '#6B7280' }}>{unit}</span>
      </p>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function OnboardingPage() {
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')

  const [s1, setS1] = useState<Step1>({
    name: '', age: '', gender: '', height_cm: '', weight_kg: '',
  })

  const [s2, setS2] = useState<Step2>({
    goal: '', target_weight_kg: '', timeline_weeks: '',
    activity_level: '', diet_type: '', allergies: '',
  })

  // ── Derived computed targets ──────────────────────────────────────────────

  function getTargets(): MacroOutput | null {
    if (!s1.age || !s1.height_cm || !s1.weight_kg || !s1.gender || !s2.activity_level || !s2.goal) {
      return null
    }
    return calculateMacros({
      age:            Number(s1.age),
      height_cm:      Number(s1.height_cm),
      weight_kg:      Number(s1.weight_kg),
      gender:         s1.gender as 'male' | 'female',
      activity_level: s2.activity_level as ActivityLevel,
      goal:           s2.goal as Goal,
    })
  }

  const targets = getTargets()

  const goalNeedsTarget = s2.goal && s2.goal !== 'maintain' && s2.goal !== 'recomp'

  // ── Step 1 validation ─────────────────────────────────────────────────────

  function step1Valid() {
    return s1.name && s1.age && s1.gender && s1.height_cm && s1.weight_kg
  }

  function step2Valid() {
    if (!s2.goal || !s2.activity_level || !s2.diet_type) return false
    if (goalNeedsTarget && (!s2.target_weight_kg || !s2.timeline_weeks)) return false
    return true
  }

  // ── Goal card descriptions ────────────────────────────────────────────────

  const wkg = Number(s1.weight_kg) || 0

  function kcalLine(goal: Goal): string {
    const delta = GOAL_KCAL_DELTA[goal]
    if (delta === 0) return 'maintenance calories'
    return delta > 0 ? `+${delta} kcal/day` : `${delta} kcal/day`
  }

  function proteinLine(goal: Goal): string {
    const multiplier = PROTEIN_PER_KG[goal]
    const grams = wkg ? `${Math.round(multiplier * wkg)}g daily` : ''
    return grams ? `${multiplier}g/kg · ${grams}` : `${multiplier}g/kg`
  }

  const goalOptions: { value: Goal; label: string }[] = [
    { value: 'lose_weight', label: 'Lose weight' },
    { value: 'maintain',    label: 'Maintain'    },
    { value: 'recomp',      label: 'Recomp'      },
    { value: 'muscle_gain', label: 'Gain muscle' },
    { value: 'bulk',        label: 'Bulk'        },
  ]

  // ── Submit ────────────────────────────────────────────────────────────────

  async function handleSubmit() {
    if (!targets) return
    setSubmitting(true)
    setSubmitError('')

    const payload = {
      name:             s1.name,
      age:              Number(s1.age),
      height_cm:        Number(s1.height_cm),
      weight_kg:        Number(s1.weight_kg),
      gender:           s1.gender,
      goal:             s2.goal,
      target_weight_kg: goalNeedsTarget ? Number(s2.target_weight_kg) : null,
      timeline_weeks:   goalNeedsTarget ? Number(s2.timeline_weeks) : null,
      activity_level:   s2.activity_level,
      diet_type:        s2.diet_type,
      allergies:        s2.allergies || null,
      ...targets,
    }

    const res = await fetch('/api/onboarding', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    if (res.ok) {
      router.push('/dashboard')
    } else {
      const data = await res.json().catch(() => ({}))
      setSubmitError(data.error ?? 'Something went wrong. Please try again.')
      setSubmitting(false)
    }
  }

  // ── Shared card wrapper ───────────────────────────────────────────────────

  const card = (children: React.ReactNode) => (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ backgroundColor: '#F5F1E8' }}>
      <div className="w-full max-w-sm bg-white p-8" style={{ borderRadius: 20 }}>
        <ProgressDots step={step} />
        {children}
      </div>
    </div>
  )

  // ─────────────────────────────────────────────────────────────────────────
  // Step 1 — About you
  // ─────────────────────────────────────────────────────────────────────────
  if (step === 1) return card(
    <>
      <p className="mb-6 text-lg" style={{ color: '#0F1B2D', fontWeight: 500 }}>About you</p>

      <div className="flex flex-col gap-4">
        <div>
          <Label>Name</Label>
          <Input
            type="text"
            placeholder="Your name"
            value={s1.name}
            onChange={(e) => setS1({ ...s1, name: e.target.value })}
          />
        </div>

        <div>
          <Label>Age</Label>
          <Input
            type="number"
            placeholder="e.g. 28"
            min={10}
            max={120}
            value={s1.age}
            onChange={(e) => setS1({ ...s1, age: e.target.value })}
          />
        </div>

        <div>
          <Label>Gender</Label>
          <Select
            value={s1.gender}
            onChange={(e) => setS1({ ...s1, gender: e.target.value as 'male' | 'female' })}
          >
            <option value="">Select gender</option>
            <option value="male">Male</option>
            <option value="female">Female</option>
          </Select>
        </div>

        <div>
          <Label>Height (cm)</Label>
          <Input
            type="number"
            placeholder="e.g. 170"
            min={100}
            max={250}
            value={s1.height_cm}
            onChange={(e) => setS1({ ...s1, height_cm: e.target.value })}
          />
        </div>

        <div>
          <Label>Current weight (kg)</Label>
          <Input
            type="number"
            placeholder="e.g. 70"
            min={30}
            max={300}
            step="0.1"
            value={s1.weight_kg}
            onChange={(e) => setS1({ ...s1, weight_kg: e.target.value })}
          />
        </div>
      </div>

      <button
        onClick={() => setStep(2)}
        disabled={!step1Valid()}
        className="w-full py-3 text-sm mt-6"
        style={{
          backgroundColor: step1Valid() ? '#D4F542' : '#E5E7EB',
          color: step1Valid() ? '#0F1B2D' : '#9CA3AF',
          borderRadius: 14,
          fontWeight: 500,
        }}
      >
        Continue
      </button>
    </>
  )

  // ─────────────────────────────────────────────────────────────────────────
  // Step 2 — Your goal
  // ─────────────────────────────────────────────────────────────────────────
  if (step === 2) return card(
    <>
      <p className="mb-6 text-lg" style={{ color: '#0F1B2D', fontWeight: 500 }}>Your goal</p>

      <div className="flex flex-col gap-4">
        <div>
          <Label>Goal</Label>
          <div className="flex flex-col gap-2">
            {goalOptions.map(({ value, label }) => (
              <GoalCard
                key={value}
                label={label}
                value={value}
                selected={s2.goal === value}
                onClick={() => setS2({ ...s2, goal: value })}
                line1={kcalLine(value)}
                line2={proteinLine(value)}
              />
            ))}
          </div>
        </div>

        {goalNeedsTarget && (
          <>
            <div>
              <Label>Target weight (kg)</Label>
              <Input
                type="number"
                placeholder="e.g. 65"
                min={30}
                max={300}
                step="0.1"
                value={s2.target_weight_kg}
                onChange={(e) => setS2({ ...s2, target_weight_kg: e.target.value })}
              />
            </div>
            <div>
              <Label>Timeline (weeks)</Label>
              <Input
                type="number"
                placeholder="e.g. 12"
                min={1}
                max={104}
                value={s2.timeline_weeks}
                onChange={(e) => setS2({ ...s2, timeline_weeks: e.target.value })}
              />
            </div>
          </>
        )}

        <div>
          <Label>Activity level</Label>
          <Select
            value={s2.activity_level}
            onChange={(e) => setS2({ ...s2, activity_level: e.target.value as ActivityLevel })}
          >
            <option value="">Select activity level</option>
            <option value="sedentary">Sedentary (desk job, no exercise)</option>
            <option value="light">Lightly active (1–3 days/week)</option>
            <option value="moderate">Moderately active (3–5 days/week)</option>
            <option value="very_active">Very active (6–7 days/week)</option>
            <option value="extra_active">Extra active (twice a day)</option>
          </Select>
        </div>

        <div>
          <Label>Diet type</Label>
          <Select
            value={s2.diet_type}
            onChange={(e) => setS2({ ...s2, diet_type: e.target.value })}
          >
            <option value="">Select diet type</option>
            <option value="non_vegetarian">Non-vegetarian</option>
            <option value="eggetarian">Eggetarian</option>
            <option value="vegetarian">Vegetarian</option>
            <option value="vegan">Vegan</option>
          </Select>
        </div>

        <div>
          <Label>Allergies (optional)</Label>
          <Input
            type="text"
            placeholder="e.g. peanuts, dairy"
            value={s2.allergies}
            onChange={(e) => setS2({ ...s2, allergies: e.target.value })}
          />
        </div>
      </div>

      <div className="flex gap-3 mt-6">
        <button
          onClick={() => setStep(1)}
          className="flex-1 py-3 text-sm"
          style={{ color: '#0F1B2D', borderRadius: 14, border: '1.5px solid #E5E7EB', fontWeight: 500 }}
        >
          Back
        </button>
        <button
          onClick={() => setStep(3)}
          disabled={!step2Valid()}
          className="flex-[2] py-3 text-sm"
          style={{
            backgroundColor: step2Valid() ? '#D4F542' : '#E5E7EB',
            color: step2Valid() ? '#0F1B2D' : '#9CA3AF',
            borderRadius: 14,
            fontWeight: 500,
          }}
        >
          Continue
        </button>
      </div>
    </>
  )

  // ─────────────────────────────────────────────────────────────────────────
  // Step 3 — Review targets
  // ─────────────────────────────────────────────────────────────────────────
  return card(
    <>
      <p className="mb-2 text-lg" style={{ color: '#0F1B2D', fontWeight: 500 }}>Your daily targets</p>
      <p className="mb-6 text-sm" style={{ color: '#6B7280' }}>
        Calculated using Mifflin-St Jeor. You can adjust these later.
      </p>

      {targets && (
        <div className="mb-6">
          <div className="flex items-center justify-between py-4" style={{ borderBottom: '2px solid #E5E7EB' }}>
            <p className="text-xs" style={{ color: '#6B7280', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
              Calories
            </p>
            <p style={{ color: '#0F1B2D', fontWeight: 500, fontSize: 36 }}>
              {targets.daily_calories}
              <span className="text-xs ml-1" style={{ color: '#6B7280', fontSize: 13 }}>kcal</span>
            </p>
          </div>
          <MacroRow label="Protein"  value={targets.daily_protein_g} unit="g" />
          <MacroRow label="Carbs"    value={targets.daily_carbs_g}   unit="g" />
          <MacroRow label="Fat"      value={targets.daily_fat_g}     unit="g" />
          <MacroRow label="Fiber"    value={targets.daily_fiber_g}   unit="g" />
        </div>
      )}

      {submitError && (
        <p className="text-sm text-red-500 mb-4">{submitError}</p>
      )}

      <div className="flex gap-3">
        <button
          onClick={() => setStep(2)}
          className="flex-1 py-3 text-sm"
          style={{ color: '#0F1B2D', borderRadius: 14, border: '1.5px solid #E5E7EB', fontWeight: 500 }}
        >
          Back
        </button>
        <button
          onClick={handleSubmit}
          disabled={submitting || !targets}
          className="flex-[2] py-3 text-sm"
          style={{
            backgroundColor: '#D4F542',
            color: '#0F1B2D',
            borderRadius: 14,
            fontWeight: 500,
            opacity: submitting ? 0.6 : 1,
          }}
        >
          {submitting ? 'Saving…' : 'Start tracking'}
        </button>
      </div>
    </>
  )
}
