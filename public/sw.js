// public/sw.js - Service Worker (JavaScript)
// 注意: Service WorkerはTypeScriptで直接書けないため、JavaScriptで実装

const CACHE_NAME = 'web-manga-reminder-v1.0.0';
const STATIC_CACHE = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon-192x192.png',
  '/icon-512x512.png'
];

// インストール時のキャッシュ設定
self.addEventListener('install', (event) => {
  console.log('Service Worker: Install event');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Service Worker: Caching files');
        return cache.addAll(STATIC_CACHE);
      })
      .then(() => self.skipWaiting())
      .catch(error => console.error('Service Worker: Cache failed', error))
  );
});

// アクティベート時の古いキャッシュ削除
self.addEventListener('activate', (event) => {
  console.log('Service Worker: Activate event');
  event.waitUntil(
    caches.keys()
      .then(cacheNames => {
        return Promise.all(
          cacheNames
            .filter(cacheName => cacheName !== CACHE_NAME)
            .map(cacheName => {
              console.log('Service Worker: Deleting old cache', cacheName);
              return caches.delete(cacheName);
            })
        );
      })
      .then(() => self.clients.claim())
  );
});

// ネットワーク要求の処理
self.addEventListener('fetch', (event) => {
  // GET リクエストのみキャッシュ対象
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request)
      .then(response => {
        if (response) {
          return response;
        }
        
        return fetch(event.request)
          .then(response => {
            // レスポンスが有効でない場合はそのまま返す
            if (!response || response.status !== 200 || response.type !== 'basic') {
              return response;
            }

            // レスポンスをキャッシュに保存
            const responseToCache = response.clone();
            caches.open(CACHE_NAME)
              .then(cache => {
                cache.put(event.request, responseToCache);
              });

            return response;
          });
      })
      .catch(error => {
        console.error('Service Worker: Fetch failed', error);
        // オフライン時のフォールバック
        if (event.request.destination === 'document') {
          return caches.match('/index.html');
        }
      })
  );
});

// 通知の許可状態を確認
const checkNotificationPermission = () => {
  if (!('Notification' in self)) {
    console.log('Service Worker: Notifications not supported');
    return false;
  }
  return Notification.permission === 'granted';
};

// リマインダーデータを保持する変数
let cachedReminders = [];
let cachedSettings = { notificationInterval: 15 };

// 通知が必要なリマインダーをチェック
const checkReminders = async () => {
  if (!checkNotificationPermission()) {
    console.log('Service Worker: No notification permission');
    return;
  }

  try {
    const now = new Date();
    console.log('Service Worker: Checking reminders at', now.toISOString());

    for (const reminder of cachedReminders) {
      if (reminder.isPaused) continue; // 一時停止中はスキップ

      const nextNotification = calculateNextNotificationTime(reminder);
      const timeDiff = Math.abs(now.getTime() - nextNotification.getTime());
      const checkInterval = cachedSettings.notificationInterval || 15;
      
      // 通知時刻から間隔分以内で、まだ通知していない場合
      if (timeDiff <= checkInterval * 60 * 1000 && 
          (!reminder.lastNotified || 
           now.getTime() - new Date(reminder.lastNotified).getTime() > 60 * 60 * 1000)) { // 1時間以上経過
        
        await showNotification(reminder);
        
        // クライアントに通知送信を報告
        const clients = await self.clients.matchAll();
        clients.forEach(client => {
          client.postMessage({
            type: 'NOTIFICATION_SENT',
            reminderId: reminder.id,
            timestamp: now.toISOString()
          });
        });
      }
    }
  } catch (error) {
    console.error('Service Worker: Reminder check failed', error);
  }
};

// 次の通知時刻を計算（簡易版）
const calculateNextNotificationTime = (reminder) => {
  const now = new Date();
  let nextDate = new Date();

  switch (reminder.schedule.type) {
    case 'daily':
      nextDate.setDate(now.getDate() + (reminder.schedule.interval || 1));
      break;
    
    case 'weekly':
      const daysUntilTarget = (reminder.schedule.dayOfWeek - now.getDay() + 7) % 7;
      nextDate.setDate(now.getDate() + (daysUntilTarget || 7));
      break;
    
    case 'monthly':
      // 簡易実装（完全版は複雑）
      nextDate.setMonth(now.getMonth() + 1);
      break;
  }

  nextDate.setHours(reminder.schedule.hour || 10, reminder.schedule.minute || 0, 0, 0);
  return nextDate;
};

