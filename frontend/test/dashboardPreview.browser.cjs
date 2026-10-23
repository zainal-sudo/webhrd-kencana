const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { spawn } = require('node:child_process');
const { parse, compileScript } = require('@vue/compiler-sfc');
const esbuild = require('esbuild');
const browser = [process.env.CHROME_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(file => file && fs.existsSync(file));

async function browserReport(file, profile) {
  const child = spawn(browser, ['--headless=new', '--no-sandbox', '--disable-gpu', '--disable-extensions', '--disable-background-networking', '--disable-renderer-backgrounding', '--no-first-run', '--user-data-dir=' + profile, '--remote-debugging-pipe'], { stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] });
  const pending = new Map();
  let buffer = '', id = 0, loaded, timer, stage = 'start';
  child.stdio[4].on('data', chunk => {
    buffer += chunk.toString();
    let index;
    while ((index = buffer.indexOf('\0')) >= 0) {
      const message = JSON.parse(buffer.slice(0, index)); buffer = buffer.slice(index + 1);
      if (pending.has(message.id)) {
        const { resolve, reject } = pending.get(message.id); pending.delete(message.id);
        message.error ? reject(Error(JSON.stringify(message.error))) : resolve(message.result);
      }
      if (message.method === 'Page.loadEventFired') loaded?.();
    }
  });
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const message = { id: ++id, method, params, ...(sessionId ? { sessionId } : {}) };
    pending.set(message.id, { resolve, reject });
    child.stdio[3].write(JSON.stringify(message) + '\0');
  });
  try {
    return await Promise.race([(async () => {
      const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
      stage = 'attach';
      const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
      await send('Page.enable', {}, sessionId);
      const load = new Promise(resolve => { loaded = resolve; });
      await send('Page.navigate', { url: pathToFileURL(file).href }, sessionId);
      stage = 'load';
      await load;
      stage = 'report';
      const result = await send('Runtime.evaluate', { expression: `new Promise(done => { const check = () => { const text = document.getElementById('preview-report')?.textContent; if (text) done(text); else setTimeout(check, 25); }; check(); })`, awaitPromise: true, returnByValue: true }, sessionId);
      return JSON.parse(result.result.value);
    })(), new Promise((_, reject) => { timer = setTimeout(() => reject(Error('Browser test timed out: ' + stage)), 15000); child.on('error', reject); })]);
  } finally {
    clearTimeout(timer);
    if (child.exitCode === null) {
      const exit = new Promise(resolve => child.once('exit', resolve)); child.kill(); await exit;
    }
  }
}

