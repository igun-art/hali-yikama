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
     2. Yardımcı fonksiyonlar (biçimler, uyarılar, form uyarıları, çift basma koruması)
     3. Sipariş işlemleri (durum, ödeme, sipariş satırı)
     4. Raporlar (dönemler, gelir/gider hesabı, dönem kartı)
     5. Ekranlar arası geçiş ve alt menü
     6. Ana Ekran (durum satırları, hızlı erişim, yedek hatırlatıcısı)
     7. Durum listesi (örn. "Yıkamada" olan siparişler)
     8. Gün Özeti
     9. Gider formu
    10. Sipariş Bul
    11. Müşteriler (liste ve arama)
    12. Müşteri detayı ve siparişleri
    13. Müşteri formu
    14. Sipariş formu
    15. Yönetici ve Gider Listesi
    16. Ayarlar ve yedekleme
    17. Service worker (internetsiz çalışma ve güncelleme)
   ===================================================================== */


/* ===================== 1. SABİTLER =====================
   (DURUMLAR, TESLIM_EDILDI, ODEME_YONTEMLERI ve GIDER_TURLERI veri.js'dedir.) */

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
const kisaParaBicimi = new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 });
const sayiBicimi = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 2 });

function paraYaz(tutar) { return paraBicimi.format(tutar || 0); }
function paraKisa(tutar) { return kisaParaBicimi.format(tutar || 0); } // Kuruşsuz: ₺4.700 (dar kutular için)
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

