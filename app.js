/* =====================================================================
   HALI YIKAMA UYGULAMASI - app.js
   Tüm uygulama mantığı bu dosyadadır. Bölümler:
     1. Sabitler
     2. Veri (localStorage okuma / yazma)
     3. Eski verileri yeni yapıya uyarlama
     4. Yardımcı fonksiyonlar (para, tarih, sayı biçimleri)
     5. Sipariş işlemleri (durum, ödeme, özet hesaplama)
     6. Ekranlar arası geçiş ve alt menü
     7. Ana Ekran (durum satırları, hızlı erişim, yedek hatırlatıcısı)
     8. Durum listesi (örn. "Yıkamada" olan siparişler)
     9. Gün Özeti
    10. Gider formu
    11. Sipariş Bul
    12. Müşteriler (liste ve arama)
    13. Müşteri detayı ve siparişleri
    14. Müşteri formu
    15. Sipariş formu
    16. Yönetici (ciro, tahsilat, gider)
    17. Ayarlar ve yedekleme
    18. Service worker (internetsiz çalışma ve güncelleme)
   ===================================================================== */


/* ===================== 1. SABİTLER ===================== */

// localStorage içinde verilerin saklandığı anahtar isimleri
const ANAHTAR_MUSTERILER = 'musteriler';
const ANAHTAR_SIPARISLER = 'siparisler';
const ANAHTAR_GIDERLER = 'giderler';
const ANAHTAR_AYARLAR = 'ayarlar';
const ANAHTAR_SON_YEDEK = 'sonYedek'; // Son yedeğin alındığı an (ayrı tutulur, geri yüklemede silinmez)

const VARSAYILAN_BIRIM_FIYAT = 100; // TL / m²
const YEDEK_UYARI_GUN = 7;          // Bu kadar günden eski yedek kırmızı uyarı verir

// Sipariş durumları (iş akışı sırasıyla)
const DURUMLAR = ['Teslim Alındı', 'Bekliyor', 'Yıkamada', 'Hazır', 'Teslim Edildi'];
const TESLIM_EDILDI = 'Teslim Edildi';

// Durum listesindeki butonun yazısı: siparişi bir sonraki duruma geçirir
const SONRAKI_ADIM = {
  'Teslim Alındı': 'Beklemeye Al',
  'Bekliyor': 'Yıkamaya Al',
  'Yıkamada': 'Hazır',
  'Hazır': 'Teslim Et'
};

// Eski sürümlerdeki durum adlarının yeni karşılıkları
const ESKI_DURUMLAR = {
  'Teslim alındı': 'Teslim Alındı',
  'Yıkanıyor': 'Yıkamada',
  'Teslim edildi': 'Teslim Edildi'
};


/* ===================== 2. VERİ ===================== */

// localStorage'dan bir listeyi/nesneyi okur. Yoksa varsayılanı döndürür.
function oku(anahtar, varsayilan) {
  try {
    const metin = localStorage.getItem(anahtar);
    return metin ? JSON.parse(metin) : varsayilan;
  } catch (hata) {
    return varsayilan;
  }
}

// localStorage'a yazar. Hata olursa (örn. depolama dolu) kullanıcıya söyler.
function yaz(anahtar, deger) {
  try {
    localStorage.setItem(anahtar, JSON.stringify(deger));
    return true;
  } catch (hata) {
    alert('Kayıt yapılamadı! Cihazda yer kalmamış olabilir.');
    return false;
  }
}

function musterileriGetir() { return oku(ANAHTAR_MUSTERILER, []); }
function siparisleriGetir() { return oku(ANAHTAR_SIPARISLER, []); }
function giderleriGetir() { return oku(ANAHTAR_GIDERLER, []); }
function ayarlariGetir() { return oku(ANAHTAR_AYARLAR, { birimFiyat: VARSAYILAN_BIRIM_FIYAT, sonSiparisNo: 0 }); }

function musterileriKaydet(liste) { return yaz(ANAHTAR_MUSTERILER, liste); }
function siparisleriKaydet(liste) { return yaz(ANAHTAR_SIPARISLER, liste); }
function giderleriKaydet(liste) { return yaz(ANAHTAR_GIDERLER, liste); }
function ayarlariKaydet(ayarlar) { return yaz(ANAHTAR_AYARLAR, ayarlar); }

