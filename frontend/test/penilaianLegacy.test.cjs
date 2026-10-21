const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {File}=require('node:buffer');
const root=path.join(__dirname,'../src/features/penilaian/legacy');

function form(type, adapted, scores, mode='share') {
 const html=fs.readFileSync(path.join(root,`source-${type}.html`),'utf8');
 let script=adapted ? fs.readFileSync(path.join(root,`runtime-${type}.js`),'utf8').split(/export function initializeForm\([^)]*\) \{/)[1]
  : [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]).filter(x=>x.trim()).join('\n');
 script=script.slice(0,script.indexOf('// ===== EVENT LISTENERS ====='));
 const values={namaKaryawan:'Sinta',nik:'00123',jabatan:'KOORDINATOR',departemen:'PPIC',statusKepegawaian:'PKWT 2',atasannya:'Budi',jabatanAtasan:'Manager',tglPenilaian:'2026-10-21',catatanPrestasi:'Catatan evaluasi',usulanSelect:'3. Dipromosikan'};
 const nodes={};
 const get=id=>nodes[id]||(nodes[id]={value:values[id]||'',classList:{add(){},remove(){}},textContent:''});
 const captured={shares:[],copied:[],downloads:[]};
 function Pdf() {
  const calls=[];
  return new Proxy({splitTextToSize:t=>[t],output:()=>new Blob([JSON.stringify(calls)],{type:'application/pdf'})},{get(target,key){return key in target ? target[key] : (...args)=>{calls.push([key,...args])}}});
 }
 class FixedDate extends Date {constructor(...args){super(...(args.length?args:['2026-10-21T03:00:00Z']))}}
 const context={Blob,File,Date:FixedDate,jsPDF:Pdf,window:{jspdf:{jsPDF:Pdf}},document:{getElementById:get,createElement:()=>({click(){captured.downloads.push(this.download)}}),body:{appendChild(){},removeChild(){}}},
  navigator:{canShare:()=>mode!=='fallback',share:async data=>{if(mode==='cancel')throw Object.assign(new Error('Cancel'),{name:'AbortError'});captured.shares.push(data)},clipboard:{writeText:async text=>captured.copied.push(text)}},
  copyResultText:async text=>{captured.copied.push(text);return true},restoreIdentity(){},URL:{createObjectURL:()=> 'blob:test',revokeObjectURL(){}},setTimeout:()=>{},console,
  deliverResult:async({pdfBlob,filename,text})=>captured.shares.push({title:'Approval PKWT',text,files:[new File([pdfBlob],filename,{type:'application/pdf'})]}),
 };
 vm.createContext(context);
 vm.runInContext(script+'\n globalThis.api={generatePDFBlob,executeSharePDF,getKeteranganByAspek,aspekData,setScores:s=>{currentScores=s}};',context);
 context.api.setScores(scores);
 return {...context.api,captured};
}

for(const [type,count,weights] of [['tanpa-bawahan',5,[2,2,2,2,2]],['dengan-bawahan',6,[2,2,2,2,1,1]]]) {
 test(`${type}: aspek, bobot, semua keterangan skor dan PDF identik dengan HTML asli`,async()=>{
  for(const scores of [Array(count).fill(5),Array(count).fill(4),Array(count).fill(3),Array(count).fill(2),Array(count).fill(1),Array(count).fill(null),Array.from({length:count},(_,i)=>i%5+1)]) {
   const original=form(type,false,scores),adapted=form(type,true,scores);
   assert.deepEqual(JSON.parse(JSON.stringify(adapted.aspekData)),JSON.parse(JSON.stringify(original.aspekData)));
   assert.deepEqual(Array.from(adapted.aspekData,a=>a.bobot||2),weights);
   for(let i=0;i<count;i++)for(let score=1;score<=5;score++)assert.equal(adapted.getKeteranganByAspek(i,score),original.getKeteranganByAspek(i,score));
   assert.equal(await (await adapted.generatePDFBlob()).text(),await (await original.generatePDFBlob()).text());
  }
 });
 test(`${type}: callback pengiriman menerima teks, nama file, dan PDF yang identik dengan source`,async()=>{
  for(const mode of ['share']) {
   const scores=Array(count).fill(5),original=form(type,false,scores,mode),adapted=form(type,true,scores,mode);
   await original.executeSharePDF();await adapted.executeSharePDF();
   assert.deepEqual(adapted.captured.copied,original.captured.copied);
   assert.deepEqual(adapted.captured.downloads,original.captured.downloads);
   assert.equal(adapted.captured.shares.length,original.captured.shares.length);
   for(let i=0;i<adapted.captured.shares.length;i++) {
    const a=adapted.captured.shares[i],b=original.captured.shares[i];
    assert.equal(a.text,b.text);assert.equal(a.title,b.title);
    assert.equal(a.files[0].name,b.files[0].name);
    assert.equal(await a.files[0].text(),await b.files[0].text());
    assert.ok(a.text.includes('50 / 50 (Sangat Baik)'));
   }
  }
 });
}
