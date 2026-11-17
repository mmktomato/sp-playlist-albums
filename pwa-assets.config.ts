import { defineConfig } from '@vite-pwa/assets-generator/config'

const resizeOptions = { background: '#111827', fit: 'contain' } as const

export default defineConfig({
  headLinkOptions: {
    preset: '2023',
  },
  preset: {
    transparent: {
      sizes: [64, 192, 512],
      favicons: [[48, 'favicon.ico']],
      padding: 0,
    },
    maskable: {
      sizes: [512],
      padding: 0,
      resizeOptions,
    },
    apple: {
      sizes: [180],
      padding: 0,
      resizeOptions,
    },
  },
  images: ['public/icon.svg'],
})
