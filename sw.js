const CACHE='orbita-lab-20261127-1';
const BASE=new URL('./',self.location.href);
const FILES=[
  './','index.html','styles.css','app.js','vision.mjs','pose.mjs','vision-worker.mjs',
  'manifest.webmanifest','favicon.svg','assets/icons.svg','assets/icon-180.png','assets/icon-192.png',
  'assets/icon-512.png','assets/icon-mask.png','assets/inter.woff2',
  'space/scene.js','space/earth-map.webp','space/jupiter-map.webp','space/sprites.webp',
  'space/earth.webp','space/solar.webp','space/jupiter.webp','space/hero.webp',
  'tracking/tracker.mjs','tracking/jsfeat.mjs','tracking/features.mjs','tracking/face-features.bin'
].map(path=>new URL(path,BASE).href);
const KNOWN=new Set(FILES);
self.addEventListener('install',event=>{
  event.waitUntil((async()=>{
    const cache=await caches.open(CACHE);
    await cache.addAll(FILES.map(url=>new Request(url,{cache:'reload'})));
    await self.skipWaiting();
  })());
});
self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    for(const key of await caches.keys())if(key.startsWith('orbita-lab-')&&key!==CACHE)await caches.delete(key);
    await self.clients.claim();
  })());
});
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  if(event.request.mode==='navigate'&&new URL(event.request.url).pathname===BASE.pathname){
    event.respondWith(caches.open(CACHE).then(async cache=>await cache.match(new URL('index.html',BASE).href)||fetch(event.request)));
  }else if(KNOWN.has(event.request.url)){
    event.respondWith(caches.open(CACHE).then(async cache=>await cache.match(event.request)||fetch(event.request)));
  }
});
