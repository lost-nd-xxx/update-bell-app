// public/sw.js - 完全修正版（シンプル版）
// タイムアウト問題解決・アプリ名統一・移行処理なし

const CACHE_NAME = 'update-bell-v1.0.1';
const DEBUG_MODE = true;

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
        await cache.addAll(STATIC_CACHE);
        await self.skipWaiting();
        debugLog('Service Workerインストール完了');
      } catch (error) {
        debugLog('インストール中エラー', error);
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
        await Promise.all(
          cacheNames
            .filter(cacheName => cacheName !== CACHE_NAME)
            .map(cacheName => caches.delete(cacheName))
        );
        
        // 全てのクライアントを制御下に置く
        await self.clients.claim();
        
        // 初期化実行
        initialize();
        
        debugLog('Service Workerアクティベート完了');
      } catch (error) {
        debugLog('アクティベート中エラー', error);
      }
    })()
  );
});

// ネットワーク要求の処理
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  
  event.respondWith(
    (async () => {
      try {
        const response = await fetch(event.request);
        
        if (response.ok) {
          const cache = await caches.open(CACHE_NAME);
          cache.put(event.request, response.clone());
        }
        
        return response;
      } catch (error) {
        const cachedResponse = await caches.match(event.request);
        if (cachedResponse) {
          return cachedResponse;
        }
        
        return new Response('Network error', { 
          status: 408, 
          statusText: 'Request Timeout' 
        });
      }
    })()
  );
});

// 次回通知時刻計算
const calculateNextNotificationTime = (reminder) => {
  const now = new Date();
  const [hours, minutes] = reminder.time.split(':').map(Number);
  
  let next = new Date();
  next.setHours(hours, minutes, 0, 0);
  
  if (next <= now) {
    next.setDate(next.getDate() + 1);
  }
  
  switch (reminder.frequency.type) {
    case 'daily':
      break;
      
    case 'days':
      const dayInterval = reminder.frequency.value;
      const lastNotified = reminder.lastNotified ? new Date(reminder.lastNotified) : null;
      
      if (lastNotified) {
        const nextFromLast = new Date(lastNotified);
        nextFromLast.setDate(nextFromLast.getDate() + dayInterval);
        nextFromLast.setHours(hours, minutes, 0, 0);
        
        if (nextFromLast > next) {
          next = nextFromLast;
        }
      }
      break;
      
    case 'weekly':
      const targetDay = reminder.frequency.value;
      while (next.getDay() !== targetDay) {
        next.setDate(next.getDate() + 1);
      }
      break;
      
    case 'weekdays':
      const targetDays = reminder.frequency.value;
      let found = false;
      
      for (let i = 0; i < 7 && !found; i++) {
        if (targetDays.includes(next.getDay())) {
          found = true;
        } else {
          next.setDate(next.getDate() + 1);
        }
      }
      break;
      
    case 'monthly':
      const { week, day } = reminder.frequency.value;
      const firstDay = new Date(next.getFullYear(), next.getMonth(), 1);
      const firstTargetDay = new Date(firstDay);
      
      while (firstTargetDay.getDay() !== day) {
        firstTargetDay.setDate(firstTargetDay.getDate() + 1);
      }
      
      const targetDate = new Date(firstTargetDay);
      targetDate.setDate(targetDate.getDate() + (week - 1) * 7);
      targetDate.setHours(hours, minutes, 0, 0);
      
      if (targetDate <= now) {
        targetDate.setMonth(targetDate.getMonth() + 1);
        const nextFirstDay = new Date(targetDate.getFullYear(), targetDate.getMonth(), 1);
        while (nextFirstDay.getDay() !== day) {
          nextFirstDay.setDate(nextFirstDay.getDate() + 1);
        }
        targetDate.setDate(nextFirstDay.getDate() + (week - 1) * 7);
      }
      
      next = targetDate;
      break;
  }
  
  return next;
};

