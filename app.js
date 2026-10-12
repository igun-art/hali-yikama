/* =====================================================================
   HALI YIKAMA UYGULAMASI - app.js
   Tüm uygulama mantığı bu dosyadadır. Bölümler:
     1. Sabitler
     2. Veri (localStorage okuma / yazma)
     3. Yardımcı fonksiyonlar (para, tarih, sayı biçimleri)
     4. Ekranlar arası geçiş (adres çubuğundaki # işaretine göre)
     5. Ekran 1: Müşteri listesi
     6. Ekran 2: Müşteri detayı ve siparişleri
     7. Ekran 3: Müşteri formu
     8. Ekran 4: Sipariş formu
     9. Ekran 5: Ayarlar ve yedekleme
    10. Service worker (internetsiz çalışma ve güncelleme)
   ===================================================================== */


/* ===================== 1. SABİTLER ===================== */

// localStorage içinde verilerin saklandığı anahtar isimleri
const ANAHTAR_MUSTERILER = 'musteriler';
const ANAHTAR_SIPARISLER = 'siparisler';
const ANAHTAR_AYARLAR = 'ayarlar';
const ANAHTAR_SON_YEDEK = 'sonYedek'; // Son yedeğin alındığı an (ayrı tutulur, geri yüklemede silinmez)

const VARSAYILAN_BIRIM_FIYAT = 100; // TL / m²
const YEDEK_UYARI_GUN = 7;          // Bu kadar günden eski yedek kırmızı uyarı verir

// Sipariş durumları (sıralı)
const DURUMLAR = ['Teslim alındı', 'Yıkanıyor', 'Hazır', 'Teslim edildi'];
const TESLIM_EDILDI = 'Teslim edildi';


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
function ayarlariGetir() { return oku(ANAHTAR_AYARLAR, { birimFiyat: VARSAYILAN_BIRIM_FIYAT }); }

function musterileriKaydet(liste) { return yaz(ANAHTAR_MUSTERILER, liste); }
function siparisleriKaydet(liste) { return yaz(ANAHTAR_SIPARISLER, liste); }
function ayarlariKaydet(ayarlar) { return yaz(ANAHTAR_AYARLAR, ayarlar); }

function musteriBul(id) {
  return musterileriGetir().find(m => m.id === id);
}

function musterininSiparisleri(musteriId) {
  return siparisleriGetir().filter(s => s.musteriId === musteriId);
}

// Her kayıt için benzersiz bir kimlik (id) üretir
function yeniId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}


/* ===================== 3. YARDIMCI FONKSİYONLAR ===================== */

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

