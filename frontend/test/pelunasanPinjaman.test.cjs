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
  const vueModule = { ...vue, onMounted: fn => mounted.push(fn), onActivated: fn => activated.push(fn), watch: (...args) => { const stop = vue.watch(...args); stops.push(stop); return stop; } };
  const api = {
    async get(url, config) {
      calls.push({ method: 'get', url, config });
      if (failGet) throw Error('load failed');
      if (settings.deferredGet) return await settings.deferredGet;
      return { data: { data: dataRows, pagination: { page: config.params.page, last_page: 2, total: dataRows.length + 25 } } };
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
      return require(name);
    };
    const capture = state => {
      state.rows.value = dataRows; state.ready.value = true;
      state.selected.value = new Set(settings.selected || []);
    };
    vm.runInNewContext(ts.transpileModule(code, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
      { module, exports: module.exports, require: requireModule, capture, window: { confirm: message => { calls.push({ method: 'confirm', message }); return confirm; } } });
    return module.exports;
  };
  const script = source.match(/<script setup lang="ts">([\s\S]*?)<\/script>/)[1];
  const state = evaluate(script + '\nexport { load, processSelected, selectAll, toggle, rows, selected, chosen, amount, eligible, bulan, tahun, search, ready, loadError, loading, processing };');
  return { ...state, calls, messages, cancel() { confirm = false; }, fail() { failGet = true; },
    async mount() { for (const fn of mounted) await fn(); }, async activate() { for (const fn of activated) await fn(); },
    async render() {
      const { descriptor } = parse(source.replace('</script>', '\ncapture({ rows, ready, selected });\n</script>'), { filename: file });
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
