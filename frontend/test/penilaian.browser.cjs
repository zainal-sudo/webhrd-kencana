// Browser smoke test terhadap production bundle + API fixture lokal, tanpa database.
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const http=require('node:http');
const {fork,spawnSync}=require('node:child_process');
const dist=path.join(__dirname,'../dist');

function browserProbe(){
 localStorage.clear();
 const params=new URLSearchParams(location.search);
 const mode=params.get('mode')||'share';
 if(mode==='stale-session'){
  localStorage.setItem('kencana_hrd_token','expired-fixture');
  localStorage.setItem('kencana_hrd_user',JSON.stringify({user_kode:'HR01'}));
 }
 const report={errors:[],downloads:[],shares:[],copied:[],opened:[]};
 window.open=(url)=>{report.opened.push(url);return null};
 window.addEventListener('error',e=>report.errors.push(e.message));
 const realURL=URL.createObjectURL.bind(URL);
 URL.createObjectURL=blob=>{report.lastPdf=blob;return realURL(blob)};
 HTMLAnchorElement.prototype.click=function(){report.downloads.push(this.download)};
 Object.defineProperty(navigator,'canShare',{configurable:true,value:()=>['share','mobile','share-fail','cancel','alternative','stale-session'].includes(mode)});
 Object.defineProperty(navigator,'share',{configurable:true,value:async data=>{
  report.shares.push(data);
  if(mode==='mobile')await new Promise(resolve=>setTimeout(resolve,40));
  if(mode==='cancel')throw new DOMException('Cancelled','AbortError');
  if(mode==='share-fail')throw new Error('Share target unavailable');
 }});
 Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{
  if(mode==='manual') throw new Error('Clipboard blocked');
  report.copied.push(text);
 }}});
 function done(){
  delete report.lastPdf;
  report.shares=report.shares.map(data=>({text:data.text,files:data.files.length,fileType:data.files[0].type}));
  const pre=document.createElement('pre');pre.id='browser-report';pre.textContent=JSON.stringify(report);document.body.append(pre);
 }
 let tries=0;
 async function inspect(){
  const host=document.querySelector('.legacy-host');
  const root=host?.shadowRoot;
  if(root?.getElementById('aspekContainer')?.children.length){
   const employeeIds=['namaKaryawan','nik','jabatan','departemen','statusKepegawaian'];
   report.readonly=employeeIds.every(id=>root.getElementById(id).readOnly);
   report.identity=employeeIds.map(id=>root.getElementById(id).value);
   report.sidebar=!!document.querySelector('.sidebar,.app-sidebar');
   report.aspects=root.getElementById('aspekContainer').children.length;
   report.initialDisabled=root.getElementById('shareWABtn').disabled;
   root.getElementById('atasannya').value='Atasan Fixture';
   root.getElementById('atasannya').dispatchEvent(new Event('input',{bubbles:true}));
   root.getElementById('jabatanAtasan').value='Manager';
   root.getElementById('jabatanAtasan').dispatchEvent(new Event('change',{bubbles:true}));
   root.getElementById('usulanSelect').selectedIndex=1;
   root.getElementById('usulanSelect').dispatchEvent(new Event('change',{bubbles:true}));
   for(let i=0;i<report.aspects;i++){
    const radio=root.querySelector(`input[name="aspek_${i}"][value="5"]`);
    radio.checked=true;radio.dispatchEvent(new Event('change',{bubbles:true}));
   }
   report.completeEnabled=!root.getElementById('shareWABtn').disabled;
   report.score=root.getElementById('totalNilaiDisplay').innerText;
   report.criteria=root.getElementById('kriteriaBadge').innerText;
   root.getElementById('printPDFbtn').click();
   await new Promise(resolve=>setTimeout(resolve,100));
   report.pdfHeader=(await report.lastPdf.text()).slice(0,5);
   report.pdfSize=report.lastPdf.size;
   root.getElementById('shareWABtn').click();
   report.modal=root.getElementById('warningModal').classList.contains('show');
   report.confirmInitiallyDisabled=root.getElementById('confirmModal').disabled;
   root.getElementById('agreeCheck').checked=true;
   root.getElementById('agreeCheck').dispatchEvent(new Event('change',{bubbles:true}));
   root.getElementById('confirmModal').click();
   await new Promise(resolve=>setTimeout(resolve,100));
   if(mode==='alternative'){
    root.querySelector('#resultDelivery button').click();
    await new Promise(resolve=>setTimeout(resolve,100));
   }
   report.instruction=root.querySelector('#resultDelivery p')?.textContent||'';
   report.alternative=!!root.querySelector('#resultDelivery button');
   report.whatsappLink=root.querySelector('#resultDelivery a')?.href||'';
   report.toast=root.getElementById('toastMsg').textContent;
   report.previewText=root.querySelector('.delivery-preview textarea')?.value||'';
   report.copyButton=!!root.querySelector('.copy-result-text');
   report.manualText=root.querySelector('#manualCopy textarea')?.value||'';
   report.copyBefore=report.copied.length;
   root.querySelector('.copy-result-text').click();
   await new Promise(resolve=>setTimeout(resolve,50));
   report.buttonCopiedText=report.copied.at(-1)||'';
   root.getElementById('resetFormBtn').click();
   report.resetIdentity=employeeIds.map(id=>root.getElementById(id).value);
   report.resetDisabled=root.getElementById('shareWABtn').disabled;
   report.resetScore=root.getElementById('totalNilaiDisplay').innerText;
   report.resetDelivery=!!root.getElementById('resultDelivery');
   report.path=location.pathname;
   done();return;
  }
  const state=document.querySelector('.public-state p');
  if(state){report.invalid=state.textContent;report.path=location.pathname;done();return}
  if(params.get('private')&&location.pathname==='/login'){report.path=location.pathname;done();return}
  if(++tries>80){report.timeout=true;report.body=document.body.innerText.slice(0,300);done();return}
  setTimeout(()=>inspect().catch(error=>{report.errors.push(error.message);done()}),75);
 }
 setTimeout(()=>inspect().catch(error=>{report.errors.push(error.message);done()}),100);
}

