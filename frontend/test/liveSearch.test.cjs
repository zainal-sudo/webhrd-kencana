const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('./helpers/frontendVm.cjs');
const ts = require('typescript');
const vue = require('vue');
const root = path.join(__dirname, '../src');

function evaluate(file, requireModule, globals = {}) {
  const module = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
  { module, exports: module.exports, require: requireModule, ...globals });
  return module.exports;
}
function fixture(callback, options = {}) {
  const timers = new Map(), hooks = {}, stops = [];
  let time = 0, nextId = 0;
  const vueModule = { ...vue,
    onActivated: fn => { hooks.activate = fn; }, onDeactivated: fn => { hooks.deactivate = fn; },
    onUnmounted: fn => { hooks.unmount = fn; },
    watch: (...args) => { const stop = vue.watch(...args); stops.push(stop); return stop; },
  };
  const module = evaluate('composables/useLiveSearch.ts', () => vueModule, {
    setTimeout: (fn, delay) => { timers.set(++nextId, { fn, due: time + delay }); return nextId; },
    clearTimeout: id => timers.delete(id),
  });
  const search = module.useLiveSearch(callback, options);
  return { search, hooks, timers,
    async tick(ms) {
      time += ms;
      for (const [id, timer] of timers) if (timer.due <= time) { timers.delete(id); timer.fn(); }
      await vue.nextTick(); await new Promise(resolve => setImmediate(resolve));
    },
    dispose() { hooks.unmount(); stops.forEach(stop => stop()); },
  };
}

test('Typing is debounced 350ms; only latest keyword runs and clearing restores unfiltered search', async () => {
  let keyword = '', calls = [];
  const f = fixture(() => { calls.push(keyword); });
  try {
    keyword = 'A'; f.search.schedule(); await f.tick(200);
    keyword = 'Ani'; f.search.schedule(); await f.tick(349);
    assert.equal(calls.length, 0); assert.equal(f.search.pending.value, true);
    await f.tick(1); assert.deepEqual(calls, ['Ani']); assert.equal(f.search.pending.value, false);
    keyword = ''; f.search.schedule(); await f.tick(350); assert.deepEqual(calls, ['Ani', '']);
  } finally { f.dispose(); }
});

test('Enter/Cari runs immediately and cancels delayed duplicate', async () => {
  let calls = 0;
  const f = fixture(() => { calls++; });
  try {
    f.search.schedule(); await f.search.run(); await f.tick(1000);
    assert.equal(calls, 1); assert.equal(f.timers.size, 0);
  } finally { f.dispose(); }
});

test('Closing popup, leaving cached tab and unmount cancel timers and invalidate in-flight responses', async () => {
  const open = vue.ref(true);
  let calls = 0, invalidations = 0;
  const f = fixture(() => { calls++; }, { enabled: () => open.value, invalidate: () => { invalidations++; } });
  try {
    f.search.schedule(); open.value = false; await f.tick(500); assert.equal(calls, 0);
    open.value = true; f.search.schedule(); f.hooks.deactivate(); await f.tick(500); assert.equal(calls, 0);
    await f.search.run(); assert.equal(calls, 0);
    f.hooks.activate(); f.search.schedule(); await f.tick(350); assert.equal(calls, 1);
    f.search.schedule(); f.hooks.unmount(); await f.tick(500); assert.equal(calls, 1);
    assert.ok(invalidations >= 5);
  } finally { f.dispose(); }
});

test('An older lookup response cannot fill selectable rows during debounce gap; context/sort preserved', async () => {
  const pending = [], calls = [];
  const lookupModule = evaluate('composables/useKaryawanLookup.ts', name => name === 'vue' ? vue : { api: {
    get: (url, config) => { calls.push(config.params); return new Promise(resolve => pending.push(resolve)); },
  } });
  const lookup = lookupModule.useKaryawanLookup('/lookup');
  const response = nik => ({ data: { data: [{ Nik: nik }], pagination: { page: 1, per_page: 25, total: 1, last_page: 1 } } });
  let keyword = 'old';
  const f = fixture(() => lookup.search(keyword, { tanggal: '2026-10-12', pabrik: 'P01' }), { invalidate: () => lookup.invalidate() });
  try {
    const old = lookup.search('old');
    lookup.sortBy = 'Nama'; lookup.sortDir = 'desc';
    keyword = 'new'; f.search.schedule(); pending[0](response('old')); await old;
    assert.equal(lookup.rows.length, 0);
    await f.tick(350);
    assert.equal(calls[1].search, 'new'); assert.equal(calls[1].page, 1);
    assert.equal(calls[1].pabrik, 'P01'); assert.equal(calls[1].tanggal, '2026-10-12');
    assert.equal(calls[1].sort_by, 'Nama');
    pending[1](response('new')); await f.tick(0); assert.equal(lookup.rows[0].Nik, 'new');
  } finally { f.dispose(); }
});

test('All formerly manual employee/section popup searches are wired to shared debounce and explicit flush', () => {
  const files = ['absensi/AbsensiForm', ...['Ijin', 'Ijin2', 'Keluar', 'Lembur', 'Lembur2', 'Mutasi', 'Penilaian', 'Permintaan', 'PerubahanStatus', 'SP', 'Pinjaman'].map(name => `transaksi/${name}Form`)];
  for (const file of files) {
    const source = fs.readFileSync(path.join(root, `views/${file}.vue`), 'utf8');
    assert.match(source, /useLiveSearch\(/, file);
    assert.match(source, /@input="liveSearch.schedule"/, file);
    assert.match(source, /@(?:keyup.enter|submit.prevent)="liveSearch.run"/, file);
    assert.match(source, /invalidate:.*(?:karyawanLookup|lookup)\.invalidate\(\)/, file);
  }
  for (const file of ['Mutasi', 'Permintaan']) {
    const source = fs.readFileSync(path.join(root, `views/transaksi/${file}Form.vue`), 'utf8');
    assert.match(source, /if \(request === searchRequest\) hasilCari.value/);
  }
});

test('Pelunasan live search only GET-loads list, invalidates selected items and remains blocked during processing', () => {
  const source = fs.readFileSync(path.join(root, 'views/transaksi/ProsesPelunasanPinjamanView.vue'), 'utf8');
  assert.match(source, /useLiveSearch\(\(\) => load\(1\), \{ enabled: \(\) => !processing.value, invalidate \}\)/);
  assert.match(source, /selected.value = new Set\(\); ready.value = false/);
  assert.match(source, /@input="liveSearch.schedule"/);
  assert.match(source, /@click="processSelected"/);
});

test('Editable salary settings confirm unsaved changes before searching and block Save while pending/loading', () => {
  const source = fs.readFileSync(path.join(root, 'views/gaji/SettingGajiView.vue'), 'utf8');
  assert.match(source, /edited.value && !window.confirm/);
  assert.match(source, /if \(confirmSearch\(\)\) liveSearch.schedule\(\)/);
  assert.match(source, /@update="edited = true"/);
  assert.match(source, /loading \|\| liveSearch.pending.value/);
  assert.match(source, /if \(request !== loadRequest\) return/);
});