function musteriBul(id) {
  return musterileriGetir().find(m => m.id === id);
}

// Müşterileri kimliklerine göre hızlı bulmak için: musteriler.get(id)
function musteriHaritasi() {
  return new Map(musterileriGetir().map(m => [m.id, m]));
}

function musterininSiparisleri(musteriId) {
  return siparisleriGetir().filter(s => s.musteriId === musteriId);
}

// Her kayıt için benzersiz bir kimlik (id) üretir
function yeniId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// Yeni sipariş için sıradaki numarayı verir (1, 2, 3 ...).
// Silinen siparişlerin numarası tekrar kullanılmaz.
function yeniSiparisNo() {
  const ayarlar = ayarlariGetir();
  ayarlar.sonSiparisNo = (Number(ayarlar.sonSiparisNo) || 0) + 1;
  ayarlariKaydet(ayarlar);
  return ayarlar.sonSiparisNo;
}


/* ===================== 3. ESKİ VERİLERİ YENİ YAPIYA UYARLAMA =====================
   Uygulama her açıldığında ve yedek geri yüklendiğinde çalışır.
   Eski sürümlerden kalan siparişleri yeni yapıya getirir; zaten
   uygun olan veriye dokunmaz.
   ================================================================================ */

function veriyiDuzenle() {
  const siparisler = siparisleriGetir();
  const ayarlar = ayarlariGetir();
  const oncekiHali = JSON.stringify(siparisler) + JSON.stringify(ayarlar);

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
  let sonNo = Math.max(Number(ayarlar.sonSiparisNo) || 0, ...siparisler.map(s => Number(s.no) || 0));
  siparisler
    .filter(s => !s.no)
    .sort((a, b) => (a.olusturma || 0) - (b.olusturma || 0))
    .forEach(s => { sonNo += 1; s.no = sonNo; });
  ayarlar.sonSiparisNo = sonNo;
  if (!(Number(ayarlar.birimFiyat) > 0)) ayarlar.birimFiyat = VARSAYILAN_BIRIM_FIYAT;

  // Sadece bir şey değiştiyse kaydet
  if (JSON.stringify(siparisler) + JSON.stringify(ayarlar) !== oncekiHali) {
    siparisleriKaydet(siparisler);
    ayarlariKaydet(ayarlar);
  }
}


/* ===================== 4. YARDIMCI FONKSİYONLAR ===================== */

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

// Ekranın altında kısa bir mesaj gösterir
let bildirimZamanlayici;
function bildirimGoster(mesaj) {
  const kutu = document.getElementById('bildirim');
  kutu.textContent = mesaj;
  kutu.hidden = false;
  clearTimeout(bildirimZamanlayici);
  bildirimZamanlayici = setTimeout(() => { kutu.hidden = true; }, 2200);
}


/* ===================== 5. SİPARİŞ İŞLEMLERİ ===================== */

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

