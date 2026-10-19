import assert from 'node:assert/strict'
import { browserAudit } from './helpers/browserAudit.mjs'

const fixture = `
import { createApp, h } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import Toast from 'vue-toastification';
import { createVuetify } from 'vuetify';
import 'vuetify/styles';
import Lembur from '/src/views/transaksi/LemburView.vue';
import { api } from '/src/api/axios.ts';
import '/src/assets/design-system.css';
import '/src/assets/main.css';
import '/src/assets/theme.css';
const pending = {}, calls = [];
let preloaded = false;
const detailRows = (nomor,count) => Array.from({length:count},(_,i)=>({Nik:nomor+'-'+i,Nama:'Nama '+nomor,Mulai:'17:00:00',Akhir:'19:00:00',Keterangan:'Keterangan '+ 'panjang'.repeat(30),Panggilan:i%2?'0':'1'}));
window.enablePreloaded = () => { preloaded = true; };
const headers = ['SPL-A','SPL-B','SPL-C'].map(Nomor=>({Nomor,Tanggal:'2026-10-19',Pabrik:'P01',Bagian:'HRD',JenisKerja:'Lembur'}));
api.get = (url, config) => {
  calls.push({url,params:config?.params});
  if(url==='/transaksi/lembur/detail') return new Promise((resolve,reject)=>{(pending[config.params.nomor] ||= []).push({resolve,reject});});
  return Promise.resolve({data:{data:headers.map(row=>preloaded&&config?.params?.include_detail==='1'?{...row,Detail:detailRows(row.Nomor,row.Nomor==='SPL-B'?0:35)}:row),pagination:{total:3,page:1,per_page:50,last_page:1}}});
};
window.calls = calls;
window.resolveDetail = (nomor, count=1) => pending[nomor].shift().resolve({data:{data:Array.from({length:count},(_,i)=>({Nik:nomor+'-'+i,Nama:'Nama '+nomor,Mulai:'17:00:00',Akhir:'19:00:00',Keterangan:'Keterangan '+ 'panjang'.repeat(30),Panggilan:i%2?'0':'1'}))}});
window.rejectDetail = nomor => pending[nomor].shift().reject(new Error('Gagal memuat detail SPL.'));
const router = createRouter({history:createMemoryHistory(),routes:[{path:'/',component:Lembur}]});
createApp({render:()=>h('main',{class:'app-shell',style:'height:95vh'},h(Lembur))}).use(createPinia()).use(router).use(Toast).use(createVuetify()).mount('#app');
`

