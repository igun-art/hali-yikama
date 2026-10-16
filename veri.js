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
   - sanal      : (isteğe bağlı) true ise gösterim için üretilmiş SANAL kayıttır (10. bölüm)

   Bölümler:
     1. Sabitler (anahtarlar, sipariş durumları)
     2. localStorage okuma / yazma
     3. Ortak kayıt işlemleri (ekle, güncelle, silindi işaretle)
     4. Müşteriler
     5. Siparişler
     6. Giderler
     7. Ayarlar
     8. Yedekleme (tüm veri, yedek dosyası kontrolü)
     9. Eski verileri yeni yapıya uyarlama
    10. Sanal (deneme) veriler
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

// Ödeme yöntemleri (ödeme alınırken biri SEÇİLMEK ZORUNDA; Kasa = sadece Nakit)
const ODEME_YONTEMLERI = ['Nakit', 'Kart', 'Havale'];

// Gider türleri (gider eklenirken biri SEÇİLMEK ZORUNDA)
const GIDER_TURLERI = ['Yakıt', 'Malzeme', 'Diğer'];

// Eski sürümlerdeki durum adlarının yeni karşılıkları
const ESKI_DURUMLAR = {
  'Teslim alındı': 'Teslim Alındı',
  'Yıkanıyor': 'Yıkamada',
  'Teslim edildi': 'Teslim Edildi'
};

// Gerçekten listedeki eski bir durum adı mı? ("toString" gibi her nesnede olan adlar sayılmaz)
function eskiDurumMu(durum) {
  return typeof durum === 'string' && Object.prototype.hasOwnProperty.call(ESKI_DURUMLAR, durum);
}


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

