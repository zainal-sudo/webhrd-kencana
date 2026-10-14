const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { spawnSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');
const ts = require('typescript');
const vue = require('vue');
const { renderToString } = require('@vue/server-renderer');
const { parse, compileScript, compileStyle } = require('@vue/compiler-sfc');
const root = path.join(__dirname, '../src');
const browser = [process.env.CHROME_BIN, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(file => file && fs.existsSync(file));

async function fixture(count) {
  const css = [];
  const detail = { Nomor: 'PJ.2610.0003', Tanggal: '2026-10-12', Nik: '0404170352', Nama: 'MUHAMMAD ROFIQ AZHAR '.repeat(5), Pabrik: 'P04', Bagian: 'CETAK MESIN '.repeat(8), Bank: 'CIMB', Norek: '762516147500'.repeat(7), Pinjam: 400000, Cicilan: count, Bayar: 0, SisaBayar: 400000, Status: count === 1 ? 'Lunas' : 'Belum Lunas', Potongan: Array.from({ length: count }, (_, i) => ({ periode: i ? 'November 2026' : 'Oktober 2026', nominal: 400000 / count })) };
  function evaluate(source) {
    const module = { exports: {} };
    vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { module, exports: module.exports, require: load, capture: state => { state.detailOpen.value = true; state.detail.value = detail; } });
    return module.exports;
  }
  function load(name) {
    if (name === 'vue') return vue;
    if (name === 'vue-toastification') return { useToast: () => ({}) };
    if (name === '@/stores/authStore') return { useAuthStore: () => ({ can: () => true }) };
    if (name === '@/api/axios') return { api: {}, getErrorMessage() {} };
    if (name === '@/api') return {};
    if (name === '@/components/PinjamanSchedule.vue') return { default: component('components/PinjamanSchedule.vue', 'schedule') };
    if (name.endsWith('.vue')) return { default: { render: () => null } };
    if (name.startsWith('@/utils/')) return evaluate(fs.readFileSync(path.join(root, name.slice(2) + '.ts'), 'utf8'));
    throw Error(name);
  }
  function component(file, id) {
    let source = fs.readFileSync(path.join(root, file), 'utf8');
    if (id === 'detail') source = source.replace('</script>', '\ncapture({ detailOpen, detail });\n</script>');
    const { descriptor } = parse(source);
    css.push(compileStyle({ source: descriptor.styles[0].content, filename: file, id: 'data-v-' + id, scoped: true }).code);
    const compiled = compileScript(descriptor, { id, inlineTemplate: true });
    const result = evaluate(compiled.content).default;
    result.__scopeId = 'data-v-' + id;
    return result;
  }
  const context = {};
  await renderToString(vue.createSSRApp(component('views/transaksi/PinjamanView.vue', 'detail')), context);
  return { html: context.teleports.body, css: css.join('\n') };
}

test('Detail renders original values, two-column employee/loan groups, stored schedule and subtle footnote', async () => {
  for (const count of [1, 2]) {
    const { html } = await fixture(count);
    assert.match(html, /Tanggal Pinjaman/);
    assert.doesNotMatch(html, /Identitas Karyawan/);
    assert.equal((html.match(/class="employee-field"/g) || []).length, 4);
    assert.match(html, /class="loan-data"/);
    assert.match(html, count === 1 ? /Lunas/ : /Belum Lunas/);
    assert.match(html, count === 1 ? /status-badge status-paid/ : /status-badge status-outstanding/);
    assert.match(html, /Oktober 2026/);
    assert.equal(html.includes('November 2026'), count === 2);
    assert.match(html, /Total/);
    assert.match(html, /Read-only\. Periode adalah rencana potongan, bukan histori pembayaran\./);
  }
});

test('Real browser: light/dark, desktop/mobile, long values, 1x/2x schedules fit without horizontal overflow', { skip: !browser }, async () => {
  const dir = fs.mkdtempSync(path.join(process.env.LOCALAPPDATA, 'Temp/opencode/loan-detail-'));
  try {
    for (const count of [1, 2]) {
      const fixtureData = await fixture(count);
      for (const theme of ['light', 'dark']) {
        const dark = theme === 'dark';
        const file = path.join(dir, `${theme}-${count}.html`);
        fs.writeFileSync(file, `<!doctype html><html><head><style>
          :root { --ds-surface:${dark ? '#172334' : '#f1f5f9'}; --ds-surface-raised:${dark ? '#1d2b3e' : '#fff'}; --ds-surface-inset:${dark ? '#243449' : '#eef1f6'}; --ds-text:${dark ? '#e2e8f0' : '#263238'}; --ds-text-secondary:${dark ? '#bac7d9' : '#55637a'}; --ds-border-light:${dark ? '#34475f' : '#dde3ec'}; }
          * { box-sizing:border-box; } body { margin:0; font-family:Arial; } ${fixtureData.css}
          </style></head><body>${fixtureData.html}<pre id="result"></pre><script>
          const modal = document.querySelector('.loan-detail-dialog');
          const grid = document.querySelector('.loan-data');
          const fields = [...document.querySelectorAll('.employee-field')].map(e => e.getBoundingClientRect());
          const small = innerWidth <= 600;
          const results = { overflow: modal.scrollWidth <= modal.clientWidth + 1, tableFits: document.querySelector('.schedule-scroll').scrollWidth <= document.querySelector('.schedule-scroll').clientWidth + 1, columns: getComputedStyle(grid).gridTemplateColumns.split(' ').length === (small ? 1 : 2), employeeOrder: small ? fields[1].top > fields[0].top : fields[0].left === fields[1].left && fields[2].left > fields[0].left && fields[0].top === fields[2].top, background: getComputedStyle(modal).backgroundColor === '${dark ? 'rgb(23, 35, 52)' : 'rgb(241, 245, 249)'}' };
          document.getElementById('result').textContent = JSON.stringify(results);
          </script></body></html>`);
        for (const width of [1100, 390]) {
          const result = spawnSync(browser, ['--headless=new', '--disable-gpu', '--no-first-run', `--user-data-dir=${path.join(dir, 'profile')}`, `--window-size=${width},900`, '--dump-dom', pathToFileURL(file).href], { encoding: 'utf8', timeout: 20000, maxBuffer: 4e6 });
          assert.equal(result.status, 0, result.stderr);
          const checks = JSON.parse(result.stdout.match(/<pre id="result">([^<]+)<\/pre>/)[1]);
          for (const [name, ok] of Object.entries(checks)) assert.equal(ok, true, `${theme}/${width}/${count}: ${name}`);
        }
      }
    }
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
