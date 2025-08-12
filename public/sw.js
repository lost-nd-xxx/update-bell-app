// public/sw.js - Service Worker with Debug Features
// デバッグ機能付きService Worker

const CACHE_NAME = "web-manga-reminder-v1.0.0";
const STATIC_CACHE = [
  "/",
  "/index.html",
  "/manifest.json",
  "/icon-192x192.png",
  "/icon-512x512.png",
];

// ===== デバッグ機能 =====
class DebugLogger {
  constructor() {
    this.logs = [];
    this.maxLogs = 200;
    this.isDebugMode = true; // 本番では false に変更
  }

  log(level, message, data = null) {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level,
      message,
      data: data
        ? typeof data === "object"
          ? JSON.stringify(data)
          : data
        : null,
    };

    if (this.isDebugMode) {
      console.log(`[SW ${level}] ${timestamp}: ${message}`, data);
    }

    this.logs.push(logEntry);
    if (this.logs.length > this.maxLogs) {
      this.logs.shift();
    }

    // 重要なログはIndexedDBに保存
    if (level === "ERROR" || level === "WARN") {
      this.saveToDB(logEntry);
    }
  }

  async saveToDB(logEntry) {
    try {
      const request = indexedDB.open("sw-debug-logs", 1);
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains("logs")) {
          const store = db.createObjectStore("logs", { keyPath: "timestamp" });
          store.createIndex("level", "level", { unique: false });
        }
      };

      request.onsuccess = (event) => {
        const db = event.target.result;
        const transaction = db.transaction(["logs"], "readwrite");
        const store = transaction.objectStore("logs");
        store.add(logEntry);
      };
    } catch (error) {
      console.error("Failed to save log to IndexedDB:", error);
    }
  }

  getAllLogs() {
    return [...this.logs];
  }

  getLogsByLevel(level) {
    return this.logs.filter((log) => log.level === level);
  }
}

// グローバルデバッガーインスタンス
const debugLogger = new DebugLogger();

// ===== 拡張通知チェッカー =====
class NotificationChecker {
  constructor() {
    this.checkInterval = null;
    this.lastCheckTime = null;
    this.cachedReminders = [];
    this.cachedSettings = { notificationInterval: 15 };
    this.stats = {
      checksPerformed: 0,
      notificationsSent: 0,
      errors: 0,
    };
  }

  async startPeriodicCheck(intervalMinutes = 15) {
    debugLogger.log("INFO", `Starting periodic notification check`, {
      intervalMinutes,
      previousInterval: this.checkInterval ? "active" : "none",
    });

    // 既存のインターバルをクリア
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
    }

    // 新しいインターバルを設定
    this.checkInterval = setInterval(
      () => {
        this.checkAndSendNotifications();
      },
      intervalMinutes * 60 * 1000,
    );

    // 初回チェック（5秒後）
    setTimeout(() => {
      this.checkAndSendNotifications();
    }, 5000);

