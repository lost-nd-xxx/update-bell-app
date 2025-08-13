// vite.config.ts - mkcert HTTPS対応版
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import fs from 'fs'
import path from 'path'

export default defineConfig(({ command, mode }) => {
  const isProduction = mode === 'production'
  const isDevelopment = mode === 'development'
  
  // mkcert証明書の存在確認
  const certPath = 'localhost+2.pem'
  const keyPath = 'localhost+2-key.pem'
  const hasMkcertCerts = fs.existsSync(certPath) && fs.existsSync(keyPath)
  
  return {
    plugins: [
      react({
        include: "**/*.{jsx,tsx}",
      }),
      
      // PWAプラグインを復活（本番環境とHTTPS開発時のみ）
      VitePWA({
        registerType: 'autoUpdate',
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,json}'],
          cleanupOutdatedCaches: true,
          skipWaiting: true,
          clientsClaim: true
        },
        includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'masked-icon.svg'],
        manifest: {
          name: 'おしらせベル',
          short_name: 'おしらせベル',
          description: 'URLを添えてリマインド通知するPWAアプリ',
          theme_color: '#8b5cf6',
          background_color: '#ffffff',
          display: 'standalone',
          orientation: 'portrait',
          scope: '/',
          start_url: '/',
          icons: [
            {
              src: 'icon-72x72.png',
              sizes: '72x72',
              type: 'image/png'
            },
            {
              src: 'icon-96x96.png',
              sizes: '96x96',
              type: 'image/png'
            },
            {
              src: 'icon-128x128.png',
              sizes: '128x128',
              type: 'image/png'
            },
            {
              src: 'icon-144x144.png',
              sizes: '144x144',
              type: 'image/png'
            },
            {
              src: 'icon-152x152.png',
              sizes: '152x152',
              type: 'image/png'
            },
            {
              src: 'icon-192x192.png',
              sizes: '192x192',
              type: 'image/png'
            },
            {
              src: 'icon-384x384.png',
              sizes: '384x384',
              type: 'image/png'
            },
            {
              src: 'icon-512x512.png',
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
              url: '/?action=create',
              icons: [{ src: 'icon-96x96.png', sizes: '96x96' }]
            },
            {
              name: '設定',
              short_name: '設定',
              description: 'アプリの設定',
              url: '/?action=settings',
              icons: [{ src: 'icon-96x96.png', sizes: '96x96' }]
            }
          ]
        },
        devOptions: {
          // HTTPS環境でも開発時はPWA無効（手動SW使用）
          enabled: false,
          type: 'module'
        }
      })
    ],
    
    // ビルド設定
    build: {
      target: 'esnext',
      minify: 'terser',
      sourcemap: isProduction ? false : true,
      
      rollupOptions: {
        output: {
          manualChunks: {
            'vendor': ['react', 'react-dom'],
            'lucide': ['lucide-react'],
          }
        }
      }
    },
    
    // サーバー設定
    server: {
      port: 3000,
      host: 'localhost',
      open: true,
      cors: true,
      // HTTPS設定 - mkcert証明書を使用
      https: hasMkcertCerts ? {
        key: fs.readFileSync(keyPath),
        cert: fs.readFileSync(certPath),
      } : false,
    },
    
    // プレビュー設定
    preview: {
      port: 4173,
      host: 'localhost',
      open: true,
      https: hasMkcertCerts ? {
        key: fs.readFileSync(keyPath),
        cert: fs.readFileSync(certPath),
      } : false,
    },
    
    // ベースURL設定（GitHub Pages用）
    base: './',
    
    // 依存関係の最適化
    optimizeDeps: {
      include: ['react', 'react-dom'],
      exclude: []
    },
    
    // 定義
    define: {
      __IS_DEVELOPMENT__: isDevelopment,
      __IS_PRODUCTION__: isProduction,
    }
  }
})