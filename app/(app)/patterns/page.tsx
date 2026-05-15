import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import type { UserPattern, PatternCategory } from '@/lib/types'

const CATEGORY_CONFIG: Record<PatternCategory, { icon: string; color: string; label: string }> = {
  preference:  { icon: 'ti-heart',  color: '#DC2626', label: 'Preference' },
  portion:     { icon: 'ti-scale',  color: '#6366F1', label: 'Portion' },
  time:        { icon: 'ti-clock',  color: '#F59E0B', label: 'Time' },
  restriction: { icon: 'ti-ban',    color: '#6B7280', label: 'Restriction' },
}

const CATEGORIES: PatternCategory[] = ['preference', 'portion', 'time', 'restriction']

function ConfidenceBadge({ confidence }: { confidence: string }) {
  const styles: Record<string, { bg: string; color: string }> = {
    high:   { bg: '#D4F542', color: '#0F1B2D' },
    medium: { bg: '#FEF3C7', color: '#F59E0B' },
    low:    { bg: '#F3F4F6', color: '#6B7280' },
  }
  const s = styles[confidence] ?? styles.low
  return (
    <span style={{ fontSize: 11, backgroundColor: s.bg, color: s.color, borderRadius: 999, padding: '2px 8px', flexShrink: 0 }}>
      {confidence}
    </span>
  )
}

export default async function PatternsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: patterns }, { count: mealCount }] = await Promise.all([
    supabase
      .from('user_patterns')
      .select('*')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false }),
    supabase
      .from('meals')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id),
  ])

  const today = new Date().toLocaleDateString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: 'numeric',
    month: 'long',
  })

  const isEmpty = !patterns || patterns.length === 0

  return (
    <div className="min-h-screen px-4 pt-6 pb-24" style={{ backgroundColor: '#F5F1E8' }}>

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <p style={{ fontSize: 22, fontWeight: 500, color: '#0F1B2D' }}>patterns</p>
        <p style={{ fontSize: 13, color: '#6B7280' }}>{today}</p>
      </div>

      {isEmpty ? (
        <div style={{ backgroundColor: '#fff', borderRadius: 20, padding: '32px 24px', textAlign: 'center' }}>
          <i className="ti ti-brain" style={{ fontSize: 32, color: '#6B7280', display: 'block', marginBottom: 12 }} />
          <p style={{ fontSize: 14, color: '#6B7280', marginBottom: 6 }}>
            Log {Math.max(0, 5 - (mealCount ?? 0))} more meal{(5 - (mealCount ?? 0)) !== 1 ? 's' : ''} to unlock pattern insights
          </p>
          <p style={{ fontSize: 12, color: '#9CA3AF' }}>
            Thali learns what you eat, when you eat it, and how much.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {CATEGORIES.map((cat) => {
            const catPatterns = (patterns as UserPattern[]).filter((p) => p.category === cat)
            if (catPatterns.length === 0) return null
            const cfg = CATEGORY_CONFIG[cat]
            return (
              <div key={cat}>
                <div className="flex items-center gap-2 mb-2">
                  <i className={`ti ${cfg.icon}`} style={{ fontSize: 14, color: cfg.color }} />
                  <p style={{ fontSize: 11, color: cfg.color, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    {cfg.label}
                  </p>
                </div>
                <div className="flex flex-col gap-2">
                  {catPatterns.map((p) => (
                    <div
                      key={p.id}
                      className="flex items-center justify-between"
                      style={{ backgroundColor: '#fff', borderRadius: 12, padding: '12px 14px' }}
                    >
                      <p style={{ fontSize: 14, color: '#0F1B2D', flex: 1, marginRight: 12 }}>{p.pattern_text}</p>
                      <ConfidenceBadge confidence={p.confidence ?? 'low'} />
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}

    </div>
  )
}
