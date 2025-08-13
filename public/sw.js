// public/sw.js - 正確な時刻判定版
// タイムアウト問題解決・正確な時刻判定・詳細ログ

const CACHE_NAME = 'update-bell-v1.0.3';
const DEBUG_MODE = true;

// デバッグログ関数（詳細版）
const debugLog = (message, data) => {
  if (DEBUG_MODE) {
    console.log(`[SW] ${message}`, data || '');
  }
};

// 静的リソースのキャッシュリスト（最小限）
const STATIC_CACHE = [
  '/',
  '/index.html',
  '/manifest.json'
];

// Service Worker の状態管理（シンプル化）
let isReady = false;
let reminders = [];
let settings = { notificationInterval: 15 };
let checkInterval = null;

// 初期化処理（高速化）
const initialize = () => {
  if (isReady) return;
  debugLog('初期化開始');
  isReady = true;
  debugLog('初期化完了');
};

// インストール時のキャッシュ設定（簡素化）
self.addEventListener('install', (event) => {
  debugLog('Install event');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(STATIC_CACHE))
      .then(() => self.skipWaiting())
      .catch(error => debugLog('Install error:', error))
  );
});

// アクティベート時の処理（簡素化）
self.addEventListener('activate', (event) => {
  debugLog('Activate event');
  event.waitUntil(
    caches.keys()
      .then(cacheNames => {
        return Promise.all(
          cacheNames
            .filter(cacheName => cacheName !== CACHE_NAME)
            .map(cacheName => caches.delete(cacheName))
        );
      })
      .then(() => self.clients.claim())
      .then(() => initialize())
      .catch(error => debugLog('Activate error:', error))
  );
});

// ネットワーク要求の処理（安全版）
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        if (response) return response;
        return fetch(event.request);
      })
      .catch(() => {
        // オフライン時のフォールバック
        if (event.request.mode === 'navigate') {
          return caches.match('/index.html');
        }
        return new Response('', { status: 404 });
      })
  );
});

// メッセージ処理（完全書き直し - 同期処理中心）
const handleMessage = (data) => {
  try {
    const { type, ...payload } = data;
    debugLog(`メッセージ受信: ${type}`);

    switch (type) {
      case 'PING':
        return { type: 'PONG', timestamp: Date.now() };

      case 'UPDATE_REMINDERS':
        reminders = payload.reminders || [];
        settings = payload.settings || settings;
        debugLog(`リマインダー更新: ${reminders.length}件`);
        
        // デバッグ: 受信したリマインダーの詳細ログ
        reminders.forEach((reminder, index) => {
          debugLog(`リマインダー[${index}]:`, {
            title: reminder.title,
            schedule: reminder.schedule,
            isPaused: reminder.isPaused
          });
        });
        
        return { type: 'SUCCESS', count: reminders.length };

      case 'CHECK_REMINDERS_NOW':
        const results = checkRemindersSync();
        return { type: 'CHECK_COMPLETE', notifications: results };

      case 'START_NOTIFICATION_CHECK':
        startPeriodicCheck(payload.intervalMinutes || 15);
        return { 
          type: 'CHECK_STARTED', 
          interval: payload.intervalMinutes || 15 
        };

      case 'STOP_NOTIFICATION_CHECK':
        stopPeriodicCheck();
        return { type: 'CHECK_STOPPED' };

      case 'GET_STATUS':
        return {
          type: 'STATUS_RESPONSE',
          ready: isReady,
          reminders: reminders.length,
          interval: settings.notificationInterval,
          isRunning: !!checkInterval
        };

      default:
        debugLog(`未対応メッセージ: ${type}`);
        return { type: 'ERROR', message: 'Unknown message type' };
    }
  } catch (error) {
    debugLog(`メッセージ処理エラー:`, error);
    return { type: 'ERROR', message: error.message };
  }
};

// メッセージリスナー（同期処理・即座レスポンス）
self.addEventListener('message', (event) => {
  if (!isReady) {
    initialize();
  }

  try {
    // 同期的にレスポンスを生成
    const response = handleMessage(event.data);
    
    // MessageChannelを使用している場合
    if (event.ports && event.ports[0]) {
      event.ports[0].postMessage(response);
    }
    
  } catch (error) {
    debugLog('メッセージ処理エラー:', error);
    if (event.ports && event.ports[0]) {
      event.ports[0].postMessage({ 
        type: 'ERROR', 
        message: error.message 
      });
    }
  }
});

// リマインダーチェック（同期処理版・詳細ログ）
const checkRemindersSync = () => {
  const now = new Date();
  const notifications = [];

  debugLog(`リマインダーチェック開始: ${reminders.length}件`);
  debugLog(`現在時刻: ${now.toLocaleString()}`);

  for (const reminder of reminders) {
    if (reminder.isPaused) {
      debugLog(`スキップ(一時停止): ${reminder.title}`);
      continue;
    }

    try {
      const shouldNotify = shouldSendNotification(reminder, now);
      debugLog(`時刻判定 [${reminder.title}]:`, {
        shouldNotify,
        schedule: reminder.schedule,
        lastNotified: reminder.lastNotified
      });
      
      if (shouldNotify) {
        sendNotificationSync(reminder);
        notifications.push(reminder.id);
      }
    } catch (error) {
      debugLog(`リマインダー${reminder.id}エラー:`, error);
    }
  }

  debugLog(`通知送信完了: ${notifications.length}件`);
  return notifications;
};

