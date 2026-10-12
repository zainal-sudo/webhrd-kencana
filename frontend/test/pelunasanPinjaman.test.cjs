const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const vue = require('vue');
const { parse, compileScript } = require('@vue/compiler-sfc');
const { renderToString } = require('@vue/server-renderer');
const root = path.join(__dirname, '../src');
const file = 'views/transaksi/ProsesPelunasanPinjamanView.vue';
const source = fs.readFileSync(path.join(root, file), 'utf8');
const settle = async () => { await vue.nextTick(); await new Promise(resolve => setImmediate(resolve)); };
const baseRows = () => [
  { Key: '["PJ.2610.0001",1]', Nomor: 'PJ.2610.0001', Nik: '001', Nama: 'Riri', Pinjam: 400000, Bayar: 0, SisaBayar: 400000, PotonganKe: 1, Potongan: 200000, DiprosesPada: null, StatusProses: 'Belum Diproses' },
  { Key: '["PJ.2610.0002",2]', Nomor: 'PJ.2610.0002', Nik: '002', Nama: 'Budi', Pinjam: 400000, Bayar: 200000, SisaBayar: 200000, PotonganKe: 2, Potongan: 200000, DiprosesPada: '2026-11-09 10:00:00', StatusProses: 'Sudah Diproses' },
  { Key: '["LEGACY",1]', Nomor: 'LEGACY', Nik: '003', Nama: null, Pinjam: 400000, Bayar: null, SisaBayar: null, PotonganKe: 1, Potongan: 200000, DiprosesPada: null, StatusProses: 'Belum Diproses' },
];
function fixture(settings = {}) {
  const mounted = [], activated = [], stops = [], calls = [], messages = [];
  let failGet = false, confirm = true;
  const dataRows = settings.rows || baseRows();
  const vueModule = { ...vue, onMounted: fn => mounted.push(fn), onActivated: fn => activated.push(fn), onDeactivated() {}, onUnmounted() {}, watch: (...args) => { const stop = vue.watch(...args); stops.push(stop); return stop; } };
  const api = {
    async get(url, config) {
      calls.push({ method: 'get', url, config });
      if (failGet) throw Error('load failed');
      if (settings.deferredGet) return await settings.deferredGet;
      return { data: { data: dataRows, pagination: { page: config.params.page, last_page: settings.lastPage ?? 2, total: settings.total ?? dataRows.length + 25 } } };
    },
    async post(url, body) {
      calls.push({ method: 'post', url, body });
      if (settings.postFail) throw Error('Sudah diproses; batch dibatalkan');
      if (settings.postDeferred) await settings.postDeferred;
      for (const item of body.items) {
        const row = dataRows.find(row => row.Nomor === item.nomor_pinjam && row.PotonganKe === item.potongan_ke);
        row.DiprosesPada = '2026-11-09 11:00:00'; row.StatusProses = 'Sudah Diproses';
      }
      return { data: { data: { periode: 'November 2026', total: 200000 } } };
    },
  };
  const evaluate = code => {
    const module = { exports: {} };
    const requireModule = name => {
      if (name === 'vue') return vueModule;
      if (name === 'vue-toastification') return { useToast: () => ({ error: e => messages.push(e), success: e => messages.push(e) }) };
      if (name === '@/stores/authStore') return { useAuthStore: () => ({ can: (_form, action) => action === 'insert' && !settings.denied }) };
      if (name === '@/api/axios') return { api, getErrorMessage: e => e.message };
      if (name === '@/components/MsIcon.vue') return { default: { render: () => null } };
      if (name === '@/utils/pinjaman') return evaluate(fs.readFileSync(path.join(root, 'utils/pinjaman.ts'), 'utf8'));
      if (name === '@/composables/useLiveSearch') return evaluate(fs.readFileSync(path.join(root, 'composables/useLiveSearch.ts'), 'utf8'));
      return require(name);
    };
    const capture = state => {
      state.rows.value = dataRows; state.ready.value = true;
      state.selected.value = new Set(settings.selected || []);
      state.page.value = settings.page ?? 1;
      state.lastPage.value = settings.lastPage ?? 1;
      state.total.value = settings.total ?? dataRows.length;
    };
    vm.runInNewContext(ts.transpileModule(code, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
      { module, exports: module.exports, require: requireModule, capture, setTimeout, clearTimeout, window: { confirm: message => { calls.push({ method: 'confirm', message }); return confirm; } } });
    return module.exports;
  };
  const script = source.match(/<script setup lang="ts">([\s\S]*?)<\/script>/)[1];
  const state = evaluate(script + '\nexport { load, processSelected, selectAll, toggle, rows, selected, chosen, amount, eligible, bulan, tahun, search, ready, loadError, loading, processing, liveSearch, page, lastPage, perPage, pageInput, visiblePages, goToPage, jumpToPage, changePerPage };');
  return { ...state, calls, messages, cancel() { confirm = false; }, fail() { failGet = true; },
    async mount() { for (const fn of mounted) await fn(); }, async activate() { for (const fn of activated) await fn(); },
    async render() {
      const { descriptor } = parse(source.replace('</script>', '\ncapture({ rows, ready, selected, page, lastPage, total });\n</script>'), { filename: file });
      const component = evaluate(compileScript(descriptor, { id: 'pelunasan', inlineTemplate: true }).content).default;
      return await renderToString(vue.createSSRApp(component));
    }, dispose() { stops.forEach(stop => stop()); } };
}

test('Select All only chooses valid unpaid stored slots; unique identity and payment total', async () => {
  const f = fixture();
  try {
    await f.mount(); f.selectAll();
    assert.equal(f.chosen.value.length, 1); assert.equal(f.amount.value, 200000);
    assert.equal(f.selected.value.has(f.rows.value[1].Key), false);
    f.toggle(f.rows.value[1]); assert.equal(f.chosen.value.length, 1);
    f.selectAll(); assert.equal(f.chosen.value.length, 0);
  } finally { f.dispose(); }
});
test('Process confirmation, identity-only payload, success refresh clears selection and disables processed slot', async () => {
  const f = fixture();
  try {
    f.bulan.value = 11; f.tahun.value = 2026; await settle(); await f.mount(); f.selectAll();
    await f.processSelected();
    const post = f.calls.find(c => c.method === 'post');
    assert.deepEqual(JSON.parse(JSON.stringify(post.body)), { bulan: 11, tahun: 2026, items: [{ nomor_pinjam: 'PJ.2610.0001', potongan_ke: 1 }] });
    assert.match(f.calls.find(c => c.method === 'confirm').message, /November 2026.*Rp200.000/);
    assert.equal(f.selected.value.size, 0); assert.equal(f.eligible(f.rows.value[0]), false);
    assert.equal(f.calls.filter(c => c.method === 'get').length, 2);
  } finally { f.dispose(); }
});
test('Cancel/missing Insert/no selection cannot POST', async () => {
  for (const setting of [{ denied: true }, { cancel: true }, { empty: true }]) {
    const f = fixture(setting);
    try {
      await f.mount(); if (!setting.empty) f.selectAll(); if (setting.cancel) f.cancel();
      await f.processSelected(); assert.equal(f.calls.filter(c => c.method === 'post').length, 0);
    } finally { f.dispose(); }
  }
});
test('Conflict reloads list, failed list cannot process, period/search changes invalidate old selections', async () => {
  const f = fixture({ postFail: true });
  try {
    await f.mount(); f.selectAll(); await f.processSelected();
    assert.ok(f.messages.some(message => message.includes('batch dibatalkan')));
    assert.equal(f.selected.value.size, 0);
    f.selectAll(); f.bulan.value = 12; await settle();
    assert.equal(f.ready.value, false); assert.equal(f.rows.value.length, 0);
    await f.processSelected(); assert.equal(f.calls.filter(c => c.method === 'post').length, 1);
    await f.load(); f.selectAll(); f.search.value = 'Riri'; await settle();
    assert.equal(f.selected.value.size, 0);
    f.fail(); await f.load(); assert.equal(f.ready.value, false); assert.equal(f.loadError.value, true);
  } finally { f.dispose(); }
});
test('Pending POST blocks duplicate clicks and late list response after period change is ignored', async () => {
  let resolve;
  const f = fixture({ postDeferred: new Promise(r => { resolve = r; }) });
  try {
    await f.mount(); f.selectAll(); const pending = f.processSelected();
    await f.processSelected(); assert.equal(f.calls.filter(c => c.method === 'post').length, 1);
    resolve(); await pending;
  } finally { f.dispose(); }
  let complete;
  const late = fixture({ deferredGet: new Promise(r => { complete = r; }) });
  try {
    const pending = late.load(); late.bulan.value = late.bulan.value === 1 ? 2 : 1; await settle();
    complete({ data: { data: baseRows(), pagination: { page: 1, last_page: 1, total: 3 } } }); await pending;
    assert.equal(late.rows.value.length, 0); assert.equal(late.ready.value, false);
  } finally { late.dispose(); }
});
test('Pagination/reactivation reload current period and clear selected checkboxes', async () => {
  const f = fixture();
  try {
    await f.mount(); await f.activate(); f.selectAll(); await f.load(2);
    assert.equal(f.calls.at(-1).config.params.page, 2); assert.equal(f.selected.value.size, 0);
    f.selectAll(); await f.activate(); assert.equal(f.selected.value.size, 0);
  } finally { f.dispose(); }
});
test('Actual page renders processed/invalid rows disabled, permission hides Proses; theme and responsive/sticky CSS', async () => {
  const f = fixture({ selected: ['["PJ.2610.0001",1]'] });
  try {
    const html = await f.render();
    assert.ok(html.includes('Proses Pelunasan Pinjaman'));
    assert.ok(html.includes('Sudah Diproses'));
    assert.ok(html.includes('Saldo tidak valid'));
    const disabledRows = html.match(/<input[^>]+aria-label="Pilih (PJ\.2610\.0002|LEGACY)[^"]*"[^>]*>/g);
    assert.equal(disabledRows.length, 2); assert.ok(disabledRows.every(input => input.includes('disabled')));
    assert.ok(!html.includes('NaN'));
    assert.match(source, /position: sticky; top: 0/);
    assert.match(source, /max-width: 600px/);
    assert.ok(source.includes('--ds-surface-raised')); assert.ok(source.includes('--ds-text'));
  } finally { f.dispose(); }
  const denied = fixture({ denied: true });
  try { assert.ok(!(await denied.render()).includes('class="process-btn"')); }
  finally { denied.dispose(); }
});

test('Live typing automatically GET-loads page 1 and clears payment selection without POST', async () => {
  const f = fixture();
  try {
    await f.mount(); f.selectAll(); assert.equal(f.selected.value.size, 1);
    const initial = f.calls.length;
    f.search.value = 'Ri'; f.liveSearch.schedule();
    f.search.value = 'Riri'; f.liveSearch.schedule();
    await settle(); assert.equal(f.ready.value, false); assert.equal(f.selected.value.size, 0);
    await new Promise(resolve => setTimeout(resolve, 400)); await settle();
    const reads = f.calls.slice(initial).filter(call => call.method === 'get');
    assert.equal(reads.length, 1); assert.equal(reads[0].config.params.search, 'Riri');
    assert.equal(reads[0].config.params.page, 1);
    assert.equal(f.calls.filter(call => call.method === 'post').length, 0);
    f.processing.value = true;
    const before = f.calls.length;
    f.liveSearch.schedule(); await f.liveSearch.run();
    assert.equal(f.calls.length, before);
  } finally { f.liveSearch.cancel(); f.dispose(); }
});

test('Single/empty page hides navigation; multiple pages render numbered buttons, jump and row size', async () => {
  for (const settings of [{ lastPage: 1, total: 1 }, { rows: [], lastPage: 1, total: 0 }]) {
    const f = fixture(settings);
    try {
      const html = await f.render();
      assert.ok(html.includes(`${settings.total} hasil · Halaman 1 / 1`));
      assert.ok(!html.includes('class="pagination-controls"'));
      assert.ok(!html.includes('Nomor halaman tujuan'));
    } finally { f.dispose(); }
  }
  const f = fixture({ lastPage: 23, total: 552 });
  try {
    const html = await f.render();
    assert.ok(html.includes('552 hasil · Halaman 1 / 23'));
    assert.ok(html.includes('class="pagination-controls"'));
    assert.ok(html.includes('aria-current="page"'));
    for (const text of ['Halaman pertama', 'Halaman terakhir', 'Nomor halaman tujuan', 'Jumlah baris per halaman']) assert.ok(html.includes(text));
    for (const size of [25, 50, 100]) assert.match(html, new RegExp(`<option value="${size}"`));
  } finally { f.dispose(); }
});

test('Navigation/jump/page size preserve filters and clear selected checkboxes, invalid targets do not load', async () => {
  const f = fixture({ lastPage: 23, total: 552 });
  try {
    f.search.value = 'Riri'; await settle(); await f.mount(); f.selectAll();
    await f.goToPage(3); await settle();
    assert.equal(f.page.value, 3); assert.equal(f.selected.value.size, 0);
    assert.equal(f.calls.at(-1).config.params.search, 'Riri');
    assert.deepEqual(Array.from(f.visiblePages.value), [1, 2, 3, 4, 5]);
    f.pageInput.value = 23; await f.jumpToPage(); await settle();
    assert.deepEqual(Array.from(f.visiblePages.value), [19, 20, 21, 22, 23]);
    const before = f.calls.length;
    for (const target of [0, -1, 24, 1.5, NaN, 23]) await f.goToPage(target);
    f.pageInput.value = ''; await f.jumpToPage();
    assert.equal(f.calls.length, before); assert.equal(f.pageInput.value, 23);
    f.selectAll(); await f.changePerPage(50); await settle();
    assert.equal(f.page.value, 1); assert.equal(f.perPage.value, 50);
    assert.equal(f.calls.at(-1).config.params.per_page, 50);
    assert.equal(f.selected.value.size, 0);
    const after = f.calls.length;
    await f.changePerPage(999); assert.equal(f.calls.length, after);
    f.processing.value = true; await f.goToPage(2); await f.changePerPage(100);
    assert.equal(f.calls.length, after); assert.equal(f.perPage.value, 50);
    assert.equal(f.calls.filter(call => call.method === 'post').length, 0);
  } finally { f.dispose(); }
});
