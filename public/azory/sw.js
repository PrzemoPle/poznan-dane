var C='sao-miguel-v2';
self.addEventListener('install',function(e){self.skipWaiting()});
self.addEventListener('activate',function(e){
  e.waitUntil(caches.keys().then(function(ks){return Promise.all(ks.filter(function(k){return k!==C}).map(function(k){return caches.delete(k)}))}));
});
self.addEventListener('fetch',function(e){
  e.respondWith(caches.match(e.request).then(function(r){
    if(r)return r;
    return fetch(e.request).then(function(res){
      var cp=res.clone();caches.open(C).then(function(c){c.put(e.request,cp)});return res;
    }).catch(function(){return caches.match('./')});
  }));
});
