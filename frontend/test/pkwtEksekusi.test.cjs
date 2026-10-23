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
// Window mock untuk mengawasi bukaan WhatsApp (tidak ada pengiriman otomatis).
const opens=[];
const helper=compile(read('utils/pkwtWa.ts'),{window:{open:url=>opens.push(url)}});
const row={Nik:'K001',Nama:'Budi',Jabatan:'STAF',Status_PKWT:'PKWT 2',Bagian:'Produksi',Pabrik:'1',
 Tgl_Mulai:'2024-01-01',Tgl_Berakhir:'2026-11-10',Sisa_Hari:20};
const monitoring=compile(read('utils/pkwtMonitoring.ts'));
const linkPenilaian='https://hrd.example/penilaian/tanpa-bawahan?t='+ 'a'.repeat(64);

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

test('Wording pesan PKWT tetap sama selain penempatan URL dan penghapusan emoji instruksi',()=>{
 const expected=fs.readFileSync(path.join(__dirname,'fixtures/pkwt-wa-existing.txt'),'utf8')
  .replace('1. {{LINK_PENILAIAN}}',`1. Link penilaian:\n${linkPenilaian}\n`)
  .replace('☝️ Silahkan pilih salah satu form penilaian di atas. ☝️','Silahkan pilih salah satu form penilaian di atas.');
 assert.equal(helper.buatPesanWa(row,linkPenilaian),expected);
 assert.doesNotMatch(helper.buatPesanWa(row,linkPenilaian),/netlify/);
});

test('Kirim WA menunggu token backend, mencegah klik ganda, dan menutup popup ketika gagal',async()=>{
 const events=[],errors=[];
 let closeCount=0,resolveRequest,fail=false;
 const popup={opener:'initial',document:{title:'',body:{textContent:''}},closed:false,location:{replace:url=>events.push(['wa',url])},close:()=>closeCount++};
 const script=read('views/dashboard/PkwtEksekusiView.vue').match(/<script setup lang="ts">([\s\S]*?)<\/script>/)[1];
 const state=compile(script+'\nexport {kirimPenilaianWa,sendingNik,waFallback};',{
  URL,window:{location:{origin:'https://hrd.example'},open:url=>{events.push(['popup',url]);return popup}},
  require:name=>{
   if(name==='vue')return {...require('vue'),onMounted:()=>{}};
   if(name==='vue-toastification')return {useToast:()=>({error:message=>errors.push(message)})};
   if(name==='@/api')return {pickError:error=>error.message,safePost:url=>{
    events.push(['token',url]);
    return fail?Promise.reject(new Error('Token gagal dibuat')):new Promise(resolve=>{resolveRequest=resolve});
   }};
   if(name==='@/utils/pkwtWa')return helper;
   if(name==='@/utils/pkwtMonitoring')return monitoring;
   return {};
  }
 });
 const pending=state.kirimPenilaianWa(row);
 assert.equal(state.sendingNik.value,row.Nik);
 assert.equal(events.filter(e=>e[0]==='wa').length,0);
 await state.kirimPenilaianWa(row);
 assert.equal(events.filter(e=>e[0]==='token').length,1);
 assert.equal(popup.opener,null);
 resolveRequest({path:'/penilaian/tanpa-bawahan?t='+'a'.repeat(64)});
 await pending;
 assert.equal(state.sendingNik.value,null);
 const sent=events.find(e=>e[0]==='wa')[1];
 assert.equal(decodeURIComponent(sent.split('?text=')[1]),helper.buatPesanWa(row,linkPenilaian));
 assert.equal(state.waFallback.value,sent);
 fail=true;
 await state.kirimPenilaianWa(row);
 assert.equal(closeCount,1);
 assert.equal(errors[0],'Token gagal dibuat');
 assert.equal(state.waFallback.value,'');
 assert.equal(state.sendingNik.value,null);
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
 const pesan=helper.buatPesanWa(row,linkPenilaian);
 assert.match(pesan,/\*HR Kontrak - Notifikasi PKWT\*/);
 assert.match(pesan,/Kepada Yth\. Atasan/);
 assert.match(pesan,/Karyawan: Budi/);
 assert.match(pesan,/Jabatan: STAF/);
 assert.match(pesan,/Bagian: Produksi/);
 assert.match(pesan,/Status: PKWT 2/);
 assert.match(pesan,/Kontrak berakhir: 10\/11\/2026 \(20 hari lagi\)/);
 assert.ok(pesan.includes(`1. Link penilaian:\n${linkPenilaian}\n\n2. Form`));
 assert.match(pesan,/pada tanggal 13\/11\/2026\)/);
 assert.match(pesan,/HR Departemen/);
 // Pesan WA TIDAK PERNAH memuat nomor penerima — HR memilih sendiri di WhatsApp.
 assert.doesNotMatch(pesan,/wa\.me\/\+?\d|whatsapp:\/\//);
});

test('Kirim WA membuka wa.me tanpa nomor (hanya ?text= pesan terisi)',()=>{
 opens.length=0;
 helper.kirimWa(row,linkPenilaian);
 assert.equal(opens.length,1);
 const url=opens[0];
 assert.match(url,/^https:\/\/wa\.me\/\?text=.{10,}$/);
 assert.equal(url,`https://wa.me/?text=${encodeURIComponent(helper.buatPesanWa(row,linkPenilaian))}`);
 const text=decodeURIComponent(url.split('?text=')[1]);
 assert.equal(text,helper.buatPesanWa(row,linkPenilaian));
 assert.equal(text.split(/\r?\n/).find(line=>line.includes('Silahkan')),'Silahkan pilih salah satu form penilaian di atas.');
 assert.doesNotMatch(text,/\uFFFD|\u261D|\uFE0F/);
 assert.ok(!/%2B6|\+62|phone/.test(url));
});

test('URL IP dengan port tetap utuh pada baris tersendiri setelah decoding pesan WhatsApp',()=>{
 for(const type of ['tanpa-bawahan','dengan-bawahan']) {
  const token='a'.repeat(64);
  const link=`http://103.94.238.252:96/penilaian/${type}?t=${token}`;
  const url=helper.kirimWa(row,link);
  const decoded=new URL(url).searchParams.get('text');
  assert.equal(decoded,helper.buatPesanWa(row,link));
  const lines=decoded.split(/\r?\n/);
  const index=lines.indexOf(link);
  assert.ok(index>0);
  assert.equal(lines[index-1],'1. Link penilaian:');
  assert.equal(lines[index+1],'');
  assert.match(lines[index+2],/^2\. Form penilaian/);
  assert.doesNotMatch(lines[index],/\s/);
  const restored=new URL(lines[index]);
  assert.equal(restored.host,'103.94.238.252:96');
  assert.equal(restored.pathname,`/penilaian/${type}`);
  assert.equal(restored.searchParams.get('t'),token);
 }
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
 // POST hanya membuat access token, bukan mengubah data karyawan/kontrak.
 assert.match(view,/link-penilaian/);
 assert.doesNotMatch(view,/safePut|safeDelete|\.put\(/);
});
