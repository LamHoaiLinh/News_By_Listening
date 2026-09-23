const CACHE='nbl-v1.10.0';
const ASSETS=['./','./index.html','./styles.css','./v13.css','./v14.css','./v15.css','./v16.css','./v18.css','./v18-mobile-hotfix.css','./slots-bootstrap.js','./app.js','./hotfix.js','./sync-v2.js','./youtube-backend.js','./router-core.js','./playback-safety.js','./playback-engine.js','./playlists-ui-v2.js','./slots-ui.js','./repeat-ui.js','./new-video-scanner.js','./bulk-refresh-v2.js','./playback-diagnostics-ui.js','./player.html','./player.css','./player.js','./manifest.webmanifest','./icon.svg'];

self.addEventListener('install',e=>e.waitUntil(
  caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting())
));

self.addEventListener('activate',e=>e.waitUntil(
  caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())
));

self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET')return;
  const url=new URL(e.request.url);
  if(url.origin!==location.origin)return;

  if(e.request.mode==='navigate'){
    e.respondWith(
      fetch(e.request,{cache:'no-store'})
        .then(resp=>{
          const copy=resp.clone();
          caches.open(CACHE).then(c=>c.put(url.pathname.endsWith('/player.html')?'./player.html':'./index.html',copy));
          return resp;
        })
        .catch(()=>caches.match(url.pathname.endsWith('/player.html')?'./player.html':'./index.html'))
    );
    return;
  }

  e.respondWith(
    caches.match(e.request).then(r=>r||fetch(e.request).then(resp=>{
      const copy=resp.clone();caches.open(CACHE).then(c=>c.put(e.request,copy));return resp;
    }))
  );
});
