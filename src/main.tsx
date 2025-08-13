// src/main.tsx - シンプル版
// タイムアウト問題解決・統一命名・移行処理なし

import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

const debugLog = (message: string, data?: unknown) => {
  console.log(`[MAIN] ${message}`, data || "");
};

const isProduction = import.meta.env.PROD;

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

    if (window.matchMedia("(display-mode: standalone)").matches) {
      debugLog("既にPWAインストール済み");
      return;
    }

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

// Service Workerデバッガーとマネージャー設定（シンプル版）
function setupServiceWorkerManager() {
  if (!("serviceWorker" in navigator)) return;

  // Service Workerとの通信チャンネル（改善版）
  const swChannel = {
    send: async (type: string, data?: unknown, timeout = 10000) => {
      if (!navigator.serviceWorker.controller) {
        throw new Error("Service Worker not active");
      }

      return new Promise((resolve, reject) => {
        const channel = new MessageChannel();
        let isResolved = false;

        channel.port1.onmessage = (event) => {
          if (!isResolved) {
            isResolved = true;
            debugLog(`SW応答受信: ${type}`, event.data);
            resolve(event.data);
          }
        };

        const timeoutId = setTimeout(() => {
          if (!isResolved) {
            isResolved = true;
            debugLog(`SW通信タイムアウト: ${type} (${timeout}ms)`);
            reject(new Error(`SW Timeout: ${type}`));
          }
        }, timeout);

        try {
          debugLog(`SW通信送信: ${type}`, data);
          navigator.serviceWorker.controller.postMessage({ type, data }, [
            channel.port2,
          ]);
        } catch (error) {
          if (!isResolved) {
            isResolved = true;
            clearTimeout(timeoutId);
            reject(error);
          }
        }
      });
    },
  };

  // リトライ機能付きの安全な通信
  const sendMessageWithRetry = async (
    type: string,
    data?: unknown,
    maxRetries = 3
  ) => {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        debugLog(`SW通信試行 ${attempt}/${maxRetries}: ${type}`);
        const result = await swChannel.send(type, data, 8000);
        debugLog(`SW通信成功: ${type}`, result);
        return result;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        debugLog(`SW通信失敗 (試行${attempt}): ${type}`, lastError.message);

        if (attempt < maxRetries) {
          const waitTime = attempt * 1000;
          debugLog(`${waitTime}ms待機後、再試行します`);
          await new Promise((resolve) => setTimeout(resolve, waitTime));
        }
      }
    }

    throw lastError || new Error(`Failed after ${maxRetries} attempts`);
  };

  // Service Workerデバッガー（改善版）
  const swDebugger = {
    test: async () => {
      try {
        const result = await sendMessageWithRetry("PING");
        debugLog("Service Workerテスト完了", result);
        return result;
      } catch (error) {
        debugLog("Service Workerテスト失敗", error);
        throw error;
      }
    },

    getStatus: async () => {
      try {
        const result = await sendMessageWithRetry("GET_STATUS");
        debugLog("Service Workerステータス取得完了", result);
        return result;
      } catch (error) {
        debugLog("Service Workerステータス取得失敗", error);
        return {
          error: error instanceof Error ? error.message : "Unknown error",
          registrations: await navigator.serviceWorker
            .getRegistrations()
            .then((regs) => regs.length)
            .catch(() => 0),
          controller: !!navigator.serviceWorker.controller,
        };
      }
    },

    manualCheck: async () => {
      try {
        const result = await sendMessageWithRetry("CHECK_REMINDERS_NOW", undefined, 15000);
        debugLog("手動チェック完了", result);
        return result;
      } catch (error) {
        debugLog("手動チェック失敗", error);
        throw error;
      }
    },
  };

  // Update Bell データ同期機能（シンプル版）
  const updateBell = {
    updateRemindersCache: async (reminders: unknown[]) => {
      try {
        const result = await sendMessageWithRetry("REMINDERS_DATA", reminders);
        debugLog("リマインダーキャッシュ更新完了", result);
        return result;
      } catch (error) {
        debugLog("リマインダーキャッシュ更新失敗", error);
        return { error: error instanceof Error ? error.message : "Unknown error" };
      }
    },

    updateSettingsCache: async (settings: unknown) => {
      try {
        const result = await sendMessageWithRetry("SETTINGS_DATA", settings);
        debugLog("設定キャッシュ更新完了", result);
        return result;
      } catch (error) {
        debugLog("設定キャッシュ更新失敗", error);
        return { error: error instanceof Error ? error.message : "Unknown error" };
      }
    },

    startPeriodicCheck: async (interval: number) => {
      try {
        const result = await sendMessageWithRetry("START_PERIODIC_CHECK", { interval });
        debugLog("定期チェック開始完了", result);
        return result;
      } catch (error) {
        debugLog("定期チェック開始失敗", error);
        return { error: error instanceof Error ? error.message : "Unknown error" };
      }
    },

    manualCheck: async () => {
      try {
        return await swDebugger.manualCheck();
      } catch (error) {
        debugLog("手動チェックエラー", error);
        throw error;
      }
    }
  };

  // Service Worker 初期化監視
  const waitForServiceWorker = async (maxWait = 10000): Promise<boolean> => {
    const startTime = Date.now();

    while (Date.now() - startTime < maxWait) {
      if (navigator.serviceWorker.controller) {
        debugLog("Service Worker アクティブ確認");
        return true;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    debugLog("Service Worker アクティブ待機タイムアウト");
    return false;
  };

  // グローバルに設定（統一命名）
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).swDebugger = swDebugger;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).updateBell = updateBell;

  debugLog("Service Workerデバッガー設定完了");

  // Service Worker登録（修正版）
  (async () => {
    try {
      const registration = await navigator.serviceWorker.register("/sw.js", {
        scope: "/",
      });

      debugLog("Service Worker登録成功", {
        scope: registration.scope,
        state: registration.active?.state,
      });

      // アクティブになるまで待機
      const isActive = await waitForServiceWorker();
      if (isActive) {
        debugLog("Service Worker通信準備完了");

        // 初期ステータス確認
        try {
          const status = await swDebugger.getStatus();
          debugLog("初期ステータス", status);
        } catch (error) {
          debugLog("初期ステータス取得失敗", error);
        }
      } else {
        debugLog("Service Workerアクティブ化待機失敗");
      }

      // Service Worker更新時の処理
      registration.addEventListener("updatefound", () => {
        debugLog("Service Worker更新検出");
        const newWorker = registration.installing;
        if (newWorker) {
          newWorker.addEventListener("statechange", () => {
            debugLog("Service Worker状態変更", newWorker.state);
            if (newWorker.state === "activated") {
              debugLog("新しいService Workerがアクティブになりました");
            }
          });
        }
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      debugLog("Service Worker登録失敗", errorMessage);
    }

    // Service Workerからのメッセージ受信
    navigator.serviceWorker.addEventListener("message", (event) => {
      debugLog("Service Workerからメッセージ受信", event.data);

      // カスタムイベントとして再発行（Reactコンポーネントでリッスン可能）
      window.dispatchEvent(
        new CustomEvent("serviceWorkerMessage", {
          detail: event.data,
        })
      );
    });

    // Service Worker制御変更の監視
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      debugLog("Service Worker制御変更検出");
      window.location.reload(); // 新しいService Workerで再開
    });
  })();
}

