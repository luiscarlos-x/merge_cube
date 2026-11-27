const CACHE='orbita-lab-20261127-2';
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
function cleanUrl(requestUrl){
  const url=new URL(requestUrl);
  url.search='';
  url.hash='';
  return url;
}
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
  const url=cleanUrl(event.request.url);
  if(event.request.mode==='navigate'&&url.origin===BASE.origin&&(url.pathname===BASE.pathname||url.pathname===BASE.pathname+'index.html')){
    event.respondWith(caches.open(CACHE).then(async cache=>await cache.match(new URL('index.html',BASE).href)||fetch(event.request)));
  }else if(KNOWN.has(url.href)){
    event.respondWith(caches.open(CACHE).then(async cache=>await cache.match(url.href)||fetch(event.request)));
  }
});
