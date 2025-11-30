// public/sw.js - setTimeout-based scheduling
const CACHE_NAME = "update-bell-v2.1.0";
const DEBUG_MODE = true;

let notificationTimer = null;

const debugLog = (message, data) => {
  if (DEBUG_MODE) {
    console.log(`[SW] ${message}`, data || "");
  }
};

self.addEventListener("install", (event) => {
  debugLog("Install event v2.1.0");
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  debugLog("Activate event v2.1.0");
  event.waitUntil(self.clients.claim());
});

const showNotification = (reminder) => {
  debugLog("通知を表示します:", reminder.title);
  self.registration
    .showNotification(reminder.title, {
      body: `リマインダー: ${reminder.title}`,
      icon: "/icon-192x192.png",
      badge: "/icon-badge.png", // This should be a monochrome icon
      tag: `reminder-${reminder.id}`,
      data: {
        url: reminder.url,
        reminderId: reminder.id,
      },
    })
    .then(() => {
      // Notify clients that notification was shown
      self.clients.matchAll().then((clients) => {
        clients.forEach((client) => {
          client.postMessage({
            type: "NOTIFICATION_EXECUTED",
            payload: { executedReminderId: reminder.id },
          });
        });
      });
    });
};

const scheduleNextNotification = (reminder, scheduleTime) => {
  if (notificationTimer) {
    clearTimeout(notificationTimer);
    debugLog("既存のタイマーをキャンセルしました。");
  }

  const now = Date.now();
  const delay = scheduleTime - now;

  if (delay <= 0) {
    debugLog("スケジュール時刻が過去です。通知をすぐに実行します。", {
      reminder,
      scheduleTime,
    });
    showNotification(reminder);
    return;
  }

  debugLog(
    `次の通知を予約しました: ${reminder.title} in ${Math.round(delay / 1000)}s`,
  );

  notificationTimer = setTimeout(() => {
    showNotification(reminder);
  }, delay);
};

const cancelAllNotifications = () => {
  if (notificationTimer) {
    clearTimeout(notificationTimer);
    notificationTimer = null;
    debugLog("すべての予約済み通知（タイマー）をキャンセルしました。");
  }
};

self.addEventListener("message", (event) => {
  const { type, payload } = event.data;

  debugLog(`メッセージ受信: ${type}`, payload);

  switch (type) {
    case "SCHEDULE_NEXT_REMINDER":
      if (payload && payload.reminder && payload.scheduleTime) {
        scheduleNextNotification(payload.reminder, payload.scheduleTime);
      }
      break;

    case "CANCEL_ALL_REMINDERS":
      cancelAllNotifications();
      break;

    case "TEST_NOTIFICATION":
      setTimeout(() => {
        self.registration.showNotification("おしらせベル テスト通知", {
          body: "通知が正しく設定されています。",
          icon: "/icon-192x192.png",
          badge: "/icon-badge.png",
          tag: "test-notification",
        });
      }, 5000);
      break;

    default:
      debugLog(`未対応メッセージ: ${type}`);
  }
});

self.addEventListener("notificationclick", (event) => {
  debugLog("通知がクリックされました", event.notification.data);
  event.notification.close();

  const url = event.notification.data?.url;
  if (url) {
    event.waitUntil(clients.openWindow(url));
  }
});

self.addEventListener('push', event => {
  debugLog('Push event received', event.data ? event.data.text() : 'No payload');
  
  let pushData;
  try {
    pushData = event.data.json();
  } catch (e) {
    debugLog('Failed to parse push data as JSON', event.data.text());
    pushData = {
      title: 'Update Bell',
      body: event.data.text() || 'You have a new reminder.',
    };
  }

  const title = pushData.title || 'Update Bell Reminder';
  const options = {
    body: pushData.body,
    icon: pushData.icon || '/icon-192x192.png',
    badge: pushData.badge || '/icon-badge.png',
    tag: pushData.tag || 'general-notification',
    data: {
      url: pushData.url, // URLをdataに含めることで、notificationclickで利用
    },
  };

  const notificationPromise = self.registration.showNotification(title, options);
  event.waitUntil(notificationPromise);
});

debugLog("Service Worker (v2.1.0) 起動完了");
