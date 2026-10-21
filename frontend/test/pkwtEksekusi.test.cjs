const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const ts=require('typescript');
const root=path.join(__dirname,'../src');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const compile=(source,globals={})=>{
 const module={exports:{}};
 vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,{...globals,module,exports:module.exports});
 return module.exports;
};
// Window mock untuk mengawasi bukaan WhatsApp (tidak ada pengiriman otomatis).
const opens=[];
const helper=compile(read('utils/pkwtWa.ts'),{window:{open:url=>opens.push(url)}});
const row={Nik:'K001',Nama:'Budi',Jabatan:'STAF',Status_PKWT:'PKWT 2',Bagian:'Produksi',Pabrik:'1',
 Tgl_Mulai:'2024-01-01',Tgl_Berakhir:'2026-11-10',Sisa_Hari:20};
const monitoring=compile(read('utils/pkwtMonitoring.ts'));

test('Kategori monitoring terpisah pada batas -1, 0, 7, 8, 30, 31 hari',()=>{
 for(const [days,category] of [[-100,'berakhir'],[-1,'berakhir'],[0,'segera'],[7,'segera'],[8,'akan'],[30,'akan'],[31,'aman'],[60,'aman'],[365,'aman']]) {
  assert.equal(monitoring.kategoriPkwt(days),category);
 }
 // Aturan tampilan baru tidak mengubah helper WhatsApp existing.
 assert.equal(helper.statusBerakhir(31),'Aman');
});

test('Card, pencarian dan filter kolom dapat digabung; pilihan kolom tetap mencakup seluruh data',async()=>{
 const vue=require('vue');
 const script=read('views/dashboard/PkwtEksekusiView.vue').match(/<script setup lang="ts">([\s\S]*?)<\/script>/)[1];
 const columnHelper=compile(read('utils/columnFilter.ts'));
 const state=compile(script+'\nexport { rows, cari, statusAktif, filtered, ringkas, pilihStatus, badgeClass, labelStatus, columnValues, columnValue, columnFilters, applyColumnFilter, resetFilters };',{
  require:name=>{
   if(name==='vue') return {...vue,onMounted:()=>{}};
   if(name==='vue-toastification') return {useToast:()=>({error:()=>{}})};
   if(name==='@/utils/pkwtMonitoring') return monitoring;
   if(name==='@/utils/pkwtWa') return helper;
   if(name==='@/utils/columnFilter') return columnHelper;
   return {};
  }
 });
 state.rows.value=[-1,0,7,8,30,31,60].map((days,i)=>({...row,Nik:`K${i}`,Nama:days===30?'Sinta':'Budi',Sisa_Hari:days}));
 assert.deepEqual(JSON.parse(JSON.stringify(state.ringkas.value)),{berakhir:1,segera:2,akan:2,aman:2});
 assert.equal(state.filtered.value.length,7);
 state.pilihStatus('segera');
 assert.deepEqual(Array.from(state.filtered.value,r=>r.Sisa_Hari),[0,7]);
 state.pilihStatus('akan');
 assert.deepEqual(Array.from(state.filtered.value,r=>r.Sisa_Hari),[8,30]);
 assert.equal(state.badgeClass(31),'rok-aman');
 assert.equal(state.labelStatus(30),'Akan Habis');
 state.cari.value='sinta';
 assert.equal(state.filtered.value.length,1);
 assert.equal(state.ringkas.value.akan,2);
 state.pilihStatus('aman');
 assert.equal(state.filtered.value.length,0);
 state.pilihStatus('aman');
 assert.equal(state.statusAktif.value,null);
 assert.equal(state.filtered.value.length,1);
 state.cari.value='';
 assert.equal(state.filtered.value.length,7);
 const selected=state.rows.value.find(r=>r.Sisa_Hari===30);
 state.applyColumnFilter('karyawan',[columnHelper.filterKey(state.columnValue(selected,'karyawan'))]);
 assert.equal(state.filtered.value.length,1);
 assert.equal(state.filtered.value[0].Nama,'Sinta');
 assert.equal((await state.columnValues('karyawan')).length,7);
 state.applyColumnFilter('status',[columnHelper.filterKey(state.columnValue(state.rows.value[0],'status'))]);
 assert.equal(state.filtered.value.length,0);
 assert.equal((await state.columnValues('status')).length,7);
 state.resetFilters();
 assert.equal(state.filtered.value.length,7);
 state.applyColumnFilter('kontrak',[columnHelper.filterKey(state.columnValue(selected,'kontrak'))]);
 assert.equal(state.filtered.value.length,7);
 state.cari.value='sinta';
 assert.equal(state.filtered.value.length,1);
 state.resetFilters();
 assert.equal(state.filtered.value.length,1);
 state.cari.value='';
 state.rows.value=[];
 assert.equal(Object.values(state.ringkas.value).reduce((a,b)=>a+b,0),0);
});

