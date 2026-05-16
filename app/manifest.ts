import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Thali',
    short_name: 'Thali',
    description: 'Personal calorie and macro tracker',
    start_url: '/dashboard',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#F5F1E8',
    theme_color: '#0F1B2D',
    icons: [
      { src: '/favicon.ico', sizes: 'any', type: 'image/x-icon' },
    ],
  }
}
