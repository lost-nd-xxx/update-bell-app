// vite.config.ts - PWA手動設定版（型エラー完全回避）
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [
    react({
      include: "**/*.{jsx,tsx}",
    })
    // vite-plugin-pwaを完全に削除して型エラーを回避
  ],
  
  // ビルド設定
  build: {
    target: 'esnext',
    minify: 'terser',
    sourcemap: false,
    
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor': ['react', 'react-dom'],
          'utils': ['./src/utils/helpers.ts'],
        }
      }
    }
  },
  
  // サーバー設定
  server: {
    port: 3000,
    open: true,
    cors: true
  },
  
  // プレビュー設定
  preview: {
    port: 4173,
    open: true
  },
  
  // ベースURL設定（GitHub Pages用）
  base: './',
  
  // 依存関係の最適化
  optimizeDeps: {
    include: ['react', 'react-dom'],
    exclude: ['lucide-react']
  }
})