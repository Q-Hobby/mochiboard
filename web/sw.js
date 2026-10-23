// Keeps a copy of Mochiboard in the browser so it opens without internet (the website version).
// The Mac app loads these files from disk, so it doesn't need this.
// Network first, so a new version shows up when you're online; the saved copy is the fallback when you're not.
const CACHE = 'mochiboard-v3';
const FILES = [
  './', 'index.html', 'style.css', 'fonts.css', 'app.js', 'bridge.js', 'goo.js', 'vendor/editor.js', 'vendor/docx.js', 'icons/names.js', 'icons/MaterialIconsOutlined-Regular.otf',
  'fonts/DMSans-400-latin.woff2', 'fonts/DMSans-500-latin.woff2', 'fonts/DMSans-700-latin.woff2', 'fonts/DMSans-800-latin.woff2',
  'fonts/DMSans-400-latin-ext.woff2', 'fonts/DMSans-500-latin-ext.woff2', 'fonts/DMSans-700-latin-ext.woff2', 'fonts/DMSans-800-latin-ext.woff2',
  'fonts/Caveat-500-latin.woff2', 'fonts/Caveat-700-latin.woff2', 'fonts/Caveat-500-latin-ext.woff2', 'fonts/Caveat-700-latin-ext.woff2',
  'stamps/mochi.png', 'stamps/mochi-shook.png', 'stamps/mochi-wave.png', 'stamps/mochi-happy.png', 'stamps/mochi-party.png', 'stamps/mochi-love.png',
  'stamps/mochi-sigh.gif', 'stamps/mochi-sleepy.png', 'stamps/mochi-cry.png', 'stamps/mochi-sigh.png', 'stamps/mochi-bounce.gif',
];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;   // only Mochiboard's own files
  e.respondWith(fetch(e.request).then(r => { if (r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); } return r; })
    .catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match('index.html'))));
});
