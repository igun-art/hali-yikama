/* =====================================================================
   HALI YIKAMA UYGULAMASI - veri.js  (VERİ KATMANI)

   Verinin nerede ve nasıl saklandığını SADECE bu dosya bilir.
   - localStorage'a yalnızca bu dosya dokunur.
   - app.js (ekranlar) veriye yalnızca buradaki fonksiyonlarla ulaşır.
   - Buluta geçerken değişecek tek dosya budur; ekranlar aynı kalır.

   Bu dosyadaki fonksiyonların kuralları:
   - app.js'in kullandığı fonksiyonların hepsi BEKLEME YAPAR (async). Sonuç "await" ile alınır:
       const musteriler = await musterileriGetir();
     Şimdilik cevap telefonun hafızasından anında gelir; bulutta internetten gelecek.
   - Bir işlem yapılamazsa null veya false döndürür (bulutta internet hatasında
     hata da fırlatabilir). veri.js ekrana HİÇBİR ŞEY yazmaz; kullanıcıya uyarıyı
     app.js gösterir ("Kaydedilemedi, tekrar deneyin").
   - Hiçbir kayıt gerçekten silinmez: "silindi: true" olarak işaretlenir.
     Okuma fonksiyonları silinmiş kayıtları HİÇ getirmez; böylece ekranlarda,
     sayılarda, ciroda ve tahsilatta kendiliğinden görünmezler.
     Yedek dosyası ise silinenler dahil her şeyi içerir.

   Her müşteri, sipariş ve giderde ortak alanlar (otomatik doldurulur):
   - id         : çakışmayan benzersiz kimlik (UUID). Bağlantılar bununla kurulur.
   - olusturma  : oluşturulma zamanı (milisaniye)
   - guncelleme : son değiştirilme zamanı (milisaniye; silinme anı da buraya yazılır)
   - kaydeden   : kaydı yapan kullanıcı (şimdilik boş: null)
   - silindi    : true ise kayıt silinmiş sayılır

   Bölümler:
     1. Sabitler (anahtarlar, sipariş durumları)
     2. localStorage okuma / yazma
     3. Ortak kayıt işlemleri (ekle, güncelle, silindi işaretle)
     4. Müşteriler
     5. Siparişler
     6. Giderler
     7. Ayarlar
     8. Yedekleme (tüm veri)
     9. Eski verileri yeni yapıya uyarlama
   ===================================================================== */


/* ===================== 1. SABİTLER ===================== */

// localStorage içinde verilerin saklandığı anahtar isimleri
const ANAHTAR_MUSTERILER = 'musteriler';
const ANAHTAR_SIPARISLER = 'siparisler';
const ANAHTAR_GIDERLER = 'giderler';
const ANAHTAR_AYARLAR = 'ayarlar';
const ANAHTAR_SON_YEDEK = 'sonYedek'; // Son yedeğin alındığı an (yedek dosyasına girmez)

const VARSAYILAN_BIRIM_FIYAT = 100; // TL / m²

// Sipariş durumları (iş akışı sırasıyla)
const DURUMLAR = ['Teslim Alındı', 'Bekliyor', 'Yıkamada', 'Hazır', 'Teslim Edildi'];
const TESLIM_EDILDI = 'Teslim Edildi';

// Eski sürümlerdeki durum adlarının yeni karşılıkları
const ESKI_DURUMLAR = {
  'Teslim alındı': 'Teslim Alındı',
  'Yıkanıyor': 'Yıkamada',
  'Teslim edildi': 'Teslim Edildi'
};


/* ===================== 2. LOCALSTORAGE OKUMA / YAZMA =====================
   Uygulamada localStorage'a dokunan TEK yer bu bölümdür.
   (Bunlar bu dosyanın iç işidir; app.js bunları kullanmaz.)
   ======================================================================== */

// Bir listeyi/nesneyi okur. Yoksa varsayılanı döndürür.
function depodanOku(anahtar, varsayilan) {
  try {
    const metin = localStorage.getItem(anahtar);
    return metin ? JSON.parse(metin) : varsayilan;
  } catch (hata) {
    return varsayilan;
  }
}

// Yazar. Yazamazsa (örn. depolama dolu) false döndürür; uyarıyı app.js gösterir.
function depoyaYaz(anahtar, deger) {
  try {
    localStorage.setItem(anahtar, JSON.stringify(deger));
    return true;
  } catch (hata) {
    console.error('Kayıt yazılamadı:', anahtar, hata);
    return false;
  }
}

