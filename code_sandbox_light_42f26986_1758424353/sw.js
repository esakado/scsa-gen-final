// Service Worker for Science Capital SA
// Provides offline functionality and caching for enhanced user experience

const CACHE_NAME = 'science-capital-sa-v1.0.0';
const STATIC_CACHE_NAME = 'science-capital-static-v1.0.0';

// Define cached resources
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/products.html',
  '/curriculum.html',
  '/institutional.html',
  '/resources.html',
  '/cart.html',
  '/checkout.html',
  '/css/global.css',
  '/css/fontawesome.css',
  '/manifest.json',
  
  // External CDN resources (cache for offline access)
  'https://cdn.tailwindcss.com',
  'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap',
  
  // Fallback offline page
  '/offline.html'
];

// Resources that should be cached on demand
const RUNTIME_CACHE_URLS = [
  '/products/',
  '/curriculum/',
  '/institutional/',
  '/resources/',
  '/support/'
];

// Install event - cache static assets
self.addEventListener('install', (event) => {
  console.log('Service Worker: Installing...');
  
  event.waitUntil(
    caches.open(STATIC_CACHE_NAME)
      .then((cache) => {
        console.log('Service Worker: Caching static assets');
        return cache.addAll(STATIC_ASSETS.filter(url => !url.startsWith('http')));
      })
      .then(() => {
        console.log('Service Worker: Static assets cached successfully');
        return self.skipWaiting();
      })
      .catch((error) => {
        console.error('Service Worker: Failed to cache static assets:', error);
      })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('Service Worker: Activating...');
  
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName !== CACHE_NAME && cacheName !== STATIC_CACHE_NAME) {
              console.log('Service Worker: Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      })
      .then(() => {
        console.log('Service Worker: Activated successfully');
        return self.clients.claim();
      })
  );
});

// Fetch event - serve cached content when offline
self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  
  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }
  
  // Skip chrome-extension and other non-http(s) requests
  if (!url.protocol.startsWith('http')) {
    return;
  }
  
  // Handle different types of requests
  if (url.pathname.startsWith('/api/')) {
    // API requests - network first with fallback
    event.respondWith(networkFirstWithFallback(request));
  } else if (isStaticAsset(url.pathname)) {
    // Static assets - cache first
    event.respondWith(cacheFirstWithNetworkFallback(request));
  } else if (isHTMLRequest(request)) {
    // HTML pages - network first with offline fallback
    event.respondWith(networkFirstWithOfflineFallback(request));
  } else {
    // Other resources - network first
    event.respondWith(networkFirstWithCacheFallback(request));
  }
});

// Strategy: Cache first with network fallback (for static assets)
async function cacheFirstWithNetworkFallback(request) {
  try {
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    
    const networkResponse = await fetch(request);
    
    // Cache successful responses
    if (networkResponse && networkResponse.status === 200) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
  } catch (error) {
    console.error('Service Worker: Cache first strategy failed:', error);
    return new Response('Offline content not available', { status: 503 });
  }
}

// Strategy: Network first with cache fallback (for dynamic content)
async function networkFirstWithCacheFallback(request) {
  try {
    const networkResponse = await fetch(request);
    
    // Cache successful responses for future offline use
    if (networkResponse && networkResponse.status === 200) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
  } catch (error) {
    console.log('Service Worker: Network failed, trying cache:', request.url);
    
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    
    return new Response('Content not available offline', { status: 503 });
  }
}

// Strategy: Network first with offline page fallback (for HTML pages)
async function networkFirstWithOfflineFallback(request) {
  try {
    const networkResponse = await fetch(request);
    
    // Cache successful HTML responses
    if (networkResponse && networkResponse.status === 200) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
  } catch (error) {
    console.log('Service Worker: Network failed for HTML, trying cache:', request.url);
    
    // Try to find cached version
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    
    // Fallback to offline page
    const offlinePage = await caches.match('/offline.html');
    if (offlinePage) {
      return offlinePage;
    }
    
    // Last resort fallback
    return new Response(getOfflineHTML(), {
      status: 503,
      headers: { 'Content-Type': 'text/html' }
    });
  }
}

