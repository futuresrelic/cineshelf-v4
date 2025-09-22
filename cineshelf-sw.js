// Enhanced CineShelf Service Worker with Auto-Update Detection
const CACHE_VERSION = 'v4.0.0'; // Change this to force updates
const CACHE_NAME = `cineshelf-${CACHE_VERSION}`;
const DATA_CACHE_NAME = `cineshelf-data-${CACHE_VERSION}`;

const urlsToCache = [
    './',
    './index.html',
    './css/styles.css',
    './js/app.js',
    './js/cover-scanner.js',
    './js/barcode-scanner.js',
    './js/service-worker.js',
    './manifest.json',
    'https://cdnjs.cloudflare.com/ajax/libs/quagga/0.12.1/quagga.min.js'
];

// Install event - cache resources
self.addEventListener('install', event => {
    console.log(`CineShelf: Service Worker ${CACHE_VERSION} installing`);
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('CineShelf: Caching app shell');
                return cache.addAll(urlsToCache);
            })
            .catch(error => {
                console.log('CineShelf: Cache failed:', error);
                return Promise.resolve();
            })
    );
    // Force the waiting service worker to become the active service worker
    self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', event => {
    console.log(`CineShelf: Service Worker ${CACHE_VERSION} activating`);
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    // Delete old caches that don't match current version
                    if (cacheName.startsWith('cineshelf-') && cacheName !== CACHE_NAME && cacheName !== DATA_CACHE_NAME) {
                        console.log('CineShelf: Deleting old cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => {
            // Take control of all pages immediately
            return self.clients.claim();
        }).then(() => {
            // Notify all clients about the update
            return self.clients.matchAll().then(clients => {
                clients.forEach(client => {
                    client.postMessage({
                        type: 'SW_UPDATED',
                        version: CACHE_VERSION,
                        message: 'CineShelf has been updated!'
                    });
                });
            });
        })
    );
});

// Fetch event - serve from cache when offline
self.addEventListener('fetch', event => {
    // Skip non-GET requests
    if (event.request.method !== 'GET') {
        return;
    }

    // Handle API calls differently
    if (event.request.url.includes('api.themoviedb.org') || 
        event.request.url.includes('api.openai.com')) {
        
        // For API calls, try network first, then cache
        event.respondWith(
            fetch(event.request)
                .then(response => {
                    // Don't cache API errors
                    if (response.status === 200) {
                        const responseClone = response.clone();
                        caches.open(DATA_CACHE_NAME).then(cache => {
                            cache.put(event.request, responseClone);
                        });
                    }
                    return response;
                })
                .catch(() => {
                    // Fallback to cache if network fails
                    return caches.match(event.request);
                })
        );
        return;
    }

    // For app resources, cache first, then network
    event.respondWith(
        caches.match(event.request)
            .then(response => {
                // Return cached version if available
                if (response) {
                    return response;
                }
                
                // Otherwise, fetch from network
                return fetch(event.request)
                    .then(response => {
                        // Don't cache non-successful responses
                        if (!response || response.status !== 200 || response.type !== 'basic') {
                            return response;
                        }

                        // Clone the response since it can only be consumed once
                        const responseToCache = response.clone();

                        caches.open(CACHE_NAME)
                            .then(cache => {
                                cache.put(event.request, responseToCache);
                            });

                        return response;
                    });
            })
    );
});

// Listen for messages from the main thread
self.addEventListener('message', event => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        // Force update when requested
        self.skipWaiting();
    }
    
    if (event.data && event.data.type === 'FORCE_REFRESH') {
        // Clear all caches and force refresh
        event.waitUntil(
            caches.keys().then(cacheNames => {
                return Promise.all(
                    cacheNames.map(cacheName => {
                        if (cacheName.startsWith('cineshelf-')) {
                            console.log('CineShelf: Force clearing cache:', cacheName);
                            return caches.delete(cacheName);
                        }
                    })
                );
            }).then(() => {
                // Notify all clients to refresh
                return self.clients.matchAll().then(clients => {
                    clients.forEach(client => {
                        client.postMessage({
                            type: 'FORCE_REFRESH_COMPLETE',
                            message: 'Cache cleared, refreshing app...'
                        });
                    });
                });
            })
        );
    }
});

// Background sync for offline actions (optional)
self.addEventListener('sync', event => {
    if (event.tag === 'background-sync') {
        console.log('CineShelf: Background sync triggered');
        // Handle background sync tasks here
    }
});

// Push notifications (future feature)
self.addEventListener('push', event => {
    if (event.data) {
        const data = event.data.json();
        const options = {
            body: data.body,
            icon: './icon-180.png',
            badge: './icon-180.png',
            data: data.data
        };
        
        event.waitUntil(
            self.registration.showNotification(data.title, options)
        );
    }
});

console.log(`CineShelf Service Worker ${CACHE_VERSION} loaded`);