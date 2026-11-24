import assert from 'node:assert/strict'
import { browserAudit } from './helpers/browserAudit.mjs'

// E2E halaman Eksekusi Tidak Masuk: data fixture lewat api yang di-patch,
// lalu klik "Buat Surat" → dialog pratinjau → "Unduh PDF" menghasilkan PDF
// asli (jsPDF + gambar kop/stempel dari folder publik). Tanpa database.
const fixture = `
import { createApp, h } from 'vue';
import Toast from 'vue-toastification';
import { createVuetify } from 'vuetify';
import * as components from 'vuetify/components';
import * as directives from 'vuetify/directives';
import 'vuetify/styles';
import '/src/assets/design-system.css';
import '/src/assets/main.css';
import '/src/assets/theme.css';
import TidakMasuk from '/src/views/dashboard/TidakMasukEksekusiView.vue';
import { api } from '/src/api/axios.ts';
document.documentElement.dataset.theme = 'light';
const rows = [
  {Kode_Absensi:'4703',Nik:'0411221197',Nama:'WAWA ANANDA PRATAMA',Bagian:'Produksi',Pabrik:'P04',
   Alamat:'Jl. Jeron No. 1, Boyolali',Nama_Pabrik:'PABRIK 4 (JERON)',Induk_Pabrik:'P04',Hari:4},
  {Kode_Absensi:'4747',Nik:'0201221120',Nama:'ARI MUNADI',Bagian:'Gudang',Pabrik:'K06',
   Alamat:'Jl. Boyolali No. 2',Nama_Pabrik:'BOYOLALI',Induk_Pabrik:'K06',Hari:3},
  {Kode_Absensi:'5123',Nik:'009251499',Nama:'DIAS PUTRI WAHYUNINGSARI',Bagian:'Store',Pabrik:'SL1',
   Alamat:'Jl. Slamet Riyadi, Solo',Nama_Pabrik:'STORE SALE',Induk_Pabrik:'SL1',Hari:3},
];
const tanggal = ['2026-11-14','2026-11-16','2026-11-17','2026-11-18'];
// Mock ENDPOINT NOMOR SURAT (database): counter per bulan + nomor yang MELEKAT
// pada data (nik+nama+rentang tanggal).
//   GET  = peek  → nomor data ini bila sudah terbit, atau urut+1
//   POST = kunci → pakai nomor lama (idempoten), simpan nomor manual, atau urut+1
window.__nomorDb = { urut: 4, get: 0, post: 0, terbit: {} };
const ROMAWI_MOCK = ['I','II','III','IV','V','VI','VII','VIII','IX','X','XI','XII'];
const nomorMock = (urut, bulan) => {
  const [th, bl] = String(bulan).split('-');
  return urut + '/HRD&GA/' + ROMAWI_MOCK[Number(bl) - 1] + '/' + th;
};
const kunciMock = (b) =>
  [String((b && b.nik) || ''), String((b && b.nama) || '').toUpperCase(),
    (b && b.tgl_awal) || '', (b && b.tgl_akhir) || ''].join('|');
const nomorApi = u => String(u).includes('surat-panggilan/nomor');
api.get = async (url, cfg) => {
  if (String(url).includes('tidak-masuk-berurut'))
    return { data: { success: true, data: { rows, tanggal } } };
  if (nomorApi(url)) {
    window.__nomorDb.get++;
    const p = (cfg && cfg.params) || {};
    const ada = window.__nomorDb.terbit[kunciMock(p)];
    if (ada) return { data: { success: true, data: { ...ada, tersimpan: true } } };
    const urut = window.__nomorDb.urut + 1;
    return { data: { success: true, data: {
      bulan: p.bulan, urut, nomor: nomorMock(urut, p.bulan), tersimpan: false } } };
  }
  return { data: { data: null } };
};
api.post = async (url, body) => {
  if (nomorApi(url)) {
    window.__nomorDb.post++;
    const b = body || {};
    const kunci = kunciMock(b);
    const ada = window.__nomorDb.terbit[kunci];
    if (ada) { // sudah terbit → nomor SAMA (nomor ketikan HR boleh menimpa)
      if (b.nomor && b.nomor !== ada.nomor) ada.nomor = b.nomor;
      return { data: { success: true, data: { ...ada } } };
    }
    if (b.nomor) { // nomor manual → TANPA menaikkan counter
      const t = { bulan: b.bulan, urut: 0, nomor: b.nomor, tersimpan: true };
      window.__nomorDb.terbit[kunci] = t;
      return { data: { success: true, data: t } };
    }
    window.__nomorDb.urut += 1;
    const t = { bulan: b.bulan, urut: window.__nomorDb.urut,
      nomor: nomorMock(window.__nomorDb.urut, b.bulan), tersimpan: true };
    window.__nomorDb.terbit[kunci] = t;
    return { data: { success: true, data: t } };
  }
  return { data: { data: null } };
};
window.fixture = { rows, tanggal };
createApp({ render: () => h('main', { class: 'app-shell', style: 'height:95vh;padding:12px' }, h(TidakMasuk)) })
  .use(Toast).use(createVuetify({ components, directives })).mount('#app');
`;