// エラーハンドリング強化
window.addEventListener("error", (event) => {
  if (event.message.includes("SW Timeout")) {
    debugLog("Service Workerタイムアウトエラー検出", {
      message: event.message,
      filename: event.filename,
      lineno: event.lineno,
    });
  }
});

window.addEventListener("unhandledrejection", (event) => {
  if (event.reason?.message?.includes("SW Timeout")) {
    debugLog("未処理のService Workerタイムアウト", event.reason);
    // デフォルトのエラー処理を防ぐ
    event.preventDefault();
  }
});

// React アプリケーション起動
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// PWAイベント設定
setupPWAEvents();

// Service Worker初期化
setupServiceWorkerManager();

debugLog("アプリケーション初期化完了");// src/main.tsx - 完全修正版
// タイムアウト問題解決・アプリ名統一完了

import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

const debugLog = (message: string, data?: unknown) => {
  console.log(`[MAIN] ${message}`, data || "");
};

const isProduction = import.meta.env.PROD;

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

    if (window.matchMedia("(display-mode: standalone)").matches) {
      debugLog("既にPWAインストール済み");
      return;
    }

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

// Service Workerデバッガーとマネージャー設定（完全修正版）
function setupServiceWorkerManager() {
  if (!("serviceWorker" in navigator)) return;

  // Service Workerとの通信チャンネル（改善版）
  const swChannel = {
    send: async (type: string, data?: unknown, timeout = 10000) => {
      if (!navigator.serviceWorker.controller) {
        throw new Error("Service Worker not active");
      }

      return new Promise((resolve, reject) => {
        const channel = new MessageChannel();
        let isResolved = false;

        channel.port1.onmessage = (event) => {
          if (!isResolved) {
            isResolved = true;
            debugLog(`SW応答受信: ${type}`, event.data);
            resolve(event.data);
          }
        };

        const timeoutId = setTimeout(() => {
          if (!isResolved) {
            isResolved = true;
            debugLog(`SW通信タイムアウト: ${type} (${timeout}ms)`);
            reject(new Error(`SW Timeout: ${type}`));
          }
        }, timeout);

        try {
          debugLog(`SW通信送信: ${type}`, data);
          navigator.serviceWorker.controller.postMessage({ type, data }, [
            channel.port2,
          ]);
        } catch (error) {
          if (!isResolved) {
            isResolved = true;
            clearTimeout(timeoutId);
            reject(error);
          }
        }
      });
    },
  };

  // リトライ機能付きの安全な通信
  const sendMessageWithRetry = async (
    type: string,
    data?: unknown,
    maxRetries = 3
  ) => {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        debugLog(`SW通信試行 ${attempt}/${maxRetries}: ${type}`);
        const result = await swChannel.send(type, data, 8000);
        debugLog(`SW通信成功: ${type}`, result);
        return result;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        debugLog(`SW通信失敗 (試行${attempt}): ${type}`, lastError.message);

        if (attempt < maxRetries) {
          const waitTime = attempt * 1000;
          debugLog(`${waitTime}ms待機後、再試行します`);
          await new Promise((resolve) => setTimeout(resolve, waitTime));
        }
      }
    }

    throw lastError || new Error(`Failed after ${maxRetries} attempts`);
  };

  // Service Workerデバッガー（改善版）
  const swDebugger = {
    test: async () => {
      try {
        const result = await sendMessageWithRetry("PING");
        debugLog("Service Workerテスト完了", result);
        return result;
      } catch (error) {
        debugLog("Service Workerテスト失敗", error);
        throw error;
      }
    },

    getStatus: async () => {
      try {
        const result = await sendMessageWithRetry("GET_STATUS");
        debugLog("Service Workerステータス取得完了", result);
        return result;
      } catch (error) {
        debugLog("Service Workerステータス取得失敗", error);
        return {
          error: error instanceof Error ? error.message : "Unknown error",
          registrations: await navigator.serviceWorker
            .getRegistrations()
            .then((regs) => regs.length)
            .catch(() => 0),
          controller: !!navigator.serviceWorker.controller,
        };
      }
    },

    manualCheck: async () => {
      try {
        const result = await sendMessageWithRetry("CHECK_REMINDERS_NOW", undefined, 15000);
        debugLog("手動チェック完了", result);
        return result;
      } catch (error) {
        debugLog("手動チェック失敗", error);
        throw error;
      }
    },
  };

  // Update Bell データ同期機能（完全修正版）
  const updateBell = {
    updateRemindersCache: async (reminders: unknown[]) => {
      try {
        const result = await sendMessageWithRetry("REMINDERS_DATA", reminders);
        debugLog("リマインダーキャッシュ更新完了", result);
        return result;
      } catch (error) {
        debugLog("リマインダーキャッシュ更新失敗", error);
        // エラーでもアプリの動作は継続
        return { error: error instanceof Error ? error.message : "Unknown error" };
      }
    },

    updateSettingsCache: async (settings: unknown) => {
      try {
        const result = await sendMessageWithRetry("SETTINGS_DATA", settings);
        debugLog("設定キャッシュ更新完了", result);
        return result;
      } catch (error) {
        debugLog("設定キャッシュ更新失敗", error);
        // エラーでもアプリの動作は継続
        return { error: error instanceof Error ? error.message : "Unknown error" };
      }
    },

    startPeriodicCheck: async (interval: number) => {
      try {
        const result = await sendMessageWithRetry("START_PERIODIC_CHECK", { interval });
        debugLog("定期チェック開始完了", result);
        return result;
      } catch (error) {
        debugLog("定期チェック開始失敗", error);
        // エラーでもアプリの動作は継続
        return { error: error instanceof Error ? error.message : "Unknown error" };
      }
    },

    manualCheck: async () => {
      try {
        return await swDebugger.manualCheck();
      } catch (error) {
        debugLog("手動チェックエラー", error);
        throw error; // 手動チェックのエラーはユーザーに通知
      }
    }
  };

  // Service Worker 初期化監視
  const waitForServiceWorker = async (maxWait = 10000): Promise<boolean> => {
    const startTime = Date.now();

    while (Date.now() - startTime < maxWait) {
      if (navigator.serviceWorker.controller) {
        debugLog("Service Worker アクティブ確認");
        return true;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    debugLog("Service Worker アクティブ待機タイムアウト");
    return false;
  };

  // グローバルに設定（統一命名）
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).swDebugger = swDebugger;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).updateBell = updateBell; // bellReminder → updateBell

  debugLog("Service Workerデバッガー設定完了");

  // Service Worker登録（修正版）
  (async () => {
    try {
      const registration = await navigator.serviceWorker.register("/sw.js", {
        scope: "/",
      });

      debugLog("Service Worker登録成功", {
        scope: registration.scope,
        state: registration.active?.state,
      });

      // アクティブになるまで待機
      const isActive = await waitForServiceWorker();
      if (isActive) {
        debugLog("Service Worker通信準備完了");

        // 初期ステータス確認
        try {
          const status = await swDebugger.getStatus();
          debugLog("初期ステータス", status);
        } catch (error) {
          debugLog("初期ステータス取得失敗", error);
        }
      } else {
        debugLog("Service Workerアクティブ化待機失敗");
      }

      // Service Worker更新時の処理
      registration.addEventListener("updatefound", () => {
        debugLog("Service Worker更新検出");
        const newWorker = registration.installing;
        if (newWorker) {
          newWorker.addEventListener("statechange", () => {
            debugLog("Service Worker状態変更", newWorker.state);
            if (newWorker.state === "activated") {
              debugLog("新しいService Workerがアクティブになりました");
            }
          });
        }
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      debugLog("Service Worker登録失敗", errorMessage);
    }

    // Service Workerからのメッセージ受信
    navigator.serviceWorker.addEventListener("message", (event) => {
      debugLog("Service Workerからメッセージ受信", event.data);

      // カスタムイベントとして再発行（Reactコンポーネントでリッスン可能）
      window.dispatchEvent(
        new CustomEvent("serviceWorkerMessage", {
          detail: event.data,
        })
      );
    });

    // Service Worker制御変更の監視
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      debugLog("Service Worker制御変更検出");
      window.location.reload(); // 新しいService Workerで再開
    });
  })();
}

