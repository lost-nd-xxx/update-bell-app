import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
// @ts-ignore
import { registerSW } from 'virtual:pwa-register'

// ローディング画面の処理を最初に実行
const hideLoadingScreen = () => {
  const loadingScreen = document.getElementById('loading-screen')
  if (loadingScreen) {
    loadingScreen.classList.add('opacity-0')
    setTimeout(() => {
      loadingScreen.style.display = 'none'
    }, 300)
  }
}

// PWA Service Worker登録（非同期で実行し、読み込みをブロックしない）
const initPWA = async () => {
  try {
    const updateSW = registerSW({
      onNeedRefresh() {
        if (confirm('新しいバージョンが利用可能です。更新しますか？')) {
          updateSW(true)
        }
      },
      onOfflineReady() {
        console.log('アプリがオフラインで利用可能になりました')
      },
      immediate: false // 即座に登録せず、アプリ初期化後に実行
    })
    return updateSW
  } catch (error) {
    console.error('PWA initialization failed:', error)
  }
}

// PWAインストールプロンプトの処理
const initInstallPrompt = () => {
  let deferredPrompt: BeforeInstallPromptEvent | null = null

  interface BeforeInstallPromptEvent extends Event {
    prompt(): Promise<void>
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
  }

  const hideInstallPrompt = () => {
    const installPrompt = document.getElementById('install-prompt')
    if (installPrompt) {
      installPrompt.classList.add('translate-y-20', 'opacity-0')
      setTimeout(() => {
        installPrompt.style.display = 'none'
      }, 300)
    }
  }

  window.addEventListener('beforeinstallprompt', (e: Event) => {
    e.preventDefault()
    deferredPrompt = e as BeforeInstallPromptEvent
    
    // 既にインストール済みかチェック
    if (window.matchMedia('(display-mode: standalone)').matches) {
      return
    }
    
    const installPrompt = document.getElementById('install-prompt')
    const installButton = document.getElementById('install-button')
    const installDismiss = document.getElementById('install-dismiss')
    
    // プロンプト表示（アプリ読み込み完了後に表示）
    setTimeout(() => {
      if (installPrompt) {
        installPrompt.style.display = 'block'
        installPrompt.classList.remove('translate-y-20', 'opacity-0')
        installPrompt.classList.add('translate-y-0', 'opacity-100')
      }
    }, 5000) // 5秒後に表示
    
    installButton?.addEventListener('click', async () => {
      if (deferredPrompt) {
        deferredPrompt.prompt()
        const { outcome } = await deferredPrompt.userChoice
        deferredPrompt = null
        hideInstallPrompt()
      }
    })
    
    installDismiss?.addEventListener('click', () => {
      hideInstallPrompt()
    })
  })

  // アプリインストール後の処理
  window.addEventListener('appinstalled', () => {
    console.log('PWA was installed')
    hideInstallPrompt()
  })
}

// React アプリケーションの初期化
const initApp = () => {
  const root = ReactDOM.createRoot(document.getElementById('root')!)
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  )
}

// メイン初期化処理
const init = async () => {
  // React アプリを最初に開始
  initApp()
  
  // DOM読み込み完了後にその他の処理を実行
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      setTimeout(hideLoadingScreen, 800) // 少し短縮
      initInstallPrompt()
    })
  } else {
    setTimeout(hideLoadingScreen, 800)
    initInstallPrompt()
  }
  
  // PWA初期化は最後に実行（ページ読み込みをブロックしない）
  setTimeout(() => {
    initPWA()
  }, 1500)
}

// 初期化実行
init()