    debugLogger.log("INFO", "Periodic check started successfully");
  }

  stopPeriodicCheck() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
      debugLogger.log("INFO", "Periodic check stopped");
    }
  }

  async checkAndSendNotifications() {
    try {
      this.stats.checksPerformed++;
      this.lastCheckTime = new Date().toISOString();

      debugLogger.log(
        "INFO",
        `Notification check #${this.stats.checksPerformed}`,
        {
          timestamp: this.lastCheckTime,
          cachedReminders: this.cachedReminders.length,
        },
      );

      if (this.cachedReminders.length === 0) {
        debugLogger.log(
          "WARN",
          "No cached reminders found - requesting from client",
        );
        await this.requestRemindersFromClient();
        return;
      }

      const now = new Date();
      const notificationsSent = [];

      for (const reminder of this.cachedReminders) {
        try {
          if (reminder.isPaused) {
            debugLogger.log("DEBUG", `Skipping paused reminder`, {
              id: reminder.id,
              title: reminder.title,
            });
            continue;
          }

          const shouldNotify = this.shouldSendNotification(reminder, now);
          if (shouldNotify.should) {
            debugLogger.log("INFO", `Attempting to send notification`, {
              id: reminder.id,
              title: reminder.title,
              reason: shouldNotify.reason,
            });

            const success = await this.sendNotification(reminder);
            if (success) {
              notificationsSent.push({
                id: reminder.id,
                title: reminder.title,
                timestamp: now.toISOString(),
              });
              this.stats.notificationsSent++;

              // クライアントに更新を通知
              await this.updateLastNotificationTime(
                reminder.id,
                now.toISOString(),
              );
            }
          } else {
            debugLogger.log("DEBUG", `Not sending notification`, {
              id: reminder.id,
              title: reminder.title,
              reason: shouldNotify.reason,
            });
          }
        } catch (error) {
          debugLogger.log("ERROR", `Error processing reminder`, {
            id: reminder.id,
            error: error.message,
            stack: error.stack,
          });
          this.stats.errors++;
        }
      }

      debugLogger.log("INFO", `Notification check completed`, {
        notificationsSent: notificationsSent.length,
        totalChecks: this.stats.checksPerformed,
        totalNotifications: this.stats.notificationsSent,
        totalErrors: this.stats.errors,
        notifications: notificationsSent,
      });
    } catch (error) {
      debugLogger.log("ERROR", "Critical error during notification check", {
        error: error.message,
        stack: error.stack,
      });
      this.stats.errors++;
    }
  }

  shouldSendNotification(reminder, now) {
    // 時刻チェック
    const targetTime = reminder.schedule?.time;
    if (!targetTime) {
      return { should: false, reason: "No target time set" };
    }

    const currentTime = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}`;
    if (targetTime !== currentTime) {
      return {
        should: false,
        reason: `Time mismatch: ${currentTime} !== ${targetTime}`,
      };
    }

    // 重複通知防止（1時間以内）
    if (reminder.lastNotified) {
      const lastNotified = new Date(reminder.lastNotified);
      const timeDiff = now.getTime() - lastNotified.getTime();
      const hoursDiff = timeDiff / (1000 * 60 * 60);

      if (hoursDiff < 1) {
        return {
          should: false,
          reason: `Too soon since last notification (${hoursDiff.toFixed(2)}h ago)`,
        };
      }
    }

    // スケジュールチェック
    const scheduleMatch = this.checkScheduleMatch(reminder.schedule, now);
    if (!scheduleMatch.matches) {
      return { should: false, reason: scheduleMatch.reason };
    }

    return { should: true, reason: "All conditions met" };
  }

  checkScheduleMatch(schedule, now) {
    switch (schedule.periodicType) {
      case "daily":
        return { matches: true, reason: "Daily schedule" };

      case "interval":
        if (!schedule.lastNotified) {
          return {
            matches: true,
            reason: "First notification for interval schedule",
          };
        }
        const lastNotified = new Date(schedule.lastNotified);
        const daysDiff = Math.floor(
          (now.getTime() - lastNotified.getTime()) / (1000 * 60 * 60 * 24),
        );
        const intervalMatches = daysDiff >= schedule.intervalDays; // 変数名を変更
        return {
          matches: intervalMatches,
          reason: `Interval check: ${daysDiff}/${schedule.intervalDays} days`,
        };

      case "weekly":
        const currentDay = now.getDay();
        const weeklyMatches =
          schedule.weekdays && schedule.weekdays.includes(currentDay); // 変数名を変更
        return {
          matches: weeklyMatches,
          reason: `Weekly check: day ${currentDay}, allowed: ${schedule.weekdays}`,
        };

      case "monthly":
        const currentWeek = Math.ceil(now.getDate() / 7);
        const currentDayOfWeek = now.getDay();
        const weekMatches = currentWeek === schedule.weekOfMonth;
        const dayMatches = currentDayOfWeek === schedule.dayOfWeek;
        const monthlyMatches = weekMatches && dayMatches; // 変数名を変更
        return {
          matches: monthlyMatches,
          reason: `Monthly check: week ${currentWeek}/${schedule.weekOfMonth}, day ${currentDayOfWeek}/${schedule.dayOfWeek}`,
        };

      default:
        return {
          matches: false,
          reason: `Unknown schedule type: ${schedule.periodicType}`,
        };
    }
  }

  async sendNotification(reminder) {
    try {
      const notificationOptions = {
        body: `${reminder.title}\n${reminder.url}`,
        icon: "/icon-192x192.png",
        badge: "/icon-72x72.png",
        tag: `reminder-${reminder.id}`,
        data: {
          reminderId: reminder.id,
          url: reminder.url,
          title: reminder.title,
          action: "open",
        },
        actions: [
          {
            action: "open",
            title: "開く",
            icon: "/icon-72x72.png",
          },
          {
            action: "dismiss",
            title: "閉じる",
          },
        ],
        requireInteraction: true,
        renotify: true,
        silent: false,
      };

      await self.registration.showNotification(
        reminder.title,
        notificationOptions,
      );
      debugLogger.log("INFO", `Notification sent successfully`, {
        reminderId: reminder.id,
        title: reminder.title,
        url: reminder.url,
      });
      return true;
    } catch (error) {
      debugLogger.log("ERROR", `Failed to send notification`, {
        reminderId: reminder.id,
        title: reminder.title,
        error: error.message,
        stack: error.stack,
      });
      return false;
    }
  }

  async requestRemindersFromClient() {
    const clients = await self.clients.matchAll();
    if (clients.length > 0) {
      debugLogger.log("INFO", "Requesting reminders data from client");
      clients[0].postMessage({
        type: "REQUEST_REMINDERS_DATA",
        timestamp: new Date().toISOString(),
      });
    } else {
      debugLogger.log("WARN", "No clients available to request reminders data");
    }
  }

  async updateLastNotificationTime(reminderId, timestamp) {
    const clients = await self.clients.matchAll();
    if (clients.length > 0) {
      clients[0].postMessage({
        type: "UPDATE_LAST_NOTIFICATION",
        reminderId,
        timestamp,
      });
      debugLogger.log("INFO", "Sent update request to client", {
        reminderId,
        timestamp,
      });
    }
  }

  getStats() {
    return {
      ...this.stats,
      lastCheckTime: this.lastCheckTime,
      intervalActive: !!this.checkInterval,
      cachedRemindersCount: this.cachedReminders.length,
    };
  }
}

// ===== メインのService Worker処理 =====

// インスタンス作成
const notificationChecker = new NotificationChecker();

// インストール時のキャッシュ設定
self.addEventListener("install", (event) => {
  debugLogger.log("INFO", "Service Worker install event");
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => {
        debugLogger.log("INFO", "Caching static files", {
          files: STATIC_CACHE,
        });
        return cache.addAll(STATIC_CACHE);
      })
      .then(() => {
        debugLogger.log("INFO", "Static files cached successfully");
        return self.skipWaiting();
      })
      .catch((error) => {
        debugLogger.log("ERROR", "Cache failed during install", {
          error: error.message,
        });
        throw error;
      }),
  );
});

// アクティベート時の古いキャッシュ削除
self.addEventListener("activate", (event) => {
  debugLogger.log("INFO", "Service Worker activate event");
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) => {
        const deletePromises = cacheNames
          .filter((cacheName) => cacheName !== CACHE_NAME)
          .map((cacheName) => {
            debugLogger.log("INFO", "Deleting old cache", { cacheName });
            return caches.delete(cacheName);
          });
        return Promise.all(deletePromises);
      })
      .then(() => {
        debugLogger.log("INFO", "Old caches cleaned up");
        return self.clients.claim();
      })
      .catch((error) => {
        debugLogger.log("ERROR", "Error during activation", {
          error: error.message,
        });
      }),
  );
});

// ネットワーク要求の処理
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  event.respondWith(
    caches
      .match(event.request)
      .then((response) => {
        if (response) {
          debugLogger.log("DEBUG", "Cache hit", { url: event.request.url });
          return response;
        }

        debugLogger.log("DEBUG", "Cache miss - fetching", {
          url: event.request.url,
        });
        return fetch(event.request).then((response) => {
          if (
            !response ||
            response.status !== 200 ||
            response.type !== "basic"
          ) {
            return response;
          }

          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });

          return response;
        });
      })
      .catch((error) => {
        debugLogger.log("ERROR", "Fetch failed", {
          url: event.request.url,
          error: error.message,
        });
        if (event.request.destination === "document") {
          return caches.match("/index.html");
        }
        throw error;
      }),
  );
});

// メッセージハンドラー
self.addEventListener("message", async (event) => {
  const { type, data } = event.data || {};
  debugLogger.log("INFO", "Received message", { type, hasData: !!data });

  switch (type) {
    case "START_PERIODIC_CHECK":
      await notificationChecker.startPeriodicCheck(data?.interval || 15);
      break;

    case "STOP_PERIODIC_CHECK":
      notificationChecker.stopPeriodicCheck();
      break;

    case "CHECK_REMINDERS_NOW":
      await notificationChecker.checkAndSendNotifications();
      break;

    case "REMINDERS_DATA":
      notificationChecker.cachedReminders = data || [];
      debugLogger.log("INFO", "Updated reminders cache", {
        count: notificationChecker.cachedReminders.length,
      });
      break;

    case "SETTINGS_DATA":
      notificationChecker.cachedSettings = data || { notificationInterval: 15 };
      debugLogger.log("INFO", "Updated settings cache", { settings: data });
      // 間隔が変更された場合は再起動
      if (notificationChecker.checkInterval && data?.notificationInterval) {
        notificationChecker.startPeriodicCheck(data.notificationInterval);
      }
      break;

    case "GET_DEBUG_LOGS":
      const logs = debugLogger.getAllLogs();
      event.ports[0]?.postMessage({ type: "DEBUG_LOGS_RESPONSE", logs });
      debugLogger.log("INFO", "Sent debug logs to client", {
        logCount: logs.length,
      });
      break;

    case "GET_STATS":
      const stats = notificationChecker.getStats();
      event.ports[0]?.postMessage({ type: "STATS_RESPONSE", stats });
      debugLogger.log("INFO", "Sent stats to client", stats);
      break;

    case "GET_DEBUG_INFO":
      const debugInfo = {
        logs: debugLogger.getAllLogs().slice(-50), // 最新50件
        stats: notificationChecker.getStats(),
        cacheStatus: await caches.has(CACHE_NAME),
        timestamp: new Date().toISOString(),
      };
      event.ports[0]?.postMessage({ type: "DEBUG_INFO_RESPONSE", debugInfo });
      break;
  }
});

// 通知クリックハンドラー
self.addEventListener("notificationclick", (event) => {
  const { reminderId, url, title } = event.notification.data || {};

  debugLogger.log("INFO", "Notification clicked", {
    action: event.action,
    reminderId,
    url,
    title,
  });

  event.notification.close();

  if (event.action === "open" || !event.action) {
    event.waitUntil(
      clients.openWindow(url || "/").catch((error) => {
        debugLogger.log("ERROR", "Failed to open URL", {
          url,
          error: error.message,
        });
      }),
    );
  } else if (event.action === "dismiss") {
    debugLogger.log("INFO", "Notification dismissed by user");
  }

  // クライアントに通知クリックを報告
  event.waitUntil(
    self.clients.matchAll().then((clients) => {
      clients.forEach((client) => {
        client.postMessage({
          type: "NOTIFICATION_CLICKED",
          reminderId: reminderId,
          action: event.action || "default",
          timestamp: new Date().toISOString(),
        });
      });
    }),
  );
});

// エラーハンドリング
self.addEventListener("error", (event) => {
  debugLogger.log("ERROR", "Service Worker error", {
    filename: event.filename,
    lineno: event.lineno,
    colno: event.colno,
    error: event.error?.message,
    stack: event.error?.stack,
  });
});

self.addEventListener("unhandledrejection", (event) => {
  debugLogger.log("ERROR", "Unhandled promise rejection", {
    reason: event.reason,
    stack: event.reason?.stack,
  });
});

// 初期化ログ
debugLogger.log(
  "INFO",
  "Web Manga Reminder Service Worker initialized with debug features",
  {
    cacheVersion: CACHE_NAME,
    timestamp: new Date().toISOString(),
    staticCacheFiles: STATIC_CACHE.length,
  },
);

// デバッグ用グローバル関数
self.getDebugInfo = () => ({
  logs: debugLogger.getAllLogs(),
  stats: notificationChecker.getStats(),
  cacheInfo: {
    name: CACHE_NAME,
    staticFiles: STATIC_CACHE,
  },
});

self.debugLogger = debugLogger;
self.notificationChecker = notificationChecker;
