/* =====================================================================
   HALI YIKAMA UYGULAMASI - app.js  (EKRANLAR)
   Ekranlar ve kullanıcı etkileşimleri bu dosyadadır.
   Veriye SADECE veri.js'deki fonksiyonlarla ulaşılır
   (musterileriGetir, siparisEkle, siparisGuncelle, giderSil ...).
   Bu dosya localStorage'a hiç dokunmaz.

   veri.js fonksiyonları BEKLEME YAPAR (async): sonuçları "await" ile alınır.
   Bu yüzden veri kullanan fonksiyonlar da "async" olarak yazılmıştır.
   Ekranlar önce veriyi alır, sonra çizilir.

   Bölümler:
     1. Sabitler
     2. Yardımcı fonksiyonlar (para, tarih, sayı biçimleri, çift basma koruması)
     3. Sipariş işlemleri (durum, ödeme, özet hesaplama)
     4. Ekranlar arası geçiş ve alt menü
     5. Ana Ekran (durum satırları, hızlı erişim, yedek hatırlatıcısı)
     6. Durum listesi (örn. "Yıkamada" olan siparişler)
     7. Gün Özeti
     8. Gider formu
     9. Sipariş Bul
    10. Müşteriler (liste ve arama)
    11. Müşteri detayı ve siparişleri
    12. Müşteri formu
    13. Sipariş formu
    14. Yönetici (ciro, tahsilat, gider)
    15. Ayarlar ve yedekleme
    16. Service worker (internetsiz çalışma ve güncelleme)
   ===================================================================== */


/* ===================== 1. SABİTLER =====================
   (Sipariş durumları DURUMLAR ve TESLIM_EDILDI veri.js'dedir.) */

const YEDEK_UYARI_GUN = 7; // Bu kadar günden eski yedek kırmızı uyarı verir

// Durum listesindeki butonun yazısı: siparişi bir sonraki duruma geçirir
const SONRAKI_ADIM = {
  'Teslim Alındı': 'Beklemeye Al',
  'Bekliyor': 'Yıkamaya Al',
  'Yıkamada': 'Hazır',
  'Hazır': 'Teslim Et'
};


/* ===================== 2. YARDIMCI FONKSİYONLAR ===================== */

// Müşteri listesinden, kimliğe göre hızlı bulma tablosu yapar: musteriler.get(id)
function musteriHaritasi(musteriler) {
  return new Map(musteriler.map(m => [m.id, m]));
}

// Çift basma koruması: işlem bitene kadar butonu pasif yapar.
// Bulutta kayıt birkaç saniye sürebilir; bu sırada iki kez basılırsa iki kayıt oluşmasın.
async function islemSirasinda(buton, islem) {
  if (buton.disabled) return; // Zaten bir işlem sürüyor
  buton.disabled = true;
  try {
    return await islem();
  } finally {
    buton.disabled = false;
  }
}

const paraBicimi = new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' });
const sayiBicimi = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 2 });

function paraYaz(tutar) { return paraBicimi.format(tutar || 0); }
function sayiYaz(sayi) { return sayiBicimi.format(sayi || 0); }

// Kullanıcının yazdığı sayıyı okur. "6,5" ve "6.5" ikisi de 6.5 olur.
// Geçersizse null döndürür.
function sayiOku(metin) {
  let temiz = String(metin || '').trim().replace(/\s/g, '');
  if (temiz.includes(',')) {
    // Türkçe yazım: "1.250,50" -> "1250.50"
    temiz = temiz.replace(/\./g, '').replace(',', '.');
  }
  const sayi = Number(temiz);
  return temiz !== '' && isFinite(sayi) ? sayi : null;
}

// Kuruş hatalarını önlemek için 2 basamağa yuvarlar
function yuvarla(sayi) {
  return Math.round(sayi * 100) / 100;
}

// Bir tarihi "2026-10-12" biçimine çevirir
function tarihMetni(tarih) {
  const ay = String(tarih.getMonth() + 1).padStart(2, '0');
  const gun = String(tarih.getDate()).padStart(2, '0');
  return `${tarih.getFullYear()}-${ay}-${gun}`;
}

// Bugünün tarihi "2026-10-12" biçiminde
function bugun() {
  return tarihMetni(new Date());
}

// "2026-10-12" -> "12 Ekim 2026"
function tarihYaz(tarih) {
  if (!tarih) return '';
  const [yil, ay, gun] = tarih.split('-').map(Number);
  return new Date(yil, ay - 1, gun).toLocaleDateString('tr-TR', {
    day: 'numeric', month: 'long', year: 'numeric'
  });
}

// Arama için metni sadeleştirir: küçük harf yapar ve Türkçe karakterleri
// düz harfe çevirir. Böylece "sukru" yazınca "Şükrü", "ismail" yazınca
// "İSMAİL" ya da "Ismail" bulunur.
//   "Şükrü Çiğdem IŞIK" -> "sukru cigdem isik"
function sadeMetin(metin) {
  return String(metin || '')
    .toLocaleLowerCase('tr-TR')       // "İ" -> "i", "I" -> "ı"
    .replace(/ı/g, 'i')               // "ı" -> "i" (I/ı/İ/i farkı kalmaz)
    .normalize('NFD')                 // "ş" -> "s" + çengel işareti, "ü" -> "u" + noktalar ...
    .replace(/[̀-ͯ]/g, '')  // ... işaretleri sil: ş->s, ç->c, ğ->g, ü->u, ö->o
    .replace(/\s+/g, ' ')             // fazla boşlukları teke indir
    .trim();
}

// Sadece rakamları bırakır: "0532 123 45 67" -> "05321234567"
function sadeceRakam(metin) {
  return String(metin || '').replace(/\D/g, '');
}

