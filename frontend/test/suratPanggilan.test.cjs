const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('./helpers/frontendVm.cjs');
const ts=require('typescript');
const root=path.join(__dirname,'../src');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const compile=(source,globals={})=>{
  const module={exports:{}};
  vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,{...globals,module,exports:module.exports});
  return module.exports;
};

// Util PDF Surat Panggilan (frontend/src/utils/suratPanggilan.ts).
// `import.meta.env` hanya ada di dalam fungsi aset; diuji via vm CommonJS
// jadi dipetakan ke global yang bisa di-set (build Vite memakai BASE_URL "/").
const sumberSurat=read('utils/suratPanggilan.ts')
  .replace(/import\.meta\.env\.BASE_URL/g,'(globalThis.__BASE_URL__ || "/")');
const surat=compile(sumberSurat);

test('Judul kata: hanya huruf pertama huruf besar (STORE SALE -> Store Sale)',()=>{
  assert.equal(surat.judulKata('STORE SALE'),'Store Sale');
  assert.equal(surat.judulKata('PABRIK 4 (JERON)'),'Pabrik 4 (Jeron)');
  assert.equal(surat.judulKata('PADOKAN'),'Padokan');
  assert.equal(surat.judulKata('PABRIK 1 (HO)'),'Pabrik 1 (Ho)');
  assert.equal(surat.judulKata(''), '');
  assert.equal(surat.judulKata(null), '');
});

test('Frasa tujuan: SEMUA versi memuat "cabang" + nama pabrik HURUF BESAR',()=>{
  const pabrik1={indukPabrik:'P01',namaPabrik:'PABRIK 1'};
  // Induk berkode P -> "CV. Kencana Print cabang <NAMA PABRIK>".
  assert.equal(surat.teksTujuan(pabrik1),'CV. Kencana Print cabang PABRIK 1');
  // Anak pabrik induk P & HO (induk P01) tetap pabrik induk.
  assert.equal(surat.teksTujuan({indukPabrik:'P01',namaPabrik:'HO'}),'CV. Kencana Print cabang HO');
  assert.equal(surat.teksTujuan({indukPabrik:'P01',namaPabrik:'PABRIK 1 (HO)'}),'CV. Kencana Print cabang PABRIK 1 (HO)');
  assert.equal(surat.teksTujuan({indukPabrik:'P04',namaPabrik:'PABRIK 4 (JERON)'}),'CV. Kencana Print cabang PABRIK 4 (JERON)');
  // Selain kode induk P -> HANYA "Kaosan cabang <NAMA PABRIK>".
  assert.equal(surat.teksTujuan({indukPabrik:'K06',namaPabrik:'BOYOLALI'}),'Kaosan cabang BOYOLALI');
  // SL1 (STORE SALE) tetap Kaosan.
  assert.equal(surat.teksTujuan({indukPabrik:'SL1',namaPabrik:'STORE SALE'}),'Kaosan cabang STORE SALE');
  assert.equal(surat.teksTujuan({indukPabrik:'KBD',namaPabrik:'BANDUNG'}),'Kaosan cabang BANDUNG');
  // Nama pabrik karyawan SENDIRI & huruf besar semua — walau datanya huruf kecil.
  assert.equal(surat.teksTujuan({indukPabrik:'K06',namaPabrik:'Boyolali'}),'Kaosan cabang BOYOLALI');
  assert.equal(surat.teksTujuan({indukPabrik:'K03',namaPabrik:'Menco'}),'Kaosan cabang MENCO');
  // Fallback tanpa nama pabrik tetap aman (tidak memunculkan "cabang" kosong).
  assert.equal(surat.teksTujuan({indukPabrik:'P01',namaPabrik:''}),'CV. Kencana Print');
  assert.equal(surat.teksTujuan({indukPabrik:'K06',namaPabrik:''}),'Kaosan');
});

