/* =====================================================================
   SERVICE WORKER - internetsiz çalışma ve güncelleme

   !!! KODDA HERHANGİ BİR DEĞİŞİKLİK YAPTIĞINIZDA AŞAĞIDAKİ SÜRÜM
   NUMARASINI ARTIRIN (örn. 1.0.0 -> 1.0.1). !!!
   Telefonlar ancak bu dosya değişince yeni sürümü indirir.
   ===================================================================== */

const SURUM = '1.11.0';
const CACHE_NAME = 'hali-yikama-' + SURUM;

// Önbelleğe alınacak (internetsiz çalışacak) dosyalar
const DOSYALAR = [
  './',
  './index.html',
  './style.css',
  './veri.js',
  './app.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png'
];

// 1) KURULUM: dosyaları yeni sürümün önbelleğine indir
self.addEventListener('install', olay => {
  olay.waitUntil(
    caches.open(CACHE_NAME)
      // cache: 'reload' -> tarayıcının eski kopyasını değil, sunucudaki güncel dosyayı al
      .then(cache => cache.addAll(DOSYALAR.map(d => new Request(d, { cache: 'reload' }))))
      // Beklemeden hemen devreye gir
      .then(() => self.skipWaiting())
  );
});

// 2) ETKİNLEŞME: eski sürümlerin önbelleklerini sil
self.addEventListener('activate', olay => {
  olay.waitUntil(
    caches.keys()
      .then(isimler => Promise.all(
        isimler
          .filter(isim => isim.startsWith('hali-yikama-') && isim !== CACHE_NAME)
          .map(isim => caches.delete(isim))
      ))
      // Açık olan sayfaların kontrolünü hemen al (sayfa kendini yenileyecek)
      .then(() => self.clients.claim())
  );
});

// 3) İSTEKLER: önce önbellekten ver, yoksa internetten al
self.addEventListener('fetch', olay => {
  const istek = olay.request;
  if (istek.method !== 'GET') return;
  if (new URL(istek.url).origin !== self.location.origin) return;

  olay.respondWith(
    caches.match(istek, { ignoreSearch: true }).then(onbellekte => {
      if (onbellekte) return onbellekte;
      return fetch(istek).catch(() => {
        // İnternet yok ve sayfa önbellekte bulunamadıysa ana sayfayı göster
        if (istek.mode === 'navigate') return caches.match('./index.html');
      });
    })
  );
});