await browserAudit('lembur-detail', fixture, async ({ evaluate, command, screenshot }) => {
  const waitFor = expression => evaluate(`(async()=>{for(let i=0;i<100;i++){if(${expression})return true;await new Promise(r=>setTimeout(r,50));}throw Error('Timed out: '+${JSON.stringify(expression)});})()`)
  const open = nomor => evaluate(`document.querySelector('button[aria-label="Buka Detail SPL ${nomor}"]').click()`)
  const close = async nomor => {
    await evaluate(`document.querySelector('button[aria-label="Tutup Detail SPL ${nomor}"]').click()`)
    await waitFor(`!${panel(nomor)}`)
  }
  const panel = nomor => `document.querySelector('section[aria-label="Rincian SPL: ${nomor}"]')`
  const mainColors = () => evaluate("[...document.querySelectorAll('.browse-table > tbody > tr:not(.expanded-row)')].map(row=>[...row.children].map(cell=>getComputedStyle(cell).backgroundColor))")
  await waitFor("document.querySelectorAll('.expand-btn').length===3")
  const initialColors = await mainColors()
  assert.equal(await evaluate("window.calls.filter(c=>c.url.endsWith('/detail')).length"), 0)
  // Native button keyboard behavior, not only scripted clicks.
  await evaluate("document.querySelector('.expand-btn').focus()")
  await command('Input.dispatchKeyEvent', { type:'keyDown', key:'Enter', code:'Enter', windowsVirtualKeyCode:13, text:'\r' })
  await command('Input.dispatchKeyEvent', { type:'keyUp', key:'Enter', code:'Enter', windowsVirtualKeyCode:13 })
  await waitFor(`${panel('SPL-A')}?.getAttribute('aria-busy')==='true'`)
  assert.ok(await evaluate("document.querySelector('.expanded-content').getAnimations().length>0"))
  await waitFor("document.querySelector('.expanded-content').getAnimations().length===0")
  await open('SPL-B')
  await waitFor(`${panel('SPL-B')}?.getAttribute('aria-busy')==='true'`)
  await evaluate("window.resolveDetail('SPL-B',0);window.resolveDetail('SPL-A',35)")
  await waitFor(`${panel('SPL-A')}?.querySelectorAll('tbody > tr').length===35`)
  assert.deepEqual(await mainColors(), initialColors)
  assert.equal(await evaluate(`getComputedStyle(${panel('SPL-A')}.closest('.expanded-row').querySelector('td')).backgroundColor`),'rgb(238, 247, 253)')
  assert.ok(await evaluate(`${panel('SPL-B')}.textContent.includes('Belum ada detail karyawan')`))
  assert.deepEqual(await evaluate(`[...${panel('SPL-A')}.querySelectorAll('thead th')].map(el=>el.textContent)`), ['No','NIK','Nama','Jam Mulai','Jam Akhir','Keterangan','Panggilan'])
  assert.deepEqual(await evaluate(`[...${panel('SPL-A')}.querySelectorAll('tbody > tr')].slice(0,2).map(el=>el.lastElementChild.textContent)`), ['Ya','Tidak'])
  assert.ok(await evaluate(`(()=>{const el=${panel('SPL-A')}.querySelector('.detail-scroll');return el.clientHeight<=320&&el.scrollHeight>el.clientHeight&&el.getBoundingClientRect().width>560})()`))
  await screenshot('desktop.png')
  await close('SPL-A'); await close('SPL-B')
  assert.deepEqual(await mainColors(), initialColors)
  await open('SPL-C')
  await waitFor(`${panel('SPL-C')}?.getAttribute('aria-busy')==='true'`)
  await evaluate("window.rejectDetail('SPL-C')")
  await waitFor(`${panel('SPL-C')}?.querySelector('[role=alert]')`)
  await evaluate(`${panel('SPL-C')}.querySelector('button').click()`)
  await waitFor(`${panel('SPL-C')}?.getAttribute('aria-busy')==='true'`)
  await close('SPL-C'); await open('SPL-C')
  await waitFor("window.calls.filter(c=>c.params?.nomor==='SPL-C').length===3")
  // Resolving a request belonging to the closed instance cannot populate the reopened panel.
  await evaluate("window.resolveDetail('SPL-C',9)")
  assert.equal(await evaluate(`${panel('SPL-C')}.getAttribute('aria-busy')`), 'true')
  await evaluate("window.resolveDetail('SPL-C',2)")
  await waitFor(`${panel('SPL-C')}?.querySelectorAll('tbody > tr').length===2`)
  await evaluate("document.documentElement.dataset.theme='dark'")
  assert.equal(await evaluate(`getComputedStyle(${panel('SPL-C')}).backgroundColor`), 'rgb(29, 43, 62)')
  assert.notEqual(await evaluate(`getComputedStyle(${panel('SPL-C')}.closest('.expanded-row').querySelector('td')).backgroundColor`),'rgb(238, 247, 253)')
  assert.equal(await evaluate(`getComputedStyle(${panel('SPL-C')}.querySelector('thead th')).backgroundColor`), 'rgb(29, 43, 62)')
  assert.notEqual(await evaluate(`getComputedStyle(${panel('SPL-C')}.querySelector('tbody > tr:first-child > td')).backgroundColor`), await evaluate(`getComputedStyle(${panel('SPL-C')}.querySelector('tbody > tr:nth-child(2) > td')).backgroundColor`))
  await screenshot('dark.png')
  const darkColors = await mainColors()
  await open('SPL-A')
  await waitFor(`${panel('SPL-A')}?.getAttribute('aria-busy')==='true'`)
  assert.deepEqual(await mainColors(), darkColors)
  await close('SPL-A')
  assert.deepEqual(await mainColors(), darkColors)
  await command('Emulation.setDeviceMetricsOverride', {width:390,height:844,deviceScaleFactor:1,mobile:true})
  await screenshot('mobile.png')
  assert.ok(await evaluate(`${panel('SPL-C')}.querySelector('.detail-scroll').clientWidth>0`))
  await evaluate("document.querySelector('button[title=\"Muat ulang\"]').click()")
  await waitFor("!document.querySelector('.spl-detail')&&!document.querySelector('.expand-btn:disabled')")
  await open('SPL-A')
  await waitFor(`${panel('SPL-A')}?.getAttribute('aria-busy')==='true'`)
  await evaluate("(()=>{const el=document.querySelector('input[aria-label=\"Tanggal awal\"]');el.value='01/10/2026';el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));})()")
  await waitFor("!document.querySelector('.spl-detail')")
  await command('Emulation.setEmulatedMedia', {features:[{name:'prefers-reduced-motion',value:'reduce'}]})
  await open('SPL-B')
  await waitFor(`${panel('SPL-B')}?.getAttribute('aria-busy')==='true'`)
  assert.equal(await evaluate("document.querySelector('.expanded-content').getAnimations().length"),0)
  await evaluate("window.enablePreloaded();document.querySelector('button[title=\"Muat ulang\"]').click()")
  await waitFor("!document.querySelector('.spl-detail')&&!document.querySelector('.expand-btn:disabled')")
  const requestsBefore = await evaluate("window.calls.filter(c=>c.url.endsWith('/detail')).length")
  await command('Emulation.setEmulatedMedia', {features:[]})
  await open('SPL-A')
  await waitFor(`${panel('SPL-A')}?.querySelectorAll('tbody > tr').length===35`)
  assert.equal(await evaluate(`${panel('SPL-A')}.getAttribute('aria-busy')`),'false')
  assert.equal(await evaluate(`${panel('SPL-A')}.querySelector('[role=status]')`),null)
  await waitFor("document.querySelector('.expanded-content').getAnimations().length===0")
  await close('SPL-A'); await open('SPL-A')
  await waitFor(`${panel('SPL-A')}?.querySelectorAll('tbody > tr').length===35`)
  await open('SPL-B')
  await waitFor(`${panel('SPL-B')}?.textContent.includes('Belum ada detail karyawan')`)
  assert.equal(await evaluate("window.calls.filter(c=>c.url.endsWith('/detail')).length"),requestsBefore)
  console.log('SPL detail: instant preloaded expansion without extra requests, fallback loading/retry, animation, stable row colors, keyboard, refresh/period reset, desktop/dark/mobile passed.')
})