// Kullanıcının yazdığı metni HTML içine güvenle koymak için
function guvenli(metin) {
  return String(metin == null ? '' : metin)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// "Teslim Alındı" -> "durum-teslim-alindi" (CSS sınıfı için)
function durumSinifi(durum) {
  return 'durum-' + sadeMetin(durum).replace(/ /g, '-');
}

function teslimEdilmediMi(siparis) {
  return siparis.durum !== TESLIM_EDILDI;
}

// Ekranın altında kısa bir mesaj gösterir.
// tur = 'hata' ise kırmızı olur ve daha uzun kalır. Mesaja dokununca kapanır.
let bildirimZamanlayici;
function bildirimGoster(mesaj, tur) {
  const kutu = document.getElementById('bildirim');
  kutu.textContent = mesaj;
  kutu.classList.toggle('hata', tur === 'hata');
  kutu.hidden = false;
  clearTimeout(bildirimZamanlayici);
  bildirimZamanlayici = setTimeout(() => { kutu.hidden = true; }, tur === 'hata' ? 6000 : 2200);
}

function hataGoster(mesaj) {
  bildirimGoster(mesaj, 'hata');
}

document.getElementById('bildirim').addEventListener('click', olay => { olay.currentTarget.hidden = true; });

// --- Kayıt / güncelleme / silme hatalarını kullanıcıya gösterme ---
const KAYIT_HATASI = 'Kaydedilemedi, tekrar deneyin.';
const SILME_HATASI = 'Silinemedi, tekrar deneyin.';

// Bir veri.js işlemini çalıştırır. İşlem yapılamazsa (null/false döndürürse
// ya da hata olursa) ekranda kırmızı uyarı gösterir ve null döndürür.
// Çağıran yer null görünce durur: ekrandan ayrılmaz, formdaki bilgiler silinmez.
async function veriIslemi(islem, hataMesaji = KAYIT_HATASI) {
  try {
    const sonuc = await islem();
    if (sonuc) return sonuc;
  } catch (hata) {
    console.error('Veri işlemi yapılamadı:', hata);
  }
  hataGoster(hataMesaji);
  return null;
}

// Gözden kaçan her türlü hata için son çare: kullanıcı en azından bir şeyler ters gittiğini görsün
window.addEventListener('unhandledrejection', olay => {
  console.error('Beklenmeyen hata:', olay.reason);
  hataGoster('Bir hata oluştu, tekrar deneyin.');
});


/* ===================== 3. SİPARİŞ İŞLEMLERİ ===================== */

// Siparişin durumunu değiştirir. "Teslim Edildi"ye geçtiği gün kaydedilir;
// geri alınırsa teslim tarihi silinir.
function durumAyarla(siparis, yeniDurum) {
  if (yeniDurum === TESLIM_EDILDI && siparis.durum !== TESLIM_EDILDI) {
    siparis.teslimTarihi = bugun();
  } else if (yeniDurum !== TESLIM_EDILDI) {
    siparis.teslimTarihi = null;
  }
  siparis.durum = yeniDurum;
}

// Ödeme işaretini değiştirir. Ödemenin alındığı gün kaydedilir (tahsilat için).
function odemeAyarla(siparis, alindi) {
  if (alindi && !siparis.odemeAlindi) siparis.odemeTarihi = bugun();
  if (!alindi) siparis.odemeTarihi = null;
  siparis.odemeAlindi = alindi;
}

// Bir sonraki durum ("Bekliyor" -> "Yıkamada"). Son durumdaysa null.
function sonrakiDurum(durum) {
  const sira = DURUMLAR.indexOf(durum);
  return sira >= 0 && sira < DURUMLAR.length - 1 ? DURUMLAR[sira + 1] : null;
}

// Tek bir siparişi değiştirir (veri.js ile), sonra bulunulan ekranı yeniden çizer.
// Değişen siparişi döndürür; yapılamazsa uyarı gösterir ve null döndürür.
// Başarısız olsa da ekran yeniden çizilir; böylece ekran kayıttaki GERÇEK durumu
// gösterir (örn. açılır liste değiştirilemeyen eski değerine geri döner).
async function siparisiGuncelleVeCiz(siparisId, degisiklik) {
  const siparis = await veriIslemi(() => siparisGuncelle(siparisId, degisiklik));
  await sayfayiCiz();
  return siparis;
}

// Bir durum satırında sayılacak siparişler.
// "Teslim Edildi" için sadece BUGÜN teslim edilenler.
function durumdakiSiparisler(siparisler, durumNo) {
  const durum = DURUMLAR[durumNo];
  return siparisler.filter(s =>
    s.durum === durum && (durum !== TESLIM_EDILDI || s.teslimTarihi === bugun()));
}

// İki tarih arasındaki ("2026-10-01" ile "2026-10-31" gibi) rakamları hesaplar.
// bas/bit null ise o taraf sınırsızdır (Tümü). Silinmiş kayıtlar zaten listede yoktur.
//   Ciro      : sipariş tarihi bu aralıkta olan siparişlerin toplamı
//   Tahsilat  : ödeme tarihi bu aralıkta olan siparişlerin toplamı (kasaya giren para)
//   Net (iş)  : ciro − gider (yapılan işin kârı)
//   Kasa      : tahsilat − gider (eldeki paranın değişimi)
function ozetHesapla(siparisler, giderler, bas, bit) {
  const aralikta = tarih => !!tarih && (!bas || tarih >= bas) && (!bit || tarih <= bit);
  const toplam = liste => yuvarla(liste.reduce((t, x) => t + (Number(x.tutar) || 0), 0));

  const donemSiparisleri = siparisler.filter(s => aralikta(s.tarih));
  const ciro = toplam(donemSiparisleri);
  const tahsilat = toplam(siparisler.filter(s => s.odemeAlindi && aralikta(s.odemeTarihi)));
  const gider = toplam(giderler.filter(g => aralikta(g.tarih)));

  return {
    siparisSayisi: donemSiparisleri.length,
    teslimSayisi: siparisler.filter(s => s.durum === TESLIM_EDILDI && aralikta(s.teslimTarihi)).length,
    ciro: ciro,
    tahsilat: tahsilat,
    odenmemis: toplam(donemSiparisleri.filter(s => !s.odemeAlindi)),
    gider: gider,
    net: yuvarla(ciro - gider),
    kasa: yuvarla(tahsilat - gider)
  };
}

// Özet rakamlarını kutucuklar halinde gösterir (Gün Özeti ve Yönetici ekranları).
// İki sütun: solda sipariş tarihine göre olanlar (Ciro, Net), sağda kasaya göre olanlar (Tahsilat, Kasa).
function ozetKutulariHTML(ozet) {
  const kutu = (baslik, deger, not, sinif = '') => `
    <div class="ozet-kutu ${sinif}">
      <div class="ozet-baslik">${baslik}</div>
      <div class="ozet-deger">${deger}</div>
      <div class="ozet-not">${not}</div>
    </div>`;
  return kutu('Sipariş', ozet.siparisSayisi, 'adet') +
    kutu('Teslim edilen', ozet.teslimSayisi, 'adet') +
    kutu('Ciro', paraYaz(ozet.ciro), 'sipariş tarihine göre') +
    kutu('Tahsilat', paraYaz(ozet.tahsilat), 'kasaya giren para', 'olumlu') +
    kutu('Ödenmemiş', paraYaz(ozet.odenmemis), 'ödemesi alınmamış') +
    kutu('Gider', paraYaz(ozet.gider), '') +
    kutu('Net (iş)', paraYaz(ozet.net), 'ciro − gider', ozet.net < 0 ? 'olumsuz' : '') +
    kutu('Kasa', paraYaz(ozet.kasa), 'tahsilat − gider', ozet.kasa < 0 ? 'olumsuz' : '');
}

// Durum listesinde ve gün özetinde kullanılan sipariş satırı.
// Satıra basınca müşteri detayı açılır; ileriButonuVar ise yanında
// siparişi sonraki duruma geçiren buton olur.
function siparisSatiriHTML(s, musteriler, ileriButonuVar) {
  const musteri = musteriler.get(s.musteriId);
  const isim = musteri ? `${guvenli(musteri.ad)} ${guvenli(musteri.soyad)}` : '(silinmiş müşteri)';
  const odeme = s.odemeAlindi
    ? '<span class="etiket odendi">Ödendi</span>'
    : '<span class="etiket odenmedi">Ödenmedi</span>';
  const ileri = ileriButonuVar && sonrakiDurum(s.durum)
    ? `<button class="buton buton-kucuk buton-ana ileri-butonu" data-islem="ileri" data-id="${guvenli(s.id)}">${SONRAKI_ADIM[s.durum]}</button>`
    : '';
  return `
    <li class="siparis-satiri ${durumSinifi(s.durum)}">
      <button class="satir-icerik" data-islem="ac" data-id="${guvenli(s.id)}" data-musteri="${guvenli(s.musteriId)}">
        <div class="satir-ust"><span class="siparis-no">#${s.no}</span> ${isim}</div>
        <div class="musteri-alt">${tarihYaz(s.tarih)} · ${sayiYaz(s.metrekare)} m² · ${paraYaz(s.tutar)} ${odeme}</div>
      </button>
      ${ileri}
    </li>`;
}

// Sipariş satırlarındaki tıklamalar (durum listesi ve gün özeti için ortak)
async function siparisSatirinaTiklandi(olay) {
  const buton = olay.target.closest('button[data-islem]');
  if (!buton) return;

  if (buton.dataset.islem === 'ac') {
    // Müşteri detayını aç ve bu siparişi vurgula
    if (await musteriGetir(buton.dataset.musteri)) git(`/musteri/${buton.dataset.musteri}/${buton.dataset.id}`);
  } else if (buton.dataset.islem === 'ileri') {
    await islemSirasinda(buton, async () => {
      const siparis = await siparisiGuncelleVeCiz(buton.dataset.id, s => {
        const yeni = sonrakiDurum(s.durum);
        if (yeni) durumAyarla(s, yeni);
      });
      if (siparis) bildirimGoster(`#${siparis.no} → ${siparis.durum}`);
    });
  }
}

document.querySelectorAll('.siparis-satirlari').forEach(liste =>
  liste.addEventListener('click', siparisSatirinaTiklandi));


/* ===================== 4. EKRANLAR ARASI GEÇİŞ VE ALT MENÜ =====================
   Hangi ekranın görüneceğini adresin # kısmı belirler:
     #/                          -> Ana Ekran
     #/durum/2                   -> 3. durumdaki ("Yıkamada") siparişler
     #/gun-ozeti                 -> Gün Özeti
     #/gider-formu               -> Gider Ekle
     #/siparis-bul               -> Sipariş Bul
     #/musteriler                -> müşteri listesi
     #/musteri/ID                -> müşteri detayı
     #/musteri/ID/SIPARISID      -> müşteri detayı, bu sipariş vurgulu
     #/musteri-formu[/ID]        -> yeni müşteri / müşteri düzenle
     #/siparis-formu/MUSTERIID[/SIPARISID] -> yeni sipariş / sipariş düzenle
     #/yonetici                  -> Yönetici
     #/ayarlar                   -> Ayarlar
   Sayfa hiç yenilenmez; telefonun "geri" tuşu da doğal çalışır.
   ================================================================================ */

let uygulamaIcindeGezildi = false; // Geri tuşu için: uygulama içinde sayfa değişti mi?
let sonCizilenAdres = null;        // Aynı ekran yeniden çizilince sayfa başa kaymasın diye

// --- Hızlı geçiş koruması ---
// Her ekran çizimi bir sıra numarası alır. Veri beklenirken başka bir ekran
// çizilmeye başlarsa, eski çizim bunu numarasından anlar ve ekrana dokunmaz.
// (Bulutta veri geç gelebilir; geç gelen veri yeni ekranın üstüne yazılmasın.)
let sonCizimNo = 0;
function cizimBaslat() { return ++sonCizimNo; }
function cizimEskidi(no) { return no !== sonCizimNo; }

function git(adres) {
  uygulamaIcindeGezildi = true;
  location.hash = adres;
}

// Bir önceki ekrana döner. Geçmiş yoksa (örn. sayfa yenilendiyse) verilen adrese gider.
function geriGit(yedekAdres) {
  if (uygulamaIcindeGezildi) {
    history.back();
  } else {
    location.replace('#' + yedekAdres);
  }
}

// Mevcut ekranı, geçmişe yeni kayıt eklemeden başka bir ekranla değiştirir
function yerineGit(adres) {
  location.replace('#' + adres);
}

// Bir ekranı gösterir, diğerlerini gizler.
//   geriAdresi: üstteki "Geri" butonu (null ise gizli)
//   sekme     : alt menüde seçili görünecek sekme (null ise alt menü gizli, formlarda böyle)
// Yeni bir ekrana geçildiyse true döndürür.
function ekranGoster(ekranId, baslik, geriAdresi, sekme) {
  document.querySelectorAll('.ekran').forEach(e => { e.hidden = e.id !== ekranId; });
  document.getElementById('sayfa-basligi').textContent = baslik;

  const geriButonu = document.getElementById('geri-butonu');
  geriButonu.hidden = !geriAdresi;
  geriButonu.onclick = () => geriGit(geriAdresi);

  const menu = document.getElementById('alt-menu');
  menu.hidden = !sekme;
  document.body.classList.toggle('menulu', !!sekme);
  menu.querySelectorAll('button').forEach(b => b.classList.toggle('secili', b.dataset.sekme === sekme));

  const yeniEkran = location.hash !== sonCizilenAdres;
  if (yeniEkran) {
    window.scrollTo(0, 0);
    sonCizilenAdres = location.hash;
  }
  return yeniEkran;
}

async function sayfayiCiz() {
  try {
    await adreseGoreCiz();
  } catch (hata) {
    // Veri okunamadıysa (örn. bulutta internet yoksa) kullanıcı boş ekranla kalmasın
    console.error('Ekran çizilemedi:', hata);
    hataGoster('Veriler yüklenemedi, tekrar deneyin.');
  }
}

async function adreseGoreCiz() {
  const parcalar = location.hash.replace(/^#\/?/, '').split('/');
  const sayfa = parcalar[0];

  if (sayfa === 'durum') {
    await durumListesiniCiz(Number(parcalar[1]));
  } else if (sayfa === 'gun-ozeti') {
    await gunOzetiniCiz();
  } else if (sayfa === 'gider-formu') {
    giderFormunuCiz();
  } else if (sayfa === 'siparis-bul') {
    siparisBulCiz();
  } else if (sayfa === 'musteriler') {
    await musteriListesiniCiz();
  } else if (sayfa === 'musteri' && parcalar[1]) {
    await musteriDetayiniCiz(parcalar[1], parcalar[2]);
  } else if (sayfa === 'musteri-formu') {
    await musteriFormunuCiz(parcalar[1]);
  } else if (sayfa === 'siparis-formu' && parcalar[1]) {
    await siparisFormunuCiz(parcalar[1], parcalar[2]);
  } else if (sayfa === 'yonetici') {
    await yoneticiCiz();
  } else if (sayfa === 'ayarlar') {
    await ayarlariCiz();
  } else {
    await anaEkraniCiz();
  }
}

window.addEventListener('hashchange', sayfayiCiz);

// Alt menü: sekmeye basınca o sekmeye geç (zaten oradaysa sadece başa kaydır)
document.getElementById('alt-menu').addEventListener('click', olay => {
  const buton = olay.target.closest('button[data-adres]');
  if (!buton) return;
  const suAnkiAdres = location.hash.replace(/^#/, '') || '/';
  if (suAnkiAdres === buton.dataset.adres) {
    window.scrollTo(0, 0);
  } else {
    git(buton.dataset.adres);
  }
});


/* ===================== 5. ANA EKRAN ===================== */

async function anaEkraniCiz() {
  const cizim = cizimBaslat();
  const [siparisler, sonYedek] = await Promise.all([siparisleriGetir(), sonYedekZamani()]);
  if (cizimEskidi(cizim)) return;

  ekranGoster('ekran-ana', 'Halı Yıkama', null, 'ana');

  document.getElementById('durum-satirlari').innerHTML = DURUMLAR.map((durum, sira) => {
    const sayi = durumdakiSiparisler(siparisler, sira).length;
    const not = durum === TESLIM_EDILDI ? ' <small>(bugün)</small>' : '';
    return `
      <li class="${durumSinifi(durum)}">
        <button class="durum-satiri" data-durum="${sira}">
          <span class="durum-adi">${durum}${not}</span>
          <span class="durum-sayi">${sayi}</span>
          <span class="durum-ok">›</span>
        </button>
      </li>`;
  }).join('');

  yedekHatirlaticisiniCiz(sonYedek);
}

document.getElementById('durum-satirlari').addEventListener('click', olay => {
  const satir = olay.target.closest('.durum-satiri');
  if (satir) git('/durum/' + satir.dataset.durum);
});

// Hızlı erişim butonları: Gün Özeti, Gider Ekle, Sipariş Bul
document.querySelectorAll('.hizli-buton').forEach(buton =>
  buton.addEventListener('click', () => git(buton.dataset.adres)));

// Son yedekten bu yana kaç takvim günü geçtiğini döndürür. Hiç yedek yoksa null.
function sonYedektenBeriGun(sonYedek) {
  if (!sonYedek) return null;
  const yedekGunu = new Date(sonYedek);
  yedekGunu.setHours(0, 0, 0, 0);
  const bugunBasi = new Date();
  bugunBasi.setHours(0, 0, 0, 0);
  return Math.round((bugunBasi - yedekGunu) / 86400000);
}

function yedekHatirlaticisiniCiz(sonYedek) {
  const gun = sonYedektenBeriGun(sonYedek);
  let yazi;
  if (gun === null) yazi = 'Hiç yedek alınmadı!';
  else if (gun <= 0) yazi = 'Son yedek: bugün';
  else yazi = `Son yedek: ${gun} gün önce`;

  document.getElementById('yedek-yazisi').textContent = yazi;
  const uyariVar = gun === null || gun > YEDEK_UYARI_GUN;
  document.getElementById('yedek-kart').classList.toggle('uyari', uyariVar);
}

document.getElementById('simdi-yedekle-butonu').addEventListener('click', olay =>
  islemSirasinda(olay.currentTarget, async () => {
    await yedekIndir();
    yedekHatirlaticisiniCiz(await sonYedekZamani());
  }));


/* ===================== 6. DURUM LİSTESİ ===================== */

async function durumListesiniCiz(durumNo) {
  if (!(durumNo >= 0 && durumNo < DURUMLAR.length)) { yerineGit('/'); return; }
  const cizim = cizimBaslat();
  const [tumSiparisler, tumMusteriler] = await Promise.all([siparisleriGetir(), musterileriGetir()]);
  if (cizimEskidi(cizim)) return;

  const durum = DURUMLAR[durumNo];
  ekranGoster('ekran-durum', durum === TESLIM_EDILDI ? 'Bugün Teslim Edilenler' : durum, '/', 'ana');

  // En eski sipariş en üstte (önce gelen önce işlenir)
  const siparisler = durumdakiSiparisler(tumSiparisler, durumNo)
    .sort((a, b) => a.tarih.localeCompare(b.tarih) || a.no - b.no);
  const musteriler = musteriHaritasi(tumMusteriler);

  document.getElementById('durum-siparisleri').innerHTML =
    siparisler.map(s => siparisSatiriHTML(s, musteriler, true)).join('');

  const bos = document.getElementById('durum-bos');
  bos.hidden = siparisler.length > 0;
  bos.textContent = durum === TESLIM_EDILDI
    ? 'Bugün teslim edilen sipariş yok.'
    : `"${durum}" durumunda sipariş yok.`;
}


/* ===================== 7. GÜN ÖZETİ ===================== */

async function gunOzetiniCiz() {
  const cizim = cizimBaslat();
  const [tumSiparisler, giderler, tumMusteriler] =
    await Promise.all([siparisleriGetir(), giderleriGetir(), musterileriGetir()]);
  if (cizimEskidi(cizim)) return;

  ekranGoster('ekran-gun-ozeti', 'Gün Özeti', '/', 'ana');

  const bugunTarihi = bugun();
  document.getElementById('gun-tarihi').textContent = tarihYaz(bugunTarihi);
  document.getElementById('gun-ozeti-kartlari').innerHTML =
    ozetKutulariHTML(ozetHesapla(tumSiparisler, giderler, bugunTarihi, bugunTarihi));

  const siparisler = tumSiparisler
    .filter(s => s.tarih === bugunTarihi)
    .sort((a, b) => a.no - b.no);
  const musteriler = musteriHaritasi(tumMusteriler);
  document.getElementById('gun-siparisleri').innerHTML =
    siparisler.map(s => siparisSatiriHTML(s, musteriler, false)).join('');
  document.getElementById('gun-bos').hidden = siparisler.length > 0;
}


/* ===================== 8. GİDER FORMU ===================== */

const giderFormu = document.getElementById('gider-formu');

function giderFormunuCiz() {
  cizimBaslat(); // Bekleyen eski çizimler bu formun üstüne yazmasın
  ekranGoster('ekran-gider-formu', 'Gider Ekle', '/', null);
  giderFormu.tarih.value = bugun();
  giderFormu.tutar.value = '';
  giderFormu.aciklama.value = '';
}

giderFormu.addEventListener('submit', olay => {
  olay.preventDefault();
  islemSirasinda(giderFormu.querySelector('[type="submit"]'), async () => {
    const tutar = sayiOku(giderFormu.tutar.value);
    if (tutar === null || tutar <= 0) {
      alert('Lütfen geçerli bir tutar girin (örn: 450 veya 99,90).');
      return;
    }
    if (!giderFormu.tarih.value) {
      alert('Lütfen tarih seçin.');
      return;
    }

    const gider = await veriIslemi(() => giderEkle({
      tarih: giderFormu.tarih.value,
      tutar: yuvarla(tutar),
      aciklama: giderFormu.aciklama.value.trim() || 'Gider'
    }));
    if (!gider) return; // Uyarı gösterildi; form olduğu gibi kalır

    bildirimGoster('Gider eklendi: ' + paraYaz(tutar));
    geriGit('/');
  });
});


/* ===================== 9. SİPARİŞ BUL ===================== */

const siparisBulFormu = document.getElementById('siparis-bul-formu');

function siparisBulCiz() {
  cizimBaslat();
  ekranGoster('ekran-siparis-bul', 'Sipariş Bul', '/', 'ana');
  siparisBulFormu.no.value = '';
  document.getElementById('bul-sonuc').hidden = true;
}

siparisBulFormu.addEventListener('submit', olay => {
  olay.preventDefault();
  islemSirasinda(siparisBulFormu.querySelector('[type="submit"]'), async () => {
    const sonuc = document.getElementById('bul-sonuc');
    const no = Number(sadeceRakam(siparisBulFormu.no.value)); // "#27" de yazılabilir

    const siparis = no ? await siparisNoIleBul(no) : null;
    if (siparis && await musteriGetir(siparis.musteriId)) {
      git(`/musteri/${siparis.musteriId}/${siparis.id}`);
    } else {
      sonuc.textContent = no ? `#${no} numaralı sipariş bulunamadı.` : 'Lütfen sipariş numarasını yazın.';
      sonuc.hidden = false;
    }
  });
});


/* ===================== 10. MÜŞTERİLER ===================== */

async function musteriListesiniCiz() {
  const cizim = cizimBaslat();
  const [tumMusteriler, siparisler] = await Promise.all([musterileriGetir(), siparisleriGetir()]);
  if (cizimEskidi(cizim)) return;

  ekranGoster('ekran-musteriler', 'Müşteriler', null, 'musteriler');

  const acikSiparisler = siparisler.filter(teslimEdilmediMi);

  // Arama kutusuna yazılana göre filtrele
  // (isim, adres ve telefonda arar; Türkçe karakter ve büyük/küçük harf farkı önemsizdir)
  const aranan = sadeMetin(document.getElementById('arama-kutusu').value);
  const arananRakam = sadeceRakam(aranan);

  let musteriler = tumMusteriler;
  if (aranan) {
    musteriler = musteriler.filter(m => {
      const isimUyuyor = sadeMetin(m.ad + ' ' + m.soyad).includes(aranan);
      const adresUyuyor = sadeMetin(m.adres).includes(aranan);
      const telefonUyuyor = arananRakam !== '' && sadeceRakam(m.telefon).includes(arananRakam);
      return isimUyuyor || adresUyuyor || telefonUyuyor;
    });
  }
  musteriler.sort((a, b) => (a.ad + ' ' + a.soyad).localeCompare(b.ad + ' ' + b.soyad, 'tr'));

  const liste = document.getElementById('musteri-listesi');
  liste.innerHTML = musteriler.map(m => {
    const acikSayisi = acikSiparisler.filter(s => s.musteriId === m.id).length;
    const rozet = acikSayisi > 0 ? `<span class="rozet">${acikSayisi} açık sipariş</span>` : '';
    return `
      <li>
        <button class="musteri-satiri" data-id="${guvenli(m.id)}">
          <div class="musteri-adi">${guvenli(m.ad)} ${guvenli(m.soyad)}${rozet}</div>
          <div class="musteri-alt">${guvenli(m.telefon)}</div>
        </button>
      </li>`;
  }).join('');

  const bosMesaj = document.getElementById('musteri-yok');
  bosMesaj.hidden = musteriler.length > 0;
  bosMesaj.textContent = aranan ? 'Aramaya uyan müşteri bulunamadı.' : 'Henüz müşteri yok. Yukarıdaki butonla ekleyin.';
}

document.getElementById('arama-kutusu').addEventListener('input', musteriListesiniCiz);

document.getElementById('yeni-musteri-butonu').addEventListener('click', () => git('/musteri-formu'));

document.getElementById('musteri-listesi').addEventListener('click', olay => {
  const satir = olay.target.closest('.musteri-satiri');
  if (satir) git('/musteri/' + satir.dataset.id);
});


/* ===================== 11. MÜŞTERİ DETAYI ===================== */

let aktifMusteriId = null;

// vurguSiparisId verilirse o sipariş kartı çerçeveli gösterilir ve ekran ona kaydırılır
async function musteriDetayiniCiz(musteriId, vurguSiparisId) {
  const cizim = cizimBaslat();
  const [musteri, tumSiparisler] = await Promise.all([musteriGetir(musteriId), musterininSiparisleri(musteriId)]);
  if (cizimEskidi(cizim)) return;
  if (!musteri) { yerineGit('/musteriler'); return; }
  aktifMusteriId = musteriId;

  const yeniEkran = ekranGoster('ekran-musteri-detay', musteri.ad + ' ' + musteri.soyad, '/musteriler', 'musteriler');

  document.getElementById('detay-isim').textContent = musteri.ad + ' ' + musteri.soyad;
  const telefon = document.getElementById('detay-telefon');
  telefon.textContent = musteri.telefon;
  telefon.href = 'tel:' + musteri.telefon.replace(/[^\d+]/g, ''); // Basınca arama açılır
  document.getElementById('detay-adres').textContent = musteri.adres || '';

  // Siparişler: en yeni tarih en üstte
  const siparisler = tumSiparisler.sort((a, b) =>
    b.tarih.localeCompare(a.tarih) || (b.olusturma || 0) - (a.olusturma || 0));

  document.getElementById('siparis-listesi').innerHTML = siparisler.map(s => {
    const secenekler = DURUMLAR.map(d =>
      `<option value="${d}" ${d === s.durum ? 'selected' : ''}>${d}</option>`).join('');
    const odemeSinifi = s.odemeAlindi ? 'odendi' : 'odenmedi';
    const odemeYazisi = s.odemeAlindi ? `✓ Ödeme alındı · ${tarihYaz(s.odemeTarihi)}` : '✗ Ödeme alınmadı';
    const teslim = s.teslimTarihi ? ` · Teslim: ${tarihYaz(s.teslimTarihi)}` : '';
    const vurgu = s.id === vurguSiparisId ? 'vurgulu' : '';
    return `
      <li class="siparis ${durumSinifi(s.durum)} ${vurgu}">
        <div class="siparis-ust">
          <span class="siparis-tarih"><span class="siparis-no">#${s.no}</span> ${tarihYaz(s.tarih)}</span>
          <span class="siparis-tutar">${paraYaz(s.tutar)}</span>
        </div>
        <div class="siparis-detay">${sayiYaz(s.metrekare)} m² × ${paraYaz(s.birimFiyat)}${teslim}</div>
        <select data-islem="durum" data-id="${guvenli(s.id)}" aria-label="Sipariş durumu">${secenekler}</select>
        <button class="buton buton-kucuk odeme-butonu ${odemeSinifi}" data-islem="odeme" data-id="${guvenli(s.id)}">${odemeYazisi}</button>
        <div class="buton-satiri">
          <button class="buton buton-kucuk" data-islem="duzenle" data-id="${guvenli(s.id)}">Düzenle</button>
          <button class="buton buton-kucuk buton-tehlike" data-islem="sil" data-id="${guvenli(s.id)}">Sil</button>
        </div>
      </li>`;
  }).join('');

  document.getElementById('siparis-yok').hidden = siparisler.length > 0;

  // Durum listesinden veya Sipariş Bul'dan gelindiyse o siparişe kaydır
  const vurguluKart = document.querySelector('#siparis-listesi .vurgulu');
  if (yeniEkran && vurguluKart) vurguluKart.scrollIntoView({ block: 'center' });
}

// Durum seçimi değişince hemen kaydet
document.getElementById('siparis-listesi').addEventListener('change', olay => {
  const secim = olay.target;
  if (secim.dataset.islem !== 'durum') return;
  islemSirasinda(secim, async () => {
    if (await siparisiGuncelleVeCiz(secim.dataset.id, s => durumAyarla(s, secim.value))) {
      bildirimGoster('Durum: ' + secim.value);
    }
  });
});

// Sipariş kartındaki butonlar
document.getElementById('siparis-listesi').addEventListener('click', olay => {
  const buton = olay.target.closest('button[data-islem]');
  if (!buton) return;
  const siparisId = buton.dataset.id;

  if (buton.dataset.islem === 'odeme') {
    islemSirasinda(buton, () => siparisiGuncelleVeCiz(siparisId, s => odemeAyarla(s, !s.odemeAlindi)));
  } else if (buton.dataset.islem === 'duzenle') {
    git('/siparis-formu/' + aktifMusteriId + '/' + siparisId);
  } else if (buton.dataset.islem === 'sil') {
    if (!confirm('Bu sipariş silinsin mi? Ciro ve tahsilattan da düşer.')) return;
    islemSirasinda(buton, async () => {
      if (await veriIslemi(() => siparisSil(siparisId), SILME_HATASI)) {
        await sayfayiCiz();
        bildirimGoster('Sipariş silindi');
      }
    });
  }
});

document.getElementById('yeni-siparis-butonu').addEventListener('click', () =>
  git('/siparis-formu/' + aktifMusteriId));

document.getElementById('musteri-duzenle-butonu').addEventListener('click', () =>
  git('/musteri-formu/' + aktifMusteriId));

document.getElementById('musteri-sil-butonu').addEventListener('click', olay =>
  islemSirasinda(olay.currentTarget, async () => {
    const [musteri, siparisler] =
      await Promise.all([musteriGetir(aktifMusteriId), musterininSiparisleri(aktifMusteriId)]);
    if (!musteri) return;

    let soru = `${musteri.ad} ${musteri.soyad} silinsin mi?`;
    if (siparisler.length > 0) {
      soru += `\n\nBu müşterinin ${siparisler.length} siparişi var, silinirse geçmiş raporlardan da çıkar.`;
    }
    if (!confirm(soru)) return;

    // Siparişleri de silindi olarak işaretlenir
    if (!await veriIslemi(() => musteriSil(aktifMusteriId), SILME_HATASI)) return;
    bildirimGoster('Müşteri silindi');
    geriGit('/musteriler');
  }));


/* ===================== 12. MÜŞTERİ FORMU ===================== */

const musteriFormu = document.getElementById('musteri-formu');
let duzenlenenMusteriId = null; // null ise yeni müşteri ekleniyor

async function musteriFormunuCiz(musteriId) {
  const cizim = cizimBaslat();
  const musteri = musteriId ? await musteriGetir(musteriId) : null;
  if (cizimEskidi(cizim)) return;
  if (musteriId && !musteri) { yerineGit('/musteriler'); return; }
  duzenlenenMusteriId = musteri ? musteri.id : null;

  ekranGoster('ekran-musteri-formu',
    musteri ? 'Müşteriyi Düzenle' : 'Yeni Müşteri',
    musteri ? '/musteri/' + musteri.id : '/musteriler',
    null);

  musteriFormu.ad.value = musteri ? musteri.ad : '';
  musteriFormu.soyad.value = musteri ? musteri.soyad : '';
  musteriFormu.telefon.value = musteri ? musteri.telefon : '';
  musteriFormu.adres.value = musteri ? musteri.adres : '';
}

musteriFormu.addEventListener('submit', olay => {
  olay.preventDefault(); // Sayfanın yenilenmesini engelle
  islemSirasinda(musteriFormu.querySelector('[type="submit"]'), async () => {
    const bilgiler = {
      ad: musteriFormu.ad.value.trim(),
      soyad: musteriFormu.soyad.value.trim(),
      telefon: musteriFormu.telefon.value.trim(),
      adres: musteriFormu.adres.value.trim()
    };
    if (!bilgiler.ad || !bilgiler.soyad || !bilgiler.telefon) {
      alert('Ad, soyad ve telefon zorunludur.');
      return;
    }

    // Kaydedilemezse uyarı gösterilir ve return ile durulur: form olduğu gibi kalır
    if (duzenlenenMusteriId) {
      // Var olan müşteriyi güncelle
      if (!await veriIslemi(() => musteriGuncelle(duzenlenenMusteriId, bilgiler))) return;
      bildirimGoster('Müşteri güncellendi');
      geriGit('/musteri/' + duzenlenenMusteriId);
    } else {
      // Yeni müşteri ekle ve detay sayfasını aç
      const yeni = await veriIslemi(() => musteriEkle(bilgiler));
      if (!yeni) return;
      bildirimGoster('Müşteri eklendi');
      yerineGit('/musteri/' + yeni.id);
    }
  });
});


/* ===================== 13. SİPARİŞ FORMU ===================== */

const siparisFormu = document.getElementById('siparis-formu');
let formMusteriId = null;
let duzenlenenSiparisId = null; // null ise yeni sipariş ekleniyor
let formBirimFiyat = 0;         // Bu siparişte kullanılacak birim fiyat

// Durum seçeneklerini bir kez doldur
siparisFormu.durum.innerHTML = DURUMLAR.map(d => `<option value="${d}">${d}</option>`).join('');

async function siparisFormunuCiz(musteriId, siparisId) {
  const cizim = cizimBaslat();
  const [musteri, siparis, ayarlar] = await Promise.all([
    musteriGetir(musteriId),
    siparisId ? siparisGetir(siparisId) : null,
    ayarlariGetir()
  ]);
  if (cizimEskidi(cizim)) return;
  if (!musteri) { yerineGit('/musteriler'); return; }
  if (siparisId && !siparis) { yerineGit('/musteri/' + musteriId); return; }

  formMusteriId = musteriId;
  duzenlenenSiparisId = siparis ? siparis.id : null;

  // ÖNEMLİ: Yeni siparişte güncel fiyat kullanılır.
  // Eski sipariş düzenlenirken siparişin KENDİ fiyatı korunur.
  formBirimFiyat = siparis ? siparis.birimFiyat : ayarlar.birimFiyat;

  ekranGoster('ekran-siparis-formu', siparis ? `Sipariş #${siparis.no}` : 'Yeni Sipariş', '/musteri/' + musteriId, null);

  document.getElementById('siparis-formu-musteri').textContent = musteri.ad + ' ' + musteri.soyad;
  siparisFormu.tarih.value = siparis ? siparis.tarih : bugun();
  siparisFormu.metrekare.value = siparis ? String(siparis.metrekare).replace('.', ',') : '';
  siparisFormu.durum.value = siparis ? siparis.durum : DURUMLAR[0];
  siparisFormu.odemeAlindi.checked = siparis ? !!siparis.odemeAlindi : false;
  document.getElementById('form-birim-fiyat').textContent = paraYaz(formBirimFiyat);
  toplamiGuncelle();
}

// Metrekare yazıldıkça toplam tutarı anında göster
function toplamiGuncelle() {
  const metrekare = sayiOku(siparisFormu.metrekare.value);
  const toplam = metrekare && metrekare > 0 ? yuvarla(metrekare * formBirimFiyat) : 0;
  document.getElementById('form-toplam').textContent = paraYaz(toplam);
}

siparisFormu.metrekare.addEventListener('input', toplamiGuncelle);

siparisFormu.addEventListener('submit', olay => {
  olay.preventDefault();
  islemSirasinda(siparisFormu.querySelector('[type="submit"]'), async () => {
    const metrekare = sayiOku(siparisFormu.metrekare.value);
    if (metrekare === null || metrekare <= 0) {
      alert('Lütfen geçerli bir metrekare girin (örn: 6,5).');
      return;
    }
    if (!siparisFormu.tarih.value) {
      alert('Lütfen tarih seçin.');
      return;
    }

    // Formdaki bilgileri siparişe işler (yeni siparişte de, düzenlemede de aynı)
    const formuIsle = s => {
      Object.assign(s, {
        tarih: siparisFormu.tarih.value,
        metrekare: metrekare,
        birimFiyat: formBirimFiyat,
        tutar: yuvarla(metrekare * formBirimFiyat)
      });
      // Teslim ve ödeme tarihleri bu fonksiyonlarda ayarlanır
      durumAyarla(s, siparisFormu.durum.value);
      odemeAyarla(s, siparisFormu.odemeAlindi.checked);
    };

    let siparis;
    if (duzenlenenSiparisId) {
      siparis = await veriIslemi(() => siparisGuncelle(duzenlenenSiparisId, formuIsle));
    } else {
      const taslak = { musteriId: formMusteriId, durum: null, odemeAlindi: false, odemeTarihi: null, teslimTarihi: null };
      formuIsle(taslak);
      siparis = await veriIslemi(() => siparisEkle(taslak)); // id, no ve zaman bilgilerini veri.js verir
    }
    if (!siparis) return; // Uyarı gösterildi; form olduğu gibi kalır

    bildirimGoster(duzenlenenSiparisId ? 'Sipariş güncellendi' : `Sipariş #${siparis.no} eklendi`);
    geriGit('/musteri/' + formMusteriId);
  });
});


/* ===================== 14. YÖNETİCİ ===================== */

let secilenDonem = 'bugun'; // bugun | hafta | ay | tumu

// Seçilen dönemin başlangıç ve bitiş tarihleri. "Tümü" için [null, null].
function donemAraligi(donem) {
  const simdi = new Date();
  const yil = simdi.getFullYear();
  const ay = simdi.getMonth();

  if (donem === 'bugun') {
    return [bugun(), bugun()];
  }
  if (donem === 'hafta') {
    const pazartesiden = (simdi.getDay() + 6) % 7; // Pazartesi = 0, Pazar = 6
    const pazartesi = new Date(yil, ay, simdi.getDate() - pazartesiden);
    const pazar = new Date(yil, ay, simdi.getDate() - pazartesiden + 6);
    return [tarihMetni(pazartesi), tarihMetni(pazar)];
  }
  if (donem === 'ay') {
    return [tarihMetni(new Date(yil, ay, 1)), tarihMetni(new Date(yil, ay + 1, 0))];
  }
  return [null, null];
}

async function yoneticiCiz() {
  const cizim = cizimBaslat();
  const [siparisler, tumGiderler] = await Promise.all([siparisleriGetir(), giderleriGetir()]);
  if (cizimEskidi(cizim)) return;

  ekranGoster('ekran-yonetici', 'Yönetici', null, 'yonetici');

  document.querySelectorAll('#donem-secici button').forEach(b =>
    b.classList.toggle('secili', b.dataset.donem === secilenDonem));

  const [bas, bit] = donemAraligi(secilenDonem);
  document.getElementById('donem-araligi').textContent =
    !bas ? 'Tüm kayıtlar' : bas === bit ? tarihYaz(bas) : `${tarihYaz(bas)} – ${tarihYaz(bit)}`;
  document.getElementById('yonetici-kartlari').innerHTML =
    ozetKutulariHTML(ozetHesapla(siparisler, tumGiderler, bas, bit));

  // Bu dönemin giderleri, en yenisi üstte
  const giderler = tumGiderler
    .filter(g => (!bas || g.tarih >= bas) && (!bit || g.tarih <= bit))
    .sort((a, b) => b.tarih.localeCompare(a.tarih) || (b.olusturma || 0) - (a.olusturma || 0));

  document.getElementById('gider-listesi').innerHTML = giderler.map(g => `
    <li class="gider-satiri">
      <div class="gider-bilgi">
        <div class="gider-aciklama">${guvenli(g.aciklama)}</div>
        <div class="musteri-alt">${tarihYaz(g.tarih)}</div>
      </div>
      <span class="gider-tutar">${paraYaz(g.tutar)}</span>
      <button class="buton buton-kucuk buton-tehlike" data-id="${guvenli(g.id)}">Sil</button>
    </li>`).join('');
  document.getElementById('gider-yok').hidden = giderler.length > 0;
}

document.getElementById('donem-secici').addEventListener('click', olay => {
  const buton = olay.target.closest('button[data-donem]');
  if (!buton) return;
  secilenDonem = buton.dataset.donem;
  yoneticiCiz();
});

document.getElementById('gider-listesi').addEventListener('click', olay => {
  const buton = olay.target.closest('button[data-id]');
  if (!buton) return;
  islemSirasinda(buton, async () => {
    const gider = (await giderleriGetir()).find(g => g.id === buton.dataset.id);
    if (!gider) return;
    if (!confirm(`"${gider.aciklama}" (${paraYaz(gider.tutar)}) gideri silinsin mi?`)) return;
    if (await veriIslemi(() => giderSil(gider.id), SILME_HATASI)) {
      await yoneticiCiz();
      bildirimGoster('Gider silindi');
    }
  });
});

document.getElementById('yonetici-gider-ekle').addEventListener('click', () => git('/gider-formu'));
document.getElementById('ayarlara-git').addEventListener('click', () => git('/ayarlar'));


/* ===================== 15. AYARLAR VE YEDEKLEME ===================== */

const ayarlarFormu = document.getElementById('ayarlar-formu');

async function ayarlariCiz() {
  const cizim = cizimBaslat();
  const ayarlar = await ayarlariGetir();
  if (cizimEskidi(cizim)) return;

  ekranGoster('ekran-ayarlar', 'Ayarlar', '/yonetici', 'yonetici');
  ayarlarFormu.birimFiyat.value = String(ayarlar.birimFiyat).replace('.', ',');
  surumuGoster();
}

ayarlarFormu.addEventListener('submit', olay => {
  olay.preventDefault();
  islemSirasinda(ayarlarFormu.querySelector('[type="submit"]'), async () => {
    const fiyat = sayiOku(ayarlarFormu.birimFiyat.value);
    if (fiyat === null || fiyat <= 0) {
      alert('Lütfen geçerli bir fiyat girin (örn: 100 veya 112,50).');
      return;
    }
    if (await veriIslemi(() => birimFiyatKaydet(yuvarla(fiyat)))) {
      bildirimGoster('Yeni fiyat: ' + paraYaz(yuvarla(fiyat)) + ' / m²');
    }
  });
});

// --- Yedeği indir: tüm veriyi (silinmişler dahil) bir .json dosyası olarak kaydeder ---
// Hem Ayarlar'daki hem ana ekrandaki "Şimdi Yedekle" butonu bunu kullanır.
async function yedekIndir() {
  const veri = await veriIslemi(tumVeriyiGetir, 'Yedek hazırlanamadı, tekrar deneyin.');
  if (!veri) return;
  const yedek = {
    uygulama: 'hali-yikama',
    yedekTarihi: new Date().toISOString(),
    ...veri // musteriler, siparisler, giderler, ayarlar
  };
  const dosya = new Blob([JSON.stringify(yedek, null, 2)], { type: 'application/json' });
  const baglanti = document.createElement('a');
  baglanti.href = URL.createObjectURL(dosya);
  baglanti.download = `hali-yikama-yedek-${bugun()}.json`;
  document.body.appendChild(baglanti);
  baglanti.click();
  baglanti.remove();
  setTimeout(() => URL.revokeObjectURL(baglanti.href), 5000);

  // Hatırlatıcı sıfırlansın (dosya indi ama tarih yazılamazsa bunu da söyle)
  if (!await veriIslemi(sonYedekKaydet, 'Yedek indirildi ama yedek tarihi kaydedilemedi.')) return;
  bildirimGoster('Yedek dosyası hazırlandı');
}

document.getElementById('yedek-indir-butonu').addEventListener('click', olay =>
  islemSirasinda(olay.currentTarget, yedekIndir));

// --- Yedekten geri yükle: seçilen dosyadaki veriyi cihaza yazar ---
const yedekDosyasiSecici = document.getElementById('yedek-dosyasi');

document.getElementById('yedek-yukle-butonu').addEventListener('click', () => {
  yedekDosyasiSecici.value = ''; // Aynı dosya tekrar seçilebilsin
  yedekDosyasiSecici.click();
});

yedekDosyasiSecici.addEventListener('change', () => {
  const dosya = yedekDosyasiSecici.files[0];
  if (!dosya) return;

  const okuyucu = new FileReader();
  okuyucu.onload = async () => {
    let yedek;
    try {
      yedek = JSON.parse(okuyucu.result);
    } catch (hata) {
      alert('Bu dosya okunamadı. Geçerli bir yedek dosyası seçin.');
      return;
    }
    if (!yedek || !Array.isArray(yedek.musteriler) || !Array.isArray(yedek.siparisler)) {
      alert('Bu dosya bir halı yıkama yedeği değil.');
      return;
    }

    const sayilar = await yedektekiKayitSayilari(yedek);
    const soru = `Yedekte ${sayilar.musteri} müşteri, ${sayilar.siparis} sipariş ve ${sayilar.gider} gider var.\n\n` +
      'Geri yüklerseniz bu cihazdaki MEVCUT TÜM VERİ silinip yedektekiyle değiştirilecek. Devam edilsin mi?';
    if (!confirm(soru)) return;

    // Eski sürüm yedeğiyse eksik alanlar (durum adları, numaralar, zamanlar) veri.js'de tamamlanır
    if (await veriIslemi(() => tumVeriyiDegistir(yedek),
        'Yedek geri yüklenemedi, tekrar deneyin. Cihazdaki veri değişmedi.')) {
      alert('Yedek başarıyla geri yüklendi.');
      await ayarlariCiz();
    }
  };
  okuyucu.readAsText(dosya);
});

// Ayarlar ekranının altında uygulama sürümünü gösterir (service worker'daki sürümden okunur)
function surumuGoster() {
  const alan = document.getElementById('surum-bilgisi');
  if (!('caches' in window)) { alan.textContent = ''; return; }
  caches.keys().then(isimler => {
    const surum = isimler.find(i => i.startsWith('hali-yikama-'));
    alan.textContent = surum ? 'Uygulama sürümü: ' + surum.replace('hali-yikama-', '') : '';
  });
}


/* ===================== 16. SERVICE WORKER =====================
   Service worker uygulamanın internetsiz çalışmasını sağlar.
   Yeni sürüm yüklendiğinde sayfa otomatik yenilenir.
   ============================================================= */

if ('serviceWorker' in navigator) {
  // Sayfa açıldığında zaten bir service worker varsa, sonradan gelen değişiklik "güncelleme" demektir
  const oncekiServiceWorker = navigator.serviceWorker.controller;
  let yenileniyor = false;

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!oncekiServiceWorker || yenileniyor) return; // İlk kurulumda yenilemeye gerek yok
    yenileniyor = true;
    location.reload(); // Yeni sürümü göster
  });

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('service-worker.js', { updateViaCache: 'none' })
      .then(kayit => {
        // Uygulama arka plandan öne gelince yeni sürüm var mı diye kontrol et
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') kayit.update();
        });
      })
      .catch(hata => console.warn('Service worker kaydedilemedi:', hata));
  });
}


/* ===================== BAŞLANGIÇ ===================== */
(async () => {
  await veriyiDuzenle(); // Eski sürümden kalan veriyi yeni yapıya uyarla
  await sayfayiCiz();
})();