await browserAudit('tidak-masuk-eksekusi', fixture, async ({ evaluate, screenshot }) => {
  const waitFor = expression => evaluate(`(async()=>{for(let i=0;i<700;i++){if(${expression})return true;await new Promise(r=>setTimeout(r,50));}throw Error('Timed out: '+${JSON.stringify(expression)});})()`);

  /* Nomor harapan — counter database mock diawali urut 4:
   *   dialog 1 → peek 5, Unduh PERTAMA → POST → urut 5 (nomor 5/…)
   *   dialog 2 → peek 6, Unduh        → POST → urut 6 (nomor 6/…)
   *   dialog 3 → peek 7, tapi HR mengetik manual 99/… → TANPA POST.
   * Beda dari hitungan localStorage (mulai 1) → membuktikan sumber DATABASE. */
  const ROM = ['I','II','III','IV','V','VI','VII','VIII','IX','X','XI','XII'];
  const kini = new Date();
  const AKHIR = `${ROM[kini.getMonth()]}/${kini.getFullYear()}`;
  const NOMOR_1 = `5/HRD&GA/${AKHIR}`;
  const NOMOR_2 = `6/HRD&GA/${AKHIR}`;
  const NOMOR_3 = `7/HRD&GA/${AKHIR}`;
  const NOMOR_MANUAL = `99/HRD&GA/${AKHIR}`;

  /* ── Daftar tampil lengkap dengan label tahap per baris ── */
  await waitFor("document.querySelectorAll('.tbl tbody tr').length===3");
  assert.deepEqual(
    await evaluate("[...document.querySelectorAll('.badge-tahap')].map(el=>el.textContent.trim())"),
    ['4 hari · Panggilan 2', '3 hari · Panggilan 1', '3 hari · Panggilan 1']);
  const ringkas = await evaluate("document.querySelector('.summary-info').textContent.replace(/\\s+/g,' ')");
  assert.match(ringkas, /Tahap 3 hari \(Panggilan 1\): 2/);
  assert.match(ringkas, /Tahap 4 hari \(Panggilan 2\): 1/);
  assert.match(ringkas, /Acuan 4 tanggal kerja: 14\/11\/2026, 16\/11\/2026, 17\/11\/2026, 18\/11\/2026/);
  assert.ok(await evaluate("document.body.textContent.includes('SURAT PANGGILAN KARYAWAN develop.docx')"),
    'subjudul merujuk template Word');

  /* ── Pencarian menyaring daftar ── */
  await evaluate(`(()=>{const i=document.querySelector('.cari-input');i.value='dias';i.dispatchEvent(new Event('input',{bubbles:true}))})()`);
  await waitFor("document.querySelectorAll('.tbl tbody tr').length===1");
  assert.ok(await evaluate("document.body.textContent.includes('DIAS PUTRI WAHYUNINGSARI')"));
  await evaluate(`(()=>{const i=document.querySelector('.cari-input');i.value='zzz';i.dispatchEvent(new Event('input',{bubbles:true}))})()`);
  await waitFor("document.body.textContent.includes('Tidak ada karyawan yang cocok dengan pencarian.')");
  await evaluate(`(()=>{const i=document.querySelector('.cari-input');i.value='';i.dispatchEvent(new Event('input',{bubbles:true}))})()`);
  await waitFor("document.querySelectorAll('.tbl tbody tr').length===3");
  await screenshot('daftar.png');

  /* ── Tahap 2 (4 hari, induk P04) → dialog pratinjau ── */
  await evaluate("document.querySelectorAll('.eksekusi-btn')[0].click()");
  await waitFor("document.body.textContent.includes('Surat Panggilan 2 — WAWA ANANDA PRATAMA')");
  const pratinjau = await evaluate("document.querySelector('.pratinjau').textContent.replace(/\\s+/g,' ')");
  assert.match(pratinjau, /surat panggilan 2 \(dua\)/i);
  assert.match(pratinjau, /masuk kerja kembali di CV\. Kencana Print cabang PABRIK 4 \(JERON\) pada:/,
    'induk P04: kata "cabang" + nama pabrik HURUF BESAR');
  assert.ok(!pratinjau.includes('Kaosan'));
  assert.match(pratinjau, /MANGKIR/);
  assert.ok(await evaluate("[...document.querySelectorAll('.fld input')].some(i=>i.value.includes('/HRD&GA/'))"),
    'nomor surat default <urut per bulan>/HRD&GA/<romawi>/<tahun>');
  assert.ok(await evaluate("[...document.querySelectorAll('.fld input')].some(i=>i.value==='07.50 WIB')"),
    'pukul default 07.50 WIB');
  await screenshot('dialog-panggilan-2.png');

  /* ── Satu evaluate: pasang jebakan, klik Unduh, tunggu & baca PDF ── */
  const hasil = await evaluate(`(async()=>{
    window.__pdf=null;
    const orig=URL.createObjectURL.bind(URL);
    URL.createObjectURL=b=>{window.__pdf=b;return orig(b)};
    [...document.querySelectorAll('button')].find(b=>b.textContent.includes('Unduh PDF')).click();
    for(let i=0;i<700 && !window.__pdf;i++) await new Promise(r=>setTimeout(r,50));
    if(!window.__pdf) return {error:'PDF tidak terbentuk dalam 35 detik'};
    const b=window.__pdf, buf=await b.arrayBuffer(), u=new Uint8Array(buf);
    const head=[...u.slice(0,5)].map(x=>String.fromCharCode(x)).join('');
    const teks=new TextDecoder('latin1').decode(u);
    const flat=teks.replace(/\\s+/g,'');
    // Font yang dipakai baris "Keperluan" — harus Times-Italic (huruf miring).
    const fontKeperluan=(()=>{
      const i=teks.indexOf('Memberikan');
      if(i<0) return null;
      const tf=[...teks.slice(0,i).matchAll(/\\/(F\\d+)\\s+[\\d.]+\\s+Tf/g)];
      if(!tf.length) return null;
      const res=tf[tf.length-1][1];
      // Cari baris resource "/Fxx <id> 0 R" (lewati operator "/Fxx 12 Tf").
      const reRes=/^\\/(F\\d+)\\s+(\\d+)\\s+0\\s+R/;
      let mid=null;
      for(let from=teks.indexOf('/'+res+' ');from>=0;from=teks.indexOf('/'+res+' ',from+1)){
        mid=teks.slice(from,from+40).match(reRes);
        if(mid) break;
      }
      if(!mid) return null;
      const at=teks.indexOf(mid[2]+' 0 obj');
      if(at<0) return null;
      const b=teks.slice(at,at+600).match(/\\/BaseFont\\s*\\/([A-Za-z-]+)/);
      return b?b[1]:null;
    })();
    return { size:b.size, head,
      nomorPdf:(flat.match(/\\d+\\/HRD&GA\\/[IVX]+\\/\\d{4}/)||[null])[0],
      fontKeperluan,
      judul:teks.includes('SURAT PANGGILAN KARYAWAN'), mangkir:teks.includes('MANGKIR'),
      // Blok ttd: kota+tanggal, nama & jabatan TETAP; ruang tengah (stempel) kosong.
      ttdAda:teks.includes('Boyolali,') && teks.includes('Muhammad Fahrun Ali Syaifuddin'),
      stempelKosong:!teks.includes('stempel'),
      // Frasa terpecah antar operator teks PDF (Tj/T*) → buang semua spasi dulu.
      keperluan:teks.replace(/\\s+/g,'').includes('kembalibekerja'),
      keperluanLama:!teks.replace(/\\s+/g,'').includes('KembaliBekerja'),
      tujuanP:teks.replace(/\\s+/g,'').includes('cabangPABRIK4'),
      geometri: (()=>{
        // Koordinat tiap teks (Td diikuti Tj) — dipakai uji tata letak.
        const koord=[]; const reT=/(-?[\\d.]+) (-?[\\d.]+) Td[^()]*\\(([^()]*)\\) Tj/g;
        let m; while((m=reT.exec(teks))) koord.push({x:+m[1],y:+m[2],t:m[3]});
        const mm=v=>v/2.834645669, r10=v=>Math.round(v*10)/10;
        const kolon=koord.filter(p=>p.t===':');
        const boy=koord.find(p=>p.t.indexOf('Boyolali,')>=0);
        const mfh=koord.find(p=>p.t.indexOf('Muhammad Fahrun')>=0);
        const jud=koord.find(p=>p.t.indexOf('SURAT PANGGILAN')>=0);
        const nom=koord.find(p=>p.t.indexOf('HRD&GA')>=0);
        // Garis horizontal (m...l): underline judul (atas) & nama ttd (bawah).
        const reL=/(-?[\\d.]+) (-?[\\d.]+) m\\s+(-?[\\d.]+) (-?[\\d.]+) l/; const reLa=new RegExp(reL.source,'g');
        const garisSemua=[]; let g;
        while((g=reLa.exec(teks))){ const y1=+g[2], y2=+g[4];
          if(Math.abs(y1-y2)<0.5){ const yMm=297-mm(y1);
            // Tebal garis = operator "0.567 w" terakhir sebelum garis ini.
            const mw=[...teks.slice(0,g.index).matchAll(/([\\d.]+) w\\b/g)];
            garisSemua.push({yMm:r10(yMm), panjang:r10(mm(Math.abs(+g[3]-+g[1]))),
              x1:r10(mm(Math.min(+g[1],+g[3]))), x2:r10(mm(Math.max(+g[1],+g[3]))),
              tebal:mw.length ? r10(mm(+mw[mw.length-1][1])) : null}); } }
        const garis=garisSemua.find(l=>l.yMm>40 && l.yMm<55)||null;
        const lNama=koord.find(p=>p.t==='Nama');
        const lAlamat=koord.find(p=>p.t==='Alamat');
        return { jmlKolon:kolon.length,
          kolonX:[...new Set(kolon.map(p=>r10(mm(p.x))))],
          kolonY:[...new Set(kolon.map(p=>r10(mm(p.y))))],
          jarakTtd: boy&&mfh ? r10(mm(boy.y)-mm(mfh.y)) : null,
          // Baseline judul (top-based mm) & x kiri teks judul — pembanding underline.
          judulY: jud ? r10(297-mm(jud.y)) : null,
          judulX: jud ? r10(mm(jud.x)) : null,
          // Baseline nomor surat — harus tepat di bawah header (jarak sedikit).
          nomorY: nom ? r10(297-mm(nom.y)) : null,
          // Baseline nama penanda tangan + jarak baris body (Nama → Alamat).
          namaY: mfh ? r10(297-mm(mfh.y)) : null,
          jarakBaris: lNama && lAlamat ? r10(Math.abs(mm(lNama.y)-mm(lAlamat.y))) : null,
          garisSemua,
          garis };
      })() };
  })()`);
  assert.ok(!hasil.error, hasil.error || 'PDF terbentuk');
  assert.equal(hasil.head, '%PDF-', 'header PDF');
  assert.ok(hasil.size > 15000, `PDF berisi gambar kop (size=${hasil.size})`);
  assert.ok(hasil.judul && hasil.mangkir, 'isi teks surat terbaca di PDF');
  assert.ok(hasil.ttdAda, 'blok ttd tetap: "Boyolali, <tanggal>" + nama + jabatan');
  assert.ok(hasil.stempelKosong, 'ruang tengah ttd (stempel) dikosongkan');
  assert.ok(hasil.keperluan, 'keperluan memakai "kembali bekerja" (huruf kecil)');
  assert.ok(hasil.keperluanLama, 'bentuk lama "Kembali Bekerja" sudah tidak ada');
  assert.ok(hasil.tujuanP, 'PDF induk P: "CV. Kencana Print cabang PABRIK 4" (cabang + huruf besar)');
  /* ── Tata letak revisi: kolom titik dua, underline judul, ruang ttd ── */
  const geo = hasil.geometri;
  assert.equal(geo.jmlKolon, 5, '5 titik dua: Nama/Alamat/Hari/tanggal/Pukul/Keperluan');
  assert.equal(geo.kolonX.length, 1,
    `titik dua sejajar di satu kolom (${JSON.stringify(geo.kolonX)} mm)`);
  assert.ok(geo.garis && geo.judulY != null, 'garis underline & baseline judul terbaca di PDF');
  const gap = geo.garis ? Math.round((geo.garis.yMm - 0.25 - geo.judulY) * 10) / 10 : null;
  assert.ok(Math.abs(gap - 0.6) <= 0.25,
    `underline beri sedikit jarak dari huruf (gap ${gap} mm, target 0.6 mm; baseline ${geo.judulY} mm)`);
  // LEBAR & POSISI horizontal garis = tepat selebar teks judul (seperti Word).
  assert.ok(Math.abs(geo.garis.x1 - geo.judulX) <= 0.15,
    `sisi kiri garis sejajar kiri teks (garis ${geo.garis.x1} mm vs teks ${geo.judulX} mm)`);
  // Nomor surat TEPAT DI BAWAH header — baseline nomor 5,5 mm di bawah judul
  // (underline 47,1 mm; nomor 51,5 mm → jarak ke garis hanya ±4,4 mm).
  assert.ok(geo.nomorY != null && Math.abs((geo.nomorY - geo.judulY) - 5.5) <= 0.5,
    `nomor surat rapat di bawah header (nomor ${geo.nomorY} mm, judul ${geo.judulY} mm, selisih ${geo.nomorY - geo.judulY} mm)`);
  assert.ok(geo.garis.panjang > 60 && geo.garis.panjang < 160,
    `panjang garis = selebar teks judul (${geo.garis.panjang} mm)`);
  assert.ok(Math.abs(geo.jarakTtd - 31.6) <= 1.5,
    `ruang kosong ttd 26 mm di atas nama+jabatan (terukur ${geo.jarakTtd} mm)`);

  /* ── Nama penanda tangan digarisbawahi seperti judul ── */
  const garisNama = (geo.garisSemua || []).find((l) => l.yMm > 150);
  assert.ok(garisNama, 'garis bawah nama terbaca di PDF');
  const gapNama = geo.namaY != null ? Math.round((garisNama.yMm - 0.1 - geo.namaY) * 10) / 10 : null;
  assert.ok(Math.abs(gapNama - 0.6) <= 0.3,
    `garis bawah nama beri jarak seperti judul (gap ${gapNama} mm, baseline nama ${geo.namaY} mm)`);
  assert.ok(garisNama.tebal != null && garisNama.tebal <= 0.3,
    `garis bawah nama TIPIS, tidak bold (tebal ${garisNama.tebal} mm)`);
  assert.ok(geo.garis.tebal >= 0.4, `garis judul tetap tebal (${geo.garis.tebal} mm)`);
  assert.ok(garisNama.panjang > 40 && garisNama.panjang < 100,
    `garis nama selebar teks nama (${garisNama.panjang} mm)`);
  const pusatNama = Math.round(((garisNama.x1 + garisNama.x2) / 2) * 10) / 10;
  assert.ok(Math.abs(pusatNama - 152.2) <= 2,
    `garis nama rata tengah dengan nama (pusat ${pusatNama} mm)`);
  /* Jarak baris body dilonggarkan 5,6 → 6,2 mm; blok ttd tetap. */
  assert.ok(geo.jarakBaris != null && Math.abs(geo.jarakBaris - 6.2) <= 0.25,
    `jarak baris body 6,2 mm (terukur ${geo.jarakBaris} mm)`);

  /* ── Alur nomor DATABASE: POST hanya saat Unduh pertama; PDF pakai hasilnya ── */
  assert.equal(await evaluate("window.__nomorDb.post"), 1,
    'klik Unduh PERTAMA mengambil nomor dari database (POST sekali)');
  assert.equal(hasil.nomorPdf, NOMOR_1,
    `PDF memakai nomor hasil reservasi database (terbaca ${hasil.nomorPdf})`);
  assert.match(hasil.fontKeperluan || '', /Italic/i,
    `baris Keperluan dicetak MIRING (font terdeteksi: ${hasil.fontKeperluan})`);

  /* Nama berkas dari toast (return `unduhSuratPanggilan`). */
  await waitFor("document.body.textContent.includes('Surat_Panggilan_2_WAWA_ANANDA_PRATAMA_')");
  assert.ok(await evaluate("document.body.textContent.includes('Surat Panggilan 2 — WAWA ANANDA PRATAMA')"),
    'dialog TETAP TERBUKA setelah unduh (nomor tetap dalam satu dialog)');

  /* ── Unduh ULANG di dialog yang sama: nomor SAMA, TANPA POST baru ── */
  const ulang = await evaluate(`(async()=>{
    window.__pdf=null;
    let btn=null;
    for(let i=0;i<700;i++){
      btn=[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Unduh PDF'));
      if(btn && !btn.disabled) break;
      await new Promise(r=>setTimeout(r,50));
    }
    if(!btn || btn.disabled) return {error:'tombol Unduh belum siap'};
    btn.click();
    for(let i=0;i<700 && !window.__pdf;i++) await new Promise(r=>setTimeout(r,50));
    if(!window.__pdf) return {error:'PDF unduh ulang tidak terbentuk'};
    const u=new Uint8Array(await window.__pdf.arrayBuffer());
    const flat=new TextDecoder('latin1').decode(u).replace(/\\s+/g,'');
    return { nomorPdf:(flat.match(/\\d+\\/HRD&GA\\/[IVX]+\\/\\d{4}/)||[null])[0],
      post:window.__nomorDb.post,
      dialogTerbuka:document.body.textContent.includes('Surat Panggilan 2 — WAWA ANANDA PRATAMA') };
  })()`);
  assert.ok(!ulang.error, ulang.error || 'PDF unduh ulang terbentuk');
  assert.equal(ulang.nomorPdf, hasil.nomorPdf, 'unduh ulang memakai nomor YANG SAMA');
  assert.equal(ulang.post, 1, 'unduh ulang TANPA POST baru (nomor terkunci di dialog)');
  assert.ok(ulang.dialogTerbuka, 'dialog tetap terbuka setelah unduh ulang');

  /* ── NOMOR MELEKAT: buka ulang data yang SAMA (WAWA, 4 hari 14–18 Nov) ──
   * Peek harus mengembalikan nomor yang sudah terbit, bukan urut berikutnya. */
  await evaluate("[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Batal').click()");
  await waitFor("!document.body.textContent.includes('Surat Panggilan 2 — WAWA ANANDA PRATAMA')",
    'Batal menutup dialog WAWA');
  await evaluate("document.querySelectorAll('.eksekusi-btn')[0].click()");
  await waitFor("document.body.textContent.includes('Surat Panggilan 2 — WAWA ANANDA PRATAMA')");
  await waitFor(`[...document.querySelectorAll('.fld input')].some(i=>i.value===${JSON.stringify(NOMOR_1)})`);
  assert.ok(await evaluate("!!document.querySelector('.hint-nomor')"),
    'dialog menandai nomor sudah terbit untuk data (nama + rentang tanggal) ini');
  const ulangData = await evaluate(`(async()=>{
    window.__pdf=null;
    let btn=null;
    for(let i=0;i<700;i++){
      btn=[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Unduh PDF'));
      if(btn && !btn.disabled) break;
      await new Promise(r=>setTimeout(r,50));
    }
    if(!btn || btn.disabled) return {error:'tombol Unduh belum siap'};
    btn.click();
    for(let i=0;i<700 && !window.__pdf;i++) await new Promise(r=>setTimeout(r,50));
    if(!window.__pdf) return {error:'PDF data yang sama tidak terbentuk'};
    const u=new Uint8Array(await window.__pdf.arrayBuffer());
    const flat=new TextDecoder('latin1').decode(u).replace(/\\s+/g,'');
    return { nomorPdf:(flat.match(/\\d+\\/HRD&GA\\/[IVX]+\\/\\d{4}/)||[null])[0],
      post:window.__nomorDb.post, urut:window.__nomorDb.urut };
  })()`);
  assert.ok(!ulangData.error, ulangData.error || 'PDF data yang sama terbentuk');
  assert.equal(ulangData.nomorPdf, NOMOR_1,
    `data yang sama memakai nomor LAMA (terbaca ${ulangData.nomorPdf})`);
  assert.equal(ulangData.post, 2, 'pembukaan ulang tetap POST, tetapi idempoten');
  assert.equal(ulangData.urut, 5, 'data yang sama TIDAK menaikkan counter urut');

  /* ── Tahap 1 (3 hari, induk K06) → frasa Kaosan cabang + nama pabrik berjudul kata ── */
  await evaluate("[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Batal').click()");
  await waitFor("!document.body.textContent.includes('Surat Panggilan 2 — WAWA ANANDA PRATAMA')",
    'tombol Batal menutup dialog');
  await evaluate("document.querySelectorAll('.eksekusi-btn')[1].click()");
  await waitFor("document.body.textContent.includes('Surat Panggilan 1 — ARI MUNADI')");
  // Peek lagi untuk dialog baru: counter database sudah naik → urut berikutnya tampil.
  await waitFor(`[...document.querySelectorAll('.fld input')].some(i=>i.value===${JSON.stringify(NOMOR_2)})`);
  assert.equal(await evaluate("window.__nomorDb.post"), 2,
    'membuka dialog BARU belum mengambil nomor (peek saja, POST belum nambah)');
  assert.ok(await evaluate("window.__nomorDb.get") >= 2, 'GET peek dipanggil untuk tiap dialog');
  const p1 = await evaluate("document.querySelector('.pratinjau').textContent.replace(/\\s+/g,' ')");
  assert.match(p1, /surat panggilan 1 \(satu\)/i);
  assert.match(p1, /masuk kerja kembali di Kaosan cabang BOYOLALI pada:/,
    'cabang: "Kaosan cabang <NAMA PABRIK>" huruf besar semua');
  assert.ok(!p1.includes('MANGKIR'), 'tahap 1 tanpa ancaman MANGKIR');
  await screenshot('dialog-panggilan-1.png');

  /* ── Unduh PDF tahap 1: frasa cabang & judul-kata pabrik ikut tercetak ── */
  const p1pdf = await evaluate(`(async()=>{
    window.__pdf=null;
    [...document.querySelectorAll('button')].find(b=>b.textContent.includes('Unduh PDF')).click();
    for(let i=0;i<700 && !window.__pdf;i++) await new Promise(r=>setTimeout(r,50));
    if(!window.__pdf) return {error:'PDF tahap 1 tidak terbentuk'};
    const u=new Uint8Array(await window.__pdf.arrayBuffer());
    const teks=new TextDecoder('latin1').decode(u);
    const flat=teks.replace(/\\s+/g,'');
    return { head:[...u.slice(0,5)].map(x=>String.fromCharCode(x)).join(''),
      cabang:flat.includes('KaosancabangBOYOLALI'),
      tanpaTitleCase:!flat.includes('KaosancabangBoyolali'),  // bukan judul kata lagi
      tanpaPrefiks:!flat.includes('CV.KencanaPrint/Kaosan'),
      tanpaMangkir:!flat.includes('MANGKIR'),
      // Nomor ikut counter database: urut naik setelah surat tahap 2 terbit.
      nomorPdf:(flat.match(/\\d+\\/HRD&GA\\/[IVX]+\\/\\d{4}/)||[null])[0] };
  })()`);
  assert.ok(!p1pdf.error, p1pdf.error || 'PDF tahap 1 terbungkus');
  assert.equal(p1pdf.head, '%PDF-', 'header PDF tahap 1');
  assert.ok(p1pdf.cabang, 'PDF memuat "Kaosan cabang BOYOLALI" (huruf besar semua)');
  assert.ok(p1pdf.tanpaTitleCase, 'nama pabrik bukan judul kata ("Boyolali") lagi');
  assert.ok(p1pdf.tanpaPrefiks, 'cabang tanpa prefiks "CV. Kencana Print/"');
  assert.ok(p1pdf.tanpaMangkir, 'PDF tahap 1 tanpa MANGKIR');
  assert.equal(p1pdf.nomorPdf, NOMOR_2,
    `PDF tahap 1 memakai urut database berikutnya (terbaca ${p1pdf.nomorPdf})`);
  assert.equal(await evaluate("window.__nomorDb.post"), 3,
    'unduh di dialog BARU → POST nomor ke-2 (urut naik)');
  await waitFor("document.body.textContent.includes('Surat_Panggilan_1_ARI_MUNADI_')",
    'toast nama berkas tahap 1');

  /* ── HR mengetik nomor SENDIRI → counter database TIDAK dipakai (tanpa POST) ── */
  await evaluate("[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Batal').click()");
  await waitFor("!document.body.textContent.includes('Surat Panggilan 1 — ARI MUNADI')",
    'tombol Batal menutup dialog tahap 1');
  await evaluate("document.querySelectorAll('.eksekusi-btn')[2].click()");
  await waitFor("document.body.textContent.includes('Surat Panggilan 1 — DIAS PUTRI WAHYUNINGSARI')");
  await waitFor(`[...document.querySelectorAll('.fld input')].some(i=>i.value===${JSON.stringify(NOMOR_3)})`);
  await evaluate(`(()=>{const i=[...document.querySelectorAll('.fld input')].find(x=>x.value.includes('/HRD&GA/'));
    i.value=${JSON.stringify(NOMOR_MANUAL)};i.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  assert.equal(
    await evaluate("[...document.querySelectorAll('.fld input')].find(x=>x.value.includes('/HRD&GA/')).value"),
    NOMOR_MANUAL, 'nomor tulisan HR dipakai apa adanya (tidak ditimpa)');
  const manual = await evaluate(`(async()=>{
    window.__pdf=null;
    let btn=null;
    for(let i=0;i<700;i++){
      btn=[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Unduh PDF'));
      if(btn && !btn.disabled) break;
      await new Promise(r=>setTimeout(r,50));
    }
    if(!btn || btn.disabled) return {error:'tombol Unduh belum siap'};
    btn.click();
    for(let i=0;i<700 && !window.__pdf;i++) await new Promise(r=>setTimeout(r,50));
    if(!window.__pdf) return {error:'PDF nomor manual tidak terbentuk'};
    const u=new Uint8Array(await window.__pdf.arrayBuffer());
    const flat=new TextDecoder('latin1').decode(u).replace(/\\s+/g,'');
    return { nomorPdf:(flat.match(/\\d+\\/HRD&GA\\/[IVX]+\\/\\d{4}/)||[null])[0],
      post:window.__nomorDb.post,
      urut:window.__nomorDb.urut,
      cabang:flat.includes('KaosancabangSTORESALE') };
  })()`);
  assert.ok(!manual.error, manual.error || 'PDF nomor manual terbentuk');
  assert.equal(manual.nomorPdf, NOMOR_MANUAL,
    `PDF memakai nomor tulisan HR, bukan counter (terbaca ${manual.nomorPdf})`);
  assert.equal(manual.post, 4, 'nomor manual → POST untuk menyimpan, bukan mengambil urut');
  assert.equal(manual.urut, 6, 'nomor manual TIDAK menaikkan counter urut');
  assert.ok(manual.cabang, 'pabrik SL1: "Kaosan cabang STORE SALE" juga tercetak');
  await screenshot('dialog-nomor-manual.png');

  /* ── Buka ulang ARI: nomor 6 melekat (bukan 8), tanpa menambah POST ── */
  await evaluate("[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Batal').click()");
  await waitFor("!document.body.textContent.includes('Surat Panggilan 1 — DIAS PUTRI WAHYUNINGSARI')",
    'Batal menutup dialog DIAS');
  await evaluate("document.querySelectorAll('.eksekusi-btn')[1].click()");
  await waitFor("document.body.textContent.includes('Surat Panggilan 1 — ARI MUNADI')");
  await waitFor(`[...document.querySelectorAll('.fld input')].some(i=>i.value===${JSON.stringify(NOMOR_2)})`);
  assert.equal(await evaluate("window.__nomorDb.post"), 4,
    'membuka ulang ARI hanya peek → nomor lama ditampilkan tanpa POST');
  assert.equal(await evaluate("window.__nomorDb.urut"), 6,
    'counter urut tetap 6 (nomor melekat tidak menambah urut)');
  await screenshot('dialog-nomor-melekat.png');
});
