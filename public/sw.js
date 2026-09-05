const CACHE_NAME = 'page24-reader-v2';
const STATIC_ASSETS = [
  '/read',
  '/manifest.json',
  '/css/reader.css',
  '/js/reader.js',
  '/js/main.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css'
];

// 1. Install & Cache Shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// 2. Activate & Clean Old Caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.map((key) => key !== CACHE_NAME && caches.delete(key)))
    )
  );
  self.clients.claim();
});

// 3. Cache-First Fetch Strategy for Offline Speed
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        // Return cached version immediately, update cache in background if online
        fetch(event.request).then((networkResponse) => {
          if (networkResponse.status === 200) {
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, networkResponse));
          }
        }).catch(() => {/* Silent fail offline */});
        return cachedResponse;
      }

      // Not in cache, fetch from network and store copy
      return fetch(event.request).then((networkResponse) => {
        if (
          networkResponse.status === 200 &&
          (event.request.url.includes('/api/books/') || event.request.url.includes('/assets/'))
        ) {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
        }
        return networkResponse;
      });
    })
  );
});

// 4. Background Sync Listener for Supabase Progress Updates
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-reading-progress') {
    event.waitUntil(syncReadingProgressToSupabase());
  }
});

async function syncReadingProgressToSupabase() {
  const db = await openIDB();
  const tx = db.transaction('pendingSync', 'readonly');
  const store = tx.objectStore('pendingSync');
  const pendingUpdates = await store.getAll();

  for (const item of pendingUpdates) {
    try {
      const response = await fetch('/api/books/update-progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(item)
      });

      if (response.ok) {
        const deleteTx = db.transaction('pendingSync', 'readwrite');
        await deleteTx.objectStore('pendingSync').delete(item.id);
      }
    } catch (err) {
      console.warn('Sync failed, will retry when back online:', err);
    }
  }
}

function openIDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('Page24OfflineDB', 1);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}