// エラーハンドリング強化
window.addEventListener("error", (event) => {
  if (event.message.includes("SW Timeout")) {
    debugLog("Service Workerタイムアウトエラー検出", {
      message: event.message,
      filename: event.filename,
      lineno: event.lineno,
    });
  }
});

window.addEventListener("unhandledrejection", (event) => {
  if (event.reason?.message?.includes("SW Timeout")) {
    debugLog("未処理のService Workerタイムアウト", event.reason);
    // デフォルトのエラー処理を防ぐ
    event.preventDefault();
  }
});

// React アプリケーション起動
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// PWAイベント設定
setupPWAEvents();

// Service Worker初期化
setupServiceWorkerManager();

debugLog("アプリケーション初期化完了");// src/main.tsx - 修正版
// タイムアウト問題解決・エラーハンドリング強化

import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

const debugLog = (message: string, data?: unknown) => {
  console.log(`[MAIN] ${message}`, data || "");
};

const isProduction = import.meta.env.PROD;

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

    if (window.matchMedia("(display-mode: standalone)").matches) {
      debugLog("既にPWAインストール済み");
      return;
    }

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

// Service Workerデバッガーとマネージャー設定（修正版）
function setupServiceWorkerManager() {
  if (!("serviceWorker" in navigator)) return;

  // Service Workerとの通信チャンネル（改善版）
  const swChannel = {
    send: async (type: string, data?: unknown, timeout = 10000) => {
      if (!navigator.serviceWorker.controller) {
        throw new Error("Service Worker not active");
      }

      return new Promise((resolve, reject) => {
        const channel = new MessageChannel();
        let isResolved = false;

        channel.port1.onmessage = (event) => {
          if (!isResolved) {
            isResolved = true;
            debugLog(`SW応答受信: ${type}`, event.data);
            resolve(event.data);
          }
        };

        const timeoutId = setTimeout(() => {
          if (!isResolved) {
            isResolved = true;
            debugLog(`SW通信タイムアウト: ${type} (${timeout}ms)`);
            reject(new Error(`SW Timeout: ${type}`));
          }
        }, timeout);

        try {
          debugLog(`SW通信送信: ${type}`, data);
          navigator.serviceWorker.controller.postMessage({ type, data }, [
            channel.port2,
          ]);
        } catch (error) {
          if (!isResolved) {
            isResolved = true;
            clearTimeout(timeoutId);
            reject(error);
          }
        }
      });
    },
  };

  // リトライ機能付きの安全な通信
  const sendMessageWithRetry = async (
    type: string,
    data?: unknown,
    maxRetries = 3
  ) => {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        debugLog(`SW通信試行 ${attempt}/${maxRetries}: ${type}`);
        const result = await swChannel.send(type, data, 8000);
        debugLog(`SW通信成功: ${type}`, result);
        return result;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        debugLog(`SW通信失敗 (試行${attempt}): ${type}`, lastError.message);

        if (attempt < maxRetries) {
          const waitTime = attempt * 1000;
          debugLog(`${waitTime}ms待機後、再試行します`);
          await new Promise((resolve) => setTimeout(resolve, waitTime));
        }
      }
    }

    throw lastError || new Error(`Failed after ${maxRetries} attempts`);
  };

  // Service Workerデバッガー（改善版）
  const swDebugger = {
    test: async () => {
      try {
        const result = await sendMessageWithRetry("PING");
        debugLog("Service Workerテスト完了", result);
        return result;
      } catch (error) {
        debugLog("Service Workerテスト失敗", error);
        throw error;
      }
    },

    getStatus: async () => {
      try {
        const result = await sendMessageWithRetry("GET_STATUS");
        debugLog("Service Workerステータス取得完了", result);
        return result;
      } catch (error) {
        debugLog("Service Workerステータス取得失敗", error);
        return {
          error: error instanceof Error ? error.message : "Unknown error",
          registrations: await navigator.serviceWorker
            .getRegistrations()
            .then((regs) => regs.length)
            .catch(() => 0),
          controller: !!navigator.serviceWorker.controller,
        };
      }
    },

    manualCheck: async () => {
      try {
        const result = await sendMessageWithRetry("CHECK_REMINDERS_NOW", undefined, 15000);
        debugLog("手動チェック完了", result);
        return result;
      } catch (error) {
        debugLog("手動チェック失敗", error);
        throw error;
      }
    },
  };

  // Bell Reminder データ同期機能（修正版）
  const bellReminder = {
    updateRemindersCache: async (reminders: unknown[]) => {
      try {
        const result = await sendMessageWithRetry("REMINDERS_DATA", reminders);
        debugLog("リマインダーキャッシュ更新完了", result);
        return result;
      } catch (error) {
        debugLog("リマインダーキャッシュ更新失敗", error);
        // エラーでもアプリの動作は継続
        return { error: error instanceof Error ? error.message : "Unknown error" };
      }
    },

    updateSettingsCache: async (settings: unknown) => {
      try {
        const result = await sendMessageWithRetry("SETTINGS_DATA", settings);
        debugLog("設定キャッシュ更新完了", result);
        return result;
      } catch (error) {
        debugLog("設定キャッシュ更新失敗", error);
        // エラーでもアプリの動作は継続
        return { error: error instanceof Error ? error.message : "Unknown error" };
      }
    },

    startPeriodicCheck: async (interval: number) => {
      try {
        const result = await sendMessageWithRetry("START_PERIODIC_CHECK", { interval });
        debugLog("定期チェック開始完了", result);
        return result;
      } catch (error) {
        debugLog("定期チェック開始失敗", error);
        // エラーでもアプリの動作は継続
        return { error: error instanceof Error ? error.message : "Unknown error" };
      }
    },

    manualCheck: async () => {
      try {
        return await swDebugger.manualCheck();
      } catch (error) {
        debugLog("手動チェックエラー", error);
        throw error; // 手動チェックのエラーはユーザーに通知
      }
    }
  };

  // Service Worker 初期化監視
  const waitForServiceWorker = async (maxWait = 10000): Promise<boolean> => {
    const startTime = Date.now();

    while (Date.now() - startTime < maxWait) {
      if (navigator.serviceWorker.controller) {
        debugLog("Service Worker アクティブ確認");
        return true;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    debugLog("Service Worker アクティブ待機タイムアウト");
    return false;
  };

  // グローバルに設定（型安全性のためany使用）
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).swDebugger = swDebugger;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).bellReminder = bellReminder;

  debugLog("Service Workerデバッガー設定完了");

  // Service Worker登録（修正版）
  (async () => {
    try {
      const registration = await navigator.serviceWorker.register("/sw.js", {
        scope: "/",
      });

      debugLog("Service Worker登録成功", {
        scope: registration.scope,
        state: registration.active?.state,
      });

      // アクティブになるまで待機
      const isActive = await waitForServiceWorker();
      if (isActive) {
        debugLog("Service Worker通信準備完了");

        // 初期ステータス確認
        try {
          const status = await swDebugger.getStatus();
          debugLog("初期ステータス", status);
        } catch (error) {
          debugLog("初期ステータス取得失敗", error);
        }
      } else {
        debugLog("Service Workerアクティブ化待機失敗");
      }

      // Service Worker更新時の処理
      registration.addEventListener("updatefound", () => {
        debugLog("Service Worker更新検出");
        const newWorker = registration.installing;
        if (newWorker) {
          newWorker.addEventListener("statechange", () => {
            debugLog("Service Worker状態変更", newWorker.state);
            if (newWorker.state === "activated") {
              debugLog("新しいService Workerがアクティブになりました");
            }
          });
        }
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      debugLog("Service Worker登録失敗", errorMessage);
    }

    // Service Workerからのメッセージ受信
    navigator.serviceWorker.addEventListener("message", (event) => {
      debugLog("Service Workerからメッセージ受信", event.data);

      // カスタムイベントとして再発行（Reactコンポーネントでリッスン可能）
      window.dispatchEvent(
        new CustomEvent("serviceWorkerMessage", {
          detail: event.data,
        })
      );
    });

    // Service Worker制御変更の監視
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      debugLog("Service Worker制御変更検出");
      window.location.reload(); // 新しいService Workerで再開
    });
  })();
}

// エラーハンドリング強化
window.addEventListener("error", (event) => {
  if (event.message.includes("SW Timeout")) {
    debugLog("Service Workerタイムアウトエラー検出", {
      message: event.message,
      filename: event.filename,
      lineno: event.lineno,
    });
  }
});

window.addEventListener("unhandledrejection", (event) => {
  if (event.reason?.message?.includes("SW Timeout")) {
    debugLog("未処理のService Workerタイムアウト", event.reason);
    // デフォルトのエラー処理を防ぐ
    event.preventDefault();
  }
});

// React アプリケーション起動
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// PWAイベント設定
setupPWAEvents();

// Service Worker初期化
setupServiceWorkerManager();

debugLog("アプリケーション初期化完了");