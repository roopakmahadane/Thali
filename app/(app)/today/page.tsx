'use client'

import { Suspense, useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { MEAL_SLOTS, type MealSlotKey } from '@/lib/config/meals'
import type { VisionMealItem } from '@/lib/vision'
import type { FrequentFood } from '@/lib/types'
import {
  UNIT_OPTIONS,
  type EditItem,
  type MacrosPerUnit,
  compressImage,
  parseServingGrams,
  blankItem,
  Spinner,
} from '../meal/new/page'

// ─── Types ────────────────────────────────────────────────────────────────────

type SlotState = {
  status: 'loading' | 'loaded' | 'error'
  mealId: string | null
  originalUTC: string | null
  loggedAt: string
  aiNotes: string
  items: EditItem[]
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const IST_MS = (5 * 60 + 30) * 60 * 1000

function formatDateParam(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d, 6, 30, 0))
  return new Intl.DateTimeFormat('en-IN', {
    weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata',
  }).format(date).toLowerCase().replace(/,/g, '')
}

function dateParamToReferenceUTC(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d, 6, 30, 0)).toISOString()
}

function utcToISTTimeStr(utcTs: string): string {
  const ist = new Date(new Date(utcTs).getTime() + IST_MS)
  return `${String(ist.getUTCHours()).padStart(2, '0')}:${String(ist.getUTCMinutes()).padStart(2, '0')}`
}

function timeToISO(timeStr: string, referenceUTC: string): string {
  const ist = new Date(new Date(referenceUTC).getTime() + IST_MS)
  const [h, m] = timeStr.split(':').map(Number)
  const istDt = new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate(), h, m, 0))
  return new Date(istDt.getTime() - IST_MS).toISOString()
}

function currentTimeIST(): string {
  const ist = new Date(Date.now() + IST_MS)
  return `${String(ist.getUTCHours()).padStart(2, '0')}:${String(ist.getUTCMinutes()).padStart(2, '0')}`
}

function loadingSlotState(slotKey: MealSlotKey): SlotState {
  return { status: 'loading', mealId: null, originalUTC: null, loggedAt: currentTimeIST(), aiNotes: '', items: [] }
}

// ─── Main content ─────────────────────────────────────────────────────────────