// Strategy: Network first with API fallback (for API calls)
async function networkFirstWithFallback(request) {
  try {
    const networkResponse = await fetch(request);
    return networkResponse;
  } catch (error) {
    console.log('Service Worker: API call failed:', request.url);
    
    // Return cached data if available
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    
    // Return offline API response
    return new Response(JSON.stringify({
      error: 'Network unavailable',
      message: 'Please check your internet connection and try again.',
      offline: true
    }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// Utility functions
function isStaticAsset(pathname) {
  const staticExtensions = ['.css', '.js', '.png', '.jpg', '.jpeg', '.svg', '.ico', '.woff', '.woff2', '.ttf'];
  return staticExtensions.some(ext => pathname.includes(ext));
}

function isHTMLRequest(request) {
  const acceptHeader = request.headers.get('Accept') || '';
  return acceptHeader.includes('text/html');
}

// Background sync for offline actions
self.addEventListener('sync', (event) => {
  console.log('Service Worker: Background sync triggered:', event.tag);
  
  if (event.tag === 'background-sync-cart') {
    event.waitUntil(syncOfflineCartActions());
  } else if (event.tag === 'background-sync-quotes') {
    event.waitUntil(syncOfflineQuoteRequests());
  }
});

// Sync offline cart actions when back online
async function syncOfflineCartActions() {
  try {
    const offlineActions = await getOfflineActions('cart');
    
    for (const action of offlineActions) {
      try {
        await fetch('/api/cart/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(action)
        });
        
        // Remove synced action
        await removeOfflineAction('cart', action.id);
      } catch (error) {
        console.error('Service Worker: Failed to sync cart action:', error);
      }
    }
  } catch (error) {
    console.error('Service Worker: Background sync failed:', error);
  }
}

// Sync offline quote requests when back online
async function syncOfflineQuoteRequests() {
  try {
    const offlineQuotes = await getOfflineActions('quotes');
    
    for (const quote of offlineQuotes) {
      try {
        await fetch('/api/quotes/submit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(quote)
        });
        
        // Remove synced quote
        await removeOfflineAction('quotes', quote.id);
      } catch (error) {
        console.error('Service Worker: Failed to sync quote request:', error);
      }
    }
  } catch (error) {
    console.error('Service Worker: Quote sync failed:', error);
  }
}

// IndexedDB helpers for offline storage
async function getOfflineActions(type) {
  // Simplified implementation - in production, use IndexedDB
  const stored = localStorage.getItem(`offline_${type}`) || '[]';
  return JSON.parse(stored);
}

async function removeOfflineAction(type, id) {
  const actions = await getOfflineActions(type);
  const filtered = actions.filter(action => action.id !== id);
  localStorage.setItem(`offline_${type}`, JSON.stringify(filtered));
}

// Push notification handling
self.addEventListener('push', (event) => {
  console.log('Service Worker: Push notification received');
  
  const options = {
    body: event.data ? event.data.text() : 'New update available!',
    icon: '/icons/icon-192x192.png',
    badge: '/icons/badge-72x72.png',
    vibrate: [100, 50, 100],
    data: {
      dateOfArrival: Date.now(),
      primaryKey: '2'
    },
    actions: [
      {
        action: 'explore',
        title: 'View Products',
        icon: '/icons/checkmark.png'
      },
      {
        action: 'close',
        title: 'Close',
        icon: '/icons/xmark.png'
      }
    ]
  };
  
  event.waitUntil(
    self.registration.showNotification('Science Capital SA', options)
  );
});

// Notification click handling
self.addEventListener('notificationclick', (event) => {
  console.log('Service Worker: Notification clicked:', event.action);
  
  event.notification.close();
  
  if (event.action === 'explore') {
    event.waitUntil(clients.openWindow('/products.html'));
  } else if (event.action === 'close') {
    // Just close the notification
  } else {
    event.waitUntil(clients.openWindow('/'));
  }
});

// Offline page HTML fallback
function getOfflineHTML() {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Offline - Science Capital SA</title>
        <style>
            body {
                font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                min-height: 100vh;
                margin: 0;
                background: linear-gradient(135deg, #008080, #1e40af);
                color: white;
                text-align: center;
                padding: 20px;
            }
            .offline-container {
                max-width: 500px;
                background: rgba(255, 255, 255, 0.1);
                backdrop-filter: blur(10px);
                padding: 40px;
                border-radius: 20px;
                border: 1px solid rgba(255, 255, 255, 0.2);
            }
            .logo {
                width: 80px;
                height: 80px;
                background: white;
                border-radius: 16px;
                display: flex;
                align-items: center;
                justify-content: center;
                margin: 0 auto 30px;
                font-size: 32px;
                font-weight: bold;
                color: #008080;
            }
            h1 {
                font-size: 2.5rem;
                margin-bottom: 1rem;
                font-weight: bold;
            }
            p {
                font-size: 1.2rem;
                margin-bottom: 2rem;
                opacity: 0.9;
                line-height: 1.6;
            }
            .retry-btn {
                background: #FFB000;
                color: black;
                padding: 12px 24px;
                border: none;
                border-radius: 8px;
                font-size: 1rem;
                font-weight: 600;
                cursor: pointer;
                transition: all 0.2s;
            }
            .retry-btn:hover {
                background: #f59e0b;
                transform: translateY(-1px);
            }
            .features {
                margin-top: 30px;
                text-align: left;
            }
            .feature {
                display: flex;
                align-items: center;
                margin-bottom: 10px;
                font-size: 14px;
            }
            .feature-icon {
                width: 20px;
                height: 20px;
                margin-right: 10px;
                opacity: 0.8;
            }
        </style>
    </head>
    <body>
        <div class="offline-container">
            <div class="logo">SC</div>
            <h1>You're Offline</h1>
            <p>
                No internet connection detected. Some cached content may still be available, 
                but full functionality requires an internet connection.
            </p>
            
            <button class="retry-btn" onclick="window.location.reload()">
                Try Again
            </button>
            
            <div class="features">
                <div class="feature">
                    <span class="feature-icon">📚</span>
                    <span>Browse cached product information</span>
                </div>
                <div class="feature">
                    <span class="feature-icon">🛒</span>
                    <span>View your saved shopping cart</span>
                </div>
                <div class="feature">
                    <span class="feature-icon">📖</span>
                    <span>Access downloaded curriculum resources</span>
                </div>
            </div>
        </div>
        
        <script>
            // Auto-retry when connection is restored
            window.addEventListener('online', () => {
                setTimeout(() => {
                    window.location.reload();
                }, 1000);
            });
            
            // Show online/offline status
            window.addEventListener('offline', () => {
                console.log('Connection lost');
            });
            
            window.addEventListener('online', () => {
                console.log('Connection restored');
            });
        </script>
    </body>
    </html>
  `;
}

// Message handling from main thread
self.addEventListener('message', (event) => {
  console.log('Service Worker: Message received:', event.data);
  
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  if (event.data && event.data.type === 'CACHE_PRODUCT') {
    cacheProduct(event.data.productId);
  }
});

// Cache specific product data
async function cacheProduct(productId) {
  try {
    const cache = await caches.open(CACHE_NAME);
    const productUrl = `/products/${productId}.html`;
    
    const response = await fetch(productUrl);
    if (response && response.status === 200) {
      await cache.put(productUrl, response);
      console.log(`Service Worker: Cached product ${productId}`);
    }
  } catch (error) {
    console.error('Service Worker: Failed to cache product:', error);
  }
}

console.log('Service Worker: Script loaded successfully');