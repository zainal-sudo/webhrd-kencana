import assert from 'node:assert/strict'
import { browserAudit } from './helpers/browserAudit.mjs'

// Real views/router/components with fictional API data; no database connection.
const fixture = `
import { createApp, h } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createMemoryHistory, RouterView } from 'vue-router';
import Toast from 'vue-toastification';
import { createVuetify } from 'vuetify';
import * as components from 'vuetify/components';
import * as directives from 'vuetify/directives';
import 'vuetify/styles';
import '/src/assets/design-system.css';
import '/src/assets/main.css';
import '/src/assets/theme.css';
import UserView from '/src/views/setting/UserView.vue';
import UserForm from '/src/views/setting/UserForm.vue';
import HakAkses from '/src/views/setting/HakAksesView.vue';
import { useAuthStore } from '/src/stores/authStore.ts';
import { useTabsStore } from '/src/stores/tabsStore.ts';
import { api } from '/src/api/axios.ts';
const users=[{Kode:'ADMIN',Nama:'Admin fixture',Cabang:'',Edit:1,Dibuat:'2026-10-20'}, {Kode:'U1',Nama:'User One',Cabang:'P1',Edit:0,Dibuat:'2026-10-20'}];
const rights = Object.fromEntries(users.map(u=>[u.Kode,[{men_id:3,men_nama:'frmUser',men_keterangan:'Lap. Akhit Tahun',men_modul:2,view:'Y',insert:'N',edit:'N',delete:'N'}]]));
const writes=[];
api.get=async(url,config)=>{
 if(url==='/master/lookup')return{data:{data:{pabrik:[{Kode:'P1',Nama:'Pabrik fixture'}]}}};
 if(url==='/master/user')return{data:{data:config?.params?.page?users:[...users,...Array.from({length:30},(_,i)=>({Kode:'FIX'+i,Nama:'User fixture '+i}))],...(config?.params?.page?{pagination:{page:1,per_page:25,total:users.length,last_page:1}}:{})}};
 const code=decodeURIComponent(url.split('/')[3]);
 if(url.endsWith('/hak'))return{data:{data:structuredClone(window.fixture.longRights?[...rights[code],...Array.from({length:45},(_,i)=>({...rights[code][0],men_id:100+i,men_keterangan:'Modul fixture '+i}))]:rights[code])}};
 return{data:{data:users.find(u=>u.Kode===code)}};
};
api.put=async(url,body)=>{writes.push({url,body:structuredClone(body)});if(url.endsWith('/hak')){const code=decodeURIComponent(url.split('/')[3]);rights[code]=body.items.map(i=>({...rights[code][0],...i}));}return{data:{message:'Saved fixture'}};};
api.delete=async(url)=>{writes.push({url,deleted:true});return{data:{message:'Deleted fixture'}};};
api.post=async(url,body)=>{writes.push({url,body:structuredClone(body)});return{data:{message:'Created fixture'}};};
const pinia=createPinia(),auth=useAuthStore(pinia);
auth.token='fixture';auth.user={user_kode:'ADMIN',user_nama:'Admin',user_akses:''};
auth.menus=[{men_id:3,men_nama:'frmUser',men_modul:2,can_insert:true,can_edit:true,can_delete:true}];
auth.refreshProfile=async()=>{auth.menus=rights.ADMIN[0].view==='Y'?auth.menus:[];return true;};
const tabs=useTabsStore(pinia);
window.fixture={writes,rights,auth,tabs};
const router=createRouter({history:createMemoryHistory(),routes:[{path:'/setting/user',component:UserView},{path:'/setting/user/form',component:UserForm},{path:'/setting/hak-akses',component:HakAkses},{path:'/dashboard',component:{render:()=>h('p','Dashboard fixture')}}]});
router.afterEach(to=>tabs.openTab({path:to.path,query:{...to.query},title:'Hak Akses',closable:true}));
window.go=path=>router.push(path);
await router.push('/setting/user');
createApp({render:()=>h('main',{class:'app-shell',style:'height:95vh;padding:12px'},h(RouterView,{key:router.currentRoute.value.fullPath}))}).use(pinia).use(router).use(Toast).use(createVuetify({components,directives})).mount('#app');
`;

