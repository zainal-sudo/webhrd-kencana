const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { pathToFileURL } = require('node:url');
const { spawn } = require('node:child_process');
const ts = require('typescript');
const root = path.join(__dirname, '../src');
const browser = [process.env.CHROME_BIN, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(file => file && fs.existsSync(file));

async function headlessResults(file, profile) {
  const child = spawn(browser, ['--headless=new', '--disable-gpu', '--no-first-run', '--disable-extensions', '--disable-renderer-backgrounding', `--user-data-dir=${profile}`, '--remote-debugging-pipe'], { stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] });
  const pending = new Map();
  let buffer = '', id = 0, loaded;
  child.stdio[4].on('data', chunk => {
    buffer += chunk.toString();
    let index;
    while ((index = buffer.indexOf('\0')) >= 0) {
      const message = JSON.parse(buffer.slice(0, index)); buffer = buffer.slice(index + 1);
      if (message.id && pending.has(message.id)) {
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
  let timer;
  try {
    return await Promise.race([(async () => {
      const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
      const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
      await send('Page.enable', {}, sessionId);
      const load = new Promise(resolve => { loaded = resolve; });
      await send('Page.navigate', { url: pathToFileURL(file).href }, sessionId);
      await load;
      const result = await send('Runtime.evaluate', { expression: `new Promise(done => { const check = () => { const text = document.getElementById('result')?.textContent; if (text) done(text); else setTimeout(check, 25); }; check(); })`, awaitPromise: true, returnByValue: true }, sessionId);
      return result.result.value;
    })(), new Promise((_, reject) => { timer = setTimeout(() => reject(Error('Browser test timed out')), 15000); child.on('error', reject); })]);
  } finally {
    clearTimeout(timer);
    if (child.exitCode === null) {
      const exit = new Promise(resolve => child.once('exit', resolve)); child.kill(); await exit;
    }
  }
}

test('Real browser: vertical bar reaches bottom; horizontal bar syncs both ways, preserves last row and cleans up', { skip: !browser }, async () => {
  const approved = path.join(process.env.LOCALAPPDATA || '', 'Temp/opencode');
  const dir = fs.mkdtempSync(path.join(fs.existsSync(approved) ? approved : os.tmpdir(), 'scrollbar-layout-'));
  try {
    const source = fs.readFileSync(path.join(root, 'utils/scrollbarLayout.ts'), 'utf8');
    const js = ts.transpileModule(source.replace('export function', 'function'), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
    const css = fs.readFileSync(path.join(root, 'assets/main.css'), 'utf8');
    const tableCss = fs.readFileSync(path.join(root, 'components/BaseBrowse.vue'), 'utf8').match(/<style scoped>([\s\S]*?)<\/style>/)[1];
    const html = `<!doctype html><html><head><style>${css}
      ${tableCss}
      #app { padding: 20px; } .area { width: 300px; height: 160px; overflow: auto; border: 1px solid black; margin-bottom: 20px; }
      .wide { width: 800px; } .row { height: 40px; background: #eee; } .only-x { height: 60px; } .only-y .wide { width: 100px; }
      </style></head><body><div id="app">
      <div id="both" class="area"><div class="wide">${'<div class="row">Row</div>'.repeat(15)}<div id="last" class="row">Last</div></div></div>
      <div id="x" class="area only-x"><div class="wide row">Horizontal only</div></div>
      <div id="y" class="area only-y"><div class="wide">${'<div class="row">Vertical</div>'.repeat(10)}</div></div>
      <div data-native-scrollbar><div id="native-table" class="area"><table class="browse-table" style="width:4600px"><thead><tr>${'<th>Column</th>'.repeat(29)}<th class="action-col">Aksi</th></tr></thead><tbody>${('<tr>' + '<td>DATA</td>'.repeat(29) + '<td class="action-col">Edit</td></tr>').repeat(25)}</tbody></table></div></div>
      <div id="table-host" class="area"><table class="browse-table" style="width:800px"><thead><tr><th>Header</th><th class="action-col">Aksi</th></tr></thead><tbody>${'<tr><td>SCROLLING DATA</td><td class="action-col">Edit</td></tr>'.repeat(30)}</tbody></table></div>
      </div><pre id="result"></pre><script>
      ${js}
      const delay = () => new Promise(resolve => setTimeout(resolve, 120));
      const checks = []; const check = (name, ok) => checks.push({name, ok: !!ok});
      (async () => {
        try {
          const host = document.getElementById('both');
          const before = host.clientHeight;
          const dispose = installScrollbarLayout(document.body);
          await delay();
          const bar = host.querySelector('[data-horizontal-scrollbar]');
          const nativeTable = document.getElementById('native-table');
          check('native-opt-out', !nativeTable.querySelector('[data-horizontal-scrollbar]') && !nativeTable.classList.contains('split-scrollbar'));
          nativeTable.scrollLeft = nativeTable.scrollWidth - nativeTable.clientWidth;
          await delay();
          check('native-reaches-last-column', nativeTable.scrollLeft > 4000);
          const action = nativeTable.querySelector('tbody .action-col');
          check('native-actions-stay-visible', action.getBoundingClientRect().right <= nativeTable.getBoundingClientRect().right + 1);
          nativeTable.scrollLeft = 0; nativeTable.scrollTop = nativeTable.scrollHeight;
          await delay();
          check('native-scroll-both-axes', nativeTable.scrollLeft === 0 && nativeTable.scrollTop > 0);
          const nativeRoot = nativeTable.parentElement;
          nativeRoot.removeAttribute('data-native-scrollbar'); await delay();
          check('dynamic-native-opt-in', nativeTable.querySelector('[data-horizontal-scrollbar]'));
          nativeRoot.setAttribute('data-native-scrollbar', ''); await delay();
          check('dynamic-native-opt-out', !nativeTable.querySelector('[data-horizontal-scrollbar]'));
          check('enhanced', bar);
          check('vertical-full-height', host.clientHeight === before + 14);
          check('no-native-bottom-corner', host.offsetHeight - host.clientHeight === 2);
          check('vertical-still-visible', host.offsetWidth - host.clientWidth > 2);
          check('horizontal-height', bar && bar.offsetHeight === 14);
          check('horizontal-ends-before-vertical', bar && bar.getBoundingClientRect().right === host.getBoundingClientRect().left + 1 + host.clientWidth);
          check('single-axis-unchanged', !document.querySelector('#x.split-scrollbar, #y.split-scrollbar'));
          bar.scrollLeft = 300; await delay();
          check('horizontal-to-content ' + JSON.stringify({host:host.scrollLeft, bar:bar.scrollLeft, width:bar.scrollWidth,client:bar.clientWidth}), host.scrollLeft === 300);
          host.scrollLeft = 100; host.scrollTop = host.scrollHeight; await delay();
          check('content-to-horizontal', bar.scrollLeft === 100);
          check('horizontal-stays-at-bottom ' + JSON.stringify({bar:bar.getBoundingClientRect().bottom,host:host.getBoundingClientRect().bottom,scrollTop:host.scrollTop,scrollHeight:host.scrollHeight,last:document.getElementById('last').getBoundingClientRect().bottom}), Math.abs(bar.getBoundingClientRect().bottom - (host.getBoundingClientRect().bottom - 1)) < 1);
          check('last-row-not-covered', document.getElementById('last').getBoundingClientRect().bottom <= bar.getBoundingClientRect().top + 1);
          const bottom = host.getBoundingClientRect().bottom - 1;
          for (const top of [50, 150, 25, 250, 0]) {
            host.scrollTop = top;
            check('no-frame-jump-' + top, Math.abs(bar.getBoundingClientRect().bottom - bottom) < 1);
          }
          check('native-sticky-not-script-positioned', getComputedStyle(bar).position === 'sticky' && !bar.style.top && !bar.style.left);
          const tableHost = document.getElementById('table-host');
          const header = tableHost.querySelector('th');
          check('separate-header-borders', getComputedStyle(tableHost.querySelector('table')).borderCollapse === 'separate');
          for (const top of [1, 35, 110]) {
            tableHost.scrollTop = top;
            check('header-flush-' + top, Math.abs(header.getBoundingClientRect().top - (tableHost.getBoundingClientRect().top + 1)) < 1);
          }
          check('header-solid', getComputedStyle(header).backgroundColor !== 'rgba(0, 0, 0, 0)' && getComputedStyle(header).borderTopWidth === '1px');
          host.style.padding = '8px 16px'; await delay();
          host.scrollTop = host.scrollHeight; await delay();
          check('padded-bottom-flush ' + JSON.stringify({bar:bar.getBoundingClientRect().bottom,host:host.getBoundingClientRect().bottom,style:host.style.cssText,transform:getComputedStyle(bar).transform}), Math.abs(bar.getBoundingClientRect().bottom - (host.getBoundingClientRect().bottom - 1)) < 1);
          check('padded-left-flush ' + JSON.stringify({bar:bar.getBoundingClientRect().left,host:host.getBoundingClientRect().left,scroll:host.scrollLeft}), Math.abs(bar.getBoundingClientRect().left - (host.getBoundingClientRect().left + 1)) < 1);
          for (const top of [0, 50, 200]) {
            host.scrollTop = top;
            check('padded-no-frame-jump-' + top, Math.abs(bar.getBoundingClientRect().bottom - (host.getBoundingClientRect().bottom - 1)) < 1);
          }
          const popup = document.createElement('div'); popup.className = 'area'; popup.innerHTML = '<div style="width:800px;height:500px">Popup</div>'; document.body.append(popup);
          await delay(); check('dynamic-popup', popup.querySelector('[data-horizontal-scrollbar]'));
          popup.firstElementChild.style.width = '100px'; await delay();
          check('horizontal-no-longer-needed', !popup.querySelector('[data-horizontal-scrollbar]'));
          host.style.display = 'none'; await delay(); check('hidden-cleaned', !host.querySelector('[data-horizontal-scrollbar]'));
          host.style.display = ''; await delay(); check('reactivated', host.querySelector('[data-horizontal-scrollbar]'));
          popup.remove(); await delay();
          dispose(); check('cleanup', !document.querySelector('[data-horizontal-scrollbar], .split-scrollbar'));
          check('position-restored', host.style.position === '');
        } catch (error) { checks.push({ name: error.stack, ok: false }); }
        document.getElementById('result').textContent = JSON.stringify(checks);
      })();</script></body></html>`;
    const file = path.join(dir, 'fixture.html'); fs.writeFileSync(file, html);
    const result = await headlessResults(file, path.join(dir, 'profile'));
    assert.ok(result, 'Browser did not return results');
    const checks = JSON.parse(result);
    assert.ok(checks.length >= 15, JSON.stringify(checks));
    for (const check of checks) assert.equal(check.ok, true, check.name + '\n' + JSON.stringify(checks));
  } finally {
    // Only remove this test's newly created temporary fixture/profile.
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 3 });
  }
});

test('Shared sticky table headers use separate borders; holiday report explanatory banner is removed', () => {
  for (const file of ['components/BaseBrowse.vue', 'components/EditableGrid.vue', 'assets/design-system.css', 'views/dashboard/DashboardView.vue']) {
    const source = fs.readFileSync(path.join(root, file), 'utf8');
    const selector = file.includes('BaseBrowse') ? '\\.browse-table' : file.includes('EditableGrid') ? '\\.grid' : file.includes('design-system') ? '\\.ds-grid' : '\\.alert-table';
    assert.match(source, new RegExp(selector + '\\s*\\{[^}]*border-collapse: separate;[^}]*border-spacing: 0;'), file);
  }
  const report = fs.readFileSync(path.join(root, 'views/laporan/LemburHariLiburView.vue'), 'utf8');
  assert.doesNotMatch(report.match(/<template>([\s\S]*?)<style/)[1], /report-note|Tanggal mengikuti Master Hari Libur|Baris ungu = sudah verifikasi/);
  const scrollbar = fs.readFileSync(path.join(root, 'utils/scrollbarLayout.ts'), 'utf8');
  assert.doesNotMatch(scrollbar, /setStyle\(bar, '(top|left)'/);
});
