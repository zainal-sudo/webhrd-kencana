const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const ts=require('typescript'),{File}=require('node:buffer');
const source=fs.readFileSync(path.join(__dirname,'../src/features/penilaian/resultDelivery.ts'),'utf8');
const text='📋 PENILAIAN PRESTASI KERJA 📋\n👥 Karyawan Tanpa Bawahan\n👤 Nama: Budi & Sinta\n🆔 NIK: 00123\n👨‍💼 Penilai: Atasan\n⭐ HASIL PENILAIAN ⭐\n🔥 Baik Sekali · 📌 Cukup · ⚠️ Kurang\n✅ TOTAL NILAI: 50 / 50 (Sangat Baik)\n❌ TIDAK ACC\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n🏢 HR - Performance Appraisal System';
const payload={pdfBlob:new Blob(['%PDF-fixture'],{type:'application/pdf'}),filename:'Approval_PKWT_fixture.pdf',text};
function fixture(mode='windows'){
 const events=[],notifications=[],panels=[],shares=[];
 let resolveShare;
 const navigator={share:data=>{events.push('share');shares.push(data);if(mode==='cancel')return Promise.reject(Object.assign(new Error('Cancelled'),{name:'AbortError'}));if(mode==='share-fail')return Promise.reject(new Error('Target failed'));if(mode==='mobile')return new Promise(resolve=>{resolveShare=resolve});return Promise.resolve()},canShare:()=>{if(mode==='canShare-throws')throw new Error('Blocked');return !['unsupported','popup-blocked','open-throws','clipboard-denied'].includes(mode)}};
 if(mode==='no-share')delete navigator.share;
 if(mode==='no-canShare')delete navigator.canShare;
 const module={exports:{}};
 const globals={module,exports:module.exports,File,Blob,navigator,
  document:{createElement:()=>({click(){events.push({download:this.download,href:this.href})},remove(){events.push('remove-anchor')}}),body:{appendChild(){}}},
  URL:{createObjectURL:blob=>{assert.equal(blob,payload.pdfBlob);return 'blob:fixture'},revokeObjectURL:()=>events.push('revoke')},
  window:{open:(url,target,features)=>{events.push({open:url,target,features});if(mode==='open-throws')throw new Error('Popup denied');return null}},
  setTimeout:fn=>fn(),
 };
 vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS}}).outputText,globals);
 const service=module.exports.createResultDelivery({notify:message=>{events.push('notify');notifications.push(message)},showActions:(message,fallback,whatsappUrl,text)=>panels.push({message,fallback,whatsappUrl,text}),copyText:async value=>{events.push({copied:value});if(mode==='clipboard-denied')throw new Error('Clipboard denied');return true}});
 return {...service,events,notifications,panels,shares,constants:module.exports,resolve:()=>resolveShare()};
}
for(const mode of ['windows','mobile'])test(`Native share ${mode}: instruksi netral muncul sebelum share, tidak mengklaim terkirim`,async()=>{
 const f=fixture(mode),pending=f.deliverResult(payload);
 assert.equal(f.shares.length,1);
 assert.ok(f.events.indexOf('notify')<f.events.indexOf('share'));
 assert.equal(f.shares[0].text,text);
 assert.doesNotMatch(f.shares[0].text,/\uFFFD/);
 assert.equal(f.shares[0].files[0].name,payload.filename);
 assert.equal(await f.shares[0].files[0].text(),await payload.pdfBlob.text());
 assert.equal(f.notifications[0],f.constants.SHARE_INSTRUCTION);
 assert.equal(f.panels[0].text,text);
 assert.equal(f.events.filter(e=>e.open||e.download).length,0);
 if(mode==='mobile')f.resolve();
 await pending;
 assert.equal(f.notifications.length,1);
 assert.doesNotMatch(f.notifications.join(' '),/berhasil dikirim|sudah dikirim/i);
 assert.equal(typeof f.panels[0].fallback,'function');
 await f.panels[0].fallback();
 assert.equal(f.events.filter(e=>e.download).length,1);
});
for(const mode of ['unsupported','no-share','no-canShare','canShare-throws','share-fail','popup-blocked','open-throws','clipboard-denied'])test(`Fallback ${mode}: PDF sama, WA berisi teks persis dan tautan manual tetap tersedia`,async()=>{
 const f=fixture(mode);await f.deliverResult(payload);
 assert.equal(f.events.filter(e=>e.download).length,1);
 assert.equal(f.events.find(e=>e.download).download,payload.filename);
 const opened=f.events.find(e=>e.open);
 assert.equal(opened.open,`https://wa.me/?text=${encodeURIComponent(text)}`);
 assert.equal(new URL(opened.open).searchParams.get('text'),text);
 assert.doesNotMatch(new URL(opened.open).searchParams.get('text'),/\uFFFD/);
 assert.equal(opened.features,'noopener,noreferrer');
 assert.equal(f.panels.at(-1).whatsappUrl,opened.open);
 assert.equal(f.panels.at(-1).text,text);
 assert.equal(f.panels.at(-1).message,f.constants.FALLBACK_INSTRUCTION);
 assert.equal(f.events.find(e=>e.copied).copied,text);
 assert.doesNotMatch(f.notifications.join(' '),/berhasil dikirim|sudah dikirim|Gagal membuat PDF/i);
});
test('Pembatalan tidak mengunduh/membuka WA; alternatif manual dapat dipilih',async()=>{
 const f=fixture('cancel');await f.deliverResult(payload);
 assert.equal(f.events.filter(e=>e.open||e.download||e.copied).length,0);
 assert.match(f.panels.at(-1).message,/ditutup atau tidak tersedia/);
 await f.panels.at(-1).fallback();
 assert.equal(f.events.filter(e=>e.download).length,1);
});
test('Reset membatalkan tindakan dari hasil lama',async()=>{
 const f=fixture();await f.deliverResult(payload);f.reset();await f.panels[0].fallback();
 assert.equal(f.events.filter(e=>e.open||e.download).length,0);
});
