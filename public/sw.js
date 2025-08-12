// public/sw.js - 改善版Service Worker（競合修正・デバッグ強化）
// vite-plugin-pwaとの競合を回避し、デバッグ機能を強化したバージョン

const CACHE_NAME = 'web-manga-reminder-v1.0.1';
const DEBUG_MODE = true; // デバッグモードの切り替え

// デバッグログ関数
const debugLog = (message, data) => {
  if (DEBUG_MODE) {
    const timestamp = new Date().toLocaleTimeString();
    console.log(`[SW ${timestamp}] ${message}`, data || '');
  }
};

// 静的リソースのキャッシュリスト
const STATIC_CACHE = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon-192x192.png',
  '/icon-512x512.png'
];

// Service Worker の状態管理
let isInitialized = false;
let cachedReminders = [];
let cachedSettings = { notificationInterval: 15 };
let checkInterval = null;
let messageQueue = [];

// 初期化処理
const initialize = () => {
  if (isInitialized) return;
  
  debugLog('Service Worker初期化開始');
  isInitialized = true;
  
  // メッセージキューの処理
  if (messageQueue.length > 0) {
    debugLog(`メッセージキューから${messageQueue.length}件処理`);
    messageQueue.forEach(queuedMessage => {
      handleMessage(queuedMessage);
    });
    messageQueue = [];
  }
  
  debugLog('Service Worker初期化完了');
};

// インストール時のキャッシュ設定
self.addEventListener('install', (event) => {
  debugLog('Service Worker: Install event');
  
  event.waitUntil(
    (async () => {
      try {
        const cache = await caches.open(CACHE_NAME);
        debugLog('キャッシュオープン成功');
        
        // 静的リソースをキャッシュ
        await cache.addAll(STATIC_CACHE);
        debugLog(`${STATIC_CACHE.length}個のリソースをキャッシュ`);
        
        // 即座にアクティブ化
        await self.skipWaiting();
        debugLog('Service Worker即座にアクティブ化');
        
      } catch (error) {
        debugLog('インストール中エラー', error);
        throw error;
      }
    })()
  );
});

// アクティベート時の処理
self.addEventListener('activate', (event) => {
  debugLog('Service Worker: Activate event');
  
  event.waitUntil(
    (async () => {
      try {
        // 古いキャッシュの削除
        const cacheNames = await caches.keys();
        const deletePromises = cacheNames
          .filter(cacheName => cacheName !== CACHE_NAME)
          .map(async (cacheName) => {
            debugLog(`古いキャッシュ削除: ${cacheName}`);
            return await caches.delete(cacheName);
          });
        
        await Promise.all(deletePromises);
        debugLog(`${deletePromises.length}個の古いキャッシュを削除`);
        
        // 全てのクライアントを制御下に置く
        await self.clients.claim();
        debugLog('全クライアントを制御下に配置');
        
        // 初期化実行
        initialize();
        
      } catch (error) {
        debugLog('アクティベート中エラー', error);
      }
    })()
  );
});

// ネットワーク要求の処理（改善版）
self.addEventListener('fetch', (event) => {
  // GET リクエストのみ処理
  if (event.request.method !== 'GET') {
    return;
  }

  // chrome-extension等の特殊スキームを除外
  if (!event.request.url.startsWith('http')) {
    return;
  }

  event.respondWith(
    (async () => {
      try {
        // キャッシュから確認
        const cachedResponse = await caches.match(event.request);
        if (cachedResponse) {
          debugLog(`キャッシュヒット: ${event.request.url}`);
          return cachedResponse;
        }
        
        // ネットワークから取得
        const networkResponse = await fetch(event.request);
        
        // レスポンスが有効な場合のみキャッシュ
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
          const cache = await caches.open(CACHE_NAME);
          cache.put(event.request, networkResponse.clone());
          debugLog(`新規キャッシュ: ${event.request.url}`);
        }
        
        return networkResponse;
        
      } catch (error) {
        debugLog(`Fetchエラー: ${event.request.url}`, error);
        
        // オフライン時のフォールバック
        if (event.request.destination === 'document') {
          const cachedIndex = await caches.match('/index.html');
          return cachedIndex || new Response('オフライン中です', { status: 503 });
        }
        
        throw error;
      }
    })()
  );
});

