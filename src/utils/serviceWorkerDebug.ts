// src/utils/serviceWorkerDebug.ts
// Service Worker デバッグヘルパークラス

interface ServiceWorkerDebugInfo {
  isSupported: boolean;
  registration: ServiceWorkerRegistration | null;
  controller: ServiceWorker | null;
  state: string | undefined;
  scope: string | undefined;
  updateFound: boolean;
}

interface NotificationDebugInfo {
  permission: NotificationPermission;
  maxActions: number | string;
  isSupported: boolean;
  isPWAInstalled: boolean;
  userAgent: string;
  platform: string;
}

interface ReminderData {
  id: string;
  lastNotified?: string;
  isPaused?: boolean;
  [key: string]: unknown;
}

interface DebugLogEntry {
  timestamp: string;
  level: string;
  message: string;
  data?: string | null;
}

type GlobalDebugFunctions = {
  get: () => ServiceWorkerDebugger;
  logs: () => Promise<DebugLogEntry[]>;
  info: () => Promise<ServiceWorkerDebugInfo>;
  report: () => Promise<unknown>;
  export: () => Promise<void>;
  check: () => Promise<void>;
  start: (interval?: number) => Promise<void>;
  stop: () => Promise<void>;
};

export class ServiceWorkerDebugger {
  private registration: ServiceWorkerRegistration | null = null;

  constructor() {
    this.init();
  }

  async init() {
    if ("serviceWorker" in navigator) {
      try {
        this.registration =
          (await navigator.serviceWorker.getRegistration()) || null;
        this.setupMessageListener();
        console.log("SW Debugger initialized:", this.registration);
      } catch (error) {
        console.error("Failed to initialize SW debugger:", error);
      }
    }
  }

  private setupMessageListener() {
    navigator.serviceWorker.addEventListener("message", (event) => {
      console.log("Message from SW:", event.data);

      switch (event.data.type) {
        case "REQUEST_REMINDERS_DATA":
          this.sendRemindersData();
          break;

        case "UPDATE_LAST_NOTIFICATION":
          this.updateReminderNotificationTime(
            event.data.reminderId,
            event.data.timestamp,
          );
          break;
      }
    });
  }

  private sendRemindersData() {
    try {
      const remindersData = JSON.parse(
        localStorage.getItem("update-bell-data") || "{}",
      );

      navigator.serviceWorker.controller?.postMessage({
        type: "REMINDERS_DATA_RESPONSE",
        data: remindersData,
      });

      console.log("Sent reminders data to SW:", remindersData);
    } catch (error) {
      console.error("Failed to send reminders data:", error);
    }
  }

  private updateReminderNotificationTime(
    reminderId: string,
    timestamp: string,
  ) {
    try {
      // 配列形式のデータを取得（修正）
      const reminders = JSON.parse(
        localStorage.getItem("update-bell-data") || "[]",
      );

      console.log("SW更新処理:", { reminderId, timestamp, reminderCount: reminders.length });

      // 配列から該当リマインダーを検索（修正）
      const reminderIndex = reminders.findIndex(
        (r: ReminderData) => r.id === reminderId,
      );

      if (reminderIndex !== -1) {
        // 最終通知時刻を更新
        reminders[reminderIndex].lastNotified = timestamp;
        
        // LocalStorageに保存（配列として）
        localStorage.setItem("update-bell-data", JSON.stringify(reminders));
        
        console.log(
          `✅ Updated lastNotified for reminder ${reminderId}:`,
          timestamp,
        );

        // アプリの状態も更新（カスタムイベント発火）
        window.dispatchEvent(
          new CustomEvent("reminderUpdated", {
            detail: { reminderId, timestamp },
          }),
        );
        
        console.log("📡 reminderUpdated イベント発火完了");
      } else {
        console.warn(`⚠️ Reminder not found: ${reminderId}`);
      }
    } catch (error) {
      console.error("❌ Failed to update reminder notification time:", error);
    }
  }

  async getDebugLogs(): Promise<DebugLogEntry[]> {
    return new Promise((resolve) => {
      if (!navigator.serviceWorker.controller) {
        resolve([]);
        return;
      }

      const channel = new MessageChannel();

      channel.port1.onmessage = (event) => {
        if (event.data.type === "DEBUG_LOGS_RESPONSE") {
          resolve(event.data.logs || []);
        }
      };

      navigator.serviceWorker.controller.postMessage(
        { type: "GET_DEBUG_LOGS" },
        [channel.port2],
      );

      // タイムアウト
      setTimeout(() => resolve([]), 5000);
    });
  }

