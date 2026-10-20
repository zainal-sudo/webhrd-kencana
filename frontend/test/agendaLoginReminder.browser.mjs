import assert from 'node:assert/strict'
import { browserAudit } from './helpers/browserAudit.mjs'

const fixture = `
import {createApp,h,nextTick} from 'vue';
import {createPinia} from 'pinia';
import {createRouter,createMemoryHistory} from 'vue-router';
import {VApp} from 'vuetify/components';
import vuetify from '/src/plugins/vuetify.ts';
import Sidebar from '/src/components/layout/AppSidebar.vue';
import {useAuthStore} from '/src/stores/authStore.ts';
import {usePermissionStore} from '/src/stores/permissionStore.ts';
import {api} from '/src/api/axios.ts';
import {jakartaToday} from '/src/utils/agenda.ts';
import 'vuetify/styles';
import '/src/assets/design-system.css';
import '/src/assets/main.css';
import '/src/assets/theme.css';
let summary={count:9,ongoing_count:1,all_day_open_count:2};
const calls=[];
api.defaults.adapter=async config=>{
 const url=config.url;calls.push(url);let result;
 if(url==='/login')result={token:'fixture-HRD',user:{user_kode:'HRD',user_nama:'HRD',user_akses:''},menus:[]};
 else if(url==='/me')result={user_kode:'HRD',user_nama:'HRD',user_akses:'',menus:[]};
 else if(url==='/agenda/today')result={date:jakartaToday(),...summary};
 else if(url==='/agenda/notifications/claim')result=[]; // Start notice already claimed: reminder must still work.
 else throw Error('Unexpected fixture URL '+url);
 return {data:{data:result},status:200,statusText:'OK',headers:{},config};
};
const pinia=createPinia(),auth=useAuthStore(pinia);
if(!sessionStorage.getItem('agenda-login-fixture-initialized')){
 await auth.login('HRD','fixture');sessionStorage.setItem('agenda-login-fixture-initialized','yes');
}else{await auth.refreshProfile();}
usePermissionStore(pinia).loaded=true;
createApp({render:()=>h(VApp,{},()=>h('div',{style:'display:flex;height:100vh'},[auth.isAuthenticated?h(Sidebar):null,h('main',{},'HRIS')]))})
 .use(pinia).use(createRouter({history:createMemoryHistory(),routes:[{path:'/',component:{render:()=>null}}]})).use(vuetify).mount('#app');
window.relogin=async()=>{auth.logout();await nextTick();await auth.login('HRD','fixture');await nextTick();};
window.setSummary=value=>{summary=value};
window.inspect=()=>({calls,marker:sessionStorage.getItem('kencana_agenda_login_marker'),client:localStorage.getItem('kencana_agenda_client_id')});
window.loginReminderReady=true;
`

await browserAudit('agenda-login-reminder', fixture, async ({evaluate,command,screenshot}) => {
  const waitFor = expression => evaluate(`(async()=>{for(let i=0;i<400;i++){if(${expression})return;await new Promise(r=>setTimeout(r,30))}throw Error('Timeout: '+${JSON.stringify(expression)})})()`)
  const bubble = 'document.querySelector(".agenda-login-notice")'
  await waitFor(`${bubble}?.textContent.includes('2 agenda seharian')`)
  assert.equal(await evaluate(`${bubble}.querySelector('strong').textContent`),'Agenda sedang berlangsung')
  assert.ok(await evaluate(`${bubble}.textContent.includes('1 agenda yang sedang berlangsung')`))
  assert.ok(await evaluate("!!document.querySelector('.agenda-notice-dot')"))
  assert.equal((await evaluate('window.inspect()')).marker,null)
  await evaluate('new Promise(r=>setTimeout(r,350))')
  await screenshot('mixed-reminder.png')
  const client = (await evaluate('window.inspect()')).client
  await command('Page.reload', {ignoreCache:true})
  await waitFor("window.loginReminderReady===true&&window.inspect().calls.includes('/agenda/today')")
  await evaluate('new Promise(r=>setTimeout(r,350))')
  assert.equal(await evaluate(bubble),null)
  assert.equal((await evaluate('window.inspect()')).client,client)
  await evaluate('window.relogin()')
  await waitFor(`${bubble}?.querySelector('strong')?.textContent==='Agenda sedang berlangsung'`)
  assert.equal((await evaluate('window.inspect()')).client,client)
  await evaluate("document.querySelector('.agenda-login-close').click()")
  await waitFor(`!${bubble}`)
  await evaluate("window.dispatchEvent(new Event('focus'))")
  await evaluate('new Promise(r=>setTimeout(r,350))')
  assert.equal(await evaluate(bubble),null)
  await evaluate('window.setSummary({count:9,ongoing_count:0,all_day_open_count:2});window.relogin()')
  await waitFor(`${bubble}?.querySelector('strong')?.textContent==='Agenda hari ini'`)
  assert.equal(await evaluate(`${bubble}.querySelectorAll('.agenda-login-message p').length`),1)
  await evaluate('new Promise(r=>setTimeout(r,350))')
  await screenshot('all-day-reminder.png')
  await evaluate('window.setSummary({count:9,ongoing_count:0,all_day_open_count:0});window.relogin()')
  await waitFor(`!${bubble}&&window.inspect().marker===null`)
  assert.ok(await evaluate("!!document.querySelector('.agenda-notice-dot')"))
  console.log('Login reminder: actual login, real page refresh, same-client re-login after start claim, mixed/all-day wording, empty reminder and independent daily indicator passed.')
})
