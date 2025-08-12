// src/main.tsx - 型エラー完全解決版（PWA手動登録）
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

// デバッグ用のログ関数
const debugLog = (message: string, data?: unknown) => {
  const timestamp = new Date().toLocaleTimeString();
  console.log(`[${timestamp}] [MAIN] ${message}`, data || "");
};

// ローディング画面管理クラス
class LoadingManager {
  private static instance: LoadingManager;
  private loadingElement: HTMLElement | null = null;
  private hideAttempts = 0;
  private isHidden = false;

  static getInstance(): LoadingManager {
    if (!LoadingManager.instance) {
      LoadingManager.instance = new LoadingManager();
    }
    return LoadingManager.instance;
  }

  constructor() {
    this.loadingElement = document.getElementById("loading-screen");
    debugLog("LoadingManager初期化", {
      element: !!this.loadingElement,
      display: this.loadingElement?.style.display,
      opacity: this.loadingElement?.style.opacity,
    });
  }

  hide(): boolean {
    this.hideAttempts++;
    debugLog(`ローディング非表示試行 #${this.hideAttempts}`);

    if (!this.loadingElement) {
      debugLog("ローディング要素が見つかりません");
      return false;
    }

    if (this.isHidden) {
      debugLog("既に非表示済み");
      return true;
    }

    try {
      // 複数の方法で確実に非表示にする
      this.loadingElement.style.display = "none";
      this.loadingElement.style.opacity = "0";
      this.loadingElement.style.visibility = "hidden";
      this.loadingElement.style.zIndex = "-1000";
      this.loadingElement.setAttribute("hidden", "true");
      this.loadingElement.classList.add("opacity-0");

      // アニメーション付きで非表示
      this.loadingElement.classList.add("transition-opacity", "duration-300");

      setTimeout(() => {
        if (this.loadingElement) {
          this.loadingElement.style.display = "none";
        }
      }, 350);

      this.isHidden = true;
      debugLog("ローディング画面を非表示にしました");
      return true;
    } catch (error) {
      debugLog("ローディング非表示エラー", error);
      return false;
    }
  }

  forceHide(): void {
    debugLog("ローディング強制非表示実行");

    // 全ての可能な方法でローディング画面を非表示
    const possibleSelectors = [
      "#loading-screen",
      ".loading-screen",
      "[data-loading]",
      ".loader",
      ".spinner",
    ];

    possibleSelectors.forEach((selector) => {
      const elements = document.querySelectorAll(selector);
      elements.forEach((element) => {
        const htmlElement = element as HTMLElement;
        htmlElement.style.display = "none";
        htmlElement.style.opacity = "0";
        htmlElement.style.visibility = "hidden";
        htmlElement.setAttribute("hidden", "true");
      });
    });

    this.isHidden = true;
    debugLog("強制非表示完了");
  }

  getStatus(): { isHidden: boolean; attempts: number; exists: boolean } {
    return {
      isHidden: this.isHidden,
      attempts: this.hideAttempts,
      exists: !!this.loadingElement,
    };
  }
}

// 環境判定
const isProduction = location.port === "4173"; // Vite preview server
const isDevelopment = !isProduction;

debugLog("環境判定", {
  isDevelopment,
  isProduction,
  location: window.location.href,
});

// 手動Service Worker登録（vite-plugin-pwaを使用しない）
async function registerServiceWorker() {
  if (!isProduction) {
    debugLog("開発環境のためService Worker登録をスキップ");
    return;
  }

  if (!("serviceWorker" in navigator)) {
    debugLog("Service Worker非対応");
    return;
  }

  try {
    debugLog("手動Service Worker登録開始");

    const registration = await navigator.serviceWorker.register("/sw.js", {
      scope: "/",
    });

    debugLog("Service Worker登録完了", registration.scope);

    // 更新チェック
    registration.addEventListener("updatefound", () => {
      const newWorker = registration.installing;
      if (newWorker) {
        debugLog("新しいService Workerが見つかりました");

        newWorker.addEventListener("statechange", () => {
          if (
            newWorker.state === "installed" &&
            navigator.serviceWorker.controller
          ) {
            debugLog("新しいバージョンが利用可能です");

            // ユーザーに更新を通知
            if (confirm("新しいバージョンが利用可能です。更新しますか？")) {
              newWorker.postMessage({ type: "SKIP_WAITING" });
            }
          }
        });
      }
    });

    // Service Worker状態変更時の処理
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      debugLog("Service Workerコントローラーが変更されました");
      window.location.reload();
    });
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    debugLog("Service Worker登録失敗", errorMessage);
  }
}

// PWAインストールプロンプト管理
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;