// 通知許可チェック（改善版）
const checkNotificationPermission = () => {
  if (!('Notification' in self)) {
    debugLog('Notification API非対応');
    return false;
  }
  
  const hasPermission = Notification.permission === 'granted';
  debugLog(`通知許可状態: ${Notification.permission}`);
  return hasPermission;
};

// 次の通知時刻計算（改善版）
const calculateNextNotificationTime = (reminder) => {
  try {
    const now = new Date();
    let nextDate = new Date();

    switch (reminder.schedule.type) {
      case 'daily':
        const interval = reminder.schedule.interval || 1;
        nextDate.setDate(now.getDate() + interval);
        break;
      
      case 'weekly':
        const targetDay = reminder.schedule.dayOfWeek || 0;
        const currentDay = now.getDay();
        const daysUntilTarget = (targetDay - currentDay + 7) % 7;
        nextDate.setDate(now.getDate() + (daysUntilTarget || 7));
        break;
      
      case 'weekly-multiple':
        const targetDays = reminder.schedule.daysOfWeek || [0];
        const today = now.getDay();
        const nextDay = targetDays.find(day => day > today) || targetDays[0];
        const daysToAdd = nextDay > today ? nextDay - today : nextDay + 7 - today;
        nextDate.setDate(now.getDate() + daysToAdd);
        break;
      
      case 'monthly':
        // 月の第N週の指定曜日
        const weekNum = reminder.schedule.weekOfMonth || 1;
        const dayOfWeek = reminder.schedule.dayOfWeek || 0;
        
        // 来月の第N週の指定曜日を計算
        nextDate.setMonth(now.getMonth() + 1, 1);
        nextDate.setDate(1);
        
        // その月の最初の指定曜日を見つける
        while (nextDate.getDay() !== dayOfWeek) {
          nextDate.setDate(nextDate.getDate() + 1);
        }
        
        // N週目に調整
        nextDate.setDate(nextDate.getDate() + (weekNum - 1) * 7);
        break;
      
      default:
        debugLog(`未対応のスケジュールタイプ: ${reminder.schedule.type}`);
        nextDate.setDate(now.getDate() + 1);
    }

    // 時刻設定
    const hour = reminder.schedule.hour || 10;
    const minute = reminder.schedule.minute || 0;
    nextDate.setHours(hour, minute, 0, 0);

    debugLog(`次回通知計算: ${reminder.title}`, {
      type: reminder.schedule.type,
      current: now.toLocaleString(),
      next: nextDate.toLocaleString()
    });

    return nextDate;
  } catch (error) {
    debugLog('次回通知計算エラー', error);
    const fallback = new Date();
    fallback.setDate(fallback.getDate() + 1);
    return fallback;
  }
};

// 通知表示（改善版）
const showNotification = async (reminder) => {
  if (!checkNotificationPermission()) {
    debugLog('通知許可なし');
    return false;
  }

  const options = {
    body: `${reminder.title}の更新をチェックしましょう！`,
    icon: '/icon-192x192.png',
    badge: '/icon-72x72.png',
    tag: `reminder-${reminder.id}`,
    requireInteraction: false,
    silent: false,
    
    actions: [
      {
        action: 'open',
        title: '開く',
        icon: '/icon-72x72.png'
      },
      {
        action: 'dismiss',
        title: '後で'
      }
    ],
    
    data: {
      reminderId: reminder.id,
      url: reminder.url,
      title: reminder.title,
      timestamp: Date.now()
    },
    
    timestamp: Date.now()
  };

  try {
    await self.registration.showNotification(
      'ウェブ漫画リマインダー',
      options
    );
    
    debugLog(`通知表示成功: ${reminder.title}`);
    return true;
    
  } catch (error) {
    debugLog('通知表示エラー', { reminder: reminder.title, error });
    return false;
  }
};

