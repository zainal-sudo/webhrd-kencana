import assert from 'node:assert/strict'
import { browserAudit } from './helpers/browserAudit.mjs'

const fixture = `
import { createApp, h, ref, nextTick } from 'vue';
import Toast, { POSITION } from 'vue-toastification';
import { useAgendaStartNotice } from '/src/composables/useAgendaStartNotice.ts';
import { api } from '/src/api/axios.ts';
import 'vue-toastification/dist/index.css';
import '/src/assets/design-system.css';
import '/src/assets/main.css';
import '/src/assets/theme.css';
const who=ref('session:hrd'), mounted=ref(true), claims=new Set();
let due=1,poll,calls=0;
const realInterval=window.setInterval.bind(window);
window.setInterval=(fn,ms,...args)=>{if(ms===60000)poll=fn;return realInterval(fn,ms,...args)};
api.post=async(url,body)=>{
  calls++;
  const key=who.value.split(':').at(-1)+':'+body.client_id+':'+due;
  if(claims.has(key))return {data:{data:[]}};
  claims.add(key);
  return {data:{data:[{id:due,title:'Rapat HRD <script>aman</script>',date:'2026-10-19',start_time:'09:00',end_time:'10:00',visibility:due===1?'shared':'private',kind:body.catch_up?'ongoing':'started'}]}};
};
const Notices={setup(){useAgendaStartNotice(()=>who.value);return()=>h('p','HRIS Kencana');}};
createApp({render:()=>h('main',{},[mounted.value?h(Notices):null])}).use(Toast,{position:POSITION.TOP_RIGHT,toastClassName:'kencana-toast'}).mount('#app');
window.tick=()=>poll();window.nextAgenda=()=>{due=2};
window.remount=async()=>{mounted.value=false;await nextTick();mounted.value=true;await nextTick()};
window.changeUser=()=>{who.value='session:p1'};
window.inspect=()=>({claims:[...claims],calls,clientId:localStorage.getItem('kencana_agenda_client_id')});
`
await browserAudit('agenda-start-notice', fixture, async ({evaluate, screenshot}) => {
  const waitFor = expression => evaluate(`(async()=>{for(let i=0;i<400;i++){if(${expression})return;await new Promise(r=>setTimeout(r,30))}throw Error('Timeout: '+${JSON.stringify(expression)})})()`)
  await waitFor("document.querySelector('.agenda-start-toast')")
  const firstClient = (await evaluate('window.inspect()')).clientId;
  assert.match(firstClient,/^[a-z0-9_-]{16,64}$/i);
  assert.equal(await evaluate("document.querySelector('.agenda-start-toast strong').textContent"),'Agenda sedang berlangsung')
  assert.equal(await evaluate("document.querySelector('.agenda-start-toast small').textContent"),'09:00–10:00 · Bersama')
  assert.equal(await evaluate("document.querySelector('.agenda-start-toast script')"),null)
  assert.ok(await evaluate("!!document.querySelector('.Vue-Toastification__close-button')"))
  await evaluate('new Promise(r=>setTimeout(r,800))')
  assert.ok(await evaluate("(()=>{const r=document.querySelector('.agenda-start-toast').getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight})()"))
  await screenshot('ongoing-light.png')
  await evaluate("document.querySelector('.Vue-Toastification__close-button').click()")
  await waitFor("!document.querySelector('.agenda-start-toast')")
  await evaluate("window.tick();window.dispatchEvent(new Event('focus'))")
  await evaluate('new Promise(r=>setTimeout(r,100))')
  assert.equal(await evaluate("document.querySelector('.agenda-start-toast')"),null)
  await evaluate("window.remount()")
  await evaluate('new Promise(r=>setTimeout(r,100))')
  assert.equal(await evaluate("document.querySelector('.agenda-start-toast')"),null)
  assert.equal((await evaluate('window.inspect()')).clientId,firstClient)
  await evaluate("window.nextAgenda();window.tick()")
  await waitFor("document.querySelector('.agenda-start-toast')")
  assert.equal(await evaluate("document.querySelector('.agenda-start-toast strong').textContent"),'Agenda dimulai sekarang')
  assert.equal(await evaluate("document.querySelector('.agenda-start-toast small').textContent"),'09:00–10:00 · Pribadi')
  await evaluate("document.documentElement.dataset.theme='dark'")
  await evaluate('new Promise(r=>setTimeout(r,800))')
  await screenshot('started-dark.png')
  await evaluate("window.changeUser()")
  await waitFor("document.querySelector('.agenda-start-toast strong')?.textContent==='Agenda sedang berlangsung'")
  assert.equal((await evaluate('window.inspect()')).claims.length,3)
  await evaluate("document.querySelector('.Vue-Toastification__close-button').click()")
  await waitFor("!document.querySelector('.agenda-start-toast')")
  await evaluate("localStorage.setItem('kencana_agenda_client_id','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');window.remount()")
  await waitFor("document.querySelector('.agenda-start-toast')")
  assert.equal((await evaluate('window.inspect()')).claims.length,4)
  console.log('Agenda time toast: real popup/close, safe wording, initial vs polling, persistent client ID, per-client/account dedup, light/dark passed.')
})
