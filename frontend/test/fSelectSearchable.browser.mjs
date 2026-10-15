import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

const root = fileURLToPath(new URL('../', import.meta.url))
const browser = [process.env.CHROME_BIN, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(p => p && existsSync(p))
assert.ok(browser, 'A local Chrome/Edge browser is required')
const page = `
import { createApp, h, ref, nextTick } from 'vue';
import { createVuetify } from 'vuetify';
import { VAutocomplete } from 'vuetify/components';
import FSelect from '/src/components/fields/FSelect.vue';
import 'vuetify/styles';
import '/src/assets/design-system.css';
import '/src/assets/main.css';
import '/src/assets/theme.css';
const dark = location.search.includes('dark');
document.documentElement.dataset.theme = dark ? 'dark' : 'light';
const value = ref(null);
const options = [{label:'Belum Ada',value:0},{label:'Perusahaan',value:1},{label:'Nama pilihan yang sangat panjang untuk memeriksa dropdown pada layar kecil',value:2}];
const app = createApp({render:()=>h('div',{class:'app-shell',style:'padding:12px;max-width:600px;min-height:400px'},[
 h(FSelect,{label:'Status BPJS',searchable:true,showClear:true,options,modelValue:value.value,'onUpdate:modelValue':v=>value.value=v}),
 h(FSelect,{label:'Status Aktif',searchable:true,disabled:true,options,modelValue:0}),
 h(FSelect,{label:'Native',options,modelValue:0})
])});
app.use(createVuetify({components:{VAutocomplete}})).mount('#app');
const delay = async()=>{await nextTick();await new Promise(r=>setTimeout(r,160));};
const input=document.querySelector('.searchable-select input');
const type=async text=>{input.value=text;input.dispatchEvent(new Event('input',{bubbles:true}));await delay();};
try {
 await delay(); input.focus(); input.click(); await delay();
 await type('xxxxxxxx');
 const empty=document.body.textContent.includes('Tidak ditemukan');
 await type('Belum');
 const filtered=[...document.querySelectorAll('.employee-select-menu [role=option]')];
 const filter=filtered.length===1&&filtered[0].textContent.includes('Belum Ada');
 input.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true}));await delay();
 // Synthetic keyboard events do not perform the browser's native focus traversal.
 if(document.activeElement===input) filtered[0].focus();
 document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));await delay();
 const keyboard=value.value==='0';
 const clear=document.querySelector('.searchable-select .v-field__clearable .v-icon');
 clear?.dispatchEvent(new MouseEvent('click',{bubbles:true}));await delay();
 const cleared=value.value===null;
 await type(''); input.click();await delay();
 const menu=document.querySelector('.employee-select-menu');
 const title=menu?.querySelector('.v-list-item-title');
 const bounds=menu?.getBoundingClientRect();
 const result={empty,filter,keyboard,cleared,disabled:document.querySelectorAll('.searchable-select input')[1].disabled,
 native:!!document.querySelector('select option[value="0"]'),font:getComputedStyle(input).fontSize==='11px',
 menuFont:title&&getComputedStyle(title).fontSize==='11px',inputHeight:Math.abs(input.getBoundingClientRect().height-30)<1,
 singleBorder:getComputedStyle(input).borderTopWidth==='0px',
 fits:bounds&&bounds.left>=0&&bounds.right<=innerWidth+1,
 theme:menu&&getComputedStyle(menu.querySelector('.v-list')).backgroundColor===(dark?'rgb(29, 43, 62)':'rgb(255, 255, 255)')};
 document.getElementById('result').textContent=JSON.stringify(result);
} catch(e){document.getElementById('result').textContent=JSON.stringify({error:e.message});}
`
const server = await createServer({ root, server: { host: '127.0.0.1', port: 0 }, logLevel: 'error', plugins: [{
    name: 'dropdown-browser-fixture',
    resolveId(id) { if (id === '/__dropdown-check.js') return '\0dropdown-check' },
    load(id) { if (id === '\0dropdown-check') return page },
    configureServer(vite) { vite.middlewares.use((req, res, next) => {
        if (!req.url.startsWith('/__dropdown-check?')) return next()
        res.setHeader('Content-Type', 'text/html')
        res.end('<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="app"></div><pre id="result"></pre><script type="module" src="/__dropdown-check.js"></script></body></html>')
    }) },
}] })
try {
    await server.listen()
    const port = server.httpServer.address().port
    for (const theme of ['light', 'dark']) for (const width of [1100, 390]) {
        const profile = mkdtempSync(path.join(tmpdir(), 'employee-dropdown-'))
        const result = await new Promise((resolve, reject) => {
            const child = spawn(browser, ['--headless=new', '--disable-gpu', '--no-first-run', `--user-data-dir=${profile}`, `--window-size=${width},800`, '--virtual-time-budget=15000', '--dump-dom', `http://127.0.0.1:${port}/__dropdown-check?${theme}`], { windowsHide: true })
            let stdout = '', stderr = ''
            child.stdout.on('data', data => stdout += data)
            child.stderr.on('data', data => stderr += data)
            child.on('error', reject)
            child.on('close', code => resolve({ code, stdout, stderr }))
            setTimeout(() => child.kill(), 45000).unref()
        })
        assert.equal(result.code, 0, result.stderr.slice(-1500))
        const text = result.stdout.match(/<pre id="result">([^<]+)<\/pre>/)?.[1]
        assert.ok(text, result.stdout.slice(-2500))
        const checks = JSON.parse(text.replaceAll('&quot;', '"').replaceAll('&amp;', '&'))
        for (const [key, value] of Object.entries(checks)) assert.equal(value, true, `${theme}/${width}: ${key} (${JSON.stringify(checks)})`)
        console.log(`${theme}/${width}: search, keyboard, zero, clear, sizing, theme and native select passed`)
    }
} finally { await server.close() }