// 通知表示
const showNotification = async (reminder) => {
  try {
    if (Notification.permission !== 'granted') {
      debugLog('通知許可がありません');
      return false;
    }

    const notificationOptions = {
      body: `${reminder.url}\n\nクリックしてサイトを開く`,
      icon: '/icon-192x192.png',
      badge: '/icon-72x72.png',
      tag: `reminder-${reminder.id}`,
      requireInteraction: true,
      actions: [
        { action: 'open', title: 'サイトを開く' },
        { action: 'dismiss', title: '閉じる' }
      ],
      data: {
        reminderId: reminder.id,
        url: reminder.url,
        title: reminder.title
      }
    };

    await self.registration.showNotification(reminder.title, notificationOptions);
    debugLog(`通知表示成功: ${reminder.title}`);
    return true;
    
  } catch (error) {
    debugLog('通知表示エラー', error);
    return false;
  }
};

// リマインダーチェック（非同期版）
const checkReminders = async () => {
  debugLog('リマインダーチェック開始');
  
  if (Notification.permission !== 'granted') {
    return { success: false, reason: 'no_permission' };
  }

  if (!cachedReminders || cachedReminders.length === 0) {
    return { success: false, reason: 'no_data' };
  }

  try {
    const now = new Date();
    const checkIntervalMs = (cachedSettings.notificationInterval || 15) * 60 * 1000;
    let notificationsSent = 0;
    const results = [];
    
    for (const reminder of cachedReminders) {
      try {
        if (reminder.isPaused) {
          results.push({ id: reminder.id, status: 'paused' });
          continue;
        }

        const nextNotification = calculateNextNotificationTime(reminder);
        const timeDiff = Math.abs(now.getTime() - nextNotification.getTime());
        
        const isTimeToNotify = timeDiff <= checkIntervalMs;
        const lastNotified = reminder.lastNotified ? new Date(reminder.lastNotified) : null;
        const hasRecentNotification = lastNotified && (now.getTime() - lastNotified.getTime()) < 60 * 60 * 1000;
        
        if (isTimeToNotify && !hasRecentNotification) {
          const success = await showNotification(reminder);
          if (success) {
            notificationsSent++;
            results.push({ id: reminder.id, status: 'sent' });
            
            const clients = await self.clients.matchAll();
            clients.forEach(client => {
              client.postMessage({
                type: 'NOTIFICATION_SENT',
                reminderId: reminder.id,
                timestamp: now.toISOString()
              });
            });
          } else {
            results.push({ id: reminder.id, status: 'failed' });
          }
        } else {
          results.push({ id: reminder.id, status: 'not_time' });
        }
      } catch (reminderError) {
        debugLog(`個別リマインダーエラー: ${reminder.title}`, reminderError);
        results.push({ id: reminder.id, status: 'error', error: reminderError.message });
      }
    }
    
    debugLog(`リマインダーチェック完了: ${notificationsSent}件送信`);
    return { 
      success: true, 
      notificationsSent, 
      totalChecked: cachedReminders.length,
      results 
    };
    
  } catch (error) {
    debugLog('リマインダーチェック総合エラー', error);
    return { success: false, reason: 'error', error: error.message };
  }
};

// 定期チェック管理
const startPeriodicCheck = (intervalMinutes = 15) => {
  debugLog(`定期チェック開始: ${intervalMinutes}分間隔`);
  
  if (checkInterval) {
    clearInterval(checkInterval);
  }
  
  checkInterval = setInterval(() => {
    checkReminders().catch(error => {
      debugLog('定期チェックエラー', error);
    });
  }, intervalMinutes * 60 * 1000);
  
  setTimeout(() => {
    checkReminders().catch(error => {
      debugLog('初回チェックエラー', error);
    });
  }, 5000);
  
  return { started: true, interval: intervalMinutes };
};