await browserAudit('hak-akses',fixture,async({evaluate,command,screenshot})=>{
 const waitFor=expression=>evaluate(`(async()=>{for(let i=0;i<700;i++){if(${expression})return true;await new Promise(r=>setTimeout(r,50));}throw Error('Timed out: '+${JSON.stringify(expression)});})()`);
 const save=()=>evaluate("document.querySelector('.bar-top .primary').click()");
 await waitFor("document.querySelectorAll('.browse-table tbody tr').length===2");
 assert.equal(await evaluate("document.querySelectorAll('a[href*="+JSON.stringify('/setting/hak-akses')+"]').length"),2);
 assert.ok(await evaluate("document.querySelector('.browse-table').textContent.includes('Semua Pabrik')"));
 assert.equal(await evaluate("document.querySelectorAll('.browse-table button[title=\"Reset Password\"]').length"),2);
 assert.deepEqual(await evaluate("[...document.querySelectorAll('.browse-table thead th')].map(el=>el.textContent.replace(/unfold_more|filter_list/g,'').trim())"),['No','Kode User','Nama User','Pabrik / Cabang','Aksi']);
 const firstActions="document.querySelector('.browse-table tbody .row-actions')";
 assert.deepEqual(await evaluate(`[...${firstActions}.children].map(el=>el.title)`),['Hak Akses','Edit User','Reset Password','Hapus User']);
 for(const theme of ['light','dark']) {
  await evaluate(`document.documentElement.dataset.theme='${theme}'`);
  for(const width of [1360,390]) {
   await command('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width===390});
   await evaluate("new Promise(r=>setTimeout(r,100))");
   assert.equal(await evaluate("document.querySelector('.browse-table tbody tr').getBoundingClientRect().height"),35);
   assert.ok(await evaluate(`(()=>{const buttons=[...${firstActions}.children],rects=buttons.map(b=>b.getBoundingClientRect());return rects.every(r=>r.height===30&&r.top===rects[0].top)&&rects.slice(1).every(r=>r.width===36)})()`));
   assert.equal(await evaluate("document.querySelector('.browse-table .action-col').getBoundingClientRect().width"),240);
   assert.equal(await evaluate(`getComputedStyle(${firstActions}).gap`),'6px');
   assert.equal(await evaluate(`document.querySelector('.access-button').getBoundingClientRect().width`),105);
   assert.equal(await evaluate(`document.querySelector('.access-button .ms-icon').textContent.trim()`),'shield');
   await screenshot('user-'+theme+'-'+width+'.png');
  }
 }
 await command('Emulation.setDeviceMetricsOverride',{width:1360,height:900,deviceScaleFactor:1,mobile:false});
 await evaluate("document.documentElement.dataset.theme='light'");
 const reset="document.querySelector('.browse-table button[title=\"Reset Password\"]')";
 const colors=await evaluate(`(()=>{const el=${reset},r=el.getBoundingClientRect();return{before:getComputedStyle(el).backgroundColor,x:r.x+r.width/2,y:r.y+r.height/2}})()`);
 await command('Input.dispatchMouseEvent',{type:'mouseMoved',x:colors.x,y:colors.y});
 await evaluate("new Promise(r=>setTimeout(r,200))");
 assert.notEqual(await evaluate(`getComputedStyle(${reset}).backgroundColor`),colors.before);
 await evaluate(`${reset}.focus()`);
 assert.ok(await evaluate(`parseFloat(getComputedStyle(${reset}).outlineWidth)>=2`));
 await evaluate(`${reset}.click()`);
 await waitFor("document.querySelector('.v-dialog input[type=password]')");
 await evaluate("const input=document.querySelector('.v-dialog input[type=password]');input.value='FixturePassword';input.dispatchEvent(new Event('input',{bubbles:true}));");
 await evaluate("[...document.querySelectorAll('.v-dialog button')].find(b=>b.textContent.trim()==='Simpan').click()");
 await waitFor("window.fixture.writes.length===1");
 assert.equal(await evaluate("window.fixture.writes[0].url"),'/master/user/ADMIN/password');
 await waitFor("!document.querySelector('.v-dialog input[type=password]')");
 await evaluate("window.confirm=()=>false;document.querySelector('.browse-table button[title=\"Hapus User\"]').click()");
 assert.equal(await evaluate("window.fixture.writes.length"),1);
 await evaluate("window.confirm=()=>true;document.querySelector('.browse-table button[title=\"Hapus User\"]').click()");
 await waitFor("window.fixture.writes.length===2");
 assert.equal(await evaluate("window.fixture.writes[1].url"),'/master/user/ADMIN');
 await evaluate("window.fixture.auth.menus[0].can_edit=false;window.fixture.auth.menus[0].can_delete=false;window.fixture.auth.menus[0].can_insert=false");
 await waitFor("document.querySelectorAll('.browse-table .row-btn.edit,.browse-table .icon-button').length===0");
 assert.equal(await evaluate("document.querySelectorAll('.browse-table .access-button').length"),2);
 await evaluate("window.fixture.auth.menus[0].can_edit=true;window.fixture.auth.menus[0].can_delete=true;window.fixture.auth.menus[0].can_insert=true;window.fixture.writes.length=0");
 await waitFor("document.querySelector('.browse-table .row-btn.edit')");
 await evaluate("document.querySelectorAll('.browse-table .row-btn.edit')[1].click()");
 await waitFor("document.querySelector('input')?.value==='U1'");

 await evaluate("window.go('/setting/hak-akses?kode=U1')");
 await waitFor("document.querySelectorAll('.tbl input').length===4");
 assert.deepEqual(await evaluate("[...document.querySelectorAll('.tbl input')].map(i=>i.checked)"),[true,false,false,false]);
 for(const theme of ['light','dark']) {
  await evaluate(`document.documentElement.dataset.theme='${theme}'`);
  for(const width of [1360,390]) {
   await command('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width===390});
   await evaluate("new Promise(r=>setTimeout(r,100))");
   assert.ok(await evaluate("(()=>{const page=document.querySelector('.hak-user-page');return page.scrollWidth<=page.clientWidth&&parseFloat(getComputedStyle(page).borderRadius)>=10})()"));
   assert.equal(await evaluate("getComputedStyle(document.querySelector('.permission-card')).borderRadius"),'12px');
   assert.equal(await evaluate("document.querySelector('.bar-top .primary').getBoundingClientRect().height"),36);
   assert.equal(await evaluate("getComputedStyle(document.querySelector('.bar-top .v-autocomplete__selection')).fontWeight"),'600');
   if(width>600)assert.ok(await evaluate("document.querySelector('.sticky-header').getBoundingClientRect().height<130"));
   assert.ok(await evaluate("(()=>{const select=document.querySelector('.bar-top .searchable-select').getBoundingClientRect(),save=document.querySelector('.bar-top .primary').getBoundingClientRect();return innerWidth>600?Math.abs(select.bottom-save.bottom)<1:select.bottom<save.top})()"));
   await screenshot('hak-user-'+theme+'-'+width+'.png');
   const anchor=await evaluate("(()=>{const r=document.querySelector('.bar-top .searchable-select').getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()");
   await command('Input.dispatchMouseEvent',{type:'mousePressed',x:anchor.x,y:anchor.y,button:'left',clickCount:1});
   await command('Input.dispatchMouseEvent',{type:'mouseReleased',x:anchor.x,y:anchor.y,button:'left',clickCount:1});
   await waitFor("document.querySelector('.hak-user-select-menu .v-list-item')");
   await evaluate("new Promise(r=>setTimeout(r,180))");
   assert.ok(await evaluate("(()=>{const menu=document.querySelector('.hak-user-select-menu'),r=menu.getBoundingClientRect();return r.height<=261&&r.bottom<=innerHeight-10&&r.left>=0&&r.right<=innerWidth})()"));
   assert.ok(await evaluate("(()=>{const menu=document.querySelector('.hak-user-select-menu');return [menu,...menu.querySelectorAll('*')].some(el=>el.scrollHeight>el.clientHeight&&getComputedStyle(el).overflowY==='auto')})()"));
   await screenshot('user-dropdown-'+theme+'-'+width+'.png');
   await command('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
   await command('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});

  }
 }
 await command('Emulation.setDeviceMetricsOverride',{width:1360,height:900,deviceScaleFactor:1,mobile:false});
 await evaluate("document.documentElement.dataset.theme='light'");

 await evaluate("(()=>{const input=document.querySelector('.bar-top .searchable-select input');input.focus();input.value='User One';input.dispatchEvent(new Event('input',{bubbles:true}))})()");
 await waitFor("document.querySelectorAll('.hak-user-select-menu [role=option]').length===1");
 assert.ok(await evaluate("document.querySelector('.hak-user-select-menu [role=option]').textContent.includes('U1 - User One')"));
 await evaluate("document.querySelector('.hak-user-select-menu [role=option]').click()");
 await waitFor("document.querySelectorAll('.tbl input').length===4&&!document.querySelector('fieldset').disabled");
 assert.equal(await evaluate("window.fixture.tabs.tabs.find(t=>t.id==='/setting/hak-akses?kode=U1').title"),'Hak Akses \u00b7 User One');
 assert.equal(await evaluate("document.querySelector('.tbl tbody td:nth-child(2)').textContent.trim()"),'Lap. Akhir Tahun');
 assert.equal(await evaluate("document.querySelector('.tbl input').getAttribute('aria-label')"),'Lap. Akhir Tahun: view');
 await save();
 await waitFor("window.fixture.writes.length===1&&!document.querySelector('fieldset').disabled");
 assert.deepEqual(await evaluate("window.fixture.writes[0].body.items[0]"),{men_id:3,view:'Y',insert:'N',edit:'N',delete:'N'});
 await evaluate("document.querySelectorAll('.tbl input')[2].click()");
 assert.deepEqual(await evaluate("[...document.querySelectorAll('.tbl input')].map(i=>i.checked)"),[true,false,true,false]);
 await evaluate("document.querySelectorAll('.tbl input')[0].click()");
 assert.deepEqual(await evaluate("[...document.querySelectorAll('.tbl input')].map(i=>i.checked)"),[false,false,false,false]);
 await save();await waitFor("window.fixture.writes.length===2&&!document.querySelector('fieldset').disabled");
 await screenshot('rights.png');
 await evaluate("window.go('/setting/user/form?id=U1')");
 await waitFor("document.querySelector('input')?.value==='U1'&&!document.querySelectorAll('input')[1].disabled");
 assert.equal(await evaluate("document.querySelector('input').disabled"),true);
 assert.equal(await evaluate("document.querySelectorAll('input[type=password]').length"),0);
 assert.equal(await evaluate("document.querySelectorAll('input')[1].value"),'User One');
 await evaluate("window.go('/setting/user/form')");
 await waitFor("document.querySelector('input[type=password]')&&!document.querySelector('input').disabled");
 assert.equal(await evaluate("document.querySelector('select').value"),'');
 await screenshot('new-user.png');
 await evaluate("window.fixture.longRights=true;window.go('/setting/hak-akses?kode=U1')");
 await waitFor("document.querySelectorAll('.tbl tbody tr').length>40");
 const headerTop=await evaluate("document.querySelector('.sticky-header').getBoundingClientRect().top");
 const toolbarTop=await evaluate("document.querySelector('.bar-top').getBoundingClientRect().top");
 await evaluate("document.querySelector('.permission-body').scrollTop=300");
 await evaluate("new Promise(r=>setTimeout(r,100))");
 assert.ok(await evaluate("document.querySelector('.permission-body').scrollTop>0"));
 assert.equal(await evaluate("document.querySelector('.sticky-header').getBoundingClientRect().top"),headerTop);
 assert.equal(await evaluate("document.querySelector('.bar-top').getBoundingClientRect().top"),toolbarTop);
 await screenshot('hak-user-sticky.png');
 await evaluate("window.fixture.longRights=false");
 await evaluate("window.go('/setting/hak-akses?kode=ADMIN')");
 await waitFor("document.querySelectorAll('.tbl input').length===4");
 assert.equal(await evaluate("window.fixture.tabs.tabs.find(t=>t.id==='/setting/hak-akses?kode=ADMIN').title"),'Hak Akses \u00b7 Admin fixture');
 assert.equal(await evaluate("window.fixture.tabs.tabs.find(t=>t.id==='/setting/hak-akses?kode=U1').title"),'Hak Akses \u00b7 User One');
 await evaluate("document.querySelectorAll('.tbl input')[0].click()");
 await save();
 await waitFor("document.body.textContent.includes('Dashboard fixture')");
 assert.equal(await evaluate("window.fixture.auth.menus.length"),0);
 console.log('Browser passed: User actions, explicit Detail mapping, password only on create, Y/N read-only round-trip, checkbox dependencies and self-revocation navigation.');
});
