import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react({
      include: "**/*.{jsx,tsx}",
    }),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'], // tsx,ts,jsonを除外
        cleanupOutdatedCaches: true,
        skipWaiting: true,
        clientsClaim: true,
        globIgnores: [
          '**/node_modules/**/*',
          'dev-dist/**/*' // dev-distを除外
        ],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/cdn\.tailwindcss\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'tailwind-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 30, // 30日
              },
            },
          },
        ],
      },
      includeAssets: [
        'favicon.ico', 
        'icon-*.png',
        'icon-mask.svg',
        'screenshot-*.png'
      ],
      manifest: {
        name: 'ウェブ漫画リマインダー',
        short_name: '漫画リマインダー',
        description: 'ウェブ漫画の更新をリマインドするPWAアプリ',
        theme_color: '#2563eb',
        background_color: '#ffffff',
        display: 'standalone',
        orientation: 'portrait-primary',
        scope: '/',
        start_url: '/',
        lang: 'ja',
        categories: ['productivity', 'entertainment'],
        // PWAインストール要件を満たすための追加設定
        display_override: ['standalone', 'minimal-ui'],
        icons: [
          {
            src: '/icon-72x72.png',
            sizes: '72x72',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: '/icon-96x96.png',
            sizes: '96x96',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: '/icon-128x128.png',
            sizes: '128x128',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: '/icon-144x144.png',
            sizes: '144x144',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: '/icon-152x152.png',
            sizes: '152x152',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: '/icon-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any maskable'
          },
          {
            src: '/icon-384x384.png',
            sizes: '384x384',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: '/icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ],
        shortcuts: [
          {
            name: '新しいリマインダー',
            short_name: '新規作成',
            description: '新しいリマインダーを作成',
            url: '/#create',
            icons: [
              {
                src: '/icon-96x96.png',
                sizes: '96x96'
              }
            ]
          },
          {
            name: '設定',
            short_name: '設定',
            description: 'アプリの設定を変更',
            url: '/#settings',
            icons: [
              {
                src: '/icon-96x96.png',
                sizes: '96x96'
              }
            ]
          }
        ],
        screenshots: [
          {
            src: '/screenshot-mobile.png',
            sizes: '640x1136',
            type: 'image/png',
            form_factor: 'narrow',
            label: 'モバイル版ダッシュボード'
          },
          {
            src: '/screenshot-desktop.png',
            sizes: '1280x720',
            type: 'image/png',
            form_factor: 'wide',
            label: 'デスクトップ版ダッシュボード'
          }
        ],
        related_applications: [],
        prefer_related_applications: false
      },
      devOptions: {
        enabled: true,
        type: 'module'
      }
    })
  ],
  base: './',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false,
    minify: 'terser',
    target: 'esnext',
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],
          utils: ['./src/utils/helpers.ts']
        }
      }
    }
  },
  server: {
    port: 3000,
    open: true,
    host: true
  },
  preview: {
    port: 4173,
    open: true,
    host: true
  },
  define: {
    __APP_VERSION__: JSON.stringify(process.env.npm_package_version || '1.0.0')
  }
})