// Tek bir siparişi değiştirip kaydeder, sonra bulunulan ekranı yeniden çizer.
// Değişen siparişi döndürür (bulunamazsa null).
function siparisiGuncelle(siparisId, degisiklik) {
  const siparisler = siparisleriGetir();
  const siparis = siparisler.find(s => s.id === siparisId);
  if (!siparis) return null;
  degisiklik(siparis);
  if (!siparisleriKaydet(siparisler)) return null;
  sayfayiCiz();
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
// bas/bit null ise o taraf sınırsızdır (Tümü).
//   Ciro      : sipariş tarihi bu aralıkta olan siparişlerin toplamı
//   Tahsilat  : ödeme tarihi bu aralıkta olan siparişlerin toplamı (kasaya giren para)
//   Net (iş)  : ciro − gider (yapılan işin kârı)
//   Kasa      : tahsilat − gider (eldeki paranın değişimi)
function ozetHesapla(bas, bit) {
  const aralikta = tarih => !!tarih && (!bas || tarih >= bas) && (!bit || tarih <= bit);
  const toplam = liste => yuvarla(liste.reduce((t, x) => t + (Number(x.tutar) || 0), 0));

  const siparisler = siparisleriGetir();
  const donemSiparisleri = siparisler.filter(s => aralikta(s.tarih));
  const ciro = toplam(donemSiparisleri);
  const tahsilat = toplam(siparisler.filter(s => s.odemeAlindi && aralikta(s.odemeTarihi)));
  const gider = toplam(giderleriGetir().filter(g => aralikta(g.tarih)));

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
function siparisSatirinaTiklandi(olay) {
  const buton = olay.target.closest('button[data-islem]');
  if (!buton) return;

  if (buton.dataset.islem === 'ac') {
    // Müşteri detayını aç ve bu siparişi vurgula
    if (musteriBul(buton.dataset.musteri)) git(`/musteri/${buton.dataset.musteri}/${buton.dataset.id}`);
  } else if (buton.dataset.islem === 'ileri') {
    const siparis = siparisiGuncelle(buton.dataset.id, s => {
      const yeni = sonrakiDurum(s.durum);
      if (yeni) durumAyarla(s, yeni);
    });
    if (siparis) bildirimGoster(`#${siparis.no} → ${siparis.durum}`);
  }
}

document.querySelectorAll('.siparis-satirlari').forEach(liste =>
  liste.addEventListener('click', siparisSatirinaTiklandi));


/* ===================== 6. EKRANLAR ARASI GEÇİŞ VE ALT MENÜ =====================
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

function sayfayiCiz() {
  const parcalar = location.hash.replace(/^#\/?/, '').split('/');
  const sayfa = parcalar[0];

  if (sayfa === 'durum') {
    durumListesiniCiz(Number(parcalar[1]));
  } else if (sayfa === 'gun-ozeti') {
    gunOzetiniCiz();
  } else if (sayfa === 'gider-formu') {
    giderFormunuCiz();
  } else if (sayfa === 'siparis-bul') {
    siparisBulCiz();
  } else if (sayfa === 'musteriler') {
    musteriListesiniCiz();
  } else if (sayfa === 'musteri' && parcalar[1]) {
    musteriDetayiniCiz(parcalar[1], parcalar[2]);
  } else if (sayfa === 'musteri-formu') {
    musteriFormunuCiz(parcalar[1]);
  } else if (sayfa === 'siparis-formu' && parcalar[1]) {
    siparisFormunuCiz(parcalar[1], parcalar[2]);
  } else if (sayfa === 'yonetici') {
    yoneticiCiz();
  } else if (sayfa === 'ayarlar') {
    ayarlariCiz();
  } else {
    anaEkraniCiz();
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


/* ===================== 7. ANA EKRAN ===================== */

function anaEkraniCiz() {
  ekranGoster('ekran-ana', 'Halı Yıkama', null, 'ana');

  const siparisler = siparisleriGetir();
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

  yedekHatirlaticisiniCiz();
}

document.getElementById('durum-satirlari').addEventListener('click', olay => {
  const satir = olay.target.closest('.durum-satiri');
  if (satir) git('/durum/' + satir.dataset.durum);
});

// Hızlı erişim butonları: Gün Özeti, Gider Ekle, Sipariş Bul
document.querySelectorAll('.hizli-buton').forEach(buton =>
  buton.addEventListener('click', () => git(buton.dataset.adres)));

// Son yedekten bu yana kaç takvim günü geçtiğini döndürür. Hiç yedek yoksa null.
function sonYedektenBeriGun() {
  const sonYedek = oku(ANAHTAR_SON_YEDEK, null);
  if (!sonYedek) return null;
  const yedekGunu = new Date(sonYedek);
  yedekGunu.setHours(0, 0, 0, 0);
  const bugunBasi = new Date();
  bugunBasi.setHours(0, 0, 0, 0);
  return Math.round((bugunBasi - yedekGunu) / 86400000);
}

function yedekHatirlaticisiniCiz() {
  const gun = sonYedektenBeriGun();
  let yazi;
  if (gun === null) yazi = 'Hiç yedek alınmadı!';
  else if (gun <= 0) yazi = 'Son yedek: bugün';
  else yazi = `Son yedek: ${gun} gün önce`;

  document.getElementById('yedek-yazisi').textContent = yazi;
  const uyariVar = gun === null || gun > YEDEK_UYARI_GUN;
  document.getElementById('yedek-kart').classList.toggle('uyari', uyariVar);
}

document.getElementById('simdi-yedekle-butonu').addEventListener('click', () => {
  yedekIndir();
  yedekHatirlaticisiniCiz();
});


/* ===================== 8. DURUM LİSTESİ ===================== */

function durumListesiniCiz(durumNo) {
  if (!(durumNo >= 0 && durumNo < DURUMLAR.length)) { yerineGit('/'); return; }
  const durum = DURUMLAR[durumNo];
  ekranGoster('ekran-durum', durum === TESLIM_EDILDI ? 'Bugün Teslim Edilenler' : durum, '/', 'ana');

  // En eski sipariş en üstte (önce gelen önce işlenir)
  const siparisler = durumdakiSiparisler(siparisleriGetir(), durumNo)
    .sort((a, b) => a.tarih.localeCompare(b.tarih) || a.no - b.no);
  const musteriler = musteriHaritasi();

  document.getElementById('durum-siparisleri').innerHTML =
    siparisler.map(s => siparisSatiriHTML(s, musteriler, true)).join('');

  const bos = document.getElementById('durum-bos');
  bos.hidden = siparisler.length > 0;
  bos.textContent = durum === TESLIM_EDILDI
    ? 'Bugün teslim edilen sipariş yok.'
    : `"${durum}" durumunda sipariş yok.`;
}


/* ===================== 9. GÜN ÖZETİ ===================== */

function gunOzetiniCiz() {
  ekranGoster('ekran-gun-ozeti', 'Gün Özeti', '/', 'ana');

  const bugunTarihi = bugun();
  document.getElementById('gun-tarihi').textContent = tarihYaz(bugunTarihi);
  document.getElementById('gun-ozeti-kartlari').innerHTML =
    ozetKutulariHTML(ozetHesapla(bugunTarihi, bugunTarihi));

  const siparisler = siparisleriGetir()
    .filter(s => s.tarih === bugunTarihi)
    .sort((a, b) => a.no - b.no);
  const musteriler = musteriHaritasi();
  document.getElementById('gun-siparisleri').innerHTML =
    siparisler.map(s => siparisSatiriHTML(s, musteriler, false)).join('');
  document.getElementById('gun-bos').hidden = siparisler.length > 0;
}


/* ===================== 10. GİDER FORMU ===================== */

const giderFormu = document.getElementById('gider-formu');

function giderFormunuCiz() {
  ekranGoster('ekran-gider-formu', 'Gider Ekle', '/', null);
  giderFormu.tarih.value = bugun();
  giderFormu.tutar.value = '';
  giderFormu.aciklama.value = '';
}

giderFormu.addEventListener('submit', olay => {
  olay.preventDefault();

  const tutar = sayiOku(giderFormu.tutar.value);
  if (tutar === null || tutar <= 0) {
    alert('Lütfen geçerli bir tutar girin (örn: 450 veya 99,90).');
    return;
  }
  if (!giderFormu.tarih.value) {
    alert('Lütfen tarih seçin.');
    return;
  }

  const giderler = giderleriGetir();
  giderler.push({
    id: yeniId(),
    tarih: giderFormu.tarih.value,
    tutar: yuvarla(tutar),
    aciklama: giderFormu.aciklama.value.trim() || 'Gider',
    olusturma: Date.now()
  });
  if (!giderleriKaydet(giderler)) return;

  bildirimGoster('Gider eklendi: ' + paraYaz(tutar));
  geriGit('/');
});


/* ===================== 11. SİPARİŞ BUL ===================== */

const siparisBulFormu = document.getElementById('siparis-bul-formu');

function siparisBulCiz() {
  ekranGoster('ekran-siparis-bul', 'Sipariş Bul', '/', 'ana');
  siparisBulFormu.no.value = '';
  document.getElementById('bul-sonuc').hidden = true;
}

siparisBulFormu.addEventListener('submit', olay => {
  olay.preventDefault();
  const sonuc = document.getElementById('bul-sonuc');
  const no = Number(sadeceRakam(siparisBulFormu.no.value)); // "#27" de yazılabilir

  const siparis = no ? siparisleriGetir().find(s => s.no === no) : null;
  if (siparis && musteriBul(siparis.musteriId)) {
    git(`/musteri/${siparis.musteriId}/${siparis.id}`);
  } else {
    sonuc.textContent = no ? `#${no} numaralı sipariş bulunamadı.` : 'Lütfen sipariş numarasını yazın.';
    sonuc.hidden = false;
  }
});


/* ===================== 12. MÜŞTERİLER ===================== */

function musteriListesiniCiz() {
  ekranGoster('ekran-musteriler', 'Müşteriler', null, 'musteriler');

  const acikSiparisler = siparisleriGetir().filter(teslimEdilmediMi);

  // Arama kutusuna yazılana göre filtrele
  // (isim, adres ve telefonda arar; Türkçe karakter ve büyük/küçük harf farkı önemsizdir)
  const aranan = sadeMetin(document.getElementById('arama-kutusu').value);
  const arananRakam = sadeceRakam(aranan);

  let musteriler = musterileriGetir();
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


/* ===================== 13. MÜŞTERİ DETAYI ===================== */

let aktifMusteriId = null;

// vurguSiparisId verilirse o sipariş kartı çerçeveli gösterilir ve ekran ona kaydırılır
function musteriDetayiniCiz(musteriId, vurguSiparisId) {
  const musteri = musteriBul(musteriId);
  if (!musteri) { yerineGit('/musteriler'); return; }
  aktifMusteriId = musteriId;

  const yeniEkran = ekranGoster('ekran-musteri-detay', musteri.ad + ' ' + musteri.soyad, '/musteriler', 'musteriler');

  document.getElementById('detay-isim').textContent = musteri.ad + ' ' + musteri.soyad;
  const telefon = document.getElementById('detay-telefon');
  telefon.textContent = musteri.telefon;
  telefon.href = 'tel:' + musteri.telefon.replace(/[^\d+]/g, ''); // Basınca arama açılır
  document.getElementById('detay-adres').textContent = musteri.adres || '';

  // Siparişler: en yeni tarih en üstte
  const siparisler = musterininSiparisleri(musteriId).sort((a, b) =>
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
  if (siparisiGuncelle(secim.dataset.id, s => durumAyarla(s, secim.value))) {
    bildirimGoster('Durum: ' + secim.value);
  }
});

// Sipariş kartındaki butonlar
document.getElementById('siparis-listesi').addEventListener('click', olay => {
  const buton = olay.target.closest('button[data-islem]');
  if (!buton) return;
  const siparisId = buton.dataset.id;

  if (buton.dataset.islem === 'odeme') {
    siparisiGuncelle(siparisId, s => odemeAyarla(s, !s.odemeAlindi));
  } else if (buton.dataset.islem === 'duzenle') {
    git('/siparis-formu/' + aktifMusteriId + '/' + siparisId);
  } else if (buton.dataset.islem === 'sil') {
    if (!confirm('Bu sipariş silinsin mi? Bu işlem geri alınamaz.')) return;
    const kalanlar = siparisleriGetir().filter(s => s.id !== siparisId);
    if (siparisleriKaydet(kalanlar)) {
      sayfayiCiz();
      bildirimGoster('Sipariş silindi');
    }
  }
});

document.getElementById('yeni-siparis-butonu').addEventListener('click', () =>
  git('/siparis-formu/' + aktifMusteriId));

document.getElementById('musteri-duzenle-butonu').addEventListener('click', () =>
  git('/musteri-formu/' + aktifMusteriId));

document.getElementById('musteri-sil-butonu').addEventListener('click', () => {
  const musteri = musteriBul(aktifMusteriId);
  if (!musteri) return;
  const siparisSayisi = musterininSiparisleri(aktifMusteriId).length;
  let soru = `${musteri.ad} ${musteri.soyad} silinsin mi?`;
  if (siparisSayisi > 0) soru += `\n\nBu müşterinin ${siparisSayisi} siparişi de silinecek.`;
  soru += '\n\nBu işlem geri alınamaz.';
  if (!confirm(soru)) return;

  musterileriKaydet(musterileriGetir().filter(m => m.id !== aktifMusteriId));
  siparisleriKaydet(siparisleriGetir().filter(s => s.musteriId !== aktifMusteriId));
  bildirimGoster('Müşteri silindi');
  geriGit('/musteriler');
});


/* ===================== 14. MÜŞTERİ FORMU ===================== */

const musteriFormu = document.getElementById('musteri-formu');
let duzenlenenMusteriId = null; // null ise yeni müşteri ekleniyor

function musteriFormunuCiz(musteriId) {
  const musteri = musteriId ? musteriBul(musteriId) : null;
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

  const musteriler = musterileriGetir();

  if (duzenlenenMusteriId) {
    // Var olan müşteriyi güncelle
    const musteri = musteriler.find(m => m.id === duzenlenenMusteriId);
    Object.assign(musteri, bilgiler);
    if (!musterileriKaydet(musteriler)) return;
    bildirimGoster('Müşteri güncellendi');
    geriGit('/musteri/' + duzenlenenMusteriId);
  } else {
    // Yeni müşteri ekle ve detay sayfasını aç
    const yeni = { id: yeniId(), ...bilgiler, olusturma: Date.now() };
    musteriler.push(yeni);
    if (!musterileriKaydet(musteriler)) return;
    bildirimGoster('Müşteri eklendi');
    yerineGit('/musteri/' + yeni.id);
  }
});


/* ===================== 15. SİPARİŞ FORMU ===================== */

const siparisFormu = document.getElementById('siparis-formu');
let formMusteriId = null;
let duzenlenenSiparisId = null; // null ise yeni sipariş ekleniyor
let formBirimFiyat = 0;         // Bu siparişte kullanılacak birim fiyat

// Durum seçeneklerini bir kez doldur
siparisFormu.durum.innerHTML = DURUMLAR.map(d => `<option value="${d}">${d}</option>`).join('');

function siparisFormunuCiz(musteriId, siparisId) {
  const musteri = musteriBul(musteriId);
  if (!musteri) { yerineGit('/musteriler'); return; }
  const siparis = siparisId ? siparisleriGetir().find(s => s.id === siparisId) : null;
  if (siparisId && !siparis) { yerineGit('/musteri/' + musteriId); return; }

  formMusteriId = musteriId;
  duzenlenenSiparisId = siparis ? siparis.id : null;

  // ÖNEMLİ: Yeni siparişte güncel fiyat kullanılır.
  // Eski sipariş düzenlenirken siparişin KENDİ fiyatı korunur.
  formBirimFiyat = siparis ? siparis.birimFiyat : ayarlariGetir().birimFiyat;

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

  const metrekare = sayiOku(siparisFormu.metrekare.value);
  if (metrekare === null || metrekare <= 0) {
    alert('Lütfen geçerli bir metrekare girin (örn: 6,5).');
    return;
  }
  if (!siparisFormu.tarih.value) {
    alert('Lütfen tarih seçin.');
    return;
  }

  const siparisler = siparisleriGetir();
  let siparis;
  if (duzenlenenSiparisId) {
    siparis = siparisler.find(s => s.id === duzenlenenSiparisId);
  } else {
    siparis = {
      id: yeniId(),
      no: yeniSiparisNo(),
      musteriId: formMusteriId,
      durum: null,
      odemeAlindi: false,
      odemeTarihi: null,
      teslimTarihi: null,
      olusturma: Date.now()
    };
    siparisler.push(siparis);
  }

  Object.assign(siparis, {
    tarih: siparisFormu.tarih.value,
    metrekare: metrekare,
    birimFiyat: formBirimFiyat,
    tutar: yuvarla(metrekare * formBirimFiyat)
  });
  // Teslim ve ödeme tarihleri bu fonksiyonlarda ayarlanır
  durumAyarla(siparis, siparisFormu.durum.value);
  odemeAyarla(siparis, siparisFormu.odemeAlindi.checked);

  if (!siparisleriKaydet(siparisler)) return;

  bildirimGoster(duzenlenenSiparisId ? 'Sipariş güncellendi' : `Sipariş #${siparis.no} eklendi`);
  geriGit('/musteri/' + formMusteriId);
});


/* ===================== 16. YÖNETİCİ ===================== */

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

function yoneticiCiz() {
  ekranGoster('ekran-yonetici', 'Yönetici', null, 'yonetici');

  document.querySelectorAll('#donem-secici button').forEach(b =>
    b.classList.toggle('secili', b.dataset.donem === secilenDonem));

  const [bas, bit] = donemAraligi(secilenDonem);
  document.getElementById('donem-araligi').textContent =
    !bas ? 'Tüm kayıtlar' : bas === bit ? tarihYaz(bas) : `${tarihYaz(bas)} – ${tarihYaz(bit)}`;
  document.getElementById('yonetici-kartlari').innerHTML = ozetKutulariHTML(ozetHesapla(bas, bit));

  // Bu dönemin giderleri, en yenisi üstte
  const giderler = giderleriGetir()
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
  const giderler = giderleriGetir();
  const gider = giderler.find(g => g.id === buton.dataset.id);
  if (!gider) return;
  if (!confirm(`"${gider.aciklama}" (${paraYaz(gider.tutar)}) gideri silinsin mi?`)) return;
  if (giderleriKaydet(giderler.filter(g => g.id !== gider.id))) {
    yoneticiCiz();
    bildirimGoster('Gider silindi');
  }
});