function setupPWAEvents() {
  if (!isProduction) return;

  window.addEventListener("beforeinstallprompt", (e: Event) => {
    debugLog("PWAインストールプロンプト受信");
    e.preventDefault();
    deferredPrompt = e as BeforeInstallPromptEvent;

    const installPrompt = document.getElementById("install-prompt");
    const installButton = document.getElementById("install-button");
    const installDismiss = document.getElementById("install-dismiss");

    // 既にインストール済みかチェック
    if (window.matchMedia("(display-mode: standalone)").matches) {
      debugLog("既にPWAインストール済み");
      return;
    }

    // プロンプト表示
    setTimeout(() => {
      if (installPrompt) {
        installPrompt.classList.remove("translate-y-20", "opacity-0");
        installPrompt.classList.add("translate-y-0", "opacity-100");
        debugLog("PWAインストールプロンプト表示");
      }
    }, 3000);

    installButton?.addEventListener("click", async () => {
      debugLog("PWAインストールボタンクリック");
      if (deferredPrompt) {
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        debugLog("PWAインストール結果", outcome);
        deferredPrompt = null;
        installPrompt?.classList.add("translate-y-20", "opacity-0");
      }
    });

    installDismiss?.addEventListener("click", () => {
      debugLog("PWAインストール拒否");
      installPrompt?.classList.add("translate-y-20", "opacity-0");
    });
  });

  window.addEventListener("appinstalled", () => {
    debugLog("PWAインストール完了");
    const installPrompt = document.getElementById("install-prompt");
    installPrompt?.classList.add("translate-y-20", "opacity-0");
  });
}

// Service Workerデバッガーとマネージャー設定
function setupServiceWorkerManager() {
  if (!("serviceWorker" in navigator)) return;

  // Service Workerとの通信チャンネル
  const swChannel = {
    send: async (type: string, data?: unknown) => {
      if (!navigator.serviceWorker.controller) {
        throw new Error("Service Worker not active");
      }

      return new Promise((resolve, reject) => {
        const channel = new MessageChannel();
        channel.port1.onmessage = (event) => resolve(event.data);

        setTimeout(() => reject(new Error("SW Timeout")), 5000);

        navigator.serviceWorker.controller!.postMessage({ type, data }, [
          channel.port2,
        ]);
      });
    },
  };

  // 型定義を追加
  interface SwDebugger {
    test: () => Promise<unknown>;
    getStatus: () => Promise<unknown>;
  }

  // Service Workerデバッガー（型を明示的に定義）
  const swDebugger: SwDebugger = {
    test: async () => {
      try {
        const result = await swChannel.send("CHECK_REMINDERS_NOW");
        debugLog("Service Workerテスト完了", result);
        return result;
      } catch (error) {
        debugLog("Service Workerテスト失敗", error);
        throw error;
      }
    },
    getStatus: async () => {
      const registrations = await navigator.serviceWorker.getRegistrations();
      return {
        registrations: registrations.length,
        controller: !!navigator.serviceWorker.controller,
        ready: await navigator.serviceWorker.ready,
      };
    },
  };

  // グローバルに型安全に設定
  (window as any).swDebugger = swDebugger;

  debugLog("Service Worker管理機能セットアップ完了");
}

// メインの初期化処理
async function initializeApp() {
  debugLog("アプリ初期化開始");

  const loadingManager = LoadingManager.getInstance();

  try {
    // 即座にローディングを非表示にする試行
    loadingManager.hide();

    // Service Worker関連セットアップ
    setupServiceWorkerManager();
    await registerServiceWorker();
    setupPWAEvents();

    // React アプリケーションのレンダリング
    debugLog("React アプリレンダリング開始");
    const rootElement = document.getElementById("root");

    if (!rootElement) {
      throw new Error("Root element not found");
    }

    const root = ReactDOM.createRoot(rootElement);
    root.render(
      <React.StrictMode>
        <App />
      </React.StrictMode>,
    );

    debugLog("React アプリレンダリング完了");

    // レンダリング後にローディングを非表示
    setTimeout(() => loadingManager.hide(), 100);
    setTimeout(() => loadingManager.hide(), 500);
    setTimeout(() => loadingManager.hide(), 1000);
  } catch (error) {
    debugLog("アプリ初期化エラー", error);
    loadingManager.forceHide();

    // エラー表示
    const rootElement = document.getElementById("root");
    if (rootElement) {
      rootElement.innerHTML = `
        <div style="
          display: flex; 
          justify-content: center; 
          align-items: center; 
          height: 100vh; 
          flex-direction: column;
          font-family: -apple-system, BlinkMacSystemFont, sans-serif;
          color: #666;
        ">
          <h2>アプリの読み込みに失敗しました</h2>
          <p>ページを再読み込みしてください</p>
          <button onclick="location.reload()" style="
            margin-top: 20px;
            padding: 10px 20px;
            background: #007bff;
            color: white;
            border: none;
            border-radius: 5px;
            cursor: pointer;
          ">再読み込み</button>
        </div>
      `;
    }
  }
}

// 複数のタイミングで初期化を実行
const initTriggers = [
  // 即座に実行
  () => initializeApp(),

  // DOM読み込み完了後
  () => {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", initializeApp);
    } else {
      initializeApp();
    }
  },

  // ウィンドウ読み込み完了後
  () => {
    window.addEventListener("load", () => {
      setTimeout(initializeApp, 50);
    });
  },

  // フォールバック（タイマー）
  () => {
    setTimeout(initializeApp, 100);
    setTimeout(initializeApp, 500);
    setTimeout(initializeApp, 1000);
  },

  // 最終フォールバック
  () => {
    setTimeout(() => {
      const loadingManager = LoadingManager.getInstance();
      loadingManager.forceHide();
      debugLog("最終フォールバック: ローディング強制非表示");
    }, 3000);
  },
];

// 全てのトリガーを実行
initTriggers.forEach((trigger, index) => {
  try {
    trigger();
    debugLog(`初期化トリガー #${index + 1} 実行完了`);
  } catch (error) {
    debugLog(`初期化トリガー #${index + 1} エラー`, error);
  }
});

debugLog("main.tsx 読み込み完了");
