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

// 環境判定のヘルパー（HTTPS対応版）
const isDevelopment =
  location.hostname === "localhost" ||
  location.hostname === "127.0.0.1" ||
  location.port === "3000";
const isHTTPS = location.protocol === "https:";
const isProduction = !isDevelopment;

// Service Worker を登録する条件
// HTTPS環境では常に手動Service Workerを使用
const shouldRegisterSW = isProduction || isHTTPS;

console.log("環境情報:", {
  isDevelopment,
  isHTTPS,
  isProduction,
  shouldRegisterSW,
  hostname: location.hostname,
  protocol: location.protocol,
});

// 手動Service Worker登録（メイン処理）
const registerManualServiceWorker = () => {
  console.log("手動Service Worker登録を開始");
  if ("serviceWorker" in navigator) {
    return navigator.serviceWorker
      .register("/sw.js")
      .then((registration) => {
        console.log("手動SW登録成功:", registration.scope);
        console.log("手動SW状態:", {
          active: registration.active?.scriptURL,
          installing: registration.installing?.scriptURL,
          waiting: registration.waiting?.scriptURL,
        });
        return registration;
      })
      .catch((error) => {
        console.error("手動SW登録失敗:", error);
        throw error;
      });
  } else {
    console.error("このブラウザはService Workerに対応していません");
    return Promise.reject(new Error("Service Worker not supported"));
  }
};

// Service Worker登録処理（HTTPS環境では手動SWのみ使用）
if (shouldRegisterSW) {
  console.log("Service Worker登録開始 (手動SW使用)");

  // PWAプラグインを完全にスキップして手動SW使用
  registerManualServiceWorker()
    .then((registration) => {
      console.log("手動Service Worker登録完了");

      // 登録完了後、既存のdev-swがあれば警告
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        const devSW = registrations.find((reg) =>
          reg.active?.scriptURL.includes("dev-sw.js"),
        );
        if (devSW && devSW !== registration) {
          console.warn(
            "dev-sw.js が検出されました。手動SWとの競合の可能性があります。",
          );
        }
      });
    })
    .catch((error) => {
      console.error("Service Worker登録に完全に失敗:", error);
    });
} else {
  console.log("HTTP開発環境: Service Worker登録をスキップ");
}

// PWAインストールプロンプトの処理
let deferredPrompt: BeforeInstallPromptEvent | null = null;

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

// PWAインストールイベントの処理
window.addEventListener("beforeinstallprompt", (e) => {
  console.log("PWAインストールプロンプト準備完了");
  e.preventDefault();
  deferredPrompt = e as BeforeInstallPromptEvent;

  // インストールプロンプトを表示
  const installPrompt = document.getElementById("install-prompt");
  const installButton = document.getElementById("install-button");
  const installDismiss = document.getElementById("install-dismiss");

  if (installPrompt && installButton && installDismiss) {
    // プロンプトを表示
    installPrompt.classList.remove("translate-y-20", "opacity-0");
    installPrompt.classList.add("translate-y-0", "opacity-100");

    // インストールボタンの処理
    installButton.onclick = async () => {
      if (deferredPrompt) {
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        console.log(`PWAインストール結果: ${outcome}`);
        deferredPrompt = null;
      }
      hideInstallPrompt();
    };

    // 後でボタンの処理
    installDismiss.onclick = () => {
      hideInstallPrompt();
      deferredPrompt = null;
    };
  }
});

// インストールプロンプトを隠す
const hideInstallPrompt = () => {
  const installPrompt = document.getElementById("install-prompt");
  if (installPrompt) {
    installPrompt.classList.add("translate-y-20", "opacity-0");
    installPrompt.classList.remove("translate-y-0", "opacity-100");
  }
};

// PWAインストール完了の処理
window.addEventListener("appinstalled", () => {
  console.log("PWAインストール完了");
  hideInstallPrompt();
  deferredPrompt = null;
});

// React アプリケーションのマウント（同期実行）
const rootElement = document.getElementById("root");
if (rootElement) {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
} else {
  console.error("Root element not found");
}

// 最終的にローディング画面を隠す（React描画後）
setTimeout(() => {
  hideLoadingScreen();
}, 100);

// Service Worker 状況を10秒後に確認
setTimeout(() => {
  console.log("=== 10秒後のService Worker状況確認 ===");
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    console.log("登録されたService Worker数:", registrations.length);
    registrations.forEach((registration, index) => {
      console.log(`SW[${index}]:`, {
        scope: registration.scope,
        scriptURL: registration.active?.scriptURL,
        state: registration.active?.state,
      });
    });

    const manualSW = registrations.find(
      (reg) =>
        reg.active?.scriptURL.includes("/sw.js") &&
        !reg.active?.scriptURL.includes("dev-sw.js"),
    );

    if (manualSW) {
      console.log("✅ 手動Service Worker (/sw.js) が正常に動作中");
    } else {
      console.warn("⚠️ 手動Service Worker が見つかりません");
    }
  });
}, 10000);
