// Caches the app shell (this file's list below) so the app can launch
// without depending on a successful network fetch every time.
// 
// See CLAUDE.md Gotchas for why that matters: GitHub Pages doesn't support
// HTTP/3, so a network change mid-request (e.g. switching wifi/cellular)
// can fail the very request that loads the app, with nothing to fall back
// to. Once this has cached the shell at least once, that failure mode goes
// away for this device.
//
// This matters most for when the app is installed as an iconon a phone's 
// home screen: the cache mechanism itself doesn't treat that case specially 
// — a regular browser tab that's visited the site before benefits the same 
// way — but an installed icon gets relaunched habitually, like a native app, 
// so it's the case most likely to actually have a cached previous version 
// sitting around by the time a network hiccup or a new deploy happens.
//
// Google Fonts is deliberately NOT cached here: the CSS already falls back
// to system fonts if it fails to load, and caching it would mean losing
// Google's own font updates for no real benefit.
//
// Bump CACHE_NAME on any deploy that changes a cached file — that's what
// makes the browser notice a new version and drives the "update available"
// banner in index.html.

const CACHE_NAME = 'serve-tracker-v1';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    )
  );
});

// Cache-first for the app shell; anything not in the cache (Google Fonts,
// etc.) just falls through to the network untouched.
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});

// Lets index.html's update banner activate a waiting new version
// immediately, instead of waiting for every open tab to close on its own.
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