if(process.argv.includes('--fixture-server')){
 const server=http.createServer(async(req,res)=>{
  const url=new URL(req.url,'http://localhost');
  if(url.pathname.startsWith('/api/public/penilaian/')){
   let body='';for await(const chunk of req)body+=chunk;
   let token;try{token=JSON.parse(body).token}catch{}
   const type=url.pathname.split('/')[4];
   const valid=token===(type==='tanpa-bawahan'?'a':'b').repeat(64);
   res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');
   res.statusCode=valid?200:404;
   res.end(JSON.stringify(valid?{success:true,data:{employee:{nik:'00123',nama:'Karyawan Fixture',jabatan:type==='tanpa-bawahan'?'OPERATOR':'KOORDINATOR',bagian:'PPIC',pabrik:'P04',statusKerja:'PKWT 2'},formType:type,expiresAt:new Date(Date.now()+86400000).toISOString()}}:{success:false,message:'Link tidak valid'}));return;
  }
  if(url.pathname.startsWith('/api/')){res.statusCode=401;res.end('{}');return}
  let file=path.resolve(dist,'.'+url.pathname);
  if(!file.startsWith(dist+path.sep)||!fs.existsSync(file)||fs.statSync(file).isDirectory())file=path.join(dist,'index.html');
  const ext=path.extname(file);
  res.setHeader('Content-Type',({'.html':'text/html','.js':'application/javascript','.css':'text/css','.woff2':'font/woff2','.woff':'font/woff','.ttf':'font/ttf','.png':'image/png'})[ext]||'application/octet-stream');
  let data=fs.readFileSync(file);
  if(ext==='.html')data=data.toString().replace(/<link\b[^>]*href="https:[^>]*>/g,'').replace('<head>','<head><script>('+browserProbe.toString()+')();</script>');
  res.end(data);
 });
 server.listen(0,'127.0.0.1',()=>process.send({port:server.address().port}));
 process.on('message',message=>{if(message==='close')server.close(()=>process.exit(0))});
}else{
 const test=require('node:test'),assert=require('node:assert/strict');
 const chrome=[process.env.CHROME_PATH,'C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(file=>file&&fs.existsSync(file));
 test('Public forms: valid token, invalid/type mismatch, readonly/reset, real PDF and share/fallback; private routes remain protected',{skip:!chrome||!fs.existsSync(path.join(dist,'index.html')),timeout:120000},async()=>{
  const child=fork(__filename,['--fixture-server'],{stdio:['ignore','ignore','inherit','ipc']});
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'penilaian-browser-'));
  try{
   const port=await new Promise((resolve,reject)=>{child.once('message',data=>resolve(data.port));child.once('error',reject)});
   const scenarios=[['tanpa-bawahan','a','share'],['dengan-bawahan','b','share'],['tanpa-bawahan','a','mobile'],['tanpa-bawahan','a','fallback'],['dengan-bawahan','b','manual'],['dengan-bawahan','b','share-fail'],['tanpa-bawahan','a','cancel'],['dengan-bawahan','b','alternative'],['tanpa-bawahan','a','stale-session'],['tanpa-bawahan','b','invalid'],['dengan-bawahan','c','invalid'],['tanpa-bawahan','','missing'],['dashboard','','private']];
   for(let i=0;i<scenarios.length;i++){
    const [type,key,mode]=scenarios[i];const url=type==='dashboard'?`http://127.0.0.1:${port}/dashboard?private=1`:`http://127.0.0.1:${port}/penilaian/${type}?t=${key.repeat(64)}&mode=${mode}`;
    const result=spawnSync(chrome,['--headless','--no-sandbox','--disable-gpu','--disable-background-networking','--no-first-run','--no-default-browser-check','--user-data-dir='+path.join(temp,String(i)),'--virtual-time-budget=9000','--dump-dom',url],{encoding:'utf8',maxBuffer:8e6,timeout:25000});
    const match=result.stdout?.match(/<pre id="browser-report">([^<]*)<\/pre>/);
    assert.ok(match,`${type}/${mode}: browser report missing (${result.error?.message||''})`);
    const report=JSON.parse(match[1].replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>'));
    assert.deepEqual(report.errors,[],`${type}/${mode}: ${JSON.stringify(report)}`);
    assert.ok(!report.timeout,JSON.stringify(report));
    if(mode==='private'){assert.equal(report.path,'/login');continue}
    assert.equal(report.path,`/penilaian/${type}`);
    if(['invalid','missing'].includes(mode)){assert.match(report.invalid,/kedaluwarsa atau tidak valid/);continue}
    assert.equal(report.readonly,true);assert.equal(report.sidebar,false);
    assert.equal(report.aspects,type==='tanpa-bawahan'?5:6);
    assert.equal(report.initialDisabled,true);assert.equal(report.completeEnabled,true);
    assert.equal(report.score,'50');assert.equal(report.criteria,'Sangat Baik');
    assert.equal(report.pdfHeader,'%PDF-');assert.ok(report.pdfSize>4000);
    assert.equal(report.modal,true);assert.equal(report.confirmInitiallyDisabled,true);
    assert.deepEqual(report.resetIdentity,report.identity);assert.equal(report.resetScore,'0');assert.equal(report.resetDisabled,true);
    assert.equal(report.resetDelivery,false);
    assert.equal(report.alternative,true);
    assert.equal(report.copyButton,true);
    assert.doesNotMatch(report.toast,/berhasil dikirim|sudah dikirim|Gagal membuat PDF/i);
    const assertEmoji=text=>{
     assert.ok(text.startsWith('\u{1f4cb} PENILAIAN PRESTASI KERJA \u{1f4cb}'));
     for(const emoji of ['\u{1f465}','\u{1f464}','\u{1f194}','\u{1f468}\u200d\u{1f4bc}','\u{1f4c5}','\u2b50','\u{1f525}','\u2705','\u274c','\u{1f3e2}'])assert.ok(text.includes(emoji),`Emoji missing: ${emoji}`);
     assert.doesNotMatch(text,/\uFFFD/);
    };
    assertEmoji(report.previewText);
    if(mode!=='manual')assert.equal(report.buttonCopiedText,report.previewText);
    if(['share','mobile','stale-session'].includes(mode)){
     assert.equal(report.shares.length,1);assert.equal(report.shares[0].files,1);assert.equal(report.shares[0].fileType,'application/pdf');assert.match(report.shares[0].text,/50 \/ 50 \(Sangat Baik\)/);
     assert.equal(report.opened.length,0);assert.equal(report.downloads.length,1);
     assert.match(report.instruction,/Pilih WhatsApp jika tersedia/);
     assertEmoji(report.shares[0].text);
    }
    if(['fallback','manual','share-fail','alternative'].includes(mode)){
     assert.equal(report.downloads.length,2);assert.equal(report.opened.length,1);
     assert.equal(report.whatsappLink,report.opened[0]);
     const decoded=new URL(report.whatsappLink).searchParams.get('text');
     assertEmoji(decoded);
     assert.match(decoded,/50 \/ 50 \(Sangat Baik\)/);
     assert.match(report.instruction,/lampirkan PDF tersebut/);
     if(report.copied.length)assert.equal(decoded,report.copied[0]);
     if(mode==='manual')assert.equal(decoded,report.manualText);
     if(['share-fail','alternative'].includes(mode))assert.equal(decoded,report.shares[0].text);
    }
    if(mode==='cancel'){assert.equal(report.downloads.length,1);assert.equal(report.opened.length,0);assert.equal(report.copyBefore,0);assert.match(report.instruction,/ditutup atau tidak tersedia/)}
    if(mode==='fallback'){assert.equal(report.downloads.length,2);assert.equal(report.copyBefore,1)}
    if(mode==='manual'){assert.equal(report.downloads.length,2);assert.match(report.manualText,/PENILAIAN PRESTASI KERJA/)}
   }
  }finally{child.send('close')}
 });
}