// bilgiler: { musteriId, tarih, metrekare, parcaSayisi, birimFiyat, tutar, durum,
//             odemeAlindi, odemeTarihi, odemeYontemi, teslimTarihi }
async function siparisEkle(bilgiler) {
  const siparis = await kayitEkle(ANAHTAR_SIPARISLER, { no: await yeniSiparisNo(), ...bilgiler });
  // Sanal bir müşteriye gerçek sipariş eklendiyse müşteri artık gerçek müşteridir (10. bölüm)
  if (siparis && siparis.sanal !== true) await sanalMusteriyiGercegeCevir(siparis.musteriId);
  return siparis;
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

// bilgiler: { tarih, tutar, tur, aciklama }
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

// --- Yedek dosyası kontrolü ---
// Dosyadaki her kaydın alanlarını kontrol eder. Sorun yoksa boş liste,
// varsa Türkçe sorun açıklamalarının listesini döndürür
// (örn. "Sipariş #5: tarih geçersiz"). Tek bir sorun bile varsa dosya YÜKLENMEZ.
// Eski sürüm yedeklerinde olmayan alanlar ve eski durum adları sorun sayılmaz.
async function yedekKontrolEt(yedek) {
  const sorunlar = [];
  const bosMu = x => x === undefined || x === null;
  const metinMi = x => typeof x === 'string';
  const sayiMi = x => typeof x === 'number' && isFinite(x);
  const pozitifTamSayiMi = x => Number.isInteger(x) && x >= 1;
  const listeMi = x => Array.isArray(x);
  const nesneMi = x => x !== null && typeof x === 'object' && !Array.isArray(x);
  // "2026-10-15" biçiminde ve gerçekten var olan bir gün mü (31 Şubat değil)
  const tarihMi = x => {
    if (!metinMi(x) || !/^\d{4}-\d{2}-\d{2}$/.test(x)) return false;
    const [yil, ay, gun] = x.split('-').map(Number);
    const d = new Date(yil, ay - 1, gun);
    return d.getFullYear() === yil && d.getMonth() === ay - 1 && d.getDate() === gun;
  };

  // 1) Dosyanın genel yapısı
  if (!nesneMi(yedek)) return ['Dosya bir halı yıkama yedeği değil.'];
  if (!listeMi(yedek.musteriler)) sorunlar.push('Dosyada müşteri listesi yok veya bozuk.');
  if (!listeMi(yedek.siparisler)) sorunlar.push('Dosyada sipariş listesi yok veya bozuk.');
  if (!bosMu(yedek.giderler) && !listeMi(yedek.giderler)) sorunlar.push('Dosyadaki gider listesi bozuk.');
  if (!bosMu(yedek.ayarlar) && !nesneMi(yedek.ayarlar)) sorunlar.push('Dosyadaki ayarlar bozuk.');
  if (sorunlar.length) return sorunlar;

  // 2) Her kayıtta ortak alanlar (id, zamanlar, kaydeden, silindi) ve tekrar eden kimlik
  const ortakKontrol = (liste, adVer) => {
    const gorulenler = new Set();
    liste.forEach((k, i) => {
      if (!nesneMi(k)) { sorunlar.push(`${adVer(k, i)}: kayıt bozuk.`); return; }
      const ad = adVer(k, i);
      if (!metinMi(k.id) || k.id === '') sorunlar.push(`${ad}: kimlik (id) eksik.`);
      else if (gorulenler.has(k.id)) sorunlar.push(`${ad}: aynı kimlik (id) iki kez geçiyor.`);
      else gorulenler.add(k.id);
      if (!bosMu(k.olusturma) && !sayiMi(k.olusturma)) sorunlar.push(`${ad}: oluşturma zamanı geçersiz.`);
      if (!bosMu(k.guncelleme) && !sayiMi(k.guncelleme)) sorunlar.push(`${ad}: güncelleme zamanı geçersiz.`);
      if (!bosMu(k.kaydeden) && !metinMi(k.kaydeden)) sorunlar.push(`${ad}: "kaydeden" alanı geçersiz.`);
      if (!bosMu(k.silindi) && typeof k.silindi !== 'boolean') sorunlar.push(`${ad}: "silindi" alanı geçersiz.`);
      if (!bosMu(k.sanal) && typeof k.sanal !== 'boolean') sorunlar.push(`${ad}: "sanal" alanı geçersiz.`);
    });
  };

  // 3) Müşteriler
  const musteriAdi = (m, i) => nesneMi(m) && metinMi(m.ad)
    ? `${i + 1}. müşteri (${m.ad} ${metinMi(m.soyad) ? m.soyad : ''})`.replace(' )', ')')
    : `${i + 1}. müşteri`;
  ortakKontrol(yedek.musteriler, musteriAdi);
  const musteriKimlikleri = new Set();
  yedek.musteriler.forEach((m, i) => {
    if (!nesneMi(m)) return;
    const ad = musteriAdi(m, i);
    if (metinMi(m.id)) musteriKimlikleri.add(m.id);
    if (!metinMi(m.ad)) sorunlar.push(`${ad}: ad eksik.`);
    if (!metinMi(m.soyad)) sorunlar.push(`${ad}: soyad eksik.`);
    if (!metinMi(m.telefon)) sorunlar.push(`${ad}: telefon eksik.`);
    if (!bosMu(m.adres) && !metinMi(m.adres)) sorunlar.push(`${ad}: adres geçersiz.`);
  });

  // 4) Siparişler
  const siparisAdi = (s, i) => nesneMi(s) && pozitifTamSayiMi(s.no) ? `Sipariş #${s.no}` : `${i + 1}. sipariş`;
  ortakKontrol(yedek.siparisler, siparisAdi);
  const gorulenNumaralar = new Set();
  yedek.siparisler.forEach((s, i) => {
    if (!nesneMi(s)) return;
    const ad = siparisAdi(s, i);
    if (!metinMi(s.musteriId) || !musteriKimlikleri.has(s.musteriId)) sorunlar.push(`${ad}: müşterisi dosyada yok.`);
    if (!tarihMi(s.tarih)) sorunlar.push(`${ad}: tarih geçersiz (2026-10-15 gibi olmalı).`);
    if (!sayiMi(s.metrekare) || s.metrekare <= 0) sorunlar.push(`${ad}: metrekare 0'dan büyük bir sayı olmalı.`);
    if (!sayiMi(s.birimFiyat) || s.birimFiyat < 0) sorunlar.push(`${ad}: birim fiyat sayı olmalı.`);
    if (!sayiMi(s.tutar) || s.tutar < 0) sorunlar.push(`${ad}: tutar sayı olmalı.`);
    if (!bosMu(s.no)) {
      if (!pozitifTamSayiMi(s.no)) sorunlar.push(`${ad}: sipariş numarası pozitif tam sayı olmalı.`);
      else if (gorulenNumaralar.has(s.no)) sorunlar.push(`${ad}: aynı sipariş numarası iki kez geçiyor.`);
      else gorulenNumaralar.add(s.no);
    }
    if (!bosMu(s.parcaSayisi) && !pozitifTamSayiMi(s.parcaSayisi)) sorunlar.push(`${ad}: parça sayısı pozitif tam sayı olmalı.`);
    if (!bosMu(s.durum) && !DURUMLAR.includes(s.durum) && !eskiDurumMu(s.durum)) {
      sorunlar.push(`${ad}: durum tanınmıyor.`);
    }
    if (!bosMu(s.odemeAlindi) && typeof s.odemeAlindi !== 'boolean') sorunlar.push(`${ad}: "ödeme alındı" alanı geçersiz.`);
    if (!bosMu(s.odemeTarihi) && !tarihMi(s.odemeTarihi)) sorunlar.push(`${ad}: ödeme tarihi geçersiz.`);
    if (!bosMu(s.odemeYontemi) && !ODEME_YONTEMLERI.includes(s.odemeYontemi)) {
      sorunlar.push(`${ad}: ödeme yöntemi tanınmıyor (Nakit, Kart veya Havale olmalı).`);
    }
    if (!bosMu(s.teslimTarihi) && !tarihMi(s.teslimTarihi)) sorunlar.push(`${ad}: teslim tarihi geçersiz.`);
  });

  // 5) Giderler (eski yedeklerde hiç olmayabilir)
  const giderler = yedek.giderler || [];
  const giderAdi = (g, i) => `${i + 1}. gider`;
  ortakKontrol(giderler, giderAdi);
  giderler.forEach((g, i) => {
    if (!nesneMi(g)) return;
    const ad = giderAdi(g, i);
    if (!tarihMi(g.tarih)) sorunlar.push(`${ad}: tarih geçersiz (2026-10-15 gibi olmalı).`);
    if (!sayiMi(g.tutar) || g.tutar <= 0) sorunlar.push(`${ad}: tutar 0'dan büyük bir sayı olmalı.`);
    if (!bosMu(g.tur) && !GIDER_TURLERI.includes(g.tur)) sorunlar.push(`${ad}: tür tanınmıyor (Yakıt, Malzeme veya Diğer olmalı).`);
    if (!bosMu(g.aciklama) && !metinMi(g.aciklama)) sorunlar.push(`${ad}: açıklama geçersiz.`);
  });

  // 6) Ayarlar
  const ayarlar = yedek.ayarlar || {};
  if (!bosMu(ayarlar.birimFiyat) && (!sayiMi(ayarlar.birimFiyat) || ayarlar.birimFiyat <= 0)) {
    sorunlar.push('Ayarlar: birim fiyat 0\'dan büyük bir sayı olmalı.');
  }
  if (!bosMu(ayarlar.sonSiparisNo) && !(Number.isInteger(ayarlar.sonSiparisNo) && ayarlar.sonSiparisNo >= 0)) {
    sorunlar.push('Ayarlar: son sipariş numarası geçersiz.');
  }

  return sorunlar;
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
    // Sipariş numarası pozitif tam sayı olmalı; değilse yok sayılır, aşağıda yeni numara verilir.
    // (GÜVENLİK: numara alanına yazı/kod konmuş bir yedek dosyası ekrana kod basamasın.)
    const no = Number(s.no);
    s.no = Number.isInteger(no) && no >= 1 ? no : null;

    // Durum adları: "Yıkanıyor" -> "Yıkamada" gibi
    if (!DURUMLAR.includes(s.durum)) s.durum = eskiDurumMu(s.durum) ? ESKI_DURUMLAR[s.durum] : DURUMLAR[0];

    // Ödemesi alınmış ama ödeme tarihi olmayan eski siparişlerde sipariş tarihi kullanılır
    s.odemeAlindi = !!s.odemeAlindi;
    if (s.odemeAlindi && !s.odemeTarihi) s.odemeTarihi = s.tarih;
    if (!s.odemeAlindi) s.odemeTarihi = null;

    // Teslim edilmiş ama teslim tarihi olmayan eski siparişlerde de sipariş tarihi kullanılır
    if (s.durum === TESLIM_EDILDI && !s.teslimTarihi) s.teslimTarihi = s.tarih;
    if (s.durum !== TESLIM_EDILDI) s.teslimTarihi = null;

    // Ödeme yöntemi ve parça sayısı UYDURULMAZ: bilinmiyorsa boş (null) kalır.
    // (Yöntemi bilinmeyen ödeme Kasa'ya girmez, raporda "belirtilmemiş" görünür;
    //  parça sayısı sipariş düzenlenirken girilmek zorundadır.)
    if (!s.odemeAlindi || !ODEME_YONTEMLERI.includes(s.odemeYontemi)) s.odemeYontemi = null;
    if (!(Number(s.parcaSayisi) >= 1)) s.parcaSayisi = null;
  });

  // Gider türü de uydurulmaz: bilinmiyorsa boş kalır, raporda "belirtilmemiş" görünür
  giderler.forEach(g => {
    if (!GIDER_TURLERI.includes(g.tur)) g.tur = null;
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


/* ===================== 10. SANAL (DENEME) VERİLER =====================
   Gösterim için üretilen kayıtlarda "sanal: true" bulunur
   (araclar/sanal-veri-uret.ps1 üretir; telefona "Yedekten Geri Yükle" ile yüklenir).
   Bunlar gerçek veri değildir.
   "Hiçbir kayıt gerçekten silinmez" kuralının TEK istisnası buradadır:
   sanal kayıtlar Ayarlar > "Sanal Verileri Sil" ile KALICI olarak silinir.
   ===================================================================== */

// Cihazdaki sanal kayıt sayıları (silindi işaretli olanlar dahil)
async function sanalKayitSayilari() {
  const say = anahtar => depodanOku(anahtar, []).filter(k => k && k.sanal === true).length;
  return {
    musteri: say(ANAHTAR_MUSTERILER),
    siparis: say(ANAHTAR_SIPARISLER),
    gider: say(ANAHTAR_GIDERLER)
  };
}

// Sanal bir müşteriye gerçek (sanal işaretsiz) sipariş eklenince çağrılır:
// müşterinin sanal işareti kaldırılır, artık gerçek müşteridir.
// (Müşterinin eski SANAL siparişleri sanal kalır; "Sanal Verileri Sil" onları yine siler.)
async function sanalMusteriyiGercegeCevir(musteriId) {
  const musteri = depodanOku(ANAHTAR_MUSTERILER, []).find(m => m.id === musteriId);
  if (!musteri || musteri.sanal !== true) return true;
  return !!(await kayitGuncelle(ANAHTAR_MUSTERILER, musteriId, m => { delete m.sanal; }));
}

// Sanal kayıtları KALICI olarak siler; gerçek (sanal olmayan) kayıtlara dokunmaz.
// Gerçek siparişi olan sanal müşteri SİLİNMEZ; sanal işareti kaldırılıp gerçek müşteriye
// çevrilir (normalde bu, sipariş eklenirken zaten yapılır; burası eski/yedekten gelen
// veriler için güvence).
// Sonuç: { musteri, siparis, gider, gercegeCevrilen } veya null. Yarıda kalırsa eski hal geri konur.
async function sanalVerileriSil() {
  const musteriler = depodanOku(ANAHTAR_MUSTERILER, []);
  const siparisler = depodanOku(ANAHTAR_SIPARISLER, []);
  const giderler = depodanOku(ANAHTAR_GIDERLER, []);
  const sanalMi = k => k && k.sanal === true;

  // Gerçek siparişlerin sahibi olan müşteriler korunur ve gerçeğe çevrilir
  const gercekSiparisSahipleri = new Set(siparisler.filter(s => !sanalMi(s)).map(s => s.musteriId));
  let gercegeCevrilen = 0;
  const kalanMusteriler = musteriler.filter(m => !sanalMi(m) || gercekSiparisSahipleri.has(m.id));
  kalanMusteriler.filter(sanalMi).forEach(m => { delete m.sanal; m.guncelleme = Date.now(); gercegeCevrilen++; });
  const kalanSiparisler = siparisler.filter(s => !sanalMi(s));
  const kalanGiderler = giderler.filter(g => !sanalMi(g));

  const eskiHal = depoAnlikGoruntu([ANAHTAR_MUSTERILER, ANAHTAR_SIPARISLER, ANAHTAR_GIDERLER]);
  const tamam = depoyaYaz(ANAHTAR_SIPARISLER, kalanSiparisler) &&
    depoyaYaz(ANAHTAR_MUSTERILER, kalanMusteriler) &&
    depoyaYaz(ANAHTAR_GIDERLER, kalanGiderler);
  if (!tamam) {
    depoyuGeriYukle(eskiHal);
    return null;
  }
  return {
    musteri: musteriler.length - kalanMusteriler.length,
    siparis: siparisler.length - kalanSiparisler.length,
    gider: giderler.length - kalanGiderler.length,
    gercegeCevrilen: gercegeCevrilen
  };
}
