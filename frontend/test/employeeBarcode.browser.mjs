import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

const root = fileURLToPath(new URL('../', import.meta.url))
const browser = [process.env.CHROME_BIN, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(p => p && existsSync(p))
assert.ok(browser, 'A local Chrome or Edge is required')
const artifacts = mkdtempSync(path.join(tmpdir(), 'employee-barcode-'))
const fixture = `
import { createApp, h, ref, nextTick } from 'vue';
import { createVuetify } from 'vuetify';
import { VApp, VDialog, VCard, VCardTitle, VCardText, VCardActions, VBtn, VSpacer } from 'vuetify/components';
import { BitArray, Code128Reader } from '@zxing/library';
import Dialog from '/src/components/EmployeeBarcodeDialog.vue';
import { createEmployeeBarcode, employeeBarcodePrintHtml } from '/src/utils/employeeBarcode.ts';
import 'vuetify/styles';
import '/src/assets/design-system.css';
import '/src/assets/main.css';
import '/src/assets/dialogs.css';
const first={nik:'001251415',nama:'PUJI YANTO'};
const second={nik:'0409261699',nama:'NAMA <script>TEST</script> & '+ 'PANJANG '.repeat(10)};
const employee=ref(first);
const app=createApp({render:()=>h(VApp,{},()=>employee.value?h(Dialog,{employee:employee.value,onClose:()=>employee.value=null}):null)});
app.use(createVuetify({components:{VApp,VDialog,VCard,VCardTitle,VCardText,VCardActions,VBtn,VSpacer}})).mount('#app');
const wait=async()=>{await nextTick();await new Promise(r=>setTimeout(r,220));};
async function decode(){
 const image=document.querySelector('.barcode-preview img');await image.decode();
 if(image.naturalHeight!==90)throw Error('Unexpected padding above/below barcode bars');
 const canvas=document.createElement('canvas');canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;
 const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);
 const pixels=ctx.getImageData(0,Math.floor(canvas.height/2),canvas.width,1).data;
 const bits=new BitArray(canvas.width);for(let x=0;x<canvas.width;x++)if(pixels[x*4]<128)bits.set(x);
 return new Code128Reader().decodeRow(0,bits,null).getText();
}
window.barcodeAudit=async()=>{
 await wait();
 const result={first:await decode()==='001251415'};
 const name=document.querySelector('.employee-name');
 result.name=name.textContent==='PUJI YANTO';
 const img=document.querySelector('.employee-barcode');const band=document.querySelector('.barcode-band');
 result.dimensions=Math.abs(img.getBoundingClientRect().width-123)<1&&Math.abs(img.getBoundingClientRect().height-46.03154)<1;
 result.position=Math.abs(img.getBoundingClientRect().left-band.getBoundingClientRect().left-22.7953)<1;
 const open=window.open;window.open=()=>null;
 [...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Cetak').click();await wait();
 result.blocked=document.querySelector('[role=alert]')?.textContent.includes('Popup diblokir');window.open=open;
 employee.value=second;await wait();result.second=await decode()==='0409261699';
 result.safeName=!document.querySelector('.employee-name script')&&document.querySelector('.employee-name').textContent===second.nama;
 result.singleLine=getComputedStyle(document.querySelector('.employee-name')).whiteSpace==='nowrap';
 [...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Tutup').click();await wait();
 result.closed=!document.querySelector('.barcode-preview');
 employee.value={nik:'invalid-lowercase',nama:'INVALID'};await wait();
 result.invalid=document.querySelector('[role=alert]')?.textContent.includes('NIK')&&!document.querySelector('.barcode-preview');
 employee.value=first;await wait();result.reopened=await decode()==='001251415';
 return {result,html:employeeBarcodePrintHtml(createEmployeeBarcode(first.nik,first.nama))};
};
`
const server = await createServer({ root, logLevel: 'error', server: { host: '127.0.0.1', port: 0 }, plugins: [{
    name: 'barcode-audit-fixture',
    resolveId(id) { if (id === '/__barcode-audit.js') return '\0barcode-audit' },
    load(id) { if (id === '\0barcode-audit') return fixture },
    configureServer(vite) { vite.middlewares.use((req, res, next) => {
        if (req.url !== '/__barcode-audit') return next()
        res.setHeader('Content-Type', 'text/html')
        res.end('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="app"></div><script type="module" src="/__barcode-audit.js"></script></body></html>')
    }) },
}] })
let child, timer
try {
    await server.listen()
    child = spawn(browser, ['--headless=new', '--disable-gpu', '--no-first-run', '--disable-extensions', `--user-data-dir=${path.join(artifacts, 'profile')}`, '--remote-debugging-pipe'], { windowsHide: true, stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] })
    let id = 0, buffer = ''
    const pending = new Map()
    child.stdio[4].on('data', data => {
        buffer += data.toString()
        let at
        while ((at = buffer.indexOf('\0')) >= 0) {
            const message = JSON.parse(buffer.slice(0, at)); buffer = buffer.slice(at + 1)
            if (pending.has(message.id)) {
                const { resolve, reject } = pending.get(message.id); pending.delete(message.id)
                message.error ? reject(Error(JSON.stringify(message.error))) : resolve(message.result)
            }
        }
    })
    const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
        const message = { id: ++id, method, params, ...(sessionId ? { sessionId } : {}) }
        pending.set(message.id, { resolve, reject }); child.stdio[3].write(JSON.stringify(message) + '\0')
    })
    await Promise.race([(async () => {
        const { targetId } = await send('Target.createTarget', { url: 'about:blank' })
        const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true })
        const evaluate = async expression => {
            const data = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sessionId)
            assert.ok(!data.exceptionDetails, JSON.stringify(data.exceptionDetails))
            return data.result.value
        }
        await send('Page.enable', {}, sessionId)
        await send('Page.navigate', { url: `http://127.0.0.1:${server.httpServer.address().port}/__barcode-audit` }, sessionId)
        await evaluate('new Promise(resolve=>{const poll=()=>window.barcodeAudit?resolve(true):setTimeout(poll,50);poll()})')
        const { result, html } = await evaluate('window.barcodeAudit()')
        for (const [key, value] of Object.entries(result)) assert.equal(value, true, key)
        const screenshot = await send('Page.captureScreenshot', { format: 'png' }, sessionId)
        writeFileSync(path.join(artifacts, 'preview.png'), Buffer.from(screenshot.data, 'base64'))
        const { frameTree } = await send('Page.getFrameTree', {}, sessionId)
        await send('Page.setDocumentContent', { frameId: frameTree.frame.id, html }, sessionId)
        await evaluate('Promise.all([...document.images].map(i=>i.decode())).then(()=>document.fonts.ready).then(()=>true)')
        await send('Emulation.setEmulatedMedia', { media: 'print' }, sessionId)
        const dimensions = await evaluate('({width:document.querySelector(".employee-barcode").getBoundingClientRect().width,height:document.querySelector(".employee-barcode").getBoundingClientRect().height,name:document.querySelector(".employee-name").textContent,bodyText:document.body.innerText.trim()})')
        assert.ok(Math.abs(dimensions.width - 123) < 1)
        assert.ok(Math.abs(dimensions.height - 46.03154) < 1)
        assert.equal(dimensions.bodyText, 'PUJI YANTO')
        const pdf = await send('Page.printToPDF', { preferCSSPageSize: true, printBackground: true, displayHeaderFooter: false, scale: 1 }, sessionId)
        const pdfPath = path.join(artifacts, 'barcode-001251415.pdf')
        writeFileSync(pdfPath, Buffer.from(pdf.data, 'base64'))
        const pdfText = readFileSync(pdfPath).toString('latin1')
        assert.equal((pdfText.match(/\/Type \/Page\b/g) || []).length, 1)
        const media = pdfText.match(/\/MediaBox\s*\[0 0 ([\d.]+) ([\d.]+)\]/)
        assert.ok(media, 'PDF page dimensions are present')
        assert.ok(Math.abs(Number(media[1]) - 595.28) < 2 && Math.abs(Number(media[2]) - 841.89) < 2)
        console.log(JSON.stringify({ checks: result, printDimensions: dimensions, pdf: pdfPath, preview: path.join(artifacts, 'preview.png') }, null, 2))
    })(), new Promise((_, reject) => { timer = setTimeout(() => reject(Error('Barcode browser audit timed out')), 60000); child.on('error', reject) })])
} finally {
    clearTimeout(timer)
    if (child && child.exitCode === null) { const exited = new Promise(resolve => child.once('exit', resolve)); child.kill(); await exited }
    await server.close()
}
