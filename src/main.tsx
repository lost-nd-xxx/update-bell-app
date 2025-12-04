import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

const hideLoadingScreen = () => {
  const loadingScreen = document.getElementById("loading-screen");
  if (loadingScreen && !loadingScreen.classList.contains("hidden")) {
    loadingScreen.classList.add("hidden");
    setTimeout(() => {
      if (loadingScreen) {
        loadingScreen.style.display = "none";
      }
    }, 300);

    return true;
  }
  return false;
};

hideLoadingScreen();

// 環境判定
const shouldRegisterSW = true; // 開発・本番問わずSWを登録する

// Service Worker登録
const registerManualServiceWorker = () => {
  if ("serviceWorker" in navigator) {
    return navigator.serviceWorker
      .register("/sw.js")
      .then((registration) => {
        return registration;
      })
      .catch((error) => {
        console.error("SW登録失敗:", error);
        throw error;
      });
  } else {
    return Promise.reject(new Error("Service Worker not supported"));
  }
};

// 環境に応じた初期化
const initializeApp = async () => {
  try {
    if (shouldRegisterSW) {
      await registerManualServiceWorker();
    }
  } catch (error) {
    console.error("初期化エラー:", error);
  }
};

// PWAインストールプロンプト処理
let deferredPrompt: Event | null = null;

window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredPrompt = e;

  const installPrompt = document.getElementById("install-prompt");
  if (installPrompt) {
    installPrompt.classList.remove("translate-y-20", "opacity-0");
    installPrompt.classList.add("translate-y-0", "opacity-100");

    const installButton = document.getElementById("install-button");
    const installDismiss = document.getElementById("install-dismiss");

    if (installButton && installDismiss) {
      installButton.onclick = async () => {
        if (deferredPrompt && "prompt" in deferredPrompt) {
          const promptEvent = deferredPrompt as unknown as {
            prompt: () => void;
            userChoice: Promise<unknown>;
          };
          promptEvent.prompt();
          await promptEvent.userChoice;
          deferredPrompt = null;
        }
        hideInstallPrompt();
      };

      installDismiss.onclick = () => {
        hideInstallPrompt();
        deferredPrompt = null;
      };
    }
  }
});

const hideInstallPrompt = () => {
  const installPrompt = document.getElementById("install-prompt");
  if (installPrompt) {
    installPrompt.classList.add("translate-y-20", "opacity-0");
    installPrompt.classList.remove("translate-y-0", "opacity-100");
  }
};

window.addEventListener("appinstalled", () => {
  hideInstallPrompt();
  deferredPrompt = null;
});

import { UserIdProvider } from "./contexts/UserIdContext";
import { ToastProvider } from "./contexts/ToastProvider"; // 追加

// React アプリケーションのマウント
const rootElement = document.getElementById("root");
if (rootElement) {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <UserIdProvider>
        <ToastProvider>
          {" "}
          {/* 追加 */}
          <App />
        </ToastProvider>{" "}
        {/* 追加 */}
      </UserIdProvider>
    </React.StrictMode>,
  );
} else {
  console.error("Root element not found");
}

setTimeout(() => {
  hideLoadingScreen();
}, 100);

// アプリ初期化実行
initializeApp();
