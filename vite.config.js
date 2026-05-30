import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.js',
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      manifest: {
        name: 'VaultMCP',
        short_name: 'Vault',
        description: 'Save what you scroll. Use what you saved.',
        theme_color: '#e07800',
        background_color: '#bfb5a3',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        categories: ['utilities', 'productivity'],
        icons: [
          {
            src: 'favicon.svg',
            type: 'image/svg+xml',
            sizes: 'any'
          },
          {
            src: 'logo192.png',
            type: 'image/png',
            sizes: '192x192',
            purpose: 'any maskable'
          },
          {
            src: 'logo512.png',
            type: 'image/png',
            sizes: '512x512',
            purpose: 'any maskable'
          }
        ],
        share_target: {
          action: '/share',
          method: 'POST',
          enctype: 'multipart/form-data',
          params: {
            title: 'title',
            text: 'text',
            url: 'url'
          }
        }
      },
      devOptions: {
        enabled: true,
        type: 'module'
      }
    })
  ]
})
