// Marketing shell only. Never cache API responses or authenticated access links.
const CACHE='luna-shell-v1';
const FILES=['./','./index.html','./style.css','./main.js','./scene.js','./config.js','./favicon.svg','./assets/hero.jpg','./assets/globe.jpg','./assets/private.jpg','./assets/Montserrat-Light.ttf','./assets/Montserrat-Regular.ttf','./assets/Montserrat-Medium.ttf'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(FILES))));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('luna-shell-')&&key!==CACHE).map(key=>caches.delete(key))))));
self.addEventListener('fetch',event=>{const url=new URL(event.request.url),root=new URL('./',self.location.href);if(event.request.method!=='GET'||url.origin!==root.origin)return;const relative='./'+url.pathname.slice(root.pathname.length);if(!FILES.includes(relative)&&url.pathname!==root.pathname)return;event.respondWith(fetch(event.request).catch(()=>caches.match(event.request).then(response=>response||Response.error())));});