// Verilen anahtarların şu anki halini saklar (yarıda kalan işlemi geri almak için)
function depoAnlikGoruntu(anahtarlar) {
  return anahtarlar.map(anahtar => [anahtar, localStorage.getItem(anahtar)]);
}

// depoAnlikGoruntu ile saklanan hali geri koyar
function depoyuGeriYukle(goruntu) {
  goruntu.forEach(([anahtar, metin]) => {
    try {
      if (metin === null) localStorage.removeItem(anahtar);
      else localStorage.setItem(anahtar, metin);
    } catch (hata) {
      console.error('Eski hal geri konamadı:', anahtar, hata);
    }
  });
}


/* ===================== 3. ORTAK KAYIT İŞLEMLERİ ===================== */

// Çakışmayan benzersiz kimlik (UUID) üretir. Örnek: "3f2b8c1e-9a4d-4c2e-b1f0-7d6e5a4b3c2d"
function yeniKimlik() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  // randomUUID olmayan eski tarayıcılar için aynı biçimde rastgele kimlik
  const baytlar = crypto.getRandomValues(new Uint8Array(16));
  baytlar[6] = (baytlar[6] & 0x0f) | 0x40;
  baytlar[8] = (baytlar[8] & 0x3f) | 0x80;
  const h = Array.from(baytlar, b => b.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

// Şu an uygulamayı kullanan kişi. Bulutta giriş yapılınca burası dolacak.
function aktifKullanici() {
  return null;
}

// Listeden silinmiş kayıtları çıkarır
function silinmemisler(liste) {
  return liste.filter(k => !k.silindi);
}

// Listeye yeni kayıt ekler; ortak alanları (id, zamanlar, kaydeden, silindi) doldurur.
// Eklenen kaydı döndürür (kaydedilemezse null).
async function kayitEkle(anahtar, bilgiler) {
  const simdi = Date.now();
  const kayit = { id: yeniKimlik(), ...bilgiler };
  Object.assign(kayit, { olusturma: simdi, guncelleme: simdi, kaydeden: aktifKullanici(), silindi: false });

  const liste = depodanOku(anahtar, []);
  liste.push(kayit);
  return depoyaYaz(anahtar, liste) ? kayit : null;
}

// Bir kaydı değiştirir. "degisiklik" kaydı alıp üzerinde değişiklik yapan bir fonksiyondur.
// guncelleme zamanı otomatik yenilenir; id, olusturma, kaydeden ve silindi değiştirilemez.
// Silinmiş kayıt değiştirilemez. Değişen kaydı döndürür (bulunamazsa veya kaydedilemezse null).
async function kayitGuncelle(anahtar, id, degisiklik) {
  const liste = depodanOku(anahtar, []);
  const kayit = liste.find(k => k.id === id && !k.silindi);
  if (!kayit) return null;

  const { olusturma, kaydeden } = kayit;
  degisiklik(kayit);
  Object.assign(kayit, { id, olusturma, kaydeden, silindi: false, guncelleme: Date.now() });

  return depoyaYaz(anahtar, liste) ? kayit : null;
}

// Kayıtları SİLMEZ; koşula uyanları "silindi" olarak işaretler. Başarılıysa true döndürür.
async function silindiIsaretle(anahtar, kosul) {
  const simdi = Date.now();
  const liste = depodanOku(anahtar, []);
  liste
    .filter(k => !k.silindi && kosul(k))
    .forEach(k => { k.silindi = true; k.guncelleme = simdi; });
  return depoyaYaz(anahtar, liste);
}


/* ===================== 4. MÜŞTERİLER ===================== */

async function musterileriGetir() {
  return silinmemisler(depodanOku(ANAHTAR_MUSTERILER, []));
}

// Bulunamazsa (veya silinmişse) null
async function musteriGetir(id) {
  return (await musterileriGetir()).find(m => m.id === id) || null;
}

// bilgiler: { ad, soyad, telefon, adres }
async function musteriEkle(bilgiler) {
  return kayitEkle(ANAHTAR_MUSTERILER, bilgiler);
}

async function musteriGuncelle(id, bilgiler) {
  return kayitGuncelle(ANAHTAR_MUSTERILER, id, musteri => Object.assign(musteri, bilgiler));
}

// Müşteriyi ve tüm siparişlerini "silindi" olarak işaretler
async function musteriSil(id) {
  return await silindiIsaretle(ANAHTAR_SIPARISLER, s => s.musteriId === id) &&
    await silindiIsaretle(ANAHTAR_MUSTERILER, m => m.id === id);
}


/* ===================== 5. SİPARİŞLER ===================== */

async function siparisleriGetir() {
  return silinmemisler(depodanOku(ANAHTAR_SIPARISLER, []));
}

// Bulunamazsa (veya silinmişse) null
async function siparisGetir(id) {
  return (await siparisleriGetir()).find(s => s.id === id) || null;
}

async function musterininSiparisleri(musteriId) {
  return (await siparisleriGetir()).filter(s => s.musteriId === musteriId);
}

// Ekrandaki sıra numarasıyla (#27) siparişi bulur. Bulunamazsa null.
async function siparisNoIleBul(no) {
  return (await siparisleriGetir()).find(s => s.no === no) || null;
}

// Yeni siparişe sıradaki numarayı verir (1, 2, 3 ...). Silinen numara tekrar kullanılmaz.
// NOT: Buluta geçince numarayı sunucu vermeli (iki telefon aynı numarayı vermesin).
async function yeniSiparisNo() {
  const ayarlar = await ayarlariGetir();
  ayarlar.sonSiparisNo = (Number(ayarlar.sonSiparisNo) || 0) + 1;
  depoyaYaz(ANAHTAR_AYARLAR, ayarlar);
  return ayarlar.sonSiparisNo;
}

// bilgiler: { musteriId, tarih, metrekare, birimFiyat, tutar, durum, odemeAlindi, odemeTarihi, teslimTarihi }
async function siparisEkle(bilgiler) {
  return kayitEkle(ANAHTAR_SIPARISLER, { no: await yeniSiparisNo(), ...bilgiler });
}

// degisiklik: siparişi alıp değiştiren fonksiyon. Örnek: s => { s.durum = 'Hazır'; }
async function siparisGuncelle(id, degisiklik) {
  return kayitGuncelle(ANAHTAR_SIPARISLER, id, degisiklik);
}

async function siparisSil(id) {
  return silindiIsaretle(ANAHTAR_SIPARISLER, s => s.id === id);
}


/* ===================== 6. GİDERLER ===================== */

async function giderleriGetir() {
  return silinmemisler(depodanOku(ANAHTAR_GIDERLER, []));
}

// bilgiler: { tarih, tutar, aciklama }
async function giderEkle(bilgiler) {
  return kayitEkle(ANAHTAR_GIDERLER, bilgiler);
}

async function giderSil(id) {
  return silindiIsaretle(ANAHTAR_GIDERLER, g => g.id === id);
}


/* ===================== 7. AYARLAR ===================== */

function varsayilanAyarlar() {
  return { birimFiyat: VARSAYILAN_BIRIM_FIYAT, sonSiparisNo: 0 };
}

async function ayarlariGetir() {
  return depodanOku(ANAHTAR_AYARLAR, varsayilanAyarlar());
}

async function birimFiyatKaydet(fiyat) {
  const ayarlar = await ayarlariGetir();
  ayarlar.birimFiyat = fiyat;
  return depoyaYaz(ANAHTAR_AYARLAR, ayarlar);
}


/* ===================== 8. YEDEKLEME ===================== */

// Yedek dosyasına girecek TÜM veri (silinmiş kayıtlar dahil)
async function tumVeriyiGetir() {
  return {
    musteriler: depodanOku(ANAHTAR_MUSTERILER, []),
    siparisler: depodanOku(ANAHTAR_SIPARISLER, []),
    giderler: depodanOku(ANAHTAR_GIDERLER, []),
    ayarlar: await ayarlariGetir()
  };
}

// Bir yedek dosyasında kaç tane (silinmemiş) kayıt olduğunu sayar (onay sorusu için)
async function yedektekiKayitSayilari(yedek) {
  const say = liste => (Array.isArray(liste) ? silinmemisler(liste).length : 0);
  return { musteri: say(yedek.musteriler), siparis: say(yedek.siparisler), gider: say(yedek.giderler) };
}

// Cihazdaki tüm veriyi yedektekiyle değiştirir, sonra eksik alanları tamamlar.
// veri: { musteriler, siparisler, giderler, ayarlar } (giderler ve ayarlar eski yedeklerde olmayabilir)
// Yarıda kalırsa (örn. bir kısmı yazılamazsa) cihazdaki eski veri olduğu gibi geri konur.
async function tumVeriyiDegistir(veri) {
  const ayarlar = veri.ayarlar && Number(veri.ayarlar.birimFiyat) > 0 ? veri.ayarlar : varsayilanAyarlar();
  const giderler = Array.isArray(veri.giderler) ? veri.giderler : [];
  const eskiHal = depoAnlikGoruntu([ANAHTAR_MUSTERILER, ANAHTAR_SIPARISLER, ANAHTAR_GIDERLER, ANAHTAR_AYARLAR]);

  const tamam = depoyaYaz(ANAHTAR_MUSTERILER, veri.musteriler) &&
    depoyaYaz(ANAHTAR_SIPARISLER, veri.siparisler) &&
    depoyaYaz(ANAHTAR_GIDERLER, giderler) &&
    depoyaYaz(ANAHTAR_AYARLAR, ayarlar);
  if (!tamam) {
    depoyuGeriYukle(eskiHal); // Yarım kalan veri kalmasın
    return false;
  }
  await veriyiDuzenle();
  return true;
}

// Son yedeğin alındığı an (milisaniye). Hiç yedek yoksa null.
async function sonYedekZamani() {
  return depodanOku(ANAHTAR_SON_YEDEK, null);
}

async function sonYedekKaydet() {
  return depoyaYaz(ANAHTAR_SON_YEDEK, Date.now());
}


/* ===================== 9. ESKİ VERİLERİ YENİ YAPIYA UYARLAMA =====================
   Uygulama her açıldığında ve yedek geri yüklendiğinde çalışır.
   Eski sürümlerden (veya ileride başka dosyalardan aktarılan) kayıtları yeni yapıya getirir;
   zaten uygun olan veriye dokunmaz. Silinmiş kayıtlar dahil hepsine bakar.
   ================================================================================ */

// Her kayıtta olması gereken ortak alanları tamamlar
function kayitAlanlariniTamamla(kayit) {
  if (!kayit.id) kayit.id = yeniKimlik();
  if (!kayit.olusturma) kayit.olusturma = Date.now();
  if (!kayit.guncelleme) kayit.guncelleme = kayit.olusturma;
  if (kayit.kaydeden === undefined) kayit.kaydeden = null;
  kayit.silindi = !!kayit.silindi;
}

async function veriyiDuzenle() {
  const musteriler = depodanOku(ANAHTAR_MUSTERILER, []);
  const siparisler = depodanOku(ANAHTAR_SIPARISLER, []);
  const giderler = depodanOku(ANAHTAR_GIDERLER, []);
  const ayarlar = depodanOku(ANAHTAR_AYARLAR, varsayilanAyarlar());
  const oncekiHali = JSON.stringify([musteriler, siparisler, giderler, ayarlar]);

  [musteriler, siparisler, giderler].forEach(liste => liste.forEach(kayitAlanlariniTamamla));

  siparisler.forEach(s => {
    // Durum adları: "Yıkanıyor" -> "Yıkamada" gibi
    if (!DURUMLAR.includes(s.durum)) s.durum = ESKI_DURUMLAR[s.durum] || DURUMLAR[0];

    // Ödemesi alınmış ama ödeme tarihi olmayan eski siparişlerde sipariş tarihi kullanılır
    s.odemeAlindi = !!s.odemeAlindi;
    if (s.odemeAlindi && !s.odemeTarihi) s.odemeTarihi = s.tarih;
    if (!s.odemeAlindi) s.odemeTarihi = null;

    // Teslim edilmiş ama teslim tarihi olmayan eski siparişlerde de sipariş tarihi kullanılır
    if (s.durum === TESLIM_EDILDI && !s.teslimTarihi) s.teslimTarihi = s.tarih;
    if (s.durum !== TESLIM_EDILDI) s.teslimTarihi = null;
  });

  // Numarası olmayan siparişlere, oluşturulma sırasına göre numara ver
  // (silinmiş siparişlerin numaraları da sayılır, böylece tekrar kullanılmaz)
  let sonNo = Math.max(Number(ayarlar.sonSiparisNo) || 0, ...siparisler.map(s => Number(s.no) || 0));
  siparisler
    .filter(s => !s.no)
    .sort((a, b) => (a.olusturma || 0) - (b.olusturma || 0))
    .forEach(s => { sonNo += 1; s.no = sonNo; });
  ayarlar.sonSiparisNo = sonNo;
  if (!(Number(ayarlar.birimFiyat) > 0)) ayarlar.birimFiyat = VARSAYILAN_BIRIM_FIYAT;

  // Sadece bir şey değiştiyse kaydet
  if (JSON.stringify([musteriler, siparisler, giderler, ayarlar]) !== oncekiHali) {
    depoyaYaz(ANAHTAR_MUSTERILER, musteriler);
    depoyaYaz(ANAHTAR_SIPARISLER, siparisler);
    depoyaYaz(ANAHTAR_GIDERLER, giderler);
    depoyaYaz(ANAHTAR_AYARLAR, ayarlar);
  }
}