test('Nomor surat: urut per bulan mulai 1 + romawi + tahun ikut tanggal surat',()=>{
  // Tanpa localStorage (lingkungan test) → urut mulai 1.
  assert.equal(surat.nomorSuratDefault(new Date(2026,10,16)),'1/HRD&GA/XI/2026');
  assert.equal(surat.nomorSuratDefault(new Date(2026,0,5)),'1/HRD&GA/I/2026');
  // Urut naik per bulan setelah surat dicatat terbit — localStorage disuntikkan
  // ke context vm tempat modul di-compile (bukan global test-runner).
  const kotak={};
  const s2=compile(sumberSurat,{localStorage:{getItem:k=>kotak[k]??null,setItem:(k,v)=>{kotak[k]=v}}});
  assert.equal(s2.nomorSuratDefault(new Date(2026,10,16)),'1/HRD&GA/XI/2026');
  assert.equal(s2.urutSuratBulan(new Date(2026,10,16)),0);
  s2.catatSuratTerbit(new Date(2026,10,16));
  s2.catatSuratTerbit(new Date(2026,10,20));
  assert.equal(s2.urutSuratBulan(new Date(2026,10,16)),2);
  assert.equal(s2.nomorSuratDefault(new Date(2026,10,16)),'3/HRD&GA/XI/2026');
  // Bulan lain tetap mulai dari 1.
  assert.equal(s2.nomorSuratDefault(new Date(2026,11,1)),'1/HRD&GA/XII/2026');
  assert.equal(surat.PUKUL_DEFAULT,'07.50 WIB');
  assert.equal(surat.PENANDATANGAN.nama,'Muhammad Fahrun Ali Syaifuddin');
  assert.equal(surat.PENANDATANGAN.jabatan,'HRD');
  // Hari/tanggal dipanggil = Today+1; tanggal surat = today.
  const besok=surat.besok(new Date(2026,10,16));
  assert.equal(surat.sqlTanggal(besok),'2026-11-17');
  assert.equal(surat.tanggalPanjang(besok),'Selasa, 17 November 2026');
  assert.equal(surat.tanggalPolos(new Date(2026,10,16)),'16 November 2026');
  assert.equal(surat.sqlTanggal(surat.tanggalDariSql('2026-11-16')),'2026-11-16');
  const berkas=surat.namaBerkasSurat({tahap:2,nama:'WAWA/ANANDA',alamat:'',indukPabrik:'P04',namaPabrik:'',
    nomor:'',tanggalPanggilan:new Date(2026,10,17),tanggalSurat:new Date(2026,10,16),pukul:''});
  assert.equal(berkas,'Surat_Panggilan_2_WAWAANANDA_20261116.pdf');
});

test('Halaman Eksekusi: daftar, pencarian, jumlah tahap, dan default surat',()=>{
  const vue=require('vue');
  const script=read('views/dashboard/TidakMasukEksekusiView.vue').match(/<script setup lang="ts">([\s\S]*?)<\/script>/)[1];
  const state=compile(script+'\nexport { rows, acuan, cari, filtered, jumlahTahap, tahapTeks, buatSurat, isiSurat, nomor, tglSurat, tglPanggilan, pukul, dialog };',{
    require:name=>{
      if(name==='vue') return {...vue,onMounted:()=>{}};
      if(name==='vue-toastification') return {useToast:()=>({error:()=>{},success:()=>{}})};
      if(name==='@/api') return {pickError:()=>'galat',safeGet:async()=>({rows:[],tanggal:[]}),safePost:async()=>({urut:0})};
      if(name==='@/components/MsIcon.vue') return {default:{}};
      if(name==='@/utils/suratPanggilan') return surat;
      return {};
    }
  });
  state.rows.value=[
    {Kode_Absensi:'4701',Nik:'0411221197',Nama:'WAWA ANANDA PRATAMA',Bagian:'Produksi',Pabrik:'P04',
     Alamat:'Jeron',Nama_Pabrik:'PABRIK 4 (JERON)',Induk_Pabrik:'P04',Hari:4},
    {Kode_Absensi:'4702',Nik:'0207190832',Nama:'BAGUS RAMADHAN',Bagian:'Produksi',Pabrik:'K06',
     Alamat:'Boyolali',Nama_Pabrik:'BOYOLALI',Induk_Pabrik:'K06',Hari:3},
  ];
  state.acuan.value=['2026-11-14','2026-11-16','2026-11-17','2026-11-18'];
  assert.deepEqual(JSON.parse(JSON.stringify(state.jumlahTahap.value)),{tiga:1,empat:1});
  assert.equal(state.tahapTeks(4),'4 hari · Panggilan 2');
  assert.equal(state.tahapTeks(3),'3 hari · Panggilan 1');
  state.cari.value='bagus';
  assert.equal(state.filtered.value.length,1);
  state.cari.value='';

  // Klik "Buat Surat": dialog terbuka + isian default (besok untuk hari dipanggil).
  state.buatSurat(state.rows.value[0]);
  assert.equal(state.dialog.value,true);
  assert.ok(state.nomor.value.includes('/HRD&GA/'));
  const isi=state.isiSurat.value;
  assert.equal(isi.tahap,2);                    // Hari 4 -> Surat Panggilan 2
  assert.equal(isi.nama,'WAWA ANANDA PRATAMA');
  assert.equal(surat.teksTujuan(isi),'CV. Kencana Print cabang PABRIK 4 (JERON)'); // induk P04 + kata "cabang" + HURUF BESAR
  assert.equal(state.isiSurat.value.tahap,2);
  state.buatSurat(state.rows.value[1]);
  assert.equal(state.isiSurat.value.tahap,1);   // Hari 3 -> Surat Panggilan 1
  assert.equal(surat.teksTujuan(state.isiSurat.value),'Kaosan cabang BOYOLALI');
});