function TodayContent() {
  const router       = useRouter()
  const searchParams = useSearchParams()

  const slotParam   = searchParams.get('slot')
  const dateParam   = searchParams.get('date')
  const validKeys   = MEAL_SLOTS.map((s) => s.key) as string[]
  const initialSlot = (validKeys.includes(slotParam ?? '') ? slotParam : 'breakfast') as MealSlotKey

  const addPhotoRef  = useRef<HTMLInputElement>(null)
  const fetchedSlots = useRef<Set<MealSlotKey>>(new Set())
  const videoRef     = useRef<HTMLVideoElement>(null)
  const codeReaderRef = useRef<{ reset(): void } | null>(null)

  const [activeSlot,        setActiveSlot]        = useState<MealSlotKey>(initialSlot)
  const [cache,             setCache]              = useState<Partial<Record<MealSlotKey, SlotState>>>({})
  const [isSaving,          setIsSaving]           = useState(false)
  const [isDeleting,        setIsDeleting]         = useState(false)
  const [isPhotoAnalyzing,  setIsPhotoAnalyzing]   = useState(false)
  const [error,             setError]              = useState<string | null>(null)
  const [dishHint,          setDishHint]           = useState('')
  const [textDescription,   setTextDescription]    = useState('')
  const [quickFoods,        setQuickFoods]         = useState<FrequentFood[]>([])
  const [isTextAnalyzing,   setIsTextAnalyzing]    = useState(false)
  const [isScanning,        setIsScanning]         = useState(false)
  const [isFetchingProduct, setIsFetchingProduct]  = useState(false)
  const [scanError,         setScanError]          = useState<string | null>(null)

  // ── Fetch slot data ───────────────────────────────────────────────────────

  useEffect(() => {
    if (fetchedSlots.current.has(activeSlot)) return
    fetchedSlots.current.add(activeSlot)

    setCache((prev) => ({ ...prev, [activeSlot]: loadingSlotState(activeSlot) }))

    fetch(`/api/meals/today?slot=${activeSlot}${dateParam ? `&date=${dateParam}` : ''}`)
      .then((r) => r.json())
      .then(({ meal, items: fetchedItems }: {
        meal: { id: string; meal_type: string; eaten_at: string; ai_notes: string | null } | null
        items: {
          item_name: string; quantity: number; unit: string
          calories: number; protein_g: number; carbs_g: number
          fat_g: number; fiber_g: number; sodium_mg: number; source: string
        }[]
      }) => {
        const editItems: EditItem[] = (fetchedItems ?? []).map((item) => {
          const base: VisionMealItem = {
            item_name:  item.item_name,
            quantity:   Number(item.quantity),
            unit:       item.unit,
            calories:   item.calories,
            protein_g:  Number(item.protein_g),
            carbs_g:    Number(item.carbs_g),
            fat_g:      Number(item.fat_g),
            fiber_g:    Number(item.fiber_g),
            sodium_mg:  Number(item.sodium_mg),
            confidence: 'high',
          }
          return { ...base, source: (item.source as 'ai' | 'manual') ?? 'manual', _base: base }
        })
        setCache((prev) => ({
          ...prev,
          [activeSlot]: {
            status:      'loaded',
            mealId:      meal?.id ?? null,
            originalUTC: meal?.eaten_at ?? null,
            loggedAt:    meal ? utcToISTTimeStr(meal.eaten_at) : currentTimeIST(),
            aiNotes:     meal?.ai_notes ?? '',
            items:       editItems,
          },
        }))
      })
      .catch(() => {
        setCache((prev) => ({ ...prev, [activeSlot]: { ...loadingSlotState(activeSlot), status: 'error' } }))
      })
  }, [activeSlot])

  // ── Fetch quick foods (once on mount) ─────────────────────────────────────

  useEffect(() => {
    fetch('/api/frequent-foods')
      .then((r) => r.json())
      .then((d) => setQuickFoods(d.foods ?? []))
      .catch(() => {})
  }, [])

  // ── ZXing barcode scanning ────────────────────────────────────────────────

  useEffect(() => {
    if (!isScanning || !videoRef.current) return
    let active = true
    ;(async () => {
      try {
        const { BrowserMultiFormatReader } = await import('@zxing/browser')
        const codeReader = new BrowserMultiFormatReader()
        let scanControls: { stop(): void } | null = null
        scanControls = await codeReader.decodeFromVideoDevice(undefined, videoRef.current!, (result) => {
          if (!active || !result) return
          const barcode = result.getText()
          scanControls?.stop()
          setIsScanning(false)
          handleBarcodeFetched(barcode)
        })
        codeReaderRef.current = { reset: () => scanControls?.stop() }
      } catch {
        if (active) {
          setScanError("Couldn't access camera")
          setIsScanning(false)
        }
      }
    })()
    return () => {
      active = false
      codeReaderRef.current?.reset()
    }
  }, [isScanning])

  const slotState  = cache[activeSlot]
  const slotConfig = MEAL_SLOTS.find((s) => s.key === activeSlot)!
  const busy       = isSaving || isDeleting

  // ── Cache mutators ────────────────────────────────────────────────────────

  function patchSlot(patch: Partial<SlotState>) {
    setCache((prev) => ({ ...prev, [activeSlot]: { ...prev[activeSlot]!, ...patch } }))
  }

  function updateItems(updater: (prev: EditItem[]) => EditItem[]) {
    setCache((prev) => {
      const cur = prev[activeSlot]
      if (!cur) return prev
      return { ...prev, [activeSlot]: { ...cur, items: updater(cur.items) } }
    })
  }

  function ensureLoaded() {
    setCache((prev) => {
      const cur = prev[activeSlot]
      if (!cur || cur.status === 'loaded') return prev
      return { ...prev, [activeSlot]: { ...cur, status: 'loaded' } }
    })
  }

  // ── Photo analysis ────────────────────────────────────────────────────────

  async function handleAddPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setIsPhotoAnalyzing(true)
    setError(null)
    try {
      const compressed = await compressImage(file)
      const fd = new FormData()
      fd.append('photo', compressed, 'photo.jpg')
      fd.append('meal_slot', activeSlot)
      if (dishHint.trim()) fd.append('dish_hint', dishHint.trim())
      const res = await fetch('/api/meals/analyze', { method: 'POST', body: fd })
      if (!res.ok) throw new Error(await res.text())
      const result = await res.json()
      const newItems: EditItem[] = (result.items as VisionMealItem[]).map((item) => ({
        ...item, source: 'ai' as const, _base: { ...item },
      }))
      updateItems((prev) => [...prev, ...newItems])
      if (result.ai_notes) {
        setCache((prev) => {
          const cur = prev[activeSlot]
          if (!cur || cur.aiNotes) return prev
          return { ...prev, [activeSlot]: { ...cur, aiNotes: result.ai_notes } }
        })
      }
      ensureLoaded()
    } catch {
      setError("couldn't analyze the photo. try again.")
    } finally {
      setIsPhotoAnalyzing(false)
    }
  }

  // ── Text analysis ─────────────────────────────────────────────────────────

  async function handleTextAnalyze() {
    if (!textDescription.trim()) return
    setIsTextAnalyzing(true)
    setError(null)
    try {
      const res = await fetch('/api/meals/text-analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description: textDescription.trim(),
          meal_slot: activeSlot,
          ...(dishHint.trim() ? { dish_hint: dishHint.trim() } : {}),
        }),
      })
      if (!res.ok) throw new Error(await res.text())
      const result = await res.json()
      const newItems: EditItem[] = (result.items as VisionMealItem[]).map((item) => ({
        ...item, source: 'ai' as const, _base: { ...item },
      }))
      updateItems((prev) => [...prev, ...newItems])
      if (result.ai_notes) {
        setCache((prev) => {
          const cur = prev[activeSlot]
          if (!cur || cur.aiNotes) return prev
          return { ...prev, [activeSlot]: { ...cur, aiNotes: result.ai_notes } }
        })
      }
      setTextDescription('')
      ensureLoaded()
    } catch {
      setError("couldn't analyze the description. try again.")
    } finally {
      setIsTextAnalyzing(false)
    }
  }

  // ── Barcode ───────────────────────────────────────────────────────────────

  function handleStopScan() {
    codeReaderRef.current?.reset()
    codeReaderRef.current = null
    setIsScanning(false)
  }

  async function handleBarcodeFetched(barcode: string) {
    setIsFetchingProduct(true)
    setScanError(null)
    try {
      const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${barcode}.json`)
      const data = await res.json()
      if (data.status === 0 || !data.product) {
        setScanError('Product not found. Enter manually.')
        return
      }
      const p = data.product
      const n = p.nutriments ?? {}
      const servingG = p.serving_size ? parseServingGrams(String(p.serving_size)) : 100
      const f = servingG / 100
      const base: VisionMealItem = {
        item_name:  p.product_name ?? 'Unknown product',
        quantity:   servingG,
        unit:       'g',
        calories:   Math.round((n['energy-kcal_100g'] ?? 0) * f),
        protein_g:  Math.round((n.protein_100g        ?? 0) * f * 10) / 10,
        carbs_g:    Math.round((n.carbohydrates_100g  ?? 0) * f * 10) / 10,
        fat_g:      Math.round((n.fat_100g            ?? 0) * f * 10) / 10,
        fiber_g:    Math.round((n.fiber_100g          ?? 0) * f * 10) / 10,
        sodium_mg:  Math.round((n.sodium_100g         ?? 0) * f * 1000),
        confidence: 'high',
      }
      updateItems((prev) => [...prev, { ...base, source: 'manual' as const, _base: base, _fromBarcode: true }])
      ensureLoaded()
    } catch {
      setScanError("Couldn't fetch product. Try again.")
    } finally {
      setIsFetchingProduct(false)
    }
  }

  // ── Quick add ─────────────────────────────────────────────────────────────

  function handleQuickAdd(food: FrequentFood) {
    const macros = food.macros_per_unit_json as MacrosPerUnit | null
    if (!macros || !food.typical_quantity) return
    const qty = food.typical_quantity
    const base: VisionMealItem = {
      item_name:  food.name,
      quantity:   qty,
      unit:       food.typical_unit ?? 'g',
      calories:   Math.round(macros.calories_per_unit  * qty),
      protein_g:  Math.round(macros.protein_g_per_unit * qty * 10) / 10,
      carbs_g:    Math.round(macros.carbs_g_per_unit   * qty * 10) / 10,
      fat_g:      Math.round(macros.fat_g_per_unit     * qty * 10) / 10,
      fiber_g:    Math.round(macros.fiber_g_per_unit   * qty * 10) / 10,
      sodium_mg:  Math.round(macros.sodium_mg_per_unit * qty),
      confidence: 'high',
    }
    updateItems((prev) => [...prev, { ...base, source: 'manual' as const, _base: base }])
    ensureLoaded()
  }

  // ── Item handlers ─────────────────────────────────────────────────────────

  function handleQtyChange(idx: number, newQty: number) {
    updateItems((prev) =>
      prev.map((item, i) => {
        if (i !== idx) return item
        if (!newQty || item._base.quantity === 0) return { ...item, quantity: newQty }
        const r = newQty / item._base.quantity
        return {
          ...item,
          quantity:  newQty,
          calories:  Math.round(item._base.calories  * r),
          protein_g: Math.round(item._base.protein_g * r * 10) / 10,
          carbs_g:   Math.round(item._base.carbs_g   * r * 10) / 10,
          fat_g:     Math.round(item._base.fat_g     * r * 10) / 10,
          fiber_g:   Math.round(item._base.fiber_g   * r * 10) / 10,
          sodium_mg: Math.round(item._base.sodium_mg * r),
        }
      })
    )
  }

  function handleMacroChange(
    idx: number,
    field: 'calories' | 'protein_g' | 'carbs_g' | 'fat_g' | 'fiber_g',
    value: number,
  ) {
    updateItems((prev) => prev.map((item, i) => i === idx ? { ...item, [field]: value } : item))
  }

  function handleDeleteItem(idx: number) {
    updateItems((prev) => prev.filter((_, i) => i !== idx))
  }

  function handleAddItem() {
    updateItems((prev) => [...prev, blankItem()])
  }

  function handleAddManually() {
    if (slotState?.status !== 'loaded') return
    updateItems((prev) => [...prev, blankItem()])
  }

  // ── Save ──────────────────────────────────────────────────────────────────

  async function handleSave() {
    if (slotState?.status !== 'loaded') return
    setIsSaving(true)
    setError(null)
    try {
      const referenceUTC = slotState.originalUTC
        ?? (dateParam ? dateParamToReferenceUTC(dateParam) : new Date().toISOString())
      const eaten_at = timeToISO(slotState.loggedAt, referenceUTC)
      const itemsPayload = slotState.items.map(({ _base: _b, _fromBarcode: _fb, ...rest }) => rest)

      if (slotState.mealId) {
        const res = await fetch(`/api/meals/${slotState.mealId}`, {
          method:  'PUT',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ meal_type: activeSlot, eaten_at, items: itemsPayload, ai_notes: slotState.aiNotes || null }),
        })
        if (!res.ok) throw new Error()
      } else {
        const res = await fetch('/api/meals/save', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ meal_slot: activeSlot, eaten_at, items: itemsPayload, ai_notes: slotState.aiNotes || null }),
        })
        if (!res.ok) throw new Error()
        const { meal_id } = await res.json()
        patchSlot({ mealId: meal_id })
      }
      router.push(dateParam ? '/calendar' : '/dashboard')
    } catch {
      setError("couldn't save changes")
      setIsSaving(false)
    }
  }

  // ── Delete ────────────────────────────────────────────────────────────────

  async function handleDelete() {
    if (!slotState?.mealId) return
    setIsDeleting(true)
    try {
      const res = await fetch(`/api/meals/${slotState.mealId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
      router.push(dateParam ? '/calendar' : '/dashboard')
    } catch {
      setError("couldn't delete meal")
      setIsDeleting(false)
    }
  }

  // ── Totals ────────────────────────────────────────────────────────────────

  const activeItems = slotState?.status === 'loaded' ? slotState.items : []
  const totals = activeItems.reduce(
    (acc, item) => ({
      calories:  acc.calories  + (item.calories  || 0),
      protein_g: acc.protein_g + (item.protein_g || 0),
      carbs_g:   acc.carbs_g   + (item.carbs_g   || 0),
      fat_g:     acc.fat_g     + (item.fat_g      || 0),
    }),
    { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }
  )

  // ── Shared sub-sections ───────────────────────────────────────────────────

  // Text describe card — shown in both empty and items states
  const textDescribeCard = (
    <div style={{ backgroundColor: '#fff', borderRadius: 16, padding: '14px 16px', width: '100%' }}>
      <p style={{ fontSize: 11, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
        describe what you ate
      </p>
      <input
        type="text"
        value={textDescription}
        onChange={(e) => setTextDescription(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') handleTextAnalyze() }}
        placeholder="e.g. 3 roti, bhindi masala, 1 cup rice"
        disabled={busy}
        style={{
          width: '100%', fontSize: 14, color: '#0F1B2D',
          border: '1px solid #E5E7EB', borderRadius: 10,
          padding: '10px 12px', outline: 'none',
          backgroundColor: '#F9F9F9', marginBottom: 10,
        }}
      />
      <button
        onClick={handleTextAnalyze}
        disabled={!textDescription.trim() || isTextAnalyzing || busy}
        className="flex items-center justify-center gap-2 w-full"
        style={{
          backgroundColor: textDescription.trim() && !isTextAnalyzing && !busy ? '#D4F542' : '#E5E7EB',
          color: textDescription.trim() && !isTextAnalyzing && !busy ? '#0F1B2D' : '#9CA3AF',
          borderRadius: 10, padding: '10px 0', fontSize: 13, fontWeight: 500,
          border: 'none', cursor: textDescription.trim() && !isTextAnalyzing && !busy ? 'pointer' : 'not-allowed',
        }}
      >
        {isTextAnalyzing ? <><Spinner /> calculating…</> : 'calculate'}
      </button>
    </div>
  )

  // Quick add chips — shown in both states
  const quickAddChips = quickFoods.length > 0 ? (
    <div style={{ width: '100%' }}>
      <p style={{ fontSize: 11, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
        quick add
      </p>
      <div style={{ display: 'flex', gap: 8, overflowX: 'auto', scrollbarWidth: 'none' as React.CSSProperties['scrollbarWidth'] }}>
        {quickFoods.map((food) => (
          <button
            key={food.id}
            onClick={() => handleQuickAdd(food)}
            disabled={busy}
            style={{
              flexShrink: 0, backgroundColor: '#fff', border: '1px solid #E5E7EB',
              borderRadius: 20, padding: '6px 12px', fontSize: 13, color: '#0F1B2D',
              cursor: busy ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap',
            }}
          >
            {food.name}
          </button>
        ))}
      </div>
    </div>
  ) : null

  // ── UI ────────────────────────────────────────────────────────────────────

  return (
    <>
      {/* ── Overlays ── */}
      {isScanning && (
        <div
          style={{
            position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.92)',
            zIndex: 50, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', padding: 24,
          }}
        >
          <video
            ref={videoRef}
            style={{ width: '100%', maxWidth: 400, borderRadius: 12, backgroundColor: '#000', aspectRatio: '4/3', objectFit: 'cover' }}
            muted
            playsInline
          />
          <p style={{ color: '#9CA3AF', fontSize: 14, marginTop: 16 }}>Point at a barcode</p>
          <button
            onClick={handleStopScan}
            style={{ marginTop: 20, color: '#fff', fontSize: 14, background: 'none', border: '1px solid rgba(255,255,255,0.3)', borderRadius: 10, padding: '10px 24px', cursor: 'pointer' }}
          >
            cancel
          </button>
        </div>
      )}
      {isFetchingProduct && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ backgroundColor: '#fff', borderRadius: 20, padding: 24, textAlign: 'center' }}>
            <Spinner />
            <p style={{ marginTop: 12, fontSize: 14, color: '#0F1B2D' }}>looking up product…</p>
          </div>
        </div>
      )}

      <div className="min-h-screen px-4 pt-6 pb-8" style={{ backgroundColor: '#F5F1E8' }}>

        {/* Header */}
        <div className="flex items-center mb-6">
          <button
            onClick={() => router.back()}
            style={{ color: '#0F1B2D', lineHeight: 1, background: 'none', border: 'none', padding: 0, cursor: 'pointer', marginRight: 12 }}
          >
            <i className="ti ti-arrow-left" style={{ fontSize: 22 }} />
          </button>
          <p style={{ fontSize: 17, fontWeight: 500, color: '#0F1B2D', flex: 1 }}>
            {dateParam ? formatDateParam(dateParam) : 'today'}
          </p>
          <button
            onClick={handleDelete}
            disabled={busy || !slotState?.mealId}
            style={{
              background: 'none', border: 'none',
              cursor: busy || !slotState?.mealId ? 'not-allowed' : 'pointer',
              color: slotState?.mealId ? '#DC2626' : '#D1D5DB',
              padding: '0 0 0 8px', lineHeight: 1,
            }}
          >
            {isDeleting
              ? <span style={{ fontSize: 12, color: '#DC2626' }}>deleting…</span>
              : <i className="ti ti-trash" style={{ fontSize: 18 }} />
            }
          </button>
        </div>

        {/* Slot tabs */}
        <div className="flex gap-2 overflow-x-auto pb-2 mb-5" style={{ scrollbarWidth: 'none' as React.CSSProperties['scrollbarWidth'] }}>
          {MEAL_SLOTS.map((slot) => {
            const active = activeSlot === slot.key
            return (
              <button
                key={slot.key}
                onClick={() => { setActiveSlot(slot.key); setError(null) }}
                disabled={busy}
                className="flex-shrink-0 px-4 py-2 text-sm"
                style={{
                  borderRadius: 999,
                  fontWeight: active ? 500 : 400,
                  backgroundColor: active ? slot.color : '#fff',
                  color: active ? '#fff' : '#6B7280',
                  border: 'none',
                  cursor: busy ? 'not-allowed' : 'pointer',
                }}
              >
                {slot.label}
              </button>
            )
          })}
        </div>

        {/* Content area */}
        {(() => {
          if (!slotState || slotState.status === 'loading') {
            return (
              <div className="flex justify-center pt-10">
                <Spinner />
              </div>
            )
          }

          if (slotState.status === 'error') {
            return (
              <p style={{ fontSize: 14, color: '#6B7280', textAlign: 'center', marginTop: 40 }}>
                couldn't load {slotConfig.label.toLowerCase()}
              </p>
            )
          }

          const { items, loggedAt, aiNotes } = slotState

          if (items.length === 0) {
            // ── Empty state ──────────────────────────────────────────────────
            return (
              <div className="flex flex-col items-center gap-4 pt-8">
                <p style={{ fontSize: 14, color: '#6B7280' }}>
                  nothing logged for {slotConfig.label.toLowerCase()}
                </p>

                {/* Dish hint */}
                <input
                  type="text"
                  value={dishHint}
                  onChange={(e) => setDishHint(e.target.value)}
                  placeholder="What are you eating? (optional)"
                  style={{
                    width: '100%', backgroundColor: '#fff', border: '1px solid #E5E7EB',
                    borderRadius: 12, padding: '12px 14px', fontSize: 14, color: '#0F1B2D', outline: 'none',
                  }}
                />

                {/* Snap a meal */}
                <button
                  onClick={() => addPhotoRef.current?.click()}
                  disabled={isPhotoAnalyzing || busy}
                  className="flex items-center justify-center gap-2 w-full"
                  style={{
                    backgroundColor: '#D4F542', color: '#0F1B2D', borderRadius: 14,
                    padding: '12px 0', fontSize: 13, fontWeight: 500, border: 'none',
                    cursor: isPhotoAnalyzing || busy ? 'not-allowed' : 'pointer',
                  }}
                >
                  {isPhotoAnalyzing
                    ? <><Spinner /><span style={{ marginLeft: 6 }}>analyzing…</span></>
                    : <><i className="ti ti-camera" style={{ fontSize: 16 }} /><span style={{ marginLeft: 4 }}>snap a meal</span></>
                  }
                </button>

                {/* Scan barcode */}
                <button
                  onClick={() => { setScanError(null); setIsScanning(true) }}
                  disabled={busy}
                  className="flex items-center justify-center gap-2 w-full"
                  style={{
                    backgroundColor: '#fff', border: '1px solid #E5E7EB', borderRadius: 14,
                    padding: '12px 0', fontSize: 13, color: '#0F1B2D',
                    cursor: busy ? 'not-allowed' : 'pointer',
                  }}
                >
                  <i className="ti ti-barcode" style={{ fontSize: 18 }} />
                  scan barcode
                </button>
                {scanError && <p style={{ fontSize: 13, color: '#DC2626', textAlign: 'center' }}>{scanError}</p>}

                {/* Text describe */}
                {textDescribeCard}

                {/* Quick add */}
                {quickAddChips}

                {/* Add manually */}
                <button
                  onClick={handleAddManually}
                  style={{ fontSize: 13, color: '#6B7280', background: 'none', border: 'none', cursor: 'pointer' }}
                >
                  add manually
                </button>

                {error && <p style={{ fontSize: 13, color: '#DC2626' }}>{error}</p>}
              </div>
            )
          }

          // ── Items present ────────────────────────────────────────────────
          return (
            <>
              {/* Time picker */}
              <div
                className="flex items-center justify-between mb-4"
                style={{ backgroundColor: '#fff', borderRadius: 12, padding: '12px 16px' }}
              >
                <div className="flex items-center gap-2">
                  <div style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: slotConfig.color, flexShrink: 0 }} />
                  <p style={{ fontSize: 14, color: '#0F1B2D', fontWeight: 500 }}>{slotConfig.label}</p>
                </div>
                <div className="flex items-center gap-2">
                  <p style={{ fontSize: 13, color: '#6B7280' }}>logged at</p>
                  <input
                    type="time"
                    value={loggedAt}
                    onChange={(e) => patchSlot({ loggedAt: e.target.value })}
                    disabled={busy}
                    style={{ fontSize: 13, color: '#0F1B2D', border: 'none', background: 'transparent', fontWeight: 500, outline: 'none' }}
                  />
                </div>
              </div>

              {/* Items list */}
              <div className="flex flex-col gap-2 mb-3">
                {items.map((item, idx) => (
                  <div key={idx} style={{ backgroundColor: '#fff', borderRadius: 12, padding: '12px 14px' }}>
                    <div className="flex items-center justify-between mb-2">
                      <input
                        value={item.item_name}
                        onChange={(e) => updateItems((prev) => prev.map((it, i) => i === idx ? { ...it, item_name: e.target.value } : it))}
                        placeholder="Item name"
                        disabled={busy}
                        style={{ fontSize: 14, fontWeight: 500, color: '#0F1B2D', border: 'none', outline: 'none', background: 'transparent', flex: 1 }}
                      />
                      <button
                        onClick={() => handleDeleteItem(idx)}
                        disabled={busy}
                        style={{ background: 'none', border: 'none', cursor: busy ? 'not-allowed' : 'pointer', padding: '0 0 0 8px', lineHeight: 1 }}
                      >
                        <i className="ti ti-trash" style={{ fontSize: 16, color: '#DC2626' }} />
                      </button>
                    </div>

                    {/* Qty + unit + cal */}
                    <div className="flex items-center gap-2 mb-2">
                      <input
                        type="number" value={item.quantity} min={0} step="any"
                        onChange={(e) => handleQtyChange(idx, parseFloat(e.target.value) || 0)}
                        disabled={busy}
                        style={{ width: 64, fontSize: 13, color: '#0F1B2D', border: '1px solid #E5E7EB', borderRadius: 8, padding: '4px 8px', outline: 'none', MozAppearance: 'textfield' }}
                      />
                      <select
                        value={item.unit} disabled={busy}
                        onChange={(e) => updateItems((prev) => prev.map((it, i) => i === idx ? { ...it, unit: e.target.value } : it))}
                        style={{ flex: 1, minWidth: 0, fontSize: 13, color: '#6B7280', border: '1px solid #E5E7EB', borderRadius: 8, padding: '4px 6px', outline: 'none', backgroundColor: '#fff' }}
                      >
                        {(UNIT_OPTIONS.includes(item.unit as typeof UNIT_OPTIONS[number])
                          ? UNIT_OPTIONS
                          : [item.unit, ...UNIT_OPTIONS]
                        ).map((u) => <option key={u} value={u}>{u}</option>)}
                      </select>
                      <input
                        type="number" value={item.calories} min={0} step="any" disabled={busy}
                        onChange={(e) => handleMacroChange(idx, 'calories', parseFloat(e.target.value) || 0)}
                        style={{
                          width: 60, fontSize: 13, textAlign: 'right',
                          border: `1px solid ${item._fromBarcode && item.calories === 0 ? '#F59E0B' : '#E5E7EB'}`,
                          borderRadius: 8, padding: '4px 6px', outline: 'none', MozAppearance: 'textfield',
                        }}
                      />
                      <p style={{ fontSize: 13, color: '#6B7280' }}>kcal</p>
                    </div>

                    {/* P / C / F */}
                    <div className="flex items-center gap-2 mb-1">
                      {(['protein_g', 'carbs_g', 'fat_g'] as const).map((field) => (
                        <div key={field} className="flex items-center gap-1">
                          <p style={{ fontSize: 11, color: '#6B7280' }}>{field === 'protein_g' ? 'P' : field === 'carbs_g' ? 'C' : 'F'}</p>
                          <input
                            type="number" value={item[field]} min={0} step="any" disabled={busy}
                            onChange={(e) => handleMacroChange(idx, field, parseFloat(e.target.value) || 0)}
                            style={{
                              width: 52, fontSize: 13, textAlign: 'right',
                              border: `1px solid ${item._fromBarcode && item[field] === 0 ? '#F59E0B' : '#E5E7EB'}`,
                              borderRadius: 8, padding: '4px 6px', outline: 'none', MozAppearance: 'textfield',
                            }}
                          />
                        </div>
                      ))}
                      <p style={{ fontSize: 11, color: '#6B7280' }}>g</p>
                    </div>

                    {/* Fiber */}
                    <div className="flex items-center gap-1">
                      <p style={{ fontSize: 11, color: '#9CA3AF' }}>fiber</p>
                      <input
                        type="number" value={item.fiber_g} min={0} step="any" disabled={busy}
                        onChange={(e) => handleMacroChange(idx, 'fiber_g', parseFloat(e.target.value) || 0)}
                        style={{
                          width: 52, fontSize: 13, textAlign: 'right',
                          border: `1px solid ${item._fromBarcode && item.fiber_g === 0 ? '#F59E0B' : '#E5E7EB'}`,
                          borderRadius: 8, padding: '4px 6px', outline: 'none', MozAppearance: 'textfield',
                        }}
                      />
                      <p style={{ fontSize: 11, color: '#9CA3AF' }}>g</p>
                    </div>

                    {/* Confidence badge */}
                    {item.confidence === 'low' && (
                      <span className="inline-block mt-2" style={{ fontSize: 11, color: '#F59E0B', backgroundColor: '#FEF3C7', borderRadius: 999, padding: '2px 8px' }}>
                        uncertain
                      </span>
                    )}
                  </div>
                ))}
              </div>

              {/* Add item / add photo / scan barcode row */}
              <div className="flex items-center gap-4 mb-3">
                <button
                  onClick={handleAddItem} disabled={busy}
                  style={{ fontSize: 13, color: '#6B7280', background: 'none', border: 'none', cursor: busy ? 'not-allowed' : 'pointer', padding: '4px 0' }}
                >
                  + add item
                </button>
                <button
                  onClick={() => addPhotoRef.current?.click()}
                  disabled={busy || isPhotoAnalyzing}
                  className="flex items-center gap-1"
                  style={{ fontSize: 13, color: '#6B7280', background: 'none', border: 'none', cursor: busy || isPhotoAnalyzing ? 'not-allowed' : 'pointer', padding: '4px 0' }}
                >
                  {isPhotoAnalyzing
                    ? <><Spinner /><span style={{ marginLeft: 4 }}>analyzing…</span></>
                    : <><i className="ti ti-camera" style={{ fontSize: 15 }} /><span style={{ marginLeft: 2 }}>add photo</span></>
                  }
                </button>
                <button
                  onClick={() => { setScanError(null); setIsScanning(true) }}
                  disabled={busy}
                  className="flex items-center gap-1"
                  style={{ fontSize: 13, color: '#6B7280', background: 'none', border: 'none', cursor: busy ? 'not-allowed' : 'pointer', padding: '4px 0' }}
                >
                  <i className="ti ti-barcode" style={{ fontSize: 15 }} />
                  <span style={{ marginLeft: 2 }}>barcode</span>
                </button>
              </div>
              {scanError && <p style={{ fontSize: 13, color: '#DC2626', marginBottom: 8 }}>{scanError}</p>}

              {/* Text describe */}
              <div className="mb-3">{textDescribeCard}</div>

              {/* Quick add */}
              {quickAddChips && <div className="mb-3">{quickAddChips}</div>}

              {/* Totals bar */}
              <div style={{ backgroundColor: '#fff', borderRadius: 12, padding: '12px 14px', marginBottom: 8 }}>
                <p style={{ fontSize: 13, color: '#6B7280' }}>
                  {Math.round(totals.calories)} kcal
                  {' · '}P {Math.round(totals.protein_g * 10) / 10}g
                  {' · '}C {Math.round(totals.carbs_g   * 10) / 10}g
                  {' · '}F {Math.round(totals.fat_g     * 10) / 10}g
                </p>
              </div>

              {/* AI notes */}
              {aiNotes && (
                <p className="mb-4" style={{ fontSize: 12, color: '#6B7280', fontStyle: 'italic' }}>
                  AI note: {aiNotes}
                </p>
              )}

              {/* Error */}
              {error && <p className="text-sm mb-3" style={{ color: '#DC2626' }}>{error}</p>}

              {/* Save */}
              <button
                onClick={handleSave}
                disabled={busy || items.length === 0}
                className="flex items-center justify-center gap-2 w-full"
                style={{
                  backgroundColor: busy || items.length === 0 ? '#E5E7EB' : '#D4F542',
                  color:            busy || items.length === 0 ? '#9CA3AF' : '#0F1B2D',
                  borderRadius: 14, padding: '13px 0', fontSize: 13, fontWeight: 500,
                  border: 'none', cursor: busy || items.length === 0 ? 'not-allowed' : 'pointer',
                }}
              >
                {isSaving ? <><Spinner /> saving…</> : 'save changes'}
              </button>
            </>
          )
        })()}

        {/* Hidden file input — shared between all photo entry points */}
        <input
          ref={addPhotoRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={handleAddPhoto}
        />

      </div>
    </>
  )
}

// ─── Page (Suspense wrapper for useSearchParams) ───────────────────────────────

export default function TodayPage() {
  return (
    <Suspense fallback={<div style={{ backgroundColor: '#F5F1E8', minHeight: '100vh' }} />}>
      <TodayContent />
    </Suspense>
  )
}