// Tam sayı okur ("3" -> 3). Geçersizse (boş, "2,5", "abc") null döndürür.
function tamSayiOku(metin) {
  const temiz = String(metin || '').trim();
  return /^\d+$/.test(temiz) ? Number(temiz) : null;
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

// Bir tarihe gün ekler/çıkarır: gunEkle(bugünTarih, -1) -> dün
function gunEkle(tarih, gun) {
  return new Date(tarih.getFullYear(), tarih.getMonth(), tarih.getDate() + gun);
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

// GÜVENLİK: Ekrana HTML olarak (innerHTML ile) basılan her veri bu fonksiyondan geçer.
// <, >, ", ' ve & karakterlerini zararsız hale getirir; böylece bir kayıttaki
// (örn. dışarıdan gelen bir yedek dosyasındaki) yazı asla kod olarak çalışmaz.
function guvenli(metin) {
  return String(metin == null ? '' : metin)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// --- "Sanal" etiketi ---
// Gösterim için yüklenmiş sanal kayıtların (sanal: true) yanında küçük gri etiket.
// Gerçeğe dönen müşteride sanal işareti kalktığı için etiket de görünmez.
function sanalEtiketiHTML(kayit) {
  return kayit && kayit.sanal === true ? ' <span class="etiket sanal-etiketi">Sanal</span>' : '';
}

// --- Google Haritalar ---
// Adresi Google Haritalar arama bağlantısına çevirir. Bu "evrensel" bağlantı telefonda
// Google Haritalar uygulaması varsa onu, yoksa tarayıcıda haritayı açar; oradan yol tarifi alınır.
// Adres URL için encodeURIComponent ile kodlanır (boşluk, Türkçe harf, "&" gibi karakterler bozulmaz).
function haritaBaglantisi(adres) {
  return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(adres);
}

// Adresin yanındaki küçük harita ikonu (adres boşsa hiçbir şey döndürmez).
// Yeni sekmede açılır (target="_blank"); uygulamadan çıkılmaz.
// Bağlantı da guvenli()'den geçer (Güvenlik Kuralı 1).
function haritaIkonuHTML(adres) {
  const temiz = String(adres || '').trim();
  if (!temiz) return '';
  return `<a class="harita-ikonu" href="${guvenli(haritaBaglantisi(temiz))}" target="_blank" ` +
    `rel="noopener noreferrer" aria-label="Adresi Google Haritalar'da aç" title="Haritada aç">📍</a>`;
}

// "Teslim Alındı" -> "durum-teslim-alindi" (CSS sınıfı için)
// Sadece a-z, 0-9 ve "-" kalır; bozuk bir durum değeri HTML etiketinin dışına taşamaz.
function durumSinifi(durum) {
  return 'durum-' + sadeMetin(durum).replace(/[^a-z0-9]+/g, '-');
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

// --- Form uyarıları: eksik/hatalı alanın hemen altında kırmızı yazı ---
// HTML'de her alanın altında <p class="alan-hatasi" data-alan="ALAN_ADI" hidden> bulunur.

function alanHatasiGoster(form, alan, mesaj) {
  const kutu = form.querySelector(`.alan-hatasi[data-alan="${alan}"]`);
  kutu.textContent = mesaj;
  kutu.hidden = false;
  const alanKutusu = kutu.closest('label, .form-alan');
  if (alanKutusu) alanKutusu.classList.add('alan-hatali'); // Alanın çerçevesi de kırmızı olur
}

// alan verilmezse formdaki tüm uyarıları kaldırır
function alanHatalariniTemizle(form, alan) {
  const secici = alan ? `.alan-hatasi[data-alan="${alan}"]` : '.alan-hatasi';
  form.querySelectorAll(secici).forEach(kutu => {
    kutu.hidden = true;
    const alanKutusu = kutu.closest('label, .form-alan');
    if (alanKutusu) alanKutusu.classList.remove('alan-hatali');
  });
}

// Formda uyarı varsa ilk uyarılı alana kaydırır ve true döndürür
function formdaHataVar(form) {
  const ilk = form.querySelector('.alan-hatasi:not([hidden])');
  if (ilk) ilk.closest('label, .form-alan').scrollIntoView({ block: 'center' });
  return !!ilk;
}

// Kullanıcı bir alanı düzeltmeye başlayınca o alanın uyarısı kalksın
document.querySelectorAll('form').forEach(form => {
  const temizle = olay => { if (olay.target.name) alanHatalariniTemizle(form, olay.target.name); };
  form.addEventListener('input', temizle);
  form.addEventListener('change', temizle);
});

// --- Seçim butonları (Nakit/Kart/Havale, Yakıt/Malzeme/Diğer) ---
// Görünüşte büyük buton, aslında radyo düğmesi: form.ALAN_ADI.value ile okunur.
function secimGrubuDoldur(kapsayiciId, ad, secenekler) {
  document.getElementById(kapsayiciId).innerHTML = secenekler.map(secenek => `
    <label class="secim">
      <input type="radio" name="${guvenli(ad)}" value="${guvenli(secenek)}">
      <span>${guvenli(secenek)}</span>
    </label>`).join('');
}

// Seçimi ayarlar; deger boşsa (null) hiçbiri seçili olmaz
function secimYap(form, ad, deger) {
  form.querySelectorAll(`input[name="${ad}"]`).forEach(radyo => { radyo.checked = radyo.value === deger; });
}


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

// Ödeme bilgisini değiştirir. Ödemenin alındığı gün (tahsilat için) ve
// yöntemi (Nakit/Kart/Havale; Kasa için) kaydedilir. Ödeme geri alınırsa ikisi de silinir.
function odemeAyarla(siparis, alindi, yontem) {
  if (alindi && !siparis.odemeAlindi) siparis.odemeTarihi = bugun();
  if (!alindi) siparis.odemeTarihi = null;
  siparis.odemeAlindi = alindi;
  siparis.odemeYontemi = alindi ? yontem : null;
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

// "3 parça · 6,5 m²" (parça sayısı bilinmiyorsa sadece m²)
function parcaVeMetrekare(s) {
  const parca = s.parcaSayisi ? `${guvenli(s.parcaSayisi)} parça · ` : '';
  return `${parca}${sayiYaz(s.metrekare)} m²`;
}

// Durum listesinde ve gün özetinde kullanılan sipariş satırı.
// Satıra basınca müşteri detayı açılır; ileriButonuVar ise yanında
// siparişi sonraki duruma geçiren buton olur.
function siparisSatiriHTML(s, musteriler, ileriButonuVar) {
  const musteri = musteriler.get(s.musteriId);
  const isim = musteri ? `${guvenli(musteri.ad)} ${guvenli(musteri.soyad)}` : '(silinmiş müşteri)';
  const odeme = s.odemeAlindi
    ? `<span class="etiket odendi">${guvenli(s.odemeYontemi || 'Ödendi')}</span>`
    : '<span class="etiket odenmedi">Ödenmedi</span>';
  const ileri = ileriButonuVar && sonrakiDurum(s.durum)
    ? `<button class="buton buton-kucuk buton-ana ileri-butonu" data-islem="ileri" data-id="${guvenli(s.id)}">${guvenli(SONRAKI_ADIM[s.durum])}</button>`
    : '';
  return `
    <li class="siparis-satiri ${durumSinifi(s.durum)}">
      <button class="satir-icerik" data-islem="ac" data-id="${guvenli(s.id)}" data-musteri="${guvenli(s.musteriId)}">
        <div class="satir-ust"><span class="siparis-no">#${guvenli(s.no)}</span>${sanalEtiketiHTML(s)} ${isim}</div>
        <div class="musteri-alt">${tarihYaz(s.tarih)} · ${parcaVeMetrekare(s)} · ${paraYaz(s.tutar)} ${odeme}</div>
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


/* ===================== 4. RAPORLAR =====================
   Yönetici ve Gün Özeti ekranlarındaki rakamlar burada hesaplanır.
   Silinmiş kayıtlar zaten veri.js'den gelmez, hesaba girmez.
   ====================================================== */

let secilenDonem = 'bugun'; // bugun | hafta | ay | tumu (Yönetici ve Gider Listesi'nde ortak)

const DONEM_ADLARI = { bugun: 'Bugün', hafta: 'Bu Hafta', ay: 'Bu Ay', tumu: 'Tümü' };

// Yüzde değişimin yazısı ve önceki dönemde hiç tahsilat yoksa gösterilecek yazı
const KARSILASTIRMA_YAZILARI = {
  bugun: ['düne göre', 'Dün tahsilat yoktu'],
  hafta: ['geçen haftaya göre', 'Geçen hafta bu zamana kadar tahsilat yoktu'],
  ay: ['geçen aya göre', 'Geçen ay bu zamana kadar tahsilat yoktu']
};

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
    return [tarihMetni(gunEkle(simdi, -pazartesiden)), tarihMetni(gunEkle(simdi, 6 - pazartesiden))];
  }
  if (donem === 'ay') {
    return [tarihMetni(new Date(yil, ay, 1)), tarihMetni(new Date(yil, ay + 1, 0))];
  }
  return [null, null];
}

// Yüzde karşılaştırması için önceki dönemin AYNI SÜREDEKİ kısmı ("Tümü" için null):
//   Bugün    -> dün
//   Bu Hafta -> geçen haftanın pazartesisinden geçen haftanın bugünkü gününe
//   Bu Ay    -> geçen ayın 1'inden geçen ayın bugünkü gününe (o ay kısaysa ayın son günü)
// Böylece yarım kalan hafta/ay, geçen haftanın/ayın tamamıyla karşılaştırılıp
// hep "düşüş" gibi görünmez.
function oncekiAralik(donem) {
  const simdi = new Date();
  if (donem === 'bugun') {
    const dun = tarihMetni(gunEkle(simdi, -1));
    return [dun, dun];
  }
  if (donem === 'hafta') {
    const pazartesiden = (simdi.getDay() + 6) % 7;
    return [tarihMetni(gunEkle(simdi, -pazartesiden - 7)), tarihMetni(gunEkle(simdi, -7))];
  }
  if (donem === 'ay') {
    const yil = simdi.getFullYear();
    const ay = simdi.getMonth();
    const gecenAyinSonGunu = new Date(yil, ay, 0).getDate();
    return [tarihMetni(new Date(yil, ay - 1, 1)),
      tarihMetni(new Date(yil, ay - 1, Math.min(simdi.getDate(), gecenAyinSonGunu)))];
  }
  return null;
}

// "14 Ekim 2026" veya "12 Ekim 2026 – 18 Ekim 2026" veya "Tüm kayıtlar"
function aralikYazisi(bas, bit) {
  if (!bas) return 'Tüm kayıtlar';
  return bas === bit ? tarihYaz(bas) : `${tarihYaz(bas)} – ${tarihYaz(bit)}`;
}

// Raporlar için gereken tüm veriyi bir kerede alır
async function raporVerisiGetir() {
  const [siparisler, giderler, musteriler] =
    await Promise.all([siparisleriGetir(), giderleriGetir(), musterileriGetir()]);
  return { siparisler, giderler, musteriler };
}

// İki tarih arasının (bas/bit null ise sınırsız) rakamlarını hesaplar.
//   Tahsilat : ödeme tarihi bu aralıkta olanlar (kasaya/bankaya giren para), yönteme göre
//   Gider    : gider tarihi bu aralıkta olanlar, türe göre
//   Ciro     : sipariş tarihi bu aralıkta olan siparişlerin toplamı
//   Net (iş) : ciro − gider
//   Kasa     : NAKİT tahsilat − gider (kart ve havale kasaya girmez)
// Yöntemi/türü bilinmeyen eski kayıtlar "belirsiz" olarak ayrı toplanır.
function donemRaporu(veri, bas, bit) {
  const aralikta = tarih => !!tarih && (!bas || tarih >= bas) && (!bit || tarih <= bit);
  const toplam = liste => yuvarla(liste.reduce((t, x) => t + (Number(x.tutar) || 0), 0));
  const turlereGore = (liste, alan, turler) => {
    const sonuc = {};
    turler.forEach(tur => { sonuc[tur] = toplam(liste.filter(x => x[alan] === tur)); });
    sonuc.belirsiz = toplam(liste.filter(x => !turler.includes(x[alan])));
    return sonuc;
  };

  const siparisler = veri.siparisler.filter(s => aralikta(s.tarih));
  const odenenler = veri.siparisler.filter(s => s.odemeAlindi && aralikta(s.odemeTarihi));
  const giderler = veri.giderler.filter(g => aralikta(g.tarih));

  const ciro = toplam(siparisler);
  const tahsilat = toplam(odenenler);
  const gelir = turlereGore(odenenler, 'odemeYontemi', ODEME_YONTEMLERI);
  const gider = toplam(giderler);

  return {
    tahsilat: tahsilat,
    gelir: gelir,                                          // { Nakit, Kart, Havale, belirsiz }
    gider: gider,
    giderTurleri: turlereGore(giderler, 'tur', GIDER_TURLERI), // { Yakıt, Malzeme, Diğer, belirsiz }
    yeniMusteri: veri.musteriler.filter(m => aralikta(tarihMetni(new Date(m.olusturma)))).length,
    siparisSayisi: siparisler.length,
    metrekare: yuvarla(siparisler.reduce((t, s) => t + (Number(s.metrekare) || 0), 0)),
    parca: siparisler.reduce((t, s) => t + (Number(s.parcaSayisi) || 0), 0),
    ciro: ciro,
    net: yuvarla(ciro - gider),
    kasa: yuvarla(gelir.Nakit - gider),
    odenmemis: toplam(siparisler.filter(s => !s.odemeAlindi))
  };
}

// Tahsilatın önceki döneme göre değişimi: "▲ %12 düne göre" (yeşil/kırmızı/gri)
function degisimHTML(donem, veri, buDonemTahsilat) {
  const onceki = oncekiAralik(donem);
  if (!onceki) return ''; // "Tümü" için karşılaştırma yok
  const [etiket, yokYazisi] = KARSILASTIRMA_YAZILARI[donem];
  const oncekiTahsilat = donemRaporu(veri, onceki[0], onceki[1]).tahsilat;

  if (oncekiTahsilat === 0) return `<div class="degisim ayni">${yokYazisi}</div>`;
  const yuzde = Math.round((buDonemTahsilat - oncekiTahsilat) / oncekiTahsilat * 100);
  if (yuzde > 0) return `<div class="degisim artis">▲ %${yuzde} ${etiket}</div>`;
  if (yuzde < 0) return `<div class="degisim dusus">▼ %${-yuzde} ${etiket}</div>`;
  return `<div class="degisim ayni">■ %0 ${etiket}</div>`;
}

// Üçlü küçük kutular: Nakit/Kart/Havale veya Yakıt/Malzeme/Diğer
function ucluKutuHTML(adlar, tutarlar) {
  return `<div class="uclu">${adlar.map(ad => `
    <div class="mini-kutu">
      <div class="mini-baslik">${guvenli(ad)}</div>
      <div class="mini-deger">${paraKisa(tutarlar[ad])}</div>
    </div>`).join('')}</div>`;
}

// Bir dönemin kartını ve altındaki Ciro/Net/Kasa/Ödenmemiş kutularını çizer
// (Yönetici ekranı ve Gün Özeti ekranı ortak kullanır)
function donemCiz(donem, veri, kartId, finansId) {
  const [bas, bit] = donemAraligi(donem);
  const r = donemRaporu(veri, bas, bit);
  const belirsizNotu = (tutar, yazi) => tutar > 0 ? `<p class="kucuk-not">${yazi}: ${paraKisa(tutar)}</p>` : '';

  document.getElementById(kartId).innerHTML = `
    <div class="donem-karti">
      <div class="donem-ust">
        <span class="donem-adi">${guvenli(DONEM_ADLARI[donem])}</span>
        <span class="donem-tarih">${guvenli(aralikYazisi(bas, bit))}</span>
      </div>
      <div class="tahsilat-satiri">
        <span class="tahsilat-etiket">Tahsilat</span>
        <span class="tahsilat-tutar">${paraKisa(r.tahsilat)}</span>
      </div>
      ${degisimHTML(donem, veri, r.tahsilat)}

      <div class="kart-bolum-baslik gelir"><span>Gelir</span></div>
      ${ucluKutuHTML(ODEME_YONTEMLERI, r.gelir)}
      ${belirsizNotu(r.gelir.belirsiz, 'Yöntemi belirtilmemiş ödemeler')}

      <div class="kart-bolum-baslik gider"><span>Gider</span><span>${paraKisa(r.gider)}</span></div>
      ${ucluKutuHTML(GIDER_TURLERI, r.giderTurleri)}
      ${belirsizNotu(r.giderTurleri.belirsiz, 'Türü belirtilmemiş giderler')}

      <div class="gostergeler">
        <div class="gosterge"><div class="gosterge-deger">+${r.yeniMusteri}</div><div class="gosterge-ad">Yeni müşteri</div></div>
        <div class="gosterge"><div class="gosterge-deger">${r.siparisSayisi}</div><div class="gosterge-ad">Sipariş</div></div>
        <div class="gosterge"><div class="gosterge-deger">${sayiYaz(r.metrekare)}</div><div class="gosterge-ad">m²</div></div>
        <div class="gosterge"><div class="gosterge-deger">${r.parca}</div><div class="gosterge-ad">Parça</div></div>
      </div>
    </div>`;

  const kutu = (baslik, deger, not, sinif = '') => `
    <div class="ozet-kutu ${sinif}">
      <div class="ozet-baslik">${baslik}</div>
      <div class="ozet-deger">${paraKisa(deger)}</div>
      <div class="ozet-not">${not}</div>
    </div>`;
  document.getElementById(finansId).innerHTML =
    kutu('Ciro', r.ciro, 'sipariş tarihine göre') +
    kutu('Net (iş)', r.net, 'ciro − gider', r.net < 0 ? 'olumsuz' : '') +
    kutu('Kasa', r.kasa, 'nakit tahsilat − gider', r.kasa < 0 ? 'olumsuz' : 'olumlu') +
    kutu('Ödenmemiş', r.odenmemis, 'alınacak para');
}

// Dönem butonlarında (Bugün / Bu Hafta / ...) seçili olanı işaretler
function donemButonlariniIsaretle() {
  document.querySelectorAll('.donem-secici button').forEach(b =>
    b.classList.toggle('secili', b.dataset.donem === secilenDonem));
}

// Dönem butonuna basınca dönemi değiştir ve bulunulan ekranı yeniden çiz
document.querySelectorAll('.donem-secici').forEach(grup =>
  grup.addEventListener('click', olay => {
    const buton = olay.target.closest('button[data-donem]');
    if (!buton) return;
    secilenDonem = buton.dataset.donem;
    sayfayiCiz();
  }));


/* ===================== 5. EKRANLAR ARASI GEÇİŞ VE ALT MENÜ =====================
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
     #/giderler                  -> Gider Listesi
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
  } else if (sayfa === 'giderler') {
    await giderListesiniCiz();
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


/* ===================== 6. ANA EKRAN ===================== */

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
          <span class="durum-adi">${guvenli(durum)}${not}</span>
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
    await yedekle(); // Telefonda paylaş menüsü açılır
    yedekHatirlaticisiniCiz(await sonYedekZamani());
  }));


/* ===================== 7. DURUM LİSTESİ ===================== */

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


/* ===================== 8. GÜN ÖZETİ ===================== */

async function gunOzetiniCiz() {
  const cizim = cizimBaslat();
  const veri = await raporVerisiGetir();
  if (cizimEskidi(cizim)) return;

  ekranGoster('ekran-gun-ozeti', 'Gün Özeti', '/', 'ana');

  // Yönetici'deki "Bugün" kartının aynısı: iki ekran hep aynı rakamı gösterir
  donemCiz('bugun', veri, 'gun-ozeti-karti', 'gun-ozeti-finans');

  const bugunTarihi = bugun();
  const siparisler = veri.siparisler
    .filter(s => s.tarih === bugunTarihi)
    .sort((a, b) => a.no - b.no);
  const musteriler = musteriHaritasi(veri.musteriler);
  document.getElementById('gun-siparisleri').innerHTML =
    siparisler.map(s => siparisSatiriHTML(s, musteriler, false)).join('');
  document.getElementById('gun-bos').hidden = siparisler.length > 0;
}


/* ===================== 9. GİDER FORMU ===================== */

const giderFormu = document.getElementById('gider-formu');
secimGrubuDoldur('gider-turu-secenekleri', 'tur', GIDER_TURLERI);

function giderFormunuCiz() {
  cizimBaslat(); // Bekleyen eski çizimler bu formun üstüne yazmasın
  ekranGoster('ekran-gider-formu', 'Gider Ekle', '/', null);
  giderFormu.tarih.value = bugun();
  giderFormu.tutar.value = '';
  giderFormu.aciklama.value = '';
  secimYap(giderFormu, 'tur', null); // Tür bilerek seçili GELMEZ; kullanıcı seçmeli
  alanHatalariniTemizle(giderFormu);
}

giderFormu.addEventListener('submit', olay => {
  olay.preventDefault();
  islemSirasinda(giderFormu.querySelector('[type="submit"]'), async () => {
    alanHatalariniTemizle(giderFormu);
    const tutar = sayiOku(giderFormu.tutar.value);
    const tur = giderFormu.tur.value;

    if (!giderFormu.tarih.value) alanHatasiGoster(giderFormu, 'tarih', 'Tarih seçin.');
    if (tutar === null || tutar <= 0) alanHatasiGoster(giderFormu, 'tutar', 'Geçerli bir tutar yazın (örn: 450 veya 99,90).');
    if (!GIDER_TURLERI.includes(tur)) alanHatasiGoster(giderFormu, 'tur', 'Gider türünü seçin: Yakıt, Malzeme veya Diğer.');
    if (formdaHataVar(giderFormu)) return;

    const gider = await veriIslemi(() => giderEkle({
      tarih: giderFormu.tarih.value,
      tutar: yuvarla(tutar),
      tur: tur,
      aciklama: giderFormu.aciklama.value.trim()
    }));
    if (!gider) return; // Uyarı gösterildi; form olduğu gibi kalır

    bildirimGoster(`Gider eklendi: ${tur} ${paraYaz(tutar)}`);
    geriGit('/');
  });
});


/* ===================== 10. SİPARİŞ BUL ===================== */

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


/* ===================== 11. MÜŞTERİLER ===================== */

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
    // Harita ikonu satır butonunun DIŞINDA durur: basınca sadece harita açılır, müşteri kartı açılmaz
    const adres = String(m.adres || '').trim();
    return `
      <li class="musteri-satir-kapsayici">
        <button class="musteri-satiri" data-id="${guvenli(m.id)}">
          <div class="musteri-adi">${guvenli(m.ad)} ${guvenli(m.soyad)}${sanalEtiketiHTML(m)}${rozet}</div>
          <div class="musteri-alt">${guvenli(m.telefon)}</div>
          ${adres ? `<div class="musteri-alt musteri-adres">${guvenli(adres)}</div>` : ''}
        </button>
        ${haritaIkonuHTML(adres)}
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


/* ===================== 12. MÜŞTERİ DETAYI ===================== */

let aktifMusteriId = null;

// Sipariş kartındaki ödeme bölümü:
//   ödenmemişse -> "Ödeme al:" [Nakit] [Kart] [Havale]  (yöntem seçmeden ödeme kaydedilemez)
//   ödenmişse   -> "✓ Nakit · 15 Ekim 2026"  [Geri al]
function odemeBolumuHTML(s) {
  const id = guvenli(s.id);
  if (s.odemeAlindi) {
    const yontem = s.odemeYontemi || 'Ödeme alındı (yöntem belirtilmemiş)';
    return `
      <div class="odeme-durumu">
        <span>✓ ${guvenli(yontem)} · ${tarihYaz(s.odemeTarihi)}</span>
        <button class="buton buton-kucuk buton-gri" data-islem="odeme-geri" data-id="${id}">Geri al</button>
      </div>`;
  }
  return `
    <div class="odeme-al">
      <span class="odeme-al-baslik">Ödeme al:</span>
      <div class="uclu">${ODEME_YONTEMLERI.map(y =>
        `<button class="buton buton-kucuk" data-islem="ode" data-yontem="${guvenli(y)}" data-id="${id}">${guvenli(y)}</button>`).join('')}
      </div>
    </div>`;
}

// vurguSiparisId verilirse o sipariş kartı çerçeveli gösterilir ve ekran ona kaydırılır
async function musteriDetayiniCiz(musteriId, vurguSiparisId) {
  const cizim = cizimBaslat();
  const [musteri, tumSiparisler] = await Promise.all([musteriGetir(musteriId), musterininSiparisleri(musteriId)]);
  if (cizimEskidi(cizim)) return;
  if (!musteri) { yerineGit('/musteriler'); return; }
  aktifMusteriId = musteriId;

  const yeniEkran = ekranGoster('ekran-musteri-detay', musteri.ad + ' ' + musteri.soyad, '/musteriler', 'musteriler');

  document.getElementById('detay-isim').innerHTML =
    `${guvenli(musteri.ad)} ${guvenli(musteri.soyad)}${sanalEtiketiHTML(musteri)}`;
  const telefon = document.getElementById('detay-telefon');
  telefon.textContent = musteri.telefon;
  telefon.href = 'tel:' + musteri.telefon.replace(/[^\d+]/g, ''); // Basınca arama açılır
  // Adres + yanında harita ikonu (adres boşsa ikisi de görünmez)
  const detayAdres = String(musteri.adres || '').trim();
  document.getElementById('detay-adres').innerHTML =
    detayAdres ? `<span>${guvenli(detayAdres)}</span>${haritaIkonuHTML(detayAdres)}` : '';
  document.getElementById('detay-kayit').textContent =
    'Kayıt: ' + tarihYaz(tarihMetni(new Date(musteri.olusturma)));

  // Siparişler: en yeni tarih en üstte
  const siparisler = tumSiparisler.sort((a, b) =>
    b.tarih.localeCompare(a.tarih) || (b.olusturma || 0) - (a.olusturma || 0));

  document.getElementById('siparis-listesi').innerHTML = siparisler.map(s => {
    const secenekler = DURUMLAR.map(d =>
      `<option value="${guvenli(d)}" ${d === s.durum ? 'selected' : ''}>${guvenli(d)}</option>`).join('');
    const teslim = s.teslimTarihi ? ` · Teslim: ${tarihYaz(s.teslimTarihi)}` : '';
    const vurgu = s.id === vurguSiparisId ? 'vurgulu' : '';
    return `
      <li class="siparis ${durumSinifi(s.durum)} ${vurgu}">
        <div class="siparis-ust">
          <span class="siparis-tarih"><span class="siparis-no">#${guvenli(s.no)}</span>${sanalEtiketiHTML(s)} ${tarihYaz(s.tarih)}</span>
          <span class="siparis-tutar">${paraYaz(s.tutar)}</span>
        </div>
        <div class="siparis-detay">${parcaVeMetrekare(s)} × ${paraYaz(s.birimFiyat)}${teslim}</div>
        <select data-islem="durum" data-id="${guvenli(s.id)}" aria-label="Sipariş durumu">${secenekler}</select>
        ${odemeBolumuHTML(s)}
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

  if (buton.dataset.islem === 'ode') {
    // Ödeme, seçilen yöntemle (Nakit/Kart/Havale) birlikte kaydedilir
    const yontem = buton.dataset.yontem;
    islemSirasinda(buton, async () => {
      const siparis = await siparisiGuncelleVeCiz(siparisId, s => odemeAyarla(s, true, yontem));
      if (siparis) bildirimGoster(`#${siparis.no} ödendi: ${yontem}`);
    });
  } else if (buton.dataset.islem === 'odeme-geri') {
    if (!confirm('Bu siparişin ödeme kaydı geri alınsın mı? Tahsilattan düşer.')) return;
    islemSirasinda(buton, async () => {
      const siparis = await siparisiGuncelleVeCiz(siparisId, s => odemeAyarla(s, false));
      if (siparis) bildirimGoster(`#${siparis.no} ödeme kaydı geri alındı`);
    });
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


/* ===================== 13. MÜŞTERİ FORMU ===================== */

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
  alanHatalariniTemizle(musteriFormu);
}

musteriFormu.addEventListener('submit', olay => {
  olay.preventDefault(); // Sayfanın yenilenmesini engelle
  islemSirasinda(musteriFormu.querySelector('[type="submit"]'), async () => {
    alanHatalariniTemizle(musteriFormu);
    const bilgiler = {
      ad: musteriFormu.ad.value.trim(),
      soyad: musteriFormu.soyad.value.trim(),
      telefon: musteriFormu.telefon.value.trim(),
      adres: musteriFormu.adres.value.trim()
    };
    if (!bilgiler.ad) alanHatasiGoster(musteriFormu, 'ad', 'Adı yazın.');
    if (!bilgiler.soyad) alanHatasiGoster(musteriFormu, 'soyad', 'Soyadı yazın.');
    if (!bilgiler.telefon) alanHatasiGoster(musteriFormu, 'telefon', 'Telefon numarasını yazın.');
    if (formdaHataVar(musteriFormu)) return;

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


/* ===================== 14. SİPARİŞ FORMU ===================== */

const siparisFormu = document.getElementById('siparis-formu');
let formMusteriId = null;
let duzenlenenSiparisId = null; // null ise yeni sipariş ekleniyor
let formBirimFiyat = 0;         // Bu siparişte kullanılacak birim fiyat

// Durum seçeneklerini ve ödeme yöntemi butonlarını bir kez doldur
siparisFormu.durum.innerHTML = DURUMLAR.map(d => `<option value="${guvenli(d)}">${guvenli(d)}</option>`).join('');
secimGrubuDoldur('odeme-yontemi-secenekleri', 'odemeYontemi', ODEME_YONTEMLERI);

// "Ödeme alındı" işaretliyse ödeme yöntemi seçimi görünür
function odemeYontemiAlaniniGuncelle() {
  const goster = siparisFormu.odemeAlindi.checked;
  document.getElementById('odeme-yontemi-alani').hidden = !goster;
  if (!goster) alanHatalariniTemizle(siparisFormu, 'odemeYontemi');
}
siparisFormu.odemeAlindi.addEventListener('change', odemeYontemiAlaniniGuncelle);

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
  // Parça sayısı ve ödeme yöntemi bilerek boş gelir; kullanıcı girmek/seçmek zorunda
  siparisFormu.parcaSayisi.value = siparis && siparis.parcaSayisi ? String(siparis.parcaSayisi) : '';
  siparisFormu.durum.value = siparis ? siparis.durum : DURUMLAR[0];
  siparisFormu.odemeAlindi.checked = siparis ? !!siparis.odemeAlindi : false;
  secimYap(siparisFormu, 'odemeYontemi', siparis ? siparis.odemeYontemi : null);
  odemeYontemiAlaniniGuncelle();
  alanHatalariniTemizle(siparisFormu);
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
    alanHatalariniTemizle(siparisFormu);
    const metrekare = sayiOku(siparisFormu.metrekare.value);
    const parcaSayisi = tamSayiOku(siparisFormu.parcaSayisi.value);
    const odemeAlindi = siparisFormu.odemeAlindi.checked;
    const odemeYontemi = siparisFormu.odemeYontemi.value;

    // Eksik/hatalı her alanın altında uyarı çıkar
    if (!siparisFormu.tarih.value) alanHatasiGoster(siparisFormu, 'tarih', 'Tarih seçin.');
    if (metrekare === null || metrekare <= 0) {
      alanHatasiGoster(siparisFormu, 'metrekare', 'Geçerli bir metrekare yazın (örn: 6,5).');
    }
    if (!parcaSayisi || parcaSayisi < 1) {
      alanHatasiGoster(siparisFormu, 'parcaSayisi', 'Parça sayısını yazın (kaç halı?).');
    }
    if (odemeAlindi && !ODEME_YONTEMLERI.includes(odemeYontemi)) {
      alanHatasiGoster(siparisFormu, 'odemeYontemi', 'Ödeme yöntemini seçin: Nakit, Kart veya Havale.');
    }
    if (formdaHataVar(siparisFormu)) return;

    // Formdaki bilgileri siparişe işler (yeni siparişte de, düzenlemede de aynı)
    const formuIsle = s => {
      Object.assign(s, {
        tarih: siparisFormu.tarih.value,
        metrekare: metrekare,
        parcaSayisi: parcaSayisi,
        birimFiyat: formBirimFiyat,
        tutar: yuvarla(metrekare * formBirimFiyat)
      });
      // Teslim ve ödeme tarihleri bu fonksiyonlarda ayarlanır
      durumAyarla(s, siparisFormu.durum.value);
      odemeAyarla(s, odemeAlindi, odemeYontemi);
    };

    let siparis;
    if (duzenlenenSiparisId) {
      siparis = await veriIslemi(() => siparisGuncelle(duzenlenenSiparisId, formuIsle));
    } else {
      const taslak = {
        musteriId: formMusteriId, durum: null,
        odemeAlindi: false, odemeTarihi: null, odemeYontemi: null, teslimTarihi: null
      };
      formuIsle(taslak);
      siparis = await veriIslemi(() => siparisEkle(taslak)); // id, no ve zaman bilgilerini veri.js verir
    }
    if (!siparis) return; // Uyarı gösterildi; form olduğu gibi kalır

    bildirimGoster(duzenlenenSiparisId ? 'Sipariş güncellendi' : `Sipariş #${siparis.no} eklendi`);
    geriGit('/musteri/' + formMusteriId);
  });
});


/* ===================== 15. YÖNETİCİ VE GİDER LİSTESİ ===================== */

async function yoneticiCiz() {
  const cizim = cizimBaslat();
  const veri = await raporVerisiGetir();
  if (cizimEskidi(cizim)) return;

  ekranGoster('ekran-yonetici', 'Yönetici', null, 'yonetici');
  donemButonlariniIsaretle();
  donemCiz(secilenDonem, veri, 'yonetici-karti', 'yonetici-finans');
}

document.getElementById('ayarlara-git').addEventListener('click', () => git('/ayarlar'));
document.getElementById('gider-listesine-git').addEventListener('click', () => git('/giderler'));

async function giderListesiniCiz() {
  const cizim = cizimBaslat();
  const tumGiderler = await giderleriGetir();
  if (cizimEskidi(cizim)) return;

  ekranGoster('ekran-giderler', 'Gider Listesi', '/yonetici', 'yonetici');
  donemButonlariniIsaretle();

  const [bas, bit] = donemAraligi(secilenDonem);
  document.getElementById('giderler-araligi').textContent = `${DONEM_ADLARI[secilenDonem]} · ${aralikYazisi(bas, bit)}`;

  // Bu dönemin giderleri, en yenisi üstte
  const giderler = tumGiderler
    .filter(g => (!bas || g.tarih >= bas) && (!bit || g.tarih <= bit))
    .sort((a, b) => b.tarih.localeCompare(a.tarih) || (b.olusturma || 0) - (a.olusturma || 0));

  const toplam = yuvarla(giderler.reduce((t, g) => t + (Number(g.tutar) || 0), 0));
  document.getElementById('giderler-toplam').textContent = paraYaz(toplam);

  document.getElementById('gider-listesi').innerHTML = giderler.map(g => `
    <li class="gider-satiri">
      <div class="gider-bilgi">
        <div class="gider-aciklama">${guvenli(g.aciklama || g.tur || 'Gider')}</div>
        <div class="musteri-alt">
          <span class="etiket tur-etiketi">${guvenli(g.tur || 'Türü belirtilmemiş')}</span> ${tarihYaz(g.tarih)}
        </div>
      </div>
      <span class="gider-tutar">${paraYaz(g.tutar)}</span>
      <button class="buton buton-kucuk buton-tehlike" data-id="${guvenli(g.id)}">Sil</button>
    </li>`).join('');
  document.getElementById('gider-yok').hidden = giderler.length > 0;
}

document.getElementById('gider-listesinden-ekle').addEventListener('click', () => git('/gider-formu'));

document.getElementById('gider-listesi').addEventListener('click', olay => {
  const buton = olay.target.closest('button[data-id]');
  if (!buton) return;
  islemSirasinda(buton, async () => {
    const gider = (await giderleriGetir()).find(g => g.id === buton.dataset.id);
    if (!gider) return;
    const ad = gider.aciklama || gider.tur || 'Gider';
    if (!confirm(`"${ad}" (${paraYaz(gider.tutar)}) gideri silinsin mi?`)) return;
    if (await veriIslemi(() => giderSil(gider.id), SILME_HATASI)) {
      await sayfayiCiz();
      bildirimGoster('Gider silindi');
    }
  });
});


/* ===================== 16. AYARLAR VE YEDEKLEME ===================== */

const ayarlarFormu = document.getElementById('ayarlar-formu');

async function ayarlariCiz() {
  const cizim = cizimBaslat();
  const [ayarlar, sanalSayilar] = await Promise.all([ayarlariGetir(), sanalKayitSayilari()]);
  if (cizimEskidi(cizim)) return;

  ekranGoster('ekran-ayarlar', 'Ayarlar', '/yonetici', 'yonetici');
  ayarlarFormu.birimFiyat.value = String(ayarlar.birimFiyat).replace('.', ',');
  alanHatalariniTemizle(ayarlarFormu);
  yedekSorunlariniGoster([]);
  geriYuklemeAdiminiKapat();
  sanalBolumunuCiz(sanalSayilar);
  surumuGoster();
}

// --- Sanal (deneme) veriler ---
// Gösterim için yüklenen sanal kayıtlar ("sanal: true") varsa bölüm görünür.
function sanalBolumunuCiz(sayilar) {
  const toplam = sayilar.musteri + sayilar.siparis + sayilar.gider;
  document.getElementById('sanal-bolumu').hidden = toplam === 0;
  document.getElementById('sanal-sayilari').textContent =
    `Bu cihazda gösterim için yüklenmiş sanal kayıtlar var: ${sayilar.musteri} müşteri, ` +
    `${sayilar.siparis} sipariş, ${sayilar.gider} gider. Silerken gerçek kayıtlarınıza dokunulmaz.`;
}

document.getElementById('sanal-sil-butonu').addEventListener('click', olay =>
  islemSirasinda(olay.currentTarget, async () => {
    const sayilar = await sanalKayitSayilari();
    const soru = `${sayilar.musteri} sanal müşteri, ${sayilar.siparis} sanal sipariş ve ${sayilar.gider} sanal gider ` +
      'KALICI olarak silinecek (geri alınamaz).\n\nGerçek kayıtlarınıza dokunulmaz. Devam edilsin mi?';
    if (!confirm(soru)) return;

    const sonuc = await veriIslemi(sanalVerileriSil, SILME_HATASI);
    if (!sonuc) return;
    let mesaj = `Sanal veriler silindi: ${sonuc.musteri} müşteri, ${sonuc.siparis} sipariş, ${sonuc.gider} gider.`;
    if (sonuc.gercegeCevrilen > 0) {
      mesaj += `\n\n${sonuc.gercegeCevrilen} sanal müşteri, gerçek siparişleri olduğu için silinmedi; artık gerçek müşteri.`;
    }
    alert(mesaj);
    await ayarlariCiz();
  }));

ayarlarFormu.addEventListener('submit', olay => {
  olay.preventDefault();
  islemSirasinda(ayarlarFormu.querySelector('[type="submit"]'), async () => {
    alanHatalariniTemizle(ayarlarFormu);
    const fiyat = sayiOku(ayarlarFormu.birimFiyat.value);
    if (fiyat === null || fiyat <= 0) {
      alanHatasiGoster(ayarlarFormu, 'birimFiyat', 'Geçerli bir fiyat yazın (örn: 100 veya 112,50).');
      formdaHataVar(ayarlarFormu);
      return;
    }
    if (await veriIslemi(() => birimFiyatKaydet(yuvarla(fiyat)))) {
      bildirimGoster('Yeni fiyat: ' + paraYaz(yuvarla(fiyat)) + ' / m²');
    }
  });
});

// --- Yedek dosyasını kaydettirme ---
// Telefonda (iPhone/Android) paylaş menüsü açılır: iCloud Drive, Dosyalar, WhatsApp, Mail...
// Paylaşımı desteklemeyen cihazda (bilgisayar) dosya eskisi gibi indirilir.
// (iPhone'da ana ekrandan açılan uygulamada indirme sadece önizleme açıyor, dosya
//  kaydedilmiyordu; paylaş menüsü bu sorunu çözer.)
//
// Sonuç: 'tamam'      -> kaydedildi (telefon "paylaşım tamamlandı" dedi / dosya indi)
//        'vazgecildi' -> kullanıcı menüyü kapattı
//        'hata'       -> menü açılamadı
//
// DİKKAT: Telefon paylaş menüsünü SADECE kullanıcı bir butona dokunduğu anda açar.
// Bu fonksiyon bir buton tıklamasının içinden, araya uzun bekleme girmeden çağrılmalıdır.
async function yedekKaydet(veri, dosyaAdi) {
  const yedek = {
    uygulama: 'hali-yikama',
    yedekTarihi: new Date().toISOString(),
    ...veri // musteriler, siparisler, giderler, ayarlar (silinmişler dahil)
  };
  const dosya = new File([JSON.stringify(yedek, null, 2)], dosyaAdi, { type: 'application/json' });

  // Paylaşım (dosya olarak) destekleniyorsa paylaş menüsünü aç
  if (navigator.canShare && navigator.canShare({ files: [dosya] })) {
    try {
      await navigator.share({ files: [dosya], title: 'Halı Yıkama yedeği' });
      return 'tamam';
    } catch (hata) {
      if (hata && hata.name === 'AbortError') return 'vazgecildi'; // Menü kapatıldı
      console.error('Paylaşım açılamadı:', hata);
      return 'hata';
    }
  }

  // Desteklenmiyorsa (bilgisayar): dosyayı indir
  const baglanti = document.createElement('a');
  baglanti.href = URL.createObjectURL(dosya);
  baglanti.download = dosyaAdi;
  document.body.appendChild(baglanti);
  baglanti.click();
  baglanti.remove();
  setTimeout(() => URL.revokeObjectURL(baglanti.href), 5000);
  return 'tamam';
}

// Dosya adları için: "2026-10-15-1430"
function zamanEtiketi() {
  const simdi = new Date();
  return `${bugun()}-${String(simdi.getHours()).padStart(2, '0')}${String(simdi.getMinutes()).padStart(2, '0')}`;
}

// --- Yedekle: tüm veriyi (silinmişler dahil) yedek dosyası olarak kaydettirir ---
// Hem Ayarlar'daki "Yedekle" hem ana ekrandaki "Şimdi Yedekle" butonu bunu kullanır.
// "Son yedek" tarihi SADECE kaydetme gerçekten tamamlanırsa güncellenir.
async function yedekle() {
  const veri = await veriIslemi(tumVeriyiGetir, 'Yedek hazırlanamadı, tekrar deneyin.');
  if (!veri) return;

  const sonuc = await yedekKaydet(veri, `hali-yikama-yedek-${bugun()}.json`);
  if (sonuc === 'vazgecildi') {
    bildirimGoster('Yedek kaydedilmedi; "Son yedek" tarihi değişmedi.');
    return;
  }
  if (sonuc === 'hata') {
    hataGoster('Paylaşım açılamadı, tekrar deneyin.');
    return;
  }

  // Hatırlatıcı sıfırlansın (kaydedildi ama tarih yazılamazsa bunu da söyle)
  if (!await veriIslemi(sonYedekKaydet, 'Yedek kaydedildi ama yedek tarihi kaydedilemedi.')) return;
  bildirimGoster('Yedek kaydedildi');
}

document.getElementById('yedekle-butonu').addEventListener('click', olay =>
  islemSirasinda(olay.currentTarget, yedekle));

// --- Yedekten geri yükle: seçilen dosyadaki veriyi cihaza yazar ---
// Sıra: 1) dosyayı kontrol et (uygunsuzsa nedenleriyle reddet)
//       2) cihazda veri varsa: "Mevcut Veriyi Yedekle ve Devam Et" adımı;
//          kullanıcı butona basar, mevcut veri kaydedilir (paylaş menüsü / indirme).
//          Kaydetme tamamlanmazsa geri yükleme YAPILMAZ.
//       3) onay sor  4) yükle
// (2. adım ayrı bir buton çünkü telefon paylaş menüsünü dosya seçiminden sonra
//  kendiliğinden açmaz; kullanıcının bir butona dokunması gerekir.)
const yedekDosyasiSecici = document.getElementById('yedek-dosyasi');
let bekleyenYedek = null; // Kontrolden geçmiş, yüklenmeyi bekleyen yedek dosyası
const EN_FAZLA_SORUN = 5; // Kırmızı kutuda en fazla bu kadar sorun yazılır

// Uygunsuz yedek dosyasının nedenlerini Ayarlar'daki kırmızı kutuda gösterir.
// Boş liste verilirse kutuyu gizler. Yazılar textContent ile basılır (dosyadaki
// yazılar asla kod olarak çalışmaz).
function yedekSorunlariniGoster(sorunlar) {
  const kutu = document.getElementById('yedek-sorunlari');
  kutu.replaceChildren();
  kutu.hidden = sorunlar.length === 0;
  if (sorunlar.length === 0) return;

  const baslik = document.createElement('strong');
  baslik.textContent = 'Bu dosya yüklenmedi; cihazdaki veriye dokunulmadı. Nedenleri:';
  const liste = document.createElement('ul');
  sorunlar.slice(0, EN_FAZLA_SORUN).forEach(sorun => {
    const madde = document.createElement('li');
    madde.textContent = sorun;
    liste.appendChild(madde);
  });
  if (sorunlar.length > EN_FAZLA_SORUN) {
    const madde = document.createElement('li');
    madde.textContent = `ve ${sorunlar.length - EN_FAZLA_SORUN} sorun daha`;
    liste.appendChild(madde);
  }
  kutu.append(baslik, liste);
  kutu.scrollIntoView({ block: 'center' });
}

// Yüklenecek yedeğin özeti: "Yüklenecek yedekte 12 müşteri, 40 sipariş ve 5 gider var."
async function yedekOzeti(yedek) {
  const sayilar = await yedektekiKayitSayilari(yedek);
  return `Yüklenecek yedekte ${sayilar.musteri} müşteri, ${sayilar.siparis} sipariş ve ${sayilar.gider} gider var.`;
}

// "Mevcut Veriyi Yedekle ve Devam Et" adım kutusunu açar / kapatır
function geriYuklemeAdiminiGoster(ozet) {
  document.getElementById('geri-yukleme-bilgisi').textContent =
    `${ozet} Geri yüklemeden önce bu cihazdaki mevcut verinin yedeğini kaydetmelisiniz.`;
  document.getElementById('geri-yukleme-uyarisi').hidden = true;
  const kutu = document.getElementById('geri-yukleme-adimi');
  kutu.hidden = false;
  kutu.scrollIntoView({ block: 'center' });
}

function geriYuklemeAdiminiKapat() {
  bekleyenYedek = null;
  document.getElementById('geri-yukleme-adimi').hidden = true;
  document.getElementById('geri-yukleme-uyarisi').hidden = true;
}

// Son onaydan sonra yedeği cihaza yazar
async function yedektenGeriYukle(yedek) {
  // Eski sürüm yedeğiyse eksik alanlar (durum adları, numaralar, zamanlar) veri.js'de tamamlanır
  if (await veriIslemi(() => tumVeriyiDegistir(yedek),
      'Yedek geri yüklenemedi, tekrar deneyin. Cihazdaki veri değişmedi.')) {
    geriYuklemeAdiminiKapat();
    alert('Yedek başarıyla geri yüklendi.');
    await ayarlariCiz();
  }
}

document.getElementById('yedek-yukle-butonu').addEventListener('click', () => {
  yedekDosyasiSecici.value = ''; // Aynı dosya tekrar seçilebilsin
  yedekDosyasiSecici.click();
});

// "Mevcut Veriyi Yedekle ve Devam Et": önce mevcut veri kaydedilir, sonra onay, sonra yükleme
document.getElementById('once-yedekle-butonu').addEventListener('click', olay =>
  islemSirasinda(olay.currentTarget, async () => {
    if (!bekleyenYedek) return;
    const mevcut = await veriIslemi(tumVeriyiGetir, 'Mevcut veri okunamadı; geri yükleme yapılmadı.');
    if (!mevcut) return;

    const sonuc = await yedekKaydet(mevcut, `hali-yikama-geri-yukleme-oncesi-${zamanEtiketi()}.json`);
    if (sonuc !== 'tamam') {
      // Kaydedilmedi: geri yükleme YAPILMAZ, uyarı kutuda kalır
      document.getElementById('geri-yukleme-uyarisi').hidden = false;
      if (sonuc === 'hata') hataGoster('Paylaşım açılamadı, tekrar deneyin.');
      return;
    }
    document.getElementById('geri-yukleme-uyarisi').hidden = true;

    const soru = `Mevcut veriniz kaydedildi.\n\n${await yedekOzeti(bekleyenYedek)}\n\n` +
      'Devam ederseniz bu cihazdaki mevcut veri yedektekiyle değiştirilecek. Devam edilsin mi?';
    if (!confirm(soru)) {
      geriYuklemeAdiminiKapat();
      bildirimGoster('Geri yükleme yapılmadı');
      return;
    }
    await yedektenGeriYukle(bekleyenYedek);
  }));

document.getElementById('geri-yukleme-vazgec').addEventListener('click', () => {
  geriYuklemeAdiminiKapat();
  bildirimGoster('Geri yükleme yapılmadı');
});

yedekDosyasiSecici.addEventListener('change', () => {
  const dosya = yedekDosyasiSecici.files[0];
  if (!dosya) return;
  yedekSorunlariniGoster([]);
  geriYuklemeAdiminiKapat(); // Yeni dosya seçildi; önceki bekleyen adım iptal

  const okuyucu = new FileReader();
  okuyucu.onload = async () => {
    let yedek;
    try {
      yedek = JSON.parse(okuyucu.result);
    } catch (hata) {
      yedekSorunlariniGoster(['Dosya okunamadı: bu bir yedek dosyası (.json) değil.']);
      return;
    }

    // 1) Alan türlerini kontrol et; tek bir sorun bile varsa dosya yüklenmez
    const sorunlar = await yedekKontrolEt(yedek);
    if (sorunlar.length > 0) {
      yedekSorunlariniGoster(sorunlar);
      return;
    }

    // 2) Cihazda kayıt varsa (silinmişler dahil): önce yedekleme adımı (butonla)
    const mevcut = await veriIslemi(tumVeriyiGetir, 'Mevcut veri okunamadı; geri yükleme yapılmadı.');
    if (!mevcut) return;
    const ozet = await yedekOzeti(yedek);
    if (mevcut.musteriler.length + mevcut.siparisler.length + mevcut.giderler.length > 0) {
      bekleyenYedek = yedek;
      geriYuklemeAdiminiGoster(ozet);
      return; // Devamı "Mevcut Veriyi Yedekle ve Devam Et" butonunda
    }

    // Cihaz boş: kaydedilecek veri yok, doğrudan onay sor
    if (!confirm(`${ozet}\n\nDevam edilsin mi?`)) return;
    await yedektenGeriYukle(yedek);
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


/* ===================== 17. SERVICE WORKER =====================
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