// リマインダーチェック（改善版）
const checkReminders = async () => {
  if (!checkNotificationPermission()) {
    debugLog('リマインダーチェック中止: 通知許可なし');
    return;
  }

  if (!cachedReminders || cachedReminders.length === 0) {
    debugLog('リマインダーチェック中止: データなし');
    return;
  }

  try {
    const now = new Date();
    const checkInterval = (cachedSettings.notificationInterval || 15) * 60 * 1000;
    let notificationsSent = 0;
    
    debugLog(`リマインダーチェック開始`, {
      時刻: now.toLocaleString(),
      チェック間隔: `${cachedSettings.notificationInterval}分`,
      リマインダー数: cachedReminders.length
    });

    for (const reminder of cachedReminders) {
      try {
        // 一時停止中はスキップ
        if (reminder.isPaused) {
          debugLog(`スキップ（一時停止中）: ${reminder.title}`);
          continue;
        }

        const nextNotification = calculateNextNotificationTime(reminder);
        const timeDiff = Math.abs(now.getTime() - nextNotification.getTime());
        
        debugLog(`チェック中: ${reminder.title}`, {
          次回通知: nextNotification.toLocaleString(),
          時差: `${Math.round(timeDiff / 1000 / 60)}分`,
          最終通知: reminder.lastNotified || 'なし'
        });
        
        // 通知タイミングの判定
        const isTimeToNotify = timeDiff <= checkInterval;
        const lastNotified = reminder.lastNotified ? new Date(reminder.lastNotified) : null;
        const hasRecentNotification = lastNotified && (now.getTime() - lastNotified.getTime()) < 60 * 60 * 1000; // 1時間以内
        
        if (isTimeToNotify && !hasRecentNotification) {
          debugLog(`通知送信: ${reminder.title}`);
          
          const success = await showNotification(reminder);
          if (success) {
            notificationsSent++;
            
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
      } catch (reminderError) {
        debugLog(`個別リマインダーエラー: ${reminder.title}`, reminderError);
      }
    }
    
    debugLog(`リマインダーチェック完了: ${notificationsSent}件送信`);
    
  } catch (error) {
    debugLog('リマインダーチェック総合エラー', error);
  }
};

// 定期チェック管理（改善版）
const startPeriodicCheck = (intervalMinutes = 15) => {
  debugLog(`定期チェック開始: ${intervalMinutes}分間隔`);
  
  // 既存のインターバルをクリア
  if (checkInterval) {
    clearInterval(checkInterval);
    debugLog('既存の定期チェックを停止');
  }
  
  // 新しいインターバルを設定
  checkInterval = setInterval(() => {
    debugLog('定期チェック実行');
    checkReminders();
  }, intervalMinutes * 60 * 1000);
  
  // 初回チェック（5秒後）
  setTimeout(() => {
    debugLog('初回リマインダーチェック');
    checkReminders();
  }, 5000);
};

// メッセージ処理（改善版）
const handleMessage = (messageData) => {
  const { type, data } = messageData || {};
  debugLog(`メッセージ受信: ${type}`, data);

  switch (type) {
    case 'PING':
      return { type: 'PONG', timestamp: Date.now() };
    
    case 'START_PERIODIC_CHECK':
      startPeriodicCheck(data?.interval || 15);
      return { type: 'PERIODIC_CHECK_STARTED', interval: data?.interval || 15 };
    
    case 'CHECK_REMINDERS_NOW':
      checkReminders();
      return { type: 'REMINDERS_CHECK_TRIGGERED' };
    
    case 'REMINDERS_DATA':
      cachedReminders = data || [];
      debugLog(`リマインダーキャッシュ更新: ${cachedReminders.length}件`);
      return { type: 'REMINDERS_CACHED', count: cachedReminders.length };
      
    case 'SETTINGS_DATA':
      const oldInterval = cachedSettings.notificationInterval;
      cachedSettings = { ...cachedSettings, ...(data || {}) };
      debugLog('設定キャッシュ更新', cachedSettings);
      
      // 間隔が変更された場合は再起動
      if (oldInterval !== cachedSettings.notificationInterval && checkInterval) {
        startPeriodicCheck(cachedSettings.notificationInterval);
      }
      return { type: 'SETTINGS_CACHED' };
    
    case 'UPDATE_CHECK_INTERVAL':
      if (data?.interval) {
        startPeriodicCheck(data.interval);
        return { type: 'CHECK_INTERVAL_UPDATED', interval: data.interval };
      }
      return { type: 'ERROR', message: 'Invalid interval' };
      
    case 'GET_STATUS':
      return {
        type: 'STATUS_RESPONSE',
        data: {
          initialized: isInitialized,
          remindersCount: cachedReminders.length,
          settings: cachedSettings,
          hasInterval: !!checkInterval,
          notificationPermission: Notification.permission,
          caches: CACHE_NAME
        }
      };
    
    case 'GET_DEBUG_INFO':
      return {
        type: 'DEBUG_INFO_RESPONSE',
        data: {
          version: CACHE_NAME,
          debugMode: DEBUG_MODE,
          reminders: cachedReminders.map(r => ({
            id: r.id,
            title: r.title,
            isPaused: r.isPaused,
            lastNotified: r.lastNotified
          })),
          settings: cachedSettings,
          performance: {
            uptime: Date.now() - (self.swStartTime || Date.now()),
            checkInterval: !!checkInterval
          }
        }
      };
      
    default:
      debugLog(`未対応メッセージタイプ: ${type}`);
      return { type: 'ERROR', message: 'Unknown message type' };
  }
};

// メッセージリスナー（改善版）
self.addEventListener('message', (event) => {
  if (!isInitialized) {
    debugLog('初期化前のメッセージをキューに追加', event.data);
    messageQueue.push(event.data);
    return;
  }

  try {
    const response = handleMessage(event.data);
    
    // メッセージチャンネル経由で応答
    if (event.ports && event.ports[0]) {
      event.ports[0].postMessage(response);
    }
    
  } catch (error) {
    debugLog('メッセージ処理エラー', error);
    if (event.ports && event.ports[0]) {
      event.ports[0].postMessage({ 
        type: 'ERROR', 
        message: error.message 
      });
    }
  }
});

// 通知クリック処理（改善版）
self.addEventListener('notificationclick', (event) => {
  debugLog('通知クリック', { action: event.action, tag: event.notification.tag });
  event.notification.close();

  const { reminderId, url, title } = event.notification.data || {};

  const handleAction = async () => {
    if (event.action === 'open' || !event.action) {
      // URLを開く
      const targetUrl = url || '/';
      await clients.openWindow(targetUrl);
      debugLog(`URLを開く: ${targetUrl}`);
      
    } else if (event.action === 'dismiss') {
      debugLog('通知を閉じる（何もしない）');
    }

    // クライアントに通知クリックを報告
    const allClients = await self.clients.matchAll();
    allClients.forEach(client => {
      client.postMessage({
        type: 'NOTIFICATION_CLICKED',
        reminderId: reminderId,
        action: event.action || 'default',
        timestamp: Date.now()
      });
    });
  };

  event.waitUntil(handleAction());
});

// バックグラウンド同期（改善版）
self.addEventListener('sync', (event) => {
  debugLog('バックグラウンド同期', { tag: event.tag });
  
  if (event.tag === 'reminder-check') {
    event.waitUntil(checkReminders());
  }
});

// プッシュ通知（将来的な拡張用）
self.addEventListener('push', (event) => {
  debugLog('プッシュ通知受信', event.data);
  
  if (event.data) {
    try {
      const data = event.data.json();
      event.waitUntil(showNotification(data));
    } catch (error) {
      debugLog('プッシュデータ解析エラー', error);
    }
  }
});

// エラーハンドリング（改善版）
self.addEventListener('error', (event) => {
  debugLog('Service Workerエラー', {
    message: event.message,
    filename: event.filename,
    lineno: event.lineno,
    error: event.error
  });
});

self.addEventListener('unhandledrejection', (event) => {
  debugLog('未処理のPromise拒否', {
    reason: event.reason,
    stack: event.reason?.stack
  });
});

// Service Worker 開始時刻を記録
self.swStartTime = Date.now();

// 起動完了ログ
debugLog('Service Worker起動完了', {
  version: CACHE_NAME,
  debugMode: DEBUG_MODE,
  startTime: new Date().toLocaleString()
});

console.log(`🚀 ウェブ漫画リマインダー Service Worker v${CACHE_NAME.split('-').pop()} 起動完了`);