document.getElementById('yonetici-gider-ekle').addEventListener('click', () => git('/gider-formu'));
document.getElementById('ayarlara-git').addEventListener('click', () => git('/ayarlar'));


/* ===================== 17. AYARLAR VE YEDEKLEME ===================== */

const ayarlarFormu = document.getElementById('ayarlar-formu');

function ayarlariCiz() {
  ekranGoster('ekran-ayarlar', 'Ayarlar', '/yonetici', 'yonetici');
  ayarlarFormu.birimFiyat.value = String(ayarlariGetir().birimFiyat).replace('.', ',');
  surumuGoster();
}

ayarlarFormu.addEventListener('submit', olay => {
  olay.preventDefault();
  const fiyat = sayiOku(ayarlarFormu.birimFiyat.value);
  if (fiyat === null || fiyat <= 0) {
    alert('Lütfen geçerli bir fiyat girin (örn: 100 veya 112,50).');
    return;
  }
  const ayarlar = ayarlariGetir();
  ayarlar.birimFiyat = yuvarla(fiyat);
  if (ayarlariKaydet(ayarlar)) bildirimGoster('Yeni fiyat: ' + paraYaz(ayarlar.birimFiyat) + ' / m²');
});

// --- Yedeği indir: tüm veriyi bir .json dosyası olarak kaydeder ---
// Hem Ayarlar'daki hem ana ekrandaki "Şimdi Yedekle" butonu bunu kullanır.
function yedekIndir() {
  const yedek = {
    uygulama: 'hali-yikama',
    yedekTarihi: new Date().toISOString(),
    musteriler: musterileriGetir(),
    siparisler: siparisleriGetir(),
    giderler: giderleriGetir(),
    ayarlar: ayarlariGetir()
  };
  const dosya = new Blob([JSON.stringify(yedek, null, 2)], { type: 'application/json' });
  const baglanti = document.createElement('a');
  baglanti.href = URL.createObjectURL(dosya);
  baglanti.download = `hali-yikama-yedek-${bugun()}.json`;
  document.body.appendChild(baglanti);
  baglanti.click();
  baglanti.remove();
  setTimeout(() => URL.revokeObjectURL(baglanti.href), 5000);

  yaz(ANAHTAR_SON_YEDEK, Date.now()); // Hatırlatıcı sıfırlansın
  bildirimGoster('Yedek dosyası hazırlandı');
}

