// Service Worker for Work Tracker PWA
// Enhanced with Periodic Background Sync for bulletproof time tracking

const CACHE_NAME = 'work-tracker-v2';
const STATIC_CACHE = 'work-tracker-static-v2';
const HEARTBEAT_SYNC_TAG = 'heartbeat-sync';
const API_BASE_URL = 'https://fastapi-project-management-production-22e0.up.railway.app';

// Assets to cache immediately on install
const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json'
];

// Session state (stored in IndexedDB for persistence)
let sessionState = {
  isActive: false,
  lastHeartbeat: null,
  token: null
};

// IndexedDB for persistent storage
const DB_NAME = 'WorkTrackerSW';
const DB_VERSION = 1;
const STORE_NAME = 'session';

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'key' });
      }
    };
  });
}

async function saveToDB(key, value) {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.put({ key, value, timestamp: Date.now() });
    await new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  } catch (error) {
    console.error('[SW] Failed to save to DB:', error);
  }
}

async function getFromDB(key) {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.get(key);
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result?.value);
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error('[SW] Failed to get from DB:', error);
    return null;
  }
}

// Install event - cache static assets
self.addEventListener('install', (event) => {
  console.log('[SW] Installing service worker v2...');
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => {
        console.log('[SW] Precaching static assets');
        return cache.addAll(PRECACHE_ASSETS);
      })
      .then(() => {
        console.log('[SW] Service worker installed');
        return self.skipWaiting();
      })
      .catch((error) => {
        console.error('[SW] Precache failed:', error);
      })
  );
});

// Activate event - clean old caches and register periodic sync
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating service worker v2...');
  event.waitUntil(
    Promise.all([
      // Clean old caches
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((name) => !name.includes('v2'))
            .map((name) => {
              console.log('[SW] Deleting old cache:', name);
              return caches.delete(name);
            })
        );
      }),
      // Claim all clients
      self.clients.claim()
    ]).then(() => {
      console.log('[SW] Service worker activated');
      // Try to register periodic sync
      registerPeriodicSync();
    })
  );
});

// Register Periodic Background Sync
async function registerPeriodicSync() {
  try {
    const registration = self.registration;
    if ('periodicSync' in registration) {
      const status = await navigator.permissions.query({
        name: 'periodic-background-sync',
      });

      if (status.state === 'granted') {
        await registration.periodicSync.register(HEARTBEAT_SYNC_TAG, {
          minInterval: 60 * 1000, // Minimum 1 minute (Chrome requires at least 12 hours, but we try)
        });
        console.log('[SW] Periodic sync registered');
      } else {
        console.log('[SW] Periodic sync permission not granted');
      }
    } else {
      console.log('[SW] Periodic sync not supported');
    }
  } catch (error) {
    console.error('[SW] Failed to register periodic sync:', error);
  }
}

// Handle periodic sync events
self.addEventListener('periodicsync', (event) => {
  if (event.tag === HEARTBEAT_SYNC_TAG) {
    console.log('[SW] Periodic sync triggered');
    event.waitUntil(sendBackgroundHeartbeat());
  }
});

// Handle regular background sync
self.addEventListener('sync', (event) => {
  if (event.tag === HEARTBEAT_SYNC_TAG) {
    console.log('[SW] Background sync triggered');
    event.waitUntil(sendBackgroundHeartbeat());
  }
});

// Send heartbeat from service worker
async function sendBackgroundHeartbeat() {
  try {
    const token = await getFromDB('authToken');
    const sessionActive = await getFromDB('sessionActive');

    if (!token || !sessionActive) {
      console.log('[SW] No active session for heartbeat');
      return;
    }

    const response = await fetch(`${API_BASE_URL}/attendance/heartbeat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        timestamp: new Date().toISOString(),
        is_active: false, // Background = not actively using
        from_service_worker: true
      })
    });

    if (response.ok) {
      console.log('[SW] Background heartbeat sent successfully');
      await saveToDB('lastHeartbeat', Date.now());
    } else {
      console.error('[SW] Background heartbeat failed:', response.status);
    }
  } catch (error) {
    console.error('[SW] Background heartbeat error:', error);
  }
}

// Fetch event - network first for API, cache first for assets
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }

  // Skip API calls - always go to network
  if (url.pathname.startsWith('/api') ||
      url.pathname.startsWith('/attendance') ||
      url.pathname.startsWith('/auth') ||
      url.pathname.includes('heartbeat')) {
    return;
  }

  // For navigation requests, try network first
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Only cache successful responses
          if (response && response.ok && response.status === 200) {
            try {
              const responseClone = response.clone();
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(request, responseClone);
              }).catch(() => {});
            } catch (e) {
              // Response can't be cloned, skip caching
            }
          }
          return response;
        })
        .catch(() => {
          return caches.match(request)
            .then((cachedResponse) => {
              return cachedResponse || caches.match('/index.html');
            });
        })
    );
    return;
  }

  // For other assets, use stale-while-revalidate
  event.respondWith(
    caches.match(request)
      .then((cachedResponse) => {
        const fetchPromise = fetch(request).then((response) => {
          // Only cache successful responses that can be cloned
          if (response && response.ok && response.status === 200) {
            try {
              const responseClone = response.clone();
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(request, responseClone);
              }).catch(() => {});
            } catch (e) {
              // Response can't be cloned, skip caching
              console.log('[SW] Could not clone response for caching');
            }
          }
          return response;
        }).catch(() => cachedResponse);

        return cachedResponse || fetchPromise;
      })
  );
});

// Handle messages from the main app
self.addEventListener('message', async (event) => {
  const { type, data } = event.data || {};

  switch (type) {
    case 'SKIP_WAITING':
      self.skipWaiting();
      break;

    case 'SET_AUTH_TOKEN':
      await saveToDB('authToken', data.token);
      console.log('[SW] Auth token saved');
      break;

    case 'SET_SESSION_ACTIVE':
      await saveToDB('sessionActive', data.active);
      console.log('[SW] Session active:', data.active);

      // Register one-time sync when session becomes active
      if (data.active && self.registration.sync) {
        try {
          await self.registration.sync.register(HEARTBEAT_SYNC_TAG);
          console.log('[SW] One-time sync registered');
        } catch (error) {
          console.error('[SW] Failed to register sync:', error);
        }
      }
      break;

    case 'CLEAR_SESSION':
      await saveToDB('authToken', null);
      await saveToDB('sessionActive', false);
      console.log('[SW] Session cleared');
      break;

    case 'GET_STATUS':
      const status = {
        token: !!(await getFromDB('authToken')),
        sessionActive: await getFromDB('sessionActive'),
        lastHeartbeat: await getFromDB('lastHeartbeat')
      };
      event.ports[0]?.postMessage(status);
      break;
  }
});

// Handle push notifications (for future use)
self.addEventListener('push', (event) => {
  const data = event.data?.json() || {};
  const title = data.title || 'Work Tracker';
  const options = {
    body: data.body || 'You have a new notification',
    icon: '/icons/icon-192x192.svg',
    badge: '/icons/icon-192x192.svg',
    tag: data.tag || 'default',
    renotify: true
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

// Handle notification clicks
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // Focus existing window if found
        for (const client of clientList) {
          if (client.url.includes(self.location.origin) && 'focus' in client) {
            return client.focus();
          }
        }
        // Open new window if none found
        if (clients.openWindow) {
          return clients.openWindow('/');
        }
      })
  );
});

console.log('[SW] Service worker v2 script loaded');
