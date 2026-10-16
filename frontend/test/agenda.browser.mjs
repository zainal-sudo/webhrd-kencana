import assert from 'node:assert/strict'
import { browserAudit } from './helpers/browserAudit.mjs'

const fixture = `
import { createApp,h,nextTick } from 'vue';
import {createPinia} from 'pinia';
import {createRouter,createMemoryHistory} from 'vue-router';
import {createVuetify} from 'vuetify';
import * as components from 'vuetify/components';
import vuetify from '/src/plugins/vuetify.ts';
import Sidebar from '/src/components/layout/AppSidebar.vue';
import {useAuthStore} from '/src/stores/authStore.ts';
import {usePermissionStore} from '/src/stores/permissionStore.ts';
import {api,TOKEN_KEY} from '/src/api/axios.ts';
import {jakartaToday,calendarDays,moveMonth} from '/src/utils/agenda.ts';
import 'vuetify/styles';
import '/src/assets/design-system.css';
import '/src/assets/main.css';
import '/src/assets/theme.css';
import '/src/assets/dialogs.css';
const today=jakartaToday();
let rows=[
 {id:1,creator:'hrd',title:'Agenda pribadi <script>aman</script>',notes:'Catatan pribadi panjang '.repeat(24),date:today,start_time:null,end_time:null,visibility:'private',status:'OPEN',version:1,recipients:[]},
 {id:2,creator:'p1',updated_by:'p2',updated_at:'2026-10-16T06:45:00.000Z',title:'Rapat bersama',notes:'Koordinasi karyawan',date:today,start_time:'09:00',end_time:'10:00',visibility:'shared',status:'SELESAI',version:1,recipients:['hrd']},
 {id:3,creator:'hrd',title:'Agenda dibatalkan dengan judul panjang untuk memastikan isi card tetap terbaca dan tidak melebar ke luar panel',notes:'',date:today,start_time:null,end_time:null,visibility:'shared',status:'BATAL',version:1,recipients:['p1',...Array.from({length:12},(_,i)=>'akun-penerima-panjang-'+i)]}
];
rows.reverse();
const calls=[];let failList=false, failUsers=false, delayUsers=0;
api.defaults.adapter=async config=>{
 const url=config.url,method=config.method,body=config.data?JSON.parse(config.data):{};calls.push({url,method,body});
 let result;
 if(url==='/agenda/today')result={date:today,count:rows.length};
 else if(url==='/agenda/users'){
  if(delayUsers)await new Promise(resolve=>setTimeout(resolve,delayUsers));
  if(failUsers)throw {response:{status:503,data:{message:'Gagal memuat akun penerima.'}}};
  result=[{code:'hrd',name:'HRD'},{code:'p1',name:'Pabrik Satu'},{code:'p2',name:'Pabrik Dua'},{code:'p4',name:'Pabrik Empat'}].filter(u=>(u.code+u.name).toLowerCase().includes((config.params?.search||'').toLowerCase()));
 }
 else if(url==='/agenda'&&method==='get'){
  if(failList)throw {message:'offline',response:{status:503,data:{message:'Gagal memuat agenda.'}}};
  result=rows.filter(r=>r.date>=config.params.start&&r.date<=config.params.end);
 }else if(url==='/agenda'&&method==='post'){result={...body,id:rows.length+1,creator:'hrd',version:1};rows.push(result);}
 else {
  const id=Number(url.split('/').pop());const row=rows.find(r=>r.id===id);
  if(method==='get')result=row;
  if(method==='put'){Object.assign(row,body,{version:row.version+1,updated_by:'hrd'});result=row;}
  if(method==='delete'){rows=rows.filter(r=>r.id!==id);result=null;}
 }
 return {data:{success:true,data:structuredClone(result)},status:200,statusText:'OK',headers:{},config};
};
const app=createApp({render:()=>h(components.VApp,{},()=>h('div',{style:'display:flex;height:100vh'},[h(Sidebar),h('main',{style:'padding:24px'},'HRIS Kencana')]))});
app.use(createPinia());app.use(createRouter({history:createMemoryHistory(),routes:[{path:'/',component:{render:()=>null}}]}));app.use(vuetify);
const auth=useAuthStore();auth.token='fixture';auth.user={user_kode:'HRD',user_nama:'HRD',user_akses:''};localStorage.setItem(TOKEN_KEY,'fixture');
usePermissionStore().loaded=true;
app.mount('#app');
const wait=async()=>{await nextTick();await new Promise(r=>setTimeout(r,90));};
const until=async(fn)=>{for(let i=0;i<100;i++){if(fn())return;await wait();}throw Error('UI not ready');};
const button=text=>[...document.querySelectorAll('button')].find(b=>b.textContent.trim().endsWith(text));
const input=(element,value)=>{element.value=value;element.dispatchEvent(new Event('input',{bubbles:true}));};
window.agendaAudit=async()=>{
 const result={};await wait();
 result.notice=!!document.querySelector('.agenda-notice-dot');
 document.querySelector('.sidebar-collapse').click();await wait();
 result.collapsed=!!document.querySelector('.collapsed .agenda-menu-button');
 document.querySelector('.agenda-menu-button').click();await until(()=>document.querySelector('.agenda-card'));
 result.cards=document.querySelectorAll('.agenda-card').length===3;
 result.safeTitle=!document.querySelector('.agenda-card script')&&document.querySelector('.agenda-card').textContent.includes('<script>aman</script>');
 result.statuses=document.querySelectorAll('.agenda-badge').length===3;
 result.statusOrder=[...document.querySelectorAll('.agenda-card .agenda-badge')].map(e=>e.textContent).join(',')==='OPEN,SELESAI,BATAL';
 result.auditText=document.body.innerText.includes('Dibuat oleh P1')&&document.body.innerText.includes('Terakhir diedit oleh P2');
 result.audience=document.body.innerText.includes('Dibuat oleh HRD untuk diri sendiri')&&document.body.innerText.includes('Dibuat oleh P1 untuk HRD');
 result.auditTime=document.body.innerText.includes('16/10/2026 13:45 WIB');
 const note=document.querySelector('.agenda-card-notes');result.notesClamped=note.scrollHeight>note.clientHeight&&note.clientHeight<=parseFloat(getComputedStyle(note).lineHeight)*2+1;
 result.emptyNoteAbsent=!document.querySelectorAll('.agenda-card')[2].querySelector('.agenda-card-notes');
 const longCard=document.querySelectorAll('.agenda-card')[2];result.allRecipientsVisible=longCard.textContent.includes('AKUN-PENERIMA-PANJANG-11')&&longCard.scrollWidth<=longCard.clientWidth+1;
 document.querySelector('.agenda-card').click();await until(()=>document.querySelector('.agenda-form textarea'));
 result.fullNoteInForm=document.querySelector('.agenda-form textarea').value===rows.find(row=>row.id===1).notes;
 const loadedNotes=document.querySelector('.agenda-form textarea');
 result.loadedNoteFits=loadedNotes.scrollHeight<=loadedNotes.clientHeight+1;
 document.querySelector('.agenda-back').click();await wait();
 button('Minggu').click();await wait();result.week=document.querySelectorAll('.calendar-day').length===7;
 button('Bulan').click();await wait();result.month=document.querySelectorAll('.calendar-day').length>=28;
 button('Tambah').click();await wait();
 result.hiddenDailyHeader=!document.querySelector('.daily-heading');
 result.resetFormScroll=document.querySelector('.agenda-pane').scrollTop===0;
 result.inlineRequired=[...document.querySelectorAll('.field-label')].every(e=>{const mark=e.querySelector('.required-mark');return Math.abs(mark.getBoundingClientRect().top-e.getBoundingClientRect().top)<4;});
 let fields=document.querySelectorAll('.agenda-form input');input(fields[0],'Agenda baru');
 input(document.querySelector('input[type=time]'),'11:00');
 document.querySelector('.agenda-form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));await wait();
 result.timeValidation=document.querySelector('.agenda-error')?.textContent.includes('jam');
 input(document.querySelector('input[type=time]'),'');
 document.querySelector('.visibility-picker input[value=shared]').click();await wait();
 await until(()=>document.querySelectorAll('.recipient-option').length===3);
 for(const code of ['p1','p2','p4'])document.querySelector('.recipient-option input[value='+code+']').closest('label').click();await wait();
 result.multiple=document.querySelectorAll('.recipient-option input:checked').length===3&&document.querySelector('.recipient-count').textContent.includes('3');
 const search=document.querySelector('#agenda-recipient-search');input(search,'Pabrik Dua');
 await until(()=>document.querySelectorAll('.recipient-option').length===1&&!document.querySelector('.recipient-list [role=status]'));
 result.searchKeepsSelection=document.querySelectorAll('.selected-recipients li').length===3&&document.querySelector('.recipient-option input').checked;
 document.querySelector('.agenda-form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));await until(()=>!document.querySelector('.agenda-form'));
 result.created=calls.some(c=>c.method==='post'&&['p1','p2','p4'].every(code=>c.body.recipients.includes(code)));
 [...document.querySelectorAll('.agenda-card')].find(e=>e.textContent.includes('Agenda baru')).click();await until(()=>document.querySelectorAll('.recipient-option input:checked').length===3);
 result.reopened=document.querySelectorAll('.selected-recipients li').length===3;
 document.querySelector('[aria-label="Hapus penerima P2"]').click();await wait();result.removedOne=document.querySelectorAll('.selected-recipients li').length===2&&!document.querySelector('.recipient-option input[value=p2]').checked;
 document.querySelector('.agenda-back').click();await wait();
 [...document.querySelectorAll('.agenda-card')].find(e=>e.textContent.includes('Rapat bersama')).click();await until(()=>document.querySelector('.status-trigger'));
 result.recipientLocks=document.querySelector('.visibility-picker').disabled&&document.querySelector('.recipient-panel').disabled&&!document.querySelector('#agenda-recipient-search');
 const status=document.querySelector('.status-trigger');status.click();await until(()=>document.querySelector('.agenda-status-options'));
 [...document.querySelectorAll('.agenda-status-options button')].find(e=>e.textContent.trim()==='BATAL').click();await wait();
 result.statusSelectable=document.querySelector('.status-trigger').textContent.includes('BATAL');
 result.backArrow=!!document.querySelector('.form-heading > .agenda-back svg')&&!document.querySelector('.form-heading').textContent.includes('Kembali');
 document.querySelector('.agenda-form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));await until(()=>!document.querySelector('.agenda-form'));
 result.edited=calls.some(c=>c.method==='put'&&c.body.status==='BATAL'&&c.body.version===1);
 result.reorderedAfterSave=[...document.querySelectorAll('.agenda-card')].at(-1).textContent.includes('Rapat bersama');
 [...document.querySelectorAll('.agenda-card')].find(e=>e.textContent.includes('Agenda baru')).click();await until(()=>document.querySelector('.agenda-form'));
 const confirm=window.confirm;window.confirm=()=>true;button('Hapus untuk semua').click();await until(()=>!document.querySelector('.agenda-form'));window.confirm=confirm;
 result.deleted=calls.some(c=>c.method==='delete');
 failList=true;button('Minggu').click();await wait();result.failure=!document.querySelector('.agenda-card')&&!!document.querySelector('[role=alert]');
 failList=false;button('Coba lagi').click();await until(()=>document.querySelector('.agenda-card'));button('Bulan').click();await wait();
 result.openKeepsNotice=!!document.querySelector('.agenda-notice-dot');
 return result;
};
window.agendaLogout=async()=>{auth.logout();await wait();return !document.querySelector('.agenda-dialog')&&!document.querySelector('.agenda-menu-button');};
window.agendaDark=async()=>{document.documentElement.setAttribute('data-theme','dark');vuetify.theme.global.name.value='kencanaDarkTheme';await wait();return getComputedStyle(document.querySelector('.agenda-dialog')).backgroundColor;};
window.prepareRecipient=async()=>{
 button('Tambah').click();await wait();
 document.querySelector('.visibility-picker input[value=shared]').click();await wait();
 await new Promise(resolve=>setTimeout(resolve,350));
 const field=document.querySelector('.recipient-panel');
 return field.getBoundingClientRect().toJSON();
};
window.recipientTestMode=(fail,delay)=>{failUsers=fail;delayUsers=delay;};
window.closeRecipientEditor=async()=>{document.querySelector('.agenda-back').click();await wait();};
window.auditSharingScroll=async()=>{
 const original=Element.prototype.scrollIntoView,previousDelay=delayUsers;
 let scrolls=0;
 Element.prototype.scrollIntoView=function(options){if(this.matches('.recipient-panel,#agenda-recipient-search'))scrolls++;return original.call(this,options);};
 try {
  delayUsers=500;button('Tambah').click();await wait();
  document.querySelector('.visibility-picker input[value=shared]').closest('label').click();await wait();
  const loadingHeight=document.querySelector('.recipient-list').getBoundingClientRect().height;
  await until(()=>!document.querySelector('.recipient-list').getAttribute('aria-busy')||document.querySelector('.recipient-list').getAttribute('aria-busy')==='false');
  await wait();
  return {scrolls,loadingHeight,loadedHeight:document.querySelector('.recipient-list').getBoundingClientRect().height};
 } finally {Element.prototype.scrollIntoView=original;delayUsers=previousDelay;await window.closeRecipientEditor();}
};
window.auditVisibilityMotion=async()=>{
 const indicator=document.querySelector('.visibility-indicator');
 const before=indicator.getBoundingClientRect().x;
 document.querySelector('.visibility-picker input[value=private]').click();await nextTick();await new Promise(r=>setTimeout(r,60));
 const middle=indicator.getBoundingClientRect().x;
 await new Promise(r=>setTimeout(r,240));const after=indicator.getBoundingClientRect().x;
 document.querySelector('.visibility-picker input[value=shared]').click();await wait();
 return {before,middle,after};
};
window.auditCompactLayout=async()=>{
 const pane=document.querySelector('.agenda-pane'),layout=document.querySelector('.agenda-layout');
 const scroller=getComputedStyle(pane).overflowY==='visible'?layout:pane;
 const textarea=document.querySelector('.agenda-form textarea'),originalNotes=textarea.value;
 input(textarea,Array.from({length:10},(_,i)=>'Catatan baris '+i).join(String.fromCharCode(10)));await wait();
 scroller.scrollTop=scroller.scrollHeight;await wait();
 const box=scroller.getBoundingClientRect(),header=document.querySelector('.form-heading').getBoundingClientRect(),footer=document.querySelector('.agenda-form-actions').getBoundingClientRect(),last=textarea.getBoundingClientRect();
 const fields=[...document.querySelectorAll('.date-time-fields input')].map(el=>el.getBoundingClientRect());
 const data={headerTop:header.top,scrollTop:box.top,footerBottom:footer.bottom,scrollBottom:box.bottom,lastBottom:last.bottom,footerTop:footer.top,headerSticky:getComputedStyle(document.querySelector('.form-heading')).position,footerSticky:getComputedStyle(document.querySelector('.agenda-form-actions')).position,columns:getComputedStyle(document.querySelector('.date-time-fields')).gridTemplateColumns.split(' ').length,dateTimeAligned:fields.every(rect=>Math.abs(rect.top-fields[0].top)<=1),inputHeight:document.querySelector('.agenda-form input[required]').getBoundingClientRect().height};
 input(textarea,originalNotes);await wait();return data;
};
window.auditNotesResize=async()=>{
 const textarea=document.querySelector('.agenda-form textarea'),original=textarea.value;
 const dialogHeight=document.querySelector('.agenda-dialog').getBoundingClientRect().height;
 input(textarea,'Singkat');await wait();const shortHeight=textarea.clientHeight;
 input(textarea,'Catatan panjang '.repeat(300)+String.fromCharCode(10)+'x'.repeat(500));await wait();
 const longHeight=textarea.clientHeight;
 const fits=textarea.scrollHeight<=textarea.clientHeight+1&&textarea.scrollWidth<=textarea.clientWidth+1;
 const overflow=getComputedStyle(textarea).overflowY;
 input(textarea,'Singkat');await wait();
 const shrinks=textarea.clientHeight<longHeight&&Math.abs(textarea.clientHeight-shortHeight)<=1;
 const stable=Math.abs(document.querySelector('.agenda-dialog').getBoundingClientRect().height-dialogHeight)<=1;
 input(textarea,original);await wait();return {grows:longHeight>shortHeight,fits,overflow,shrinks,stable};
};
window.auditCalendarFit=async weeks=>{
 if(document.querySelector('.agenda-back')){document.querySelector('.agenda-back').click();await wait();}
 button('Bulan').click();button('Hari ini').click();await wait();
 let cursor=today;
 for(let i=0;i<25&&calendarDays(cursor,'month').length!==weeks*7;i++){document.querySelector('[aria-label="Periode berikutnya"]').click();cursor=moveMonth(cursor,1);await wait();}
 const layout=document.querySelector('.agenda-layout');layout.scrollTop=0;
 const pane=document.querySelector('.calendar-pane');pane.scrollTop=0;await wait();
 const scroller=getComputedStyle(pane).overflowY==='visible'?layout:pane;
 const last=[...document.querySelectorAll('.calendar-day')].at(-1),note=document.querySelector('.timezone-note');
 const dialog=document.querySelector('.agenda-dialog').getBoundingClientRect();
 const grid=document.querySelector('.calendar-grid').getBoundingClientRect();
 const cell=document.querySelector('.calendar-day').getBoundingClientRect();
 return {sourceWeeks:calendarDays(cursor,'month').length/7,weeks:document.querySelectorAll('.calendar-day').length/7,gridWidth:grid.width,gridHeight:grid.height,cellSide:cell.width,calendarScroll:pane.scrollHeight-pane.clientHeight,firstTop:document.querySelector('.calendar-grid').getBoundingClientRect().top,scrollTop:scroller.getBoundingClientRect().top,lastBottom:last.getBoundingClientRect().bottom,noteTop:note.getBoundingClientRect().top,noteBottom:note.getBoundingClientRect().bottom,scrollBottom:scroller.getBoundingClientRect().bottom,dialogTop:dialog.top,dialogBottom:dialog.bottom,horizontalOverflow:[layout,pane,document.querySelector('.agenda-pane')].some(el=>el.scrollWidth>el.clientWidth+1),cellsFit:[...document.querySelectorAll('.calendar-day')].every(el=>el.scrollHeight<=el.clientHeight+1&&Math.abs(el.getBoundingClientRect().height-el.getBoundingClientRect().width)<=1&&el.getBoundingClientRect().height<=96)};
};
window.auditCalendarDensity=async()=>{
 const original=rows;
 const reload=async()=>{button('Minggu').click();await wait();button('Bulan').click();await wait();};
 try {
  rows=[];button('Hari ini').click();await reload();
  const monthHeight=document.querySelector('.agenda-dialog').getBoundingClientRect().height;
  const monthWidth=document.querySelector('.agenda-dialog').getBoundingClientRect().width;
  const monthCellSide=document.querySelector('.calendar-day').getBoundingClientRect().width;
  button('Minggu').click();await wait();
  const weekHeight=document.querySelector('.agenda-dialog').getBoundingClientRect().height;
  const weekCells=[...document.querySelectorAll('.calendar-day')].every(el=>Math.abs(el.getBoundingClientRect().height-el.getBoundingClientRect().width)<=1&&el.getBoundingClientRect().height<=96);
  rows=['OPEN','SELESAI','BATAL'].flatMap((status,s)=>Array.from({length:12},(_,i)=>({id:100+s*12+i,creator:'hrd',title:'Agenda '+status+' '+i,notes:'',date:today,start_time:null,end_time:null,visibility:'private',status,version:1,recipients:[]})));
  await reload();
  const sameSize=()=>{const rect=document.querySelector('.agenda-dialog').getBoundingClientRect();return Math.abs(rect.height-monthHeight)<=1&&Math.abs(rect.width-monthWidth)<=1;};
  const populatedSizeStable=sameSize();
  document.querySelector('.calendar-day:not(.muted):not(.selected)').click();await wait();
  const selectedSizeStable=sameSize();
  button('Tambah').click();await wait();
  const editorSizeStable=sameSize();
  document.querySelector('.agenda-back').click();button('Hari ini').click();await wait();
  const day=document.querySelector('.calendar-day.selected');
  const markers=[...day.querySelectorAll('.day-count')];
  const pane=document.querySelector('.agenda-pane'),layout=document.querySelector('.agenda-layout');
  const scroller=getComputedStyle(pane).overflowY==='visible'?layout:pane;
  scroller.scrollTop=scroller.scrollHeight;await wait();
  const last=[...document.querySelectorAll('.agenda-card')].at(-1).getBoundingClientRect();
  return {monthHeight,monthCellSide,weekHeight,weekCells,populatedSizeStable,selectedSizeStable,editorSizeStable,counts:markers.map(el=>el.textContent.trim().split(' ')[0]),label:day.getAttribute('aria-label'),markersFit:markers.every(el=>el.getBoundingClientRect().right<=day.getBoundingClientRect().right+1&&el.getBoundingClientRect().bottom<=day.getBoundingClientRect().bottom+1),lastCardVisible:last.bottom<=scroller.getBoundingClientRect().bottom+1};
 } finally {rows=original;await reload();}
};
`
await browserAudit('agenda-audit', fixture, async ({ evaluate, command, screenshot }) => {
    const checks = await evaluate('(async()=>{await new Promise(resolve=>{const poll=()=>window.agendaAudit?resolve(true):setTimeout(poll,50);poll()});return window.agendaAudit();})()')
    for (const [key, value] of Object.entries(checks)) assert.equal(value, true, key)
    const backgrounds=()=>evaluate("Object.fromEntries(['.agenda-dialog','.calendar-pane','.calendar-day:not(.selected)','.agenda-card','.agenda-pane','.form-heading','.agenda-form-actions'].map(selector=>[selector,document.querySelector(selector)?getComputedStyle(document.querySelector(selector)).backgroundColor:null]))");
    const light=await backgrounds();
    for(const selector of ['.agenda-dialog','.calendar-pane','.calendar-day:not(.selected)','.agenda-card'])assert.equal(light[selector],'rgb(255, 255, 255)',selector);
    assert.equal(light['.agenda-pane'],'rgb(240, 243, 248)');
    const sharing=await evaluate('window.auditSharingScroll()');
    assert.equal(sharing.scrolls,1,JSON.stringify(sharing));
    assert.ok(Math.abs(sharing.loadingHeight-sharing.loadedHeight)<=1,JSON.stringify(sharing));
    const click = async rect => {
        const point={x:rect.x+rect.width/2,y:rect.y+rect.height/2};
        await command('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...point});
        await command('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...point});
    }
    const waitPanel = async text => evaluate(`new Promise((resolve,reject)=>{let n=0;const poll=()=>{const panel=document.querySelector('.recipient-panel');if(panel?.innerText.includes(${JSON.stringify(text)}))resolve(true);else if(n++>100)reject(Error('Panel missing: '+${JSON.stringify(text)}));else setTimeout(poll,40);};poll();})`);
    await evaluate('window.recipientTestMode(false,800)');
    await evaluate('window.prepareRecipient()');
    const formBackgrounds=await backgrounds();
    for(const selector of ['.agenda-pane','.form-heading','.agenda-form-actions'])assert.equal(formBackgrounds[selector],'rgb(240, 243, 248)',selector);
    const fieldBackgrounds=await evaluate("Array.from(document.querySelectorAll('.agenda-form input:not([type=radio]):not([type=checkbox]),.agenda-form textarea,.agenda-form select'),el=>getComputedStyle(el).backgroundColor)");
    assert.ok(fieldBackgrounds.length>=6);
    for(const color of fieldBackgrounds)assert.equal(color,'rgb(255, 255, 255)');
    const notes=await evaluate('window.auditNotesResize()');
    assert.ok(notes.grows&&notes.fits&&notes.shrinks&&notes.stable,JSON.stringify(notes));assert.equal(notes.overflow,'hidden');
    assert.equal(await evaluate("document.activeElement?.id==='agenda-recipient-search'"),true);
    const movement=await evaluate('window.auditVisibilityMotion()');
    assert.ok(movement.before>movement.middle&&movement.middle>movement.after,JSON.stringify(movement));
    await command('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
    assert.equal(await evaluate("getComputedStyle(document.querySelector('.visibility-indicator')).transitionDuration"),'0s');
    await command('Emulation.setEmulatedMedia',{features:[]});
    assert.equal(await waitPanel('Memuat akun'), true);
    assert.equal(await waitPanel('Pabrik Satu'), true);
    const item = await evaluate("document.querySelector('.recipient-option input[value=p1]').closest('label').getBoundingClientRect().toJSON()");
    await click(item);
    assert.equal(await evaluate("document.querySelector('.selected-recipients').innerText.includes('Pabrik Satu')"), true);
    const cross = await evaluate("(()=>{const b=document.querySelector('.selected-recipients button').getBoundingClientRect(),s=document.querySelector('.selected-recipients button svg').getBoundingClientRect();return {width:b.width,height:b.height,x:Math.abs((b.left+b.width/2)-(s.left+s.width/2)),y:Math.abs((b.top+b.height/2)-(s.top+s.height/2)),modes:document.querySelectorAll('.visibility-picker input[type=radio]').length}})()");
    assert.equal(cross.width, cross.height); assert.ok(cross.x < .5 && cross.y < .5); assert.equal(cross.modes, 2);
    await screenshot('selection.png');
    await evaluate("document.querySelector('.recipient-option input[value=p2]').focus()");
    await command('Input.dispatchKeyEvent',{type:'keyDown',key:' ',code:'Space',windowsVirtualKeyCode:32});
    await command('Input.dispatchKeyEvent',{type:'keyUp',key:' ',code:'Space',windowsVirtualKeyCode:32});
    assert.equal(await evaluate("document.querySelector('.recipient-option input[value=p2]').checked"),true);
    await evaluate("document.querySelector('#agenda-recipient-search').value='tidak-ada';document.querySelector('#agenda-recipient-search').dispatchEvent(new Event('input',{bubbles:true}))");
    assert.equal(await waitPanel('Tidak ditemukan'), true);
    assert.equal(await evaluate("document.querySelectorAll('.selected-recipients li').length"),2);
    await evaluate('window.closeRecipientEditor();window.recipientTestMode(true,0)');
    await evaluate('window.prepareRecipient()');
    assert.equal(await waitPanel('Gagal memuat akun penerima'), true);
    await evaluate("window.recipientTestMode(false,0);document.querySelector('.recipient-list button').click()");
    assert.equal(await waitPanel('Pabrik Dua'), true);
    const statusRect=await evaluate("(()=>{const el=document.querySelector('.status-trigger');el.scrollIntoView({block:'center',behavior:'instant'});return el.getBoundingClientRect().toJSON()})()");
    await click(statusRect);
    assert.equal(await evaluate("new Promise((resolve,reject)=>{let n=0;const poll=()=>{const el=document.querySelector('.agenda-status-options');if(el&&el.getBoundingClientRect().height>30&&Number(getComputedStyle(el).opacity)>.95)resolve(true);else if(n++>100)reject(Error('Status menu not visible'));else setTimeout(poll,30)};poll()})"),true);
    await screenshot('status-dropdown.png');
    await command('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
    const compact=await evaluate('window.auditCompactLayout()');
    assert.equal(compact.headerSticky,'sticky');assert.equal(compact.footerSticky,'sticky');
    assert.ok(Math.abs(compact.headerTop-compact.scrollTop)<=2,JSON.stringify(compact));
    assert.ok(compact.footerBottom<=compact.scrollBottom+1&&compact.footerBottom>=compact.scrollBottom-5,JSON.stringify(compact));
    assert.ok(compact.lastBottom<=compact.footerTop+1,JSON.stringify(compact));
    assert.equal(compact.columns,3);assert.ok(compact.dateTimeAligned);assert.equal(compact.inputHeight,32);
    await screenshot('compact-form.png');
    await evaluate('window.closeRecipientEditor()');
    assert.equal(await evaluate("document.querySelector('.agenda-pane').scrollTop===0&&!!document.querySelector('.daily-heading')"),true);
    const desktop = await screenshot('desktop.png')
    assert.equal(await evaluate('window.agendaDark()'), 'rgb(23, 35, 52)')
    await evaluate('new Promise(resolve=>setTimeout(resolve,180))');
    const darkBackgrounds=await backgrounds();
    assert.equal(darkBackgrounds['.agenda-pane'],'rgb(29, 43, 62)');
    assert.equal(darkBackgrounds['.agenda-card'],'rgb(23, 35, 52)');
    const dark = await screenshot('dark.png')
    await command('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true })
    const mobile = await evaluate('new Promise(r=>setTimeout(()=>r({layout:getComputedStyle(document.querySelector(".agenda-layout")).flexDirection,width:document.querySelector(".agenda-dialog").getBoundingClientRect().width}),150))')
    assert.equal(mobile.layout, 'column'); assert.ok(mobile.width <= 390)
    const small = await screenshot('mobile.png')
    await evaluate('window.prepareRecipient()');
    assert.equal(await waitPanel('Pabrik Satu'), true);
    assert.equal(await evaluate("document.activeElement?.id==='agenda-recipient-search'"),true);
    const panel = await evaluate("document.querySelector('.recipient-panel').getBoundingClientRect().toJSON()");
    assert.ok(panel.left >= 0 && panel.right <= 391);
    assert.ok(await evaluate("document.querySelector('.recipient-list').getBoundingClientRect().height<=240"));
    await screenshot('mobile-picker.png');
    const compactMobile=await evaluate('window.auditCompactLayout()');
    const mobileNotes=await evaluate('window.auditNotesResize()');
    assert.ok(mobileNotes.grows&&mobileNotes.fits&&mobileNotes.shrinks&&mobileNotes.stable,JSON.stringify(mobileNotes));
    assert.equal(compactMobile.columns,3);assert.ok(compactMobile.dateTimeAligned);
    assert.ok(Math.abs(compactMobile.headerTop-compactMobile.scrollTop)<=2,JSON.stringify(compactMobile));
    assert.ok(compactMobile.footerBottom<=compactMobile.scrollBottom+1&&compactMobile.footerBottom>=compactMobile.scrollBottom-5,JSON.stringify(compactMobile));
    await command('Emulation.setDeviceMetricsOverride',{width:680,height:700,deviceScaleFactor:1,mobile:false});
    await evaluate("document.querySelector('.recipient-panel').scrollIntoView({block:'center',behavior:'instant'})");
    const zoom=await evaluate("({width:document.querySelector('.agenda-dialog').getBoundingClientRect().width,overflow:document.querySelector('.agenda-pane').scrollWidth>document.querySelector('.agenda-pane').clientWidth+1})");
    assert.ok(zoom.width<=680&&!zoom.overflow);
    const fitChecks=[];
    for(const [width,height] of [[1360,900],[1100,600],[1000,500],[390,700]]){
      await command('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<760});
      if(width===1360||width===390){
        const density=await evaluate('window.auditCalendarDensity()');
        assert.ok(density.weekCells&&Math.abs(density.weekHeight-density.monthHeight)<=1,JSON.stringify(density));
        assert.ok(density.populatedSizeStable&&density.selectedSizeStable&&density.editorSizeStable,JSON.stringify(density));
        if(width===1360)assert.ok(density.monthCellSide>=80,JSON.stringify(density));
        assert.deepEqual(density.counts,['12','12','12']);
        for(const status of ['OPEN','SELESAI','BATAL'])assert.ok(density.label.includes('12 '+status),JSON.stringify(density));
        assert.ok(density.markersFit&&density.lastCardVisible,JSON.stringify(density));
      }
      let previousFit;
      for(const weeks of [4,5,6]){
        const fit=await evaluate(`window.auditCalendarFit(${weeks})`);
        assert.equal(fit.weeks,6,JSON.stringify(fit));assert.equal(fit.sourceWeeks,weeks);assert.ok(fit.cellsFit&&!fit.horizontalOverflow&&fit.calendarScroll<=1&&fit.firstTop>=fit.scrollTop-1,JSON.stringify({width,height,...fit}));
        if(previousFit)for(const key of ['gridWidth','gridHeight','cellSide'])assert.ok(Math.abs(fit[key]-previousFit[key])<=1,JSON.stringify({width,height,previousFit,fit}));
        previousFit=fit;
        assert.ok(fit.lastBottom<=fit.noteTop&&fit.noteBottom<=fit.scrollBottom+1,JSON.stringify(fit));
        assert.ok(fit.dialogTop>=0&&fit.dialogBottom<=height+1,JSON.stringify(fit));
        fitChecks.push({width,height,weeks});
      }
    }
    await screenshot('calendar-fit-mobile.png');
    await command('Emulation.setDeviceMetricsOverride',{width:1100,height:600,deviceScaleFactor:1,mobile:false});
    await evaluate('window.auditCalendarFit(6)');
    await screenshot('calendar-fit-desktop.png');
    assert.equal(await evaluate('window.agendaLogout()'), true)
    console.log(JSON.stringify({ checks, mobile, fitChecks, desktop, dark, small }, null, 2))
})