test('PKWT preview fits whole rows to card height, responds to resizing, and preserves expand/collapse', { skip: !browser }, async () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/views/dashboard/DashboardView.vue'), 'utf8');
  const { descriptor } = parse(source);
  const component = compileScript(descriptor, { id: 'preview-fixture', inlineTemplate: true }).content;
  const rows = Array.from({ length: 87 }, (_, i) => ({ Nik: String(i + 1).padStart(10, '0'), Nama: 'KARYAWAN DENGAN NAMA PANJANG SEKALI', Jabatan: 'OPERATOR', Status_Kerja: 'PKWT 1', Tgl_Berakhir: '2026-11-10' }));
  const mocks = `
    export default { render: () => null };
    export const useRouter=()=>({push(){}}),useToast=()=>({error(){}});
    export const useAuthStore=()=>({user:{user_kode:'HR'}});
    export const usePermissionStore=()=>({allowedRoutes:['/master/karyawan'],menuTree:[]});
    export const useTabsStore=()=>({openTab(){}}),useKaryawanBrowseStore=()=>({setStatus(){}});
    const rows=${JSON.stringify(rows)};
    export const safeGet=async url=>url.includes('peringatan')?{
      pkwt_habis:{total:rows.length,rows},mangkir_2hari:{total:0,rows:[]},
      bpjs_belum:{total:0,rows:[]},nonaktif_bpjs:{total:0,rows:[]}
    }:{};
    export const api={},pickError=String,formatNumber=String,formatTanggal=String,todaySql=()=> '2026-10-23',normalizeIcon=String;
  `;
  const bundle = await esbuild.build({
    stdin: { contents: 'import Dashboard from "fixture:dashboard";import {createApp} from "vue";window.fixtureApp=createApp(Dashboard);window.fixtureApp.mount("#app");', resolveDir: path.join(__dirname, '..') },
    bundle: true, write: false, format: 'iife', define: { 'process.env.NODE_ENV': '"production"' },
    plugins: [{ name: 'dashboard-fixture', setup(build) {
      build.onResolve({ filter: /^fixture:|^@\/|^vue-router$|^vue-toastification$/ }, args => ({ path: args.path, namespace: 'fixture' }));
      build.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: args.path === 'fixture:dashboard' ? component : mocks, loader: 'ts', resolveDir: path.join(__dirname, '..') }));
    } }],
  });
  const probe = async function () {
    const delay = () => new Promise(resolve => setTimeout(resolve, 150));
    const checks = [];
    try {
      await delay();
      const card = document.querySelector('.pkwt-card');
      const wrap = card.querySelector('.alert-table-wrap');
      const button = () => [...card.querySelectorAll('button')].find(el => /Lihat semua|Ringkas/.test(el.textContent));
      const inspect = label => {
        const rows = [...card.querySelectorAll('tbody tr')];
        const header = card.querySelector('thead').getBoundingClientRect();
        const box = wrap.getBoundingClientRect();
        const rowMin = parseFloat(getComputedStyle(wrap).getPropertyValue('--preview-row-height'));
        const capacity = Math.floor((wrap.clientHeight - header.height) / rowMin);
        const last = rows.at(-1).getBoundingClientRect();
        const foot = card.querySelector('.alert-foot').getBoundingClientRect();
        checks.push({ label, count: rows.length, capacity, fits: last.bottom <= box.bottom + 1, fills: Math.abs(last.bottom - foot.top) <= 1, noScroll: wrap.scrollHeight <= wrap.clientHeight + 1, dateVisible: card.querySelector('thead th:last-child').getBoundingClientRect().right <= box.right });
        return rows.length;
      };
      card.style.height = '520px'; await delay();
      const initial = inspect('initial');
      card.style.height = '650px'; await delay();
      const taller = inspect('taller');
      card.style.height = '480px'; await delay();
      const shorter = inspect('shorter');
      checks.push({ label: 'resize-count', ok: taller > initial && shorter < taller });
      button().click(); await delay();
      checks.push({ label: 'expanded', ok: card.querySelectorAll('tbody tr').length === 87 && wrap.scrollHeight > wrap.clientHeight && /Ringkas/.test(button().textContent) });
      button().click(); await delay(); inspect('collapsed');
      document.querySelector('.alert-grid').style.gridTemplateColumns = '1fr';
      card.style.height = '520px'; card.style.width = '398px'; await delay(); inspect('narrow');
      window.fixtureApp.unmount(); await delay();
    } catch (error) { checks.push({ error: error.stack }); }
    document.body.append(Object.assign(document.createElement('pre'), { id: 'preview-report', textContent: JSON.stringify(checks) }));
  };
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dashboard-preview-'));
  const file = path.join(dir, 'index.html');
  fs.writeFileSync(file, `<style>${descriptor.styles.map(style => style.content).join('\n')}</style><div id="app"></div><script>${bundle.outputFiles[0].text}</script><script>(${probe})();</script>`);
  const checks = await browserReport(file, path.join(dir, 'profile'));
  assert.equal(checks.length, 7, JSON.stringify(checks));
  for (const check of checks) {
    assert.equal(check.error, undefined, JSON.stringify(checks));
    if ('ok' in check) assert.equal(check.ok, true, JSON.stringify(checks));
    else {
      assert.equal(check.count, check.capacity, JSON.stringify(checks));
      for (const key of ['fits', 'fills', 'noScroll', 'dateVisible']) assert.equal(check[key], true, JSON.stringify(checks));
    }
  }
});