  async startNotificationCheck(intervalMinutes: number = 15) {
    if (navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({
        type: "START_NOTIFICATION_CHECK",
        intervalMinutes,
      });
      console.log(
        `Started notification check with ${intervalMinutes}min interval`,
      );
    }
  }

  async stopNotificationCheck() {
    if (navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({
        type: "STOP_NOTIFICATION_CHECK",
      });
      console.log("Stopped notification check");
    }
  }

  async manualNotificationCheck() {
    if (navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({
        type: "MANUAL_NOTIFICATION_CHECK",
      });
      console.log("Manual notification check triggered");
    }
  }

  async getServiceWorkerInfo(): Promise<ServiceWorkerDebugInfo> {
    const info: ServiceWorkerDebugInfo = {
      isSupported: "serviceWorker" in navigator,
      registration: this.registration,
      controller: navigator.serviceWorker.controller,
      state: this.registration?.active?.state,
      scope: this.registration?.scope,
      updateFound: false,
    };

    // アップデート確認
    if (this.registration) {
      await this.registration.update();
      info.updateFound = !!this.registration.waiting;
    }

    return info;
  }

  async getNotificationInfo(): Promise<NotificationDebugInfo> {
    // maxActionsは標準にないプロパティなので、安全にアクセス
    const NotificationWithExtensions = Notification as typeof Notification & {
      maxActions?: number;
    };
    const maxActions = NotificationWithExtensions.maxActions || "unknown";

    return {
      permission: Notification.permission,
      maxActions,
      isSupported: "Notification" in window,
      isPWAInstalled: window.matchMedia("(display-mode: standalone)").matches,
      userAgent: navigator.userAgent,
      platform: navigator.platform,
    };
  }

  async createDebugReport() {
    const [swInfo, notificationInfo, debugLogs] = await Promise.all([
      this.getServiceWorkerInfo(),
      this.getNotificationInfo(),
      this.getDebugLogs(),
    ]);

    const remindersData = JSON.parse(
      localStorage.getItem("update-bell-data") || "{}",
    );

    const report = {
      timestamp: new Date().toISOString(),
      serviceWorker: swInfo,
      notifications: notificationInfo,
      reminders: {
        count: remindersData.reminders?.length || 0,
        active:
          remindersData.reminders?.filter((r: ReminderData) => !r.isPaused)
            .length || 0,
        paused:
          remindersData.reminders?.filter((r: ReminderData) => r.isPaused)
            .length || 0,
      },
      settings: remindersData.settings || {},
      debugLogs: debugLogs.slice(-50), // 最新50件
      userAgent: navigator.userAgent,
      url: window.location.href,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    };

    return report;
  }

  async exportDebugReport() {
    const report = await this.createDebugReport();
    const blob = new Blob([JSON.stringify(report, null, 2)], {
      type: "application/json",
    });

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `sw-debug-report-${new Date().toISOString().split("T")[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    console.log("Debug report exported:", report);
  }
}

// グローバルインスタンス
let debuggerInstance: ServiceWorkerDebugger | null = null;

export function getServiceWorkerDebugger(): ServiceWorkerDebugger {
  if (!debuggerInstance) {
    debuggerInstance = new ServiceWorkerDebugger();
  }
  return debuggerInstance;
}

// デバッグ用のグローバル関数（開発時のみ）
if (import.meta.env.DEV) {
  const globalFunctions: GlobalDebugFunctions = {
    get: () => getServiceWorkerDebugger(),
    logs: () => getServiceWorkerDebugger().getDebugLogs(),
    info: () => getServiceWorkerDebugger().getServiceWorkerInfo(),
    report: () => getServiceWorkerDebugger().createDebugReport(),
    export: () => getServiceWorkerDebugger().exportDebugReport(),
    check: () => getServiceWorkerDebugger().manualNotificationCheck(),
    start: (interval?: number) =>
      getServiceWorkerDebugger().startNotificationCheck(interval),
    stop: () => getServiceWorkerDebugger().stopNotificationCheck(),
  };

  (window as Window & { swDebugger?: GlobalDebugFunctions }).swDebugger =
    globalFunctions;
}
