// Planif Recharge Libre — service worker : l'appli démarre toujours, même sans réseau
const CACHE = 'planif-libre-v1.0.0';
const TILES = 'pl-tiles-v1';
const SHELL = ["./", "index.html", "trajet.js", "extras.js", "abos.js", "onboard.js", "offline.js", "manifest.json", "icon-192.png", "icon-512.png", "vendor/leaflet/leaflet.js", "vendor/leaflet/leaflet.css", "vendor/cluster/leaflet.markercluster.js", "vendor/cluster/MarkerCluster.css", "vendor/cluster/MarkerCluster.Default.css", "vendor/fonts/fonts.css", "vendor/leaflet/images/layers.png", "vendor/leaflet/images/layers-2x.png", "vendor/leaflet/images/marker-icon-2x.png", "vendor/leaflet/images/marker-shadow.png", "vendor/leaflet/images/marker-icon.png", "vendor/fonts/orbitron-latin-900-normal.woff2", "vendor/fonts/rajdhani-latin-400-normal.woff2", "vendor/fonts/rajdhani-latin-700-normal.woff2", "vendor/fonts/orbitron-latin-500-normal.woff2", "vendor/fonts/orbitron-latin-700-normal.woff2", "vendor/fonts/rajdhani-latin-600-normal.woff2", "vendor/fonts/rajdhani-latin-500-normal.woff2"];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => Promise.all(SHELL.map(u => c.add(new Request(u, { cache: 'reload' })).catch(() => {})))));
  self.skipWaiting();
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE && k !== TILES).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
let trimming = false;
async function trimTiles() {
  if (trimming) return; trimming = true;
  try { const c = await caches.open(TILES); const ks = await c.keys(); if (ks.length > 15000) for (const k of ks.slice(0, 1500)) await c.delete(k); } catch (e) {}
  trimming = false;
}
self.addEventListener('fetch', e => {
  const req = e.request, u = new URL(req.url);
  if (req.method !== 'GET') return;
  if (u.hostname === 'tile.openstreetmap.org') {
    e.respondWith(caches.open(TILES).then(c => c.match(req.url).then(hit => hit ||
      fetch(req).then(r => { if (r.ok) { c.put(req.url, r.clone()); trimTiles(); } return r; })
        .catch(() => new Response('', { status: 504 })))));
    return;
  }
  if (u.origin !== location.origin) return;
  if (u.pathname.endsWith('version.json')) return;
  e.respondWith(caches.open(CACHE).then(c => c.match(req, { ignoreSearch: true }).then(hit => hit ||
    fetch(req).catch(() => (req.mode === 'navigate' ? c.match('index.html') : undefined)))));
});
