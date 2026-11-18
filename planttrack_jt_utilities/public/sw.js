// PlantTrack PWA service worker. Do not cache authenticated pages or API responses.
self.addEventListener("install",()=>self.skipWaiting());
self.addEventListener("activate",event=>event.waitUntil(self.clients.claim()));
self.addEventListener("fetch",event=>{
 if(event.request.mode!=="navigate")return;
 event.respondWith(fetch(event.request).catch(()=>new Response('<!doctype html><html lang="en"><meta name="viewport" content="width=device-width,initial-scale=1"><title>PlantTrack offline</title><body style="font-family:system-ui;padding:2rem"><h1>PlantTrack is offline</h1><p>Reconnect to the internet and reopen the app to access workshop job cards.</p></body></html>',{headers:{"Content-Type":"text/html; charset=utf-8"},status:503})));
});