import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Thali',
    short_name: 'Thali',
    description: 'Personal calorie and macro tracker',
    start_url: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#F5F1E8',
    theme_color: '#D4F542',
    icons: [
      { src: '/favicon.ico', sizes: 'any', type: 'image/x-icon' },
    ],
  }
}
