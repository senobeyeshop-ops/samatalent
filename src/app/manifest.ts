import type { MetadataRoute } from 'next';

// PWA installable sur Android
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Sama Talent',
    short_name: 'Sama Talent',
    description: 'Le réseau des talents du Sénégal et de l’UEMOA',
    start_url: '/',
    display: 'standalone',
    background_color: '#fbfaf7',
    theme_color: '#13203a',
    lang: 'fr',
    icons: [
      { src: '/icons/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
    ],
  };
}