// Bugünün tarihi "2026-10-12" biçiminde
function bugun() {
  const t = new Date();
  const ay = String(t.getMonth() + 1).padStart(2, '0');
  const gun = String(t.getDate()).padStart(2, '0');
  return `${t.getFullYear()}-${ay}-${gun}`;
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

// "Teslim alındı" -> "teslim-alindi" (CSS sınıfı için)
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


/* ===================== 4. EKRANLAR ARASI GEÇİŞ =====================
   Hangi ekranın görüneceğini adresin # kısmı belirler:
     #/                          -> müşteri listesi
     #/musteri/ID                -> müşteri detayı
     #/musteri-formu             -> yeni müşteri
     #/musteri-formu/ID          -> müşteri düzenle
     #/siparis-formu/MUSTERIID   -> yeni sipariş
     #/siparis-formu/MUSTERIID/SIPARISID -> sipariş düzenle
     #/ayarlar                   -> ayarlar
   Bu sayede telefonun "geri" tuşu da doğal çalışır.
   ================================================================== */

let uygulamaIcindeGezildi = false; // Geri tuşu için: uygulama içinde sayfa değişti mi?

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

function ekranGoster(ekranId, baslik, geriAdresi) {
  document.querySelectorAll('.ekran').forEach(e => { e.hidden = e.id !== ekranId; });
  document.getElementById('sayfa-basligi').textContent = baslik;

  const geriButonu = document.getElementById('geri-butonu');
  geriButonu.hidden = !geriAdresi;
  geriButonu.onclick = () => geriGit(geriAdresi);

  document.getElementById('ayarlar-butonu').hidden = ekranId === 'ekran-ayarlar';
  window.scrollTo(0, 0);
}

function sayfayiCiz() {
  const parcalar = location.hash.replace(/^#\/?/, '').split('/');
  const sayfa = parcalar[0];

  if (sayfa === 'musteri' && parcalar[1]) {
    musteriDetayiniCiz(parcalar[1]);
  } else if (sayfa === 'musteri-formu') {
    musteriFormunuCiz(parcalar[1]);
  } else if (sayfa === 'siparis-formu' && parcalar[1]) {
    siparisFormunuCiz(parcalar[1], parcalar[2]);
  } else if (sayfa === 'ayarlar') {
    ayarlariCiz();
  } else {
    musteriListesiniCiz();
  }
}

window.addEventListener('hashchange', sayfayiCiz);


/* ===================== 5. EKRAN 1: MÜŞTERİ LİSTESİ ===================== */

function musteriListesiniCiz() {
  ekranGoster('ekran-musteriler', 'Halı Yıkama', null);

  const siparisler = siparisleriGetir();
  const bekleyenler = siparisler.filter(teslimEdilmediMi);
  document.getElementById('bekleyen-sayisi').textContent = bekleyenler.length;
  yedekHatirlaticisiniCiz();

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
    const bekleyenSayisi = bekleyenler.filter(s => s.musteriId === m.id).length;
    const rozet = bekleyenSayisi > 0 ? `<span class="rozet">${bekleyenSayisi} bekleyen</span>` : '';
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

document.getElementById('yeni-musteri-butonu').addEventListener('click', () => git('/musteri-formu'));

document.getElementById('musteri-listesi').addEventListener('click', olay => {
  const satir = olay.target.closest('.musteri-satiri');
  if (satir) git('/musteri/' + satir.dataset.id);
});

document.getElementById('ayarlar-butonu').addEventListener('click', () => git('/ayarlar'));


/* ===================== 6. EKRAN 2: MÜŞTERİ DETAYI ===================== */

let aktifMusteriId = null;

function musteriDetayiniCiz(musteriId) {
  const musteri = musteriBul(musteriId);
  if (!musteri) { yerineGit('/'); return; }
  aktifMusteriId = musteriId;

  ekranGoster('ekran-musteri-detay', musteri.ad + ' ' + musteri.soyad, '/');

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
    const odemeYazisi = s.odemeAlindi ? '✓ Ödeme alındı' : '✗ Ödeme alınmadı';
    return `
      <li class="siparis ${durumSinifi(s.durum)}">
        <div class="siparis-ust">
          <span class="siparis-tarih">${tarihYaz(s.tarih)}</span>
          <span class="siparis-tutar">${paraYaz(s.tutar)}</span>
        </div>
        <div class="siparis-detay">${sayiYaz(s.metrekare)} m² × ${paraYaz(s.birimFiyat)}</div>
        <select data-islem="durum" data-id="${guvenli(s.id)}" aria-label="Sipariş durumu">${secenekler}</select>
        <button class="buton buton-kucuk odeme-butonu ${odemeSinifi}" data-islem="odeme" data-id="${guvenli(s.id)}">${odemeYazisi}</button>
        <div class="buton-satiri">
          <button class="buton buton-kucuk" data-islem="duzenle" data-id="${guvenli(s.id)}">Düzenle</button>
          <button class="buton buton-kucuk buton-tehlike" data-islem="sil" data-id="${guvenli(s.id)}">Sil</button>
        </div>
      </li>`;
  }).join('');

  document.getElementById('siparis-yok').hidden = siparisler.length > 0;
}

// Tek bir siparişi değiştirip kaydeder
function siparisiGuncelle(siparisId, degisiklik) {
  const siparisler = siparisleriGetir();
  const siparis = siparisler.find(s => s.id === siparisId);
  if (!siparis) return;
  degisiklik(siparis);
  if (siparisleriKaydet(siparisler)) musteriDetayiniCiz(aktifMusteriId);
}

// Durum seçimi değişince hemen kaydet
document.getElementById('siparis-listesi').addEventListener('change', olay => {
  const secim = olay.target;
  if (secim.dataset.islem !== 'durum') return;
  siparisiGuncelle(secim.dataset.id, s => { s.durum = secim.value; });
  bildirimGoster('Durum: ' + secim.value);
});

// Sipariş kartındaki butonlar
document.getElementById('siparis-listesi').addEventListener('click', olay => {
  const buton = olay.target.closest('button[data-islem]');
  if (!buton) return;
  const siparisId = buton.dataset.id;

  if (buton.dataset.islem === 'odeme') {
    siparisiGuncelle(siparisId, s => { s.odemeAlindi = !s.odemeAlindi; });
  } else if (buton.dataset.islem === 'duzenle') {
    git('/siparis-formu/' + aktifMusteriId + '/' + siparisId);
  } else if (buton.dataset.islem === 'sil') {
    if (!confirm('Bu sipariş silinsin mi? Bu işlem geri alınamaz.')) return;
    const kalanlar = siparisleriGetir().filter(s => s.id !== siparisId);
    if (siparisleriKaydet(kalanlar)) {
      musteriDetayiniCiz(aktifMusteriId);
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
  geriGit('/');
});


/* ===================== 7. EKRAN 3: MÜŞTERİ FORMU ===================== */

const musteriFormu = document.getElementById('musteri-formu');
let duzenlenenMusteriId = null; // null ise yeni müşteri ekleniyor

function musteriFormunuCiz(musteriId) {
  const musteri = musteriId ? musteriBul(musteriId) : null;
  if (musteriId && !musteri) { yerineGit('/'); return; }
  duzenlenenMusteriId = musteri ? musteri.id : null;

  ekranGoster('ekran-musteri-formu',
    musteri ? 'Müşteriyi Düzenle' : 'Yeni Müşteri',
    musteri ? '/musteri/' + musteri.id : '/');

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


/* ===================== 8. EKRAN 4: SİPARİŞ FORMU ===================== */

const siparisFormu = document.getElementById('siparis-formu');
let formMusteriId = null;
let duzenlenenSiparisId = null; // null ise yeni sipariş ekleniyor
let formBirimFiyat = 0;         // Bu siparişte kullanılacak birim fiyat

// Durum seçeneklerini bir kez doldur
siparisFormu.durum.innerHTML = DURUMLAR.map(d => `<option value="${d}">${d}</option>`).join('');

function siparisFormunuCiz(musteriId, siparisId) {
  const musteri = musteriBul(musteriId);
  if (!musteri) { yerineGit('/'); return; }
  const siparis = siparisId ? siparisleriGetir().find(s => s.id === siparisId) : null;
  if (siparisId && !siparis) { yerineGit('/musteri/' + musteriId); return; }

  formMusteriId = musteriId;
  duzenlenenSiparisId = siparis ? siparis.id : null;

  // ÖNEMLİ: Yeni siparişte güncel fiyat kullanılır.
  // Eski sipariş düzenlenirken siparişin KENDİ fiyatı korunur.
  formBirimFiyat = siparis ? siparis.birimFiyat : ayarlariGetir().birimFiyat;

  ekranGoster('ekran-siparis-formu', siparis ? 'Siparişi Düzenle' : 'Yeni Sipariş', '/musteri/' + musteriId);

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

  const bilgiler = {
    tarih: siparisFormu.tarih.value,
    metrekare: metrekare,
    birimFiyat: formBirimFiyat,
    tutar: yuvarla(metrekare * formBirimFiyat),
    durum: siparisFormu.durum.value,
    odemeAlindi: siparisFormu.odemeAlindi.checked
  };

  const siparisler = siparisleriGetir();
  if (duzenlenenSiparisId) {
    Object.assign(siparisler.find(s => s.id === duzenlenenSiparisId), bilgiler);
  } else {
    siparisler.push({ id: yeniId(), musteriId: formMusteriId, ...bilgiler, olusturma: Date.now() });
  }
  if (!siparisleriKaydet(siparisler)) return;

  bildirimGoster(duzenlenenSiparisId ? 'Sipariş güncellendi' : 'Sipariş eklendi');
  geriGit('/musteri/' + formMusteriId);
});


/* ===================== 9. EKRAN 5: AYARLAR VE YEDEKLEME ===================== */

const ayarlarFormu = document.getElementById('ayarlar-formu');

function ayarlariCiz() {
  ekranGoster('ekran-ayarlar', 'Ayarlar', '/');
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

    const soru = `Yedekte ${yedek.musteriler.length} müşteri ve ${yedek.siparisler.length} sipariş var.\n\n` +
      'Geri yüklerseniz bu cihazdaki MEVCUT TÜM VERİ silinip yedektekiyle değiştirilecek. Devam edilsin mi?';
    if (!confirm(soru)) return;

    // Eski sürüm yedeklerde eksik olabilecek alanları tamamla
    const siparisler = yedek.siparisler.map(s => ({
      ...s,
      durum: DURUMLAR.includes(s.durum) ? s.durum : DURUMLAR[0],
      odemeAlindi: !!s.odemeAlindi
    }));
    const ayarlar = yedek.ayarlar && Number(yedek.ayarlar.birimFiyat) > 0
      ? yedek.ayarlar
      : { birimFiyat: VARSAYILAN_BIRIM_FIYAT };

    if (musterileriKaydet(yedek.musteriler) && siparisleriKaydet(siparisler) && ayarlariKaydet(ayarlar)) {
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


/* ===================== 10. SERVICE WORKER =====================
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
sayfayiCiz();
