'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const TABS = [
  { href: '/dashboard', label: 'Today',    iconClass: 'circle-dot' },
  { href: '/calendar',  label: 'Calendar', iconClass: 'calendar'   },
  { href: '/patterns',  label: 'Patterns', iconClass: 'brain'      },
  { href: '/profile',   label: 'Profile',  iconClass: 'user'       },
]

export default function BottomNav() {
  const pathname = usePathname()

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 flex items-center justify-around px-2"
      style={{ backgroundColor: '#fff', borderTop: '1px solid #E5E7EB', height: 64 }}
    >
      {TABS.map(({ href, label, iconClass }) => {
        const active = pathname.startsWith(href)
        return (
          <Link
            key={href}
            href={href}
            className="flex flex-col items-center gap-0.5"
            style={{ color: active ? '#0F1B2D' : '#6B7280', minWidth: 56 }}
          >
            <i className={`ti ti-${iconClass}`} style={{ fontSize: 22 }} />
            <span style={{ fontSize: 10, letterSpacing: '0.03em', fontWeight: active ? 500 : 400 }}>
              {label}
            </span>
          </Link>
        )
      })}
    </nav>
  )
}
