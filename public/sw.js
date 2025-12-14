const CACHE_NAME = "update-bell-v2.2.0";
const ASSETS_TO_CACHE = [
  "/",
  "/index.html",
  "/icon-192x192.png",
  "/icon-badge.png",
  "/manifest.json",
  // Vite generates hashed filenames for JS/CSS, so strict caching list is hard.
  // Instead, we will cache visited requests dynamically (Stale-While-Revalidate or Cache-First)
];

const DEBUG_MODE = false;

const debugLog = (message, data) => {
  if (DEBUG_MODE) {
    console.log(`[SW] ${message}`, data || "");
  }
};

self.addEventListener("install", (event) => {
  debugLog("Install event v2.2.0");
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => {
        return cache.addAll(ASSETS_TO_CACHE);
      })
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  debugLog("Activate event v2.2.0");
  event.waitUntil(
    caches
      .keys()
      .then((keyList) => {
        return Promise.all(
          keyList.map((key) => {
            if (key !== CACHE_NAME) {
              debugLog("Removing old cache", key);
              return caches.delete(key);
            }
          }),
        );
      })
      .then(() => self.clients.claim()),
  );
});

// --- Fetch Strategy: Stale-While-Revalidate for most, Network-First for API ---
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Skip non-GET requests and API requests (except maybe static assets in public)
  if (event.request.method !== "GET" || url.pathname.startsWith("/api/")) {
    return;
  }

  // Skip browser extensions
  if (!url.protocol.startsWith("http")) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const fetchPromise = fetch(event.request).then((networkResponse) => {
        // Cache valid responses
        if (
          networkResponse &&
          networkResponse.status === 200 &&
          networkResponse.type === "basic"
        ) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      });

      // Return cached response immediately if available, while updating in background
      return cachedResponse || fetchPromise;
    }),
  );
});

// --- Push Notifications (Server-Sent Only) ---

self.addEventListener("push", (event) => {
  debugLog(
    "Push event received",
    event.data ? event.data.text() : "No payload",
  );

  let pushData;
  try {
    pushData = event.data.json();
  } catch (e) {
    debugLog("Failed to parse push data as JSON", event.data.text());
    pushData = {
      title: "Update Bell",
      body: event.data.text() || "You have a new reminder.",
    };
  }

  const title = pushData.title || "Update Bell Reminder";
  const options = {
    body: pushData.body,
    icon: pushData.icon || "/icon-192x192.png",
    badge: pushData.badge || "/icon-badge.png",
    tag: pushData.tag || "general-notification",
    data: {
      url: pushData.url,
      userId: pushData.userId,
    },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  debugLog("Notification clicked", event.notification.data);
  event.notification.close();

  const data = event.notification.data;
  const urlToOpen = data?.url;
  const userId = data?.userId;

  const promises = [];

  // Open URL if present
  if (urlToOpen) {
    promises.push(
      clients
        .matchAll({ type: "window", includeUncontrolled: true })
        .then((windowClients) => {
          // Check if there is already a window/tab open with the target URL
          for (let i = 0; i < windowClients.length; i++) {
            const client = windowClients[i];
            if (client.url === urlToOpen && "focus" in client) {
              return client.focus();
            }
          }
          if (clients.openWindow) {
            return clients.openWindow(urlToOpen);
          }
        }),
    );
  } else {
    // Just focus the app if no specific URL
    promises.push(
      clients
        .matchAll({ type: "window", includeUncontrolled: true })
        .then((windowClients) => {
          if (windowClients.length > 0 && "focus" in windowClients[0]) {
            return windowClients[0].focus();
          }
          if (clients.openWindow) {
            return clients.openWindow("/");
          }
        }),
    );
  }

  // Track access
  if (userId) {
    const trackingUrl = "/api/track-access";
    // Using fetch keepalive or simpler fetch
    promises.push(
      fetch(trackingUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      }).catch((e) => debugLog("Tracking failed", e)),
    );
  }

  event.waitUntil(Promise.all(promises));
});

self.addEventListener("message", (event) => {
  const { type } = event.data;

  if (type === "TEST_NOTIFICATION") {
    debugLog("Showing test notification immediately.");
    self.registration.showNotification("おしらせベル テスト通知", {
      body: "通知は正常に機能しています。",
      icon: "/icon-192x192.png",
      badge: "/icon-badge.png",
      tag: "test-notification",
    });
  }
});
