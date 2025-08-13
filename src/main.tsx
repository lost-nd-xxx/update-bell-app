import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

// ローディング画面を即座に隠す（最優先実行）
const hideLoadingScreen = () => {
  const loadingScreen = document.getElementById("loading-screen");
  if (loadingScreen && loadingScreen.style.display !== "none") {
    loadingScreen.classList.add("opacity-0");
    setTimeout(() => {
      loadingScreen.style.display = "none";
    }, 300);
    return true;
  }
  return false;
};

// 即座にローディングを隠す試み
hideLoadingScreen();

// 環境判定のヘルパー（より確実な判定）
const isDevelopment =
  location.hostname === "localhost" ||
  location.hostname === "127.0.0.1" ||
  location.port === "3000";
const isProduction = !isDevelopment;

// PWA Service Worker登録（本番環境のみ）
if (isProduction) {
  try {
    // @ts-expect-error PWA register module import for production build
    import("virtual:pwa-register")
      .then(({ registerSW }) => {
        const updateSW = registerSW({
          onNeedRefresh() {
            if (confirm("新しいバージョンが利用可能です。更新しますか？")) {
              updateSW(true);
            }
          },
          onOfflineReady() {
            // アプリがオフライン対応済み
          },
        });
      })
      .catch(() => {
        // PWA登録に失敗（silent fail）
      });
  } catch {
    // PWAインポートエラー（silent fail）
  }
}

// PWAインストールプロンプトの処理
let deferredPrompt: BeforeInstallPromptEvent | null = null;

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

// React アプリケーションのマウント（同期実行）
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

// マウント直後にローディング画面を隠す
setTimeout(() => {
  hideLoadingScreen();
}, 10);

// 複数のタイミングでローディング画面を隠す
const intervals = [50, 100, 200, 500, 1000];
intervals.forEach((delay) => {
  setTimeout(() => {
    hideLoadingScreen();
  }, delay);
});

// DOM読み込み完了後の処理
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    hideLoadingScreen();
    setupPWAEvents();
  });
} else {
  // DOM は既に読み込み済み
  hideLoadingScreen();
  setupPWAEvents();
}

// PWA関連のイベント設定
function setupPWAEvents() {
  if (!isProduction) return;

  window.addEventListener("beforeinstallprompt", (e: Event) => {
    e.preventDefault();
    deferredPrompt = e as BeforeInstallPromptEvent;

    const installPrompt = document.getElementById("install-prompt");
    const installButton = document.getElementById("install-button");
    const installDismiss = document.getElementById("install-dismiss");

    // 既にインストール済みかチェック
    if (window.matchMedia("(display-mode: standalone)").matches) {
      return;
    }

    // プロンプト表示
    setTimeout(() => {
      installPrompt?.classList.remove("translate-y-20", "opacity-0");
      installPrompt?.classList.add("translate-y-0", "opacity-100");
    }, 3000);

    installButton?.addEventListener("click", async () => {
      if (deferredPrompt) {
        deferredPrompt.prompt();
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        await deferredPrompt.userChoice;
        deferredPrompt = null;
        installPrompt?.classList.add("translate-y-20", "opacity-0");
      }
    });

    installDismiss?.addEventListener("click", () => {
      installPrompt?.classList.add("translate-y-20", "opacity-0");
    });
  });

  // アプリインストール後の処理
  window.addEventListener("appinstalled", () => {
    const installPrompt = document.getElementById("install-prompt");
    installPrompt?.classList.add("translate-y-20", "opacity-0");
  });
}

// ページ読み込み完了時のフォールバック
window.addEventListener("load", () => {
  setTimeout(hideLoadingScreen, 50);
});

// 最終フォールバック（3秒経過したら強制的にローディングを隠す）
setTimeout(() => {
  hideLoadingScreen();
}, 3000);