test('Konfigurasi link penilaian prototipe: OPERATOR/STAF tanpa bawahan, lainnya dengan bawahan',()=>{
 assert.equal(helper.LINK_TANPA_BAWAHAN,'https://peniliantanpabawahan.netlify.app/');
 assert.equal(helper.LINK_DENGAN_BAWAHAN,'https://penilaiankaryawandenganbawahan.netlify.app/');
 assert.equal(helper.getLinkPenilaian('STAF'),helper.LINK_TANPA_BAWAHAN);
 assert.equal(helper.getLinkPenilaian('operator'),helper.LINK_TANPA_BAWAHAN);
 assert.equal(helper.getLinkPenilaian('FORMAN'),helper.LINK_DENGAN_BAWAHAN);
 assert.equal(helper.getLinkPenilaian(null),helper.LINK_DENGAN_BAWAHAN);
});

test('Tanggal diformat dd/mm/yyyy, tahun aneh tampil apa adanya, form H+3 dihitung dari akhir kontrak',()=>{
 assert.equal(helper.formatTglBerakhir('2026-11-10'),'10/11/2026');
 assert.equal(helper.formatTglBerakhir('1899-12-30'),'30/12/1899');
 assert.equal(helper.formatTglBerakhir(null),'-');
 assert.equal(helper.formatHPlus3('2026-11-10'),'13/11/2026');
 assert.equal(helper.formatHPlus3('1899-12-30'),'02/01/1900');
 assert.equal(helper.formatHPlus3(undefined),'-');
});

test('Label status mengikuti getStatusText prototipe',()=>{
 assert.equal(helper.statusBerakhir(-1),'Berakhir');
 assert.equal(helper.statusBerakhir(0),'Segera!');
 assert.equal(helper.statusBerakhir(7),'Segera!');
 assert.equal(helper.statusBerakhir(8),'Akan habis');
 assert.equal(helper.statusBerakhir(30),'Akan habis');
 assert.equal(helper.statusBerakhir(31),'Aman');
 assert.equal(helper.sisaHariTeks(-5),'0');
 assert.equal(helper.sisaHariPesan(-5),'Sudah berakhir');
 assert.equal(helper.sisaHariPesan(3),'3 hari lagi');
});

test('Pesan WA berisi data karyawan + link penilaian, tanpa pengiriman daring',()=>{
 const pesan=helper.buatPesanWa(row);
 assert.match(pesan,/\*HR Kontrak - Notifikasi PKWT\*/);
 assert.match(pesan,/Kepada Yth\. Atasan/);
 assert.match(pesan,/Karyawan: Budi/);
 assert.match(pesan,/Jabatan: STAF/);
 assert.match(pesan,/Bagian: Produksi/);
 assert.match(pesan,/Status: PKWT 2/);
 assert.match(pesan,/Kontrak berakhir: 10\/11\/2026 \(20 hari lagi\)/);
 assert.match(pesan,/1\. https:\/\/peniliantanpabawahan\.netlify\.app\//);
 assert.match(pesan,/pada tanggal 13\/11\/2026\)/);
 assert.match(pesan,/HR Departemen/);
 // Pesan WA TIDAK PERNAH memuat nomor penerima — HR memilih sendiri di WhatsApp.
 assert.doesNotMatch(pesan,/wa\.me\/\+?\d|whatsapp:\/\//);
});

test('Kirim WA membuka wa.me tanpa nomor (hanya ?text= pesan terisi)',()=>{
 opens.length=0;
 helper.kirimWa(row);
 assert.equal(opens.length,1);
 const url=opens[0];
 assert.match(url,/^https:\/\/wa\.me\/\?text=.{10,}$/);
 assert.equal(url,`https://wa.me/?text=${encodeURIComponent(helper.buatPesanWa(row))}`);
 const text=decodeURIComponent(url.split('?text=')[1]);
 assert.equal(text,helper.buatPesanWa(row));
 assert.ok(!/%2B6|\+62|phone/.test(url));
});

test('Tombol Eksekusi + route + view terpasang tanpa tab Keputusan atau upload Excel',()=>{
 const dash=read('views/dashboard/DashboardView.vue');
 assert.match(dash,/eksekusi: \{ route: "\/dashboard\/eksekusi-pkwt", label: "Eksekusi PKWT" \}/);
 assert.match(dash,/p\.eksekusi\.route/);
 assert.match(dash,/<span>Eksekusi<\/span>/);
 const router=read('router/index.ts');
 assert.match(router,/path: "\/dashboard\/eksekusi-pkwt"/);
 assert.match(router,/PkwtEksekusiView\.vue/);
 const view=read('views/dashboard/PkwtEksekusiView.vue');
 assert.match(view,/<span>Kirim WhatsApp<\/span>/);
 assert.match(view,/kirimWa/);
 assert.match(view,/:class="badgeClass\(r\.Sisa_Hari\)"/);
 // Prototipe TIDAK diseret utuh: tanpa tab Keputusan, upload Excel, atau PDF.
 for(const file of [view,dash]){
   assert.doesNotMatch(file,/Keputusan/i);
   assert.doesNotMatch(file,/fileInput|\.pdf/i);
 }
 // Perubahan data PKWT dilarang: endpoint read-only tidak melakukan POST/PUT.
 assert.doesNotMatch(view,/safePost|safePut|safeDelete|\.post\(|\.put\(/);
});
