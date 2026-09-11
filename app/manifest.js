// Web-app manifest so techs can "Add to Home Screen" on the station iPad / phone.
export default function manifest() {
  return {
    name: 'GTS Hub — Guest Technical Services',
    short_name: 'GTS Hub',
    description: 'B&H Guest Technical Services work tracker',
    start_url: '/',
    display: 'standalone',
    background_color: '#070b12',
    theme_color: '#070b12',
    icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' }],
  };
}