// 通知を表示
const showNotification = async (reminder) => {
  const options = {
    body: `${reminder.title}の更新をチェックしましょう！`,
    icon: '/icon-192x192.png',
    badge: '/icon-72x72.png',
    tag: `reminder-${reminder.id}`,
    requireInteraction: true,
    actions: [
      {
        action: 'open',
        title: '開く',
        icon: '/icon-72x72.png'
      },
      {
        action: 'dismiss',
        title: '閉じる'
      }
    ],
    data: {
      reminderId: reminder.id,
      url: reminder.url,
      title: reminder.title
    },
    timestamp: Date.now()
  };

  try {
    await self.registration.showNotification(
      'ウェブ漫画リマインダー',
      options
    );
    console.log('Service Worker: Notification shown for', reminder.title);
  } catch (error) {
    console.error('Service Worker: Failed to show notification', error);
  }
};

// 通知クリック時の処理
self.addEventListener('notificationclick', (event) => {
  console.log('Service Worker: Notification clicked', event.action);
  event.notification.close();

  const { reminderId, url, title } = event.notification.data || {};

  if (event.action === 'open') {
    // URLを開く
    event.waitUntil(
      clients.openWindow(url || '/')
    );
  } else if (event.action === 'dismiss') {
    // 何もしない（通知を閉じるだけ）
    console.log('Service Worker: Notification dismissed');
  } else {
    // デフォルト：アプリを開く
    event.waitUntil(
      clients.openWindow('/')
    );
  }

  // クライアントに通知クリックを報告
  event.waitUntil(
    self.clients.matchAll().then(clients => {
      clients.forEach(client => {
        client.postMessage({
          type: 'NOTIFICATION_CLICKED',
          reminderId: reminderId,
          action: event.action || 'default'
        });
      });
    })
  );
});

// 定期的なリマインダーチェック
let checkInterval;

const startPeriodicCheck = (intervalMinutes = 15) => {
  console.log('Service Worker: Starting periodic check every', intervalMinutes, 'minutes');
  
  if (checkInterval) {
    clearInterval(checkInterval);
  }
  
  checkInterval = setInterval(() => {
    checkReminders();
  }, intervalMinutes * 60 * 1000);
  
  // 初回実行
  setTimeout(checkReminders, 5000); // 5秒後に初回チェック
};

// クライアントからのメッセージを処理
self.addEventListener('message', (event) => {
  const { type, data, reminderId } = event.data || {};
  console.log('Service Worker: Received message', type);

  switch (type) {
    case 'START_PERIODIC_CHECK':
      startPeriodicCheck(data?.interval);
      break;
    
    case 'CHECK_REMINDERS_NOW':
      checkReminders();
      break;
    
    case 'REMINDERS_DATA':
      cachedReminders = data || [];
      console.log('Service Worker: Updated reminders cache', cachedReminders.length, 'items');
      break;
      
    case 'SETTINGS_DATA':
      cachedSettings = data || { notificationInterval: 15 };
      console.log('Service Worker: Updated settings cache');
      // 間隔が変更された場合は再起動
      if (checkInterval) {
        startPeriodicCheck(cachedSettings.notificationInterval);
      }
      break;
    
    case 'UPDATE_CHECK_INTERVAL':
      if (data?.interval) {
        startPeriodicCheck(data.interval);
      }
      break;
      
    case 'GET_REMINDERS':
      // クライアントにキャッシュされたデータを要求
      event.ports[0]?.postMessage({
        type: 'REQUEST_REMINDERS_DATA'
      });
      break;
      
    case 'GET_SETTINGS':
      // クライアントにキャッシュされた設定を要求
      event.ports[0]?.postMessage({
        type: 'REQUEST_SETTINGS_DATA'
      });
      break;
  }
});

// バックグラウンド同期
self.addEventListener('sync', (event) => {
  console.log('Service Worker: Background sync', event.tag);
  if (event.tag === 'reminder-check') {
    event.waitUntil(checkReminders());
  }
});

// プッシュ通知（将来的な拡張用）
self.addEventListener('push', (event) => {
  console.log('Service Worker: Push received');
  if (event.data) {
    try {
      const data = event.data.json();
      event.waitUntil(showNotification(data));
    } catch (error) {
      console.error('Service Worker: Push data parse failed', error);
    }
  }
});

// エラーハンドリング
self.addEventListener('error', (event) => {
  console.error('Service Worker: Error', event.error);
});

self.addEventListener('unhandledrejection', (event) => {
  console.error('Service Worker: Unhandled promise rejection', event.reason);
});

console.log('Service Worker: Web Manga Reminder SW loaded');