document.getElementById('yedek-indir-butonu').addEventListener('click', yedekIndir);

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
  okuyucu.onload = () => {
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
    // Eski sürüm yedeklerinde gider yoktur
    const giderler = Array.isArray(yedek.giderler) ? yedek.giderler : [];

    const soru = `Yedekte ${yedek.musteriler.length} müşteri, ${yedek.siparisler.length} sipariş ve ${giderler.length} gider var.\n\n` +
      'Geri yüklerseniz bu cihazdaki MEVCUT TÜM VERİ silinip yedektekiyle değiştirilecek. Devam edilsin mi?';
    if (!confirm(soru)) return;

    const ayarlar = yedek.ayarlar && Number(yedek.ayarlar.birimFiyat) > 0
      ? yedek.ayarlar
      : { birimFiyat: VARSAYILAN_BIRIM_FIYAT };

    if (musterileriKaydet(yedek.musteriler) && siparisleriKaydet(yedek.siparisler) &&
        giderleriKaydet(giderler) && ayarlariKaydet(ayarlar)) {
      veriyiDuzenle(); // Eski sürüm yedeğiyse durum adlarını, numaraları vb. tamamla
      alert('Yedek başarıyla geri yüklendi.');
      ayarlariCiz();
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


/* ===================== 18. SERVICE WORKER =====================
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
veriyiDuzenle(); // Eski sürümden kalan veriyi yeni yapıya uyarla
sayfayiCiz();