// 通知判定（正確な実装）
const shouldSendNotification = (reminder, now) => {
  try {
    const schedule = reminder.schedule;
    if (!schedule) {
      debugLog('スケジュール情報なし');
      return false;
    }

    // 今日の指定時刻を計算
    const todayTarget = new Date(
      now.getFullYear(),
      now.getMonth(), 
      now.getDate(),
      schedule.hour,
      schedule.minute,
      0,
      0
    );

    debugLog('時刻詳細:', {
      現在時刻: now.toLocaleString(),
      目標時刻: todayTarget.toLocaleString(),
      時差分: Math.round((now.getTime() - todayTarget.getTime()) / (1000 * 60)),
      最終通知: reminder.lastNotified
    });

    // 時刻範囲チェック（目標時刻から30分以内）
    const timeDiff = now.getTime() - todayTarget.getTime();
    const withinTimeRange = timeDiff >= 0 && timeDiff <= (30 * 60 * 1000);

    if (!withinTimeRange) {
      debugLog(`時刻範囲外: ${Math.round(timeDiff / (1000 * 60))}分差`);
      return false;
    }

    // 本日既に通知済みチェック
    if (reminder.lastNotified) {
      const lastNotified = new Date(reminder.lastNotified);
      const isSameDay = lastNotified.toDateString() === now.toDateString();
      
      if (isSameDay) {
        debugLog('本日既に通知済み');
        return false;
      }
    }

    debugLog('通知条件満たす!');
    return true;

  } catch (error) {
    debugLog('時刻判定エラー:', error);
    return false;
  }
};

// 通知送信（同期処理版）
const sendNotificationSync = (reminder) => {
  try {
    self.registration.showNotification(reminder.title, {
      body: `リマインダー: ${reminder.title}`,
      icon: '/icon-192x192.png',
      badge: '/icon-96x96.png',
      tag: `reminder-${reminder.id}`,
      data: {
        reminderId: reminder.id,
        url: reminder.url,
        title: reminder.title
      },
      actions: [
        { action: 'open', title: '開く' },
        { action: 'dismiss', title: '閉じる' }
      ],
      requireInteraction: false,
      renotify: false
    });

    // 最終通知時刻を更新
    updateLastNotifiedSync(reminder.id);
    
    debugLog(`通知送信: ${reminder.title}`);
  } catch (error) {
    debugLog(`通知送信エラー: ${reminder.id}`, error);
  }
};

// 最終通知時刻更新（メインアプリに通知）
const updateLastNotifiedSync = (reminderId) => {
  try {
    const timestamp = new Date().toISOString();
    
    // メインアプリに更新を通知
    self.clients.matchAll().then(clients => {
      clients.forEach(client => {
        client.postMessage({
          type: 'UPDATE_LAST_NOTIFICATION',
          reminderId,
          timestamp
        });
      });
    });
    
    debugLog(`最終通知時刻更新: ${reminderId}`);
  } catch (error) {
    debugLog(`最終通知時刻更新エラー: ${reminderId}`, error);
  }
};

// 定期チェック開始
const startPeriodicCheck = (intervalMinutes) => {
  stopPeriodicCheck(); // 既存停止
  
  const intervalMs = intervalMinutes * 60 * 1000;
  checkInterval = setInterval(() => {
    try {
      checkRemindersSync();
    } catch (error) {
      debugLog('定期チェックエラー:', error);
    }
  }, intervalMs);
  
  debugLog(`定期チェック開始: ${intervalMinutes}分間隔`);
};

// 定期チェック停止
const stopPeriodicCheck = () => {
  if (checkInterval) {
    clearInterval(checkInterval);
    checkInterval = null;
    debugLog('定期チェック停止');
  }
};

// 通知クリック処理（簡素化）
self.addEventListener('notificationclick', (event) => {
  debugLog('通知クリック');
  event.notification.close();

  const { url } = event.notification.data || {};
  
  event.waitUntil(
    clients.openWindow(url || '/')
      .then(() => {
        // メインアプリに通知
        return self.clients.matchAll();
      })
      .then(clients => {
        clients.forEach(client => {
          client.postMessage({
            type: 'NOTIFICATION_CLICKED',
            reminderId: event.notification.data?.reminderId,
            timestamp: Date.now()
          });
        });
      })
      .catch(error => debugLog('通知クリック処理エラー:', error))
  );
});

// エラーハンドリング
self.addEventListener('error', (event) => {
  debugLog('Service Workerエラー:', event.error);
});

self.addEventListener('unhandledrejection', (event) => {
  debugLog('未処理のPromise拒否:', event.reason);
  event.preventDefault();
});

// 起動完了ログ
debugLog('Service Worker起動完了', {
  version: CACHE_NAME,
  timestamp: new Date().toLocaleString()
});

console.log(`🚀 おしらせベル Service Worker v${CACHE_NAME.split('-').pop()} 起動完了`);