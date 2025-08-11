import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
// @ts-ignore
import { registerSW } from 'virtual:pwa-register'

// PWA Service Worker登録
const updateSW = registerSW({
  onNeedRefresh() {
    if (confirm('新しいバージョンが利用可能です。更新しますか？')) {
      updateSW(true)
    }
  },
  onOfflineReady() {
    console.log('アプリがオフラインで利用可能になりました')
  },
})

// PWAインストールプロンプトの処理
let deferredPrompt: BeforeInstallPromptEvent | null = null

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

window.addEventListener('beforeinstallprompt', (e: Event) => {
  e.preventDefault()
  deferredPrompt = e as BeforeInstallPromptEvent
  
  const installPrompt = document.getElementById('install-prompt')
  const installButton = document.getElementById('install-button')
  const installDismiss = document.getElementById('install-dismiss')
  
  // 既にインストール済みかチェック
  if (window.matchMedia('(display-mode: standalone)').matches) {
    return
  }
  
  // プロンプト表示
  setTimeout(() => {
    installPrompt?.classList.remove('translate-y-20', 'opacity-0')
    installPrompt?.classList.add('translate-y-0', 'opacity-100')
  }, 3000)
  
  installButton?.addEventListener('click', async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt()
      const { outcome } = await deferredPrompt.userChoice
      deferredPrompt = null
      installPrompt?.classList.add('translate-y-20', 'opacity-0')
    }
  })
  
  installDismiss?.addEventListener('click', () => {
    installPrompt?.classList.add('translate-y-20', 'opacity-0')
  })
})

// アプリインストール後の処理
window.addEventListener('appinstalled', () => {
  console.log('PWA was installed')
  const installPrompt = document.getElementById('install-prompt')
  installPrompt?.classList.add('translate-y-20', 'opacity-0')
})

// ローディング画面の処理
window.addEventListener('load', () => {
  setTimeout(() => {
    const loadingScreen = document.getElementById('loading-screen')
    loadingScreen?.classList.add('opacity-0')
    setTimeout(() => {
      if (loadingScreen) {
        loadingScreen.style.display = 'none'
      }
    }, 300)
  }, 1000)
})

// React アプリケーションのマウント
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)