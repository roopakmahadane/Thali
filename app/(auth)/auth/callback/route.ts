import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse, type NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')

  // On Vercel, SSL is terminated at the edge — request.url may carry http://.
  // x-forwarded-host always contains the correct public hostname.
  const forwardedHost = request.headers.get('x-forwarded-host')
  const baseUrl =
    process.env.NODE_ENV === 'development'
      ? origin
      : `https://${forwardedHost ?? new URL(request.url).hostname}`

  if (!code) {
    return NextResponse.redirect(`${baseUrl}/login?error=missing_code`)
  }

  const cookieStore = await cookies()

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
        },
      },
    }
  )

  const { error } = await supabase.auth.exchangeCodeForSession(code)

  if (error) {
    return NextResponse.redirect(`${baseUrl}/login?error=auth_failed`)
  }

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.redirect(`${baseUrl}/login?error=no_user`)
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('user_id')
    .eq('user_id', user.id)
    .maybeSingle()

  return NextResponse.redirect(profile ? `${baseUrl}/dashboard` : `${baseUrl}/onboarding`)
}