// メッセージ処理（非同期対応版）
const handleMessage = async (messageData) => {
  const { type, data } = messageData || {};
  debugLog(`メッセージ受信: ${type}`, data);

  try {
    switch (type) {
      case 'PING':
        return { type: 'PONG', timestamp: Date.now() };
      
      case 'START_PERIODIC_CHECK':
        const startResult = startPeriodicCheck(data?.interval || 15);
        return { type: 'PERIODIC_CHECK_STARTED', ...startResult };
      
      case 'CHECK_REMINDERS_NOW':
        const checkResult = await checkReminders();
        return { type: 'REMINDERS_CHECK_COMPLETED', ...checkResult };
      
      case 'GET_REMINDERS':
        try {
          const remindersData = localStorage.getItem('update-bell-data');
          const reminders = remindersData ? JSON.parse(remindersData) : [];
          
          cachedReminders = Array.isArray(reminders) ? reminders : [];
          debugLog(`リマインダーデータ取得: ${cachedReminders.length}件`);
          
          return { type: 'REMINDERS_DATA_LOADED', data: cachedReminders, count: cachedReminders.length };
        } catch (error) {
          debugLog('リマインダーデータ取得エラー', error);
          return { type: 'ERROR', message: 'Failed to get reminders' };
        }
        
      case 'GET_SETTINGS':
        try {
          const settingsData = localStorage.getItem('update-bell-settings');
          const settings = settingsData ? JSON.parse(settingsData) : cachedSettings;
          cachedSettings = { ...cachedSettings, ...settings };
          debugLog('設定データ取得', cachedSettings);
          
          return { type: 'SETTINGS_DATA_LOADED', data: cachedSettings };
        } catch (error) {
          debugLog('設定データ取得エラー', error);
          return { type: 'ERROR', message: 'Failed to get settings' };
        }
      
      case 'REMINDERS_DATA':
        cachedReminders = data || [];
        debugLog(`リマインダーキャッシュ更新: ${cachedReminders.length}件`);
        return { type: 'REMINDERS_CACHED', count: cachedReminders.length };
        
      case 'SETTINGS_DATA':
        const oldInterval = cachedSettings.notificationInterval;
        cachedSettings = { ...cachedSettings, ...(data || {}) };
        debugLog('設定キャッシュ更新', cachedSettings);
        
        if (oldInterval !== cachedSettings.notificationInterval && checkInterval) {
          const restartResult = startPeriodicCheck(cachedSettings.notificationInterval);
          return { type: 'SETTINGS_CACHED', restarted: true, ...restartResult };
        }
        return { type: 'SETTINGS_CACHED', restarted: false };
      
      case 'UPDATE_CHECK_INTERVAL':
        if (data?.interval) {
          const updateResult = startPeriodicCheck(data.interval);
          return { type: 'CHECK_INTERVAL_UPDATED', ...updateResult };
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
            caches: CACHE_NAME,
            uptime: Date.now() - (self.swStartTime || Date.now())
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
              checkInterval: !!checkInterval,
              intervalValue: cachedSettings.notificationInterval
            }
          }
        };
        
      default:
        debugLog(`未対応メッセージタイプ: ${type}`);
        return { type: 'ERROR', message: 'Unknown message type' };
    }
  } catch (error) {
    debugLog(`メッセージ処理エラー: ${type}`, error);
    return { type: 'ERROR', message: error.message, messageType: type };
  }
};

// メッセージリスナー（非同期対応版）
self.addEventListener('message', async (event) => {
  if (!isInitialized) {
    debugLog('初期化前のメッセージをキューに追加', event.data);
    messageQueue.push(event.data);
    
    if (event.ports && event.ports[0]) {
      event.ports[0].postMessage({ 
        type: 'QUEUED', 
        message: 'Message queued until initialization' 
      });
    }
    return;
  }

  try {
    const response = await handleMessage(event.data);
    
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

// 通知クリック処理
self.addEventListener('notificationclick', (event) => {
  debugLog('通知クリック', { action: event.action, tag: event.notification.tag });
  event.notification.close();

  const { reminderId, url, title } = event.notification.data || {};

  const handleAction = async () => {
    if (event.action === 'open' || !event.action) {
      const targetUrl = url || '/';
      await clients.openWindow(targetUrl);
      debugLog(`URLを開く: ${targetUrl}`);
    } else if (event.action === 'dismiss') {
      debugLog('通知を閉じる（何もしない）');
    }

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

// エラーハンドリング
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
  event.preventDefault();
});

// Service Worker 開始時刻を記録
self.swStartTime = Date.now();

// 起動完了ログ
debugLog('Service Worker起動完了', {
  version: CACHE_NAME,
  debugMode: DEBUG_MODE,
  startTime: new Date().toLocaleString()
});

console.log(`🚀 おしらせベル Service Worker v${CACHE_NAME.split('-').pop()} 起動完了`);