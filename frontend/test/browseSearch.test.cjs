const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('./helpers/frontendVm.cjs');
const ts = require('typescript');
const vue = require('vue');
const root = path.join(__dirname, '../src');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
function compile(source, requireModule, globals = {}) {
  const module = { exports: {} };
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports, require: requireModule, ...globals });
  return module.exports;
}
const filters = compile(read('utils/columnFilter.ts'), require);
function fixture(props = {}) {
  const requests = [], timers = new Map(), events = [], errors = [], unmounted = [], stops = [];
  let timerId = 0;
  const source = read('components/BaseBrowse.vue').match(/<script setup lang="ts">([\s\S]*?)<\/script>/)[1];
  const result = compile(source + '\nexport { rows, loading, search, onSearch, fetchData, refresh, page, total, lastPage, rowIdentity, props };', name => {
    if (name === 'vue') return { ...vue, onMounted() {}, onActivated() {}, onUnmounted: fn => unmounted.push(fn),
      watch: (...args) => { const stop = vue.watch(...args); stops.push(stop); return stop; } };
    if (name === 'vue-router') return { useRouter: () => ({}) };
    if (name === 'vue-toastification') return { useToast: () => ({ error: message => errors.push(message) }) };
    if (name === '@/stores/tabsStore') return { useTabsStore: () => ({}) };
    if (name === '@/api/axios') return { getErrorMessage: e => e.message, api: { get(url, config) {
      return new Promise((resolve, reject) => requests.push({ url, params: config.params, resolve, reject }));
    } } };
    if (name === '@/utils/format') return { todaySql: () => '2026-10-12', formatDateInput: v => v };
    if (name === '@/utils/columnFilter') return filters;
    return {};
  }, {
    defineProps: () => ({ endpoint: '/absensi', moduleTitle: 'Absensi', primaryKey: 'Nik', ...props }),
    withDefaults: (p, defaults) => ({ ...Object.fromEntries(Object.entries(defaults).map(([k, v]) => [k, typeof v === 'function' ? v() : v])), ...p }),
    defineEmits: () => (...args) => events.push(args), defineExpose() {},
    window: { setTimeout(fn, delay) { assert.equal(delay, 350); timers.set(++timerId, fn); return timerId; }, clearTimeout(id) { timers.delete(id); } },
  });
  return { ...result, requests, events, errors, timers,
    flush() { const queued = [...timers.values()]; timers.clear(); queued.forEach(fn => fn()); },
    unmount() { unmounted.forEach(fn => fn()); stops.forEach(fn => fn()); } };
}
function response(name, page = 1, total = 1) {
  return { data: { data: [{ Nik: name, Nama: name }], pagination: { page, per_page: 50, total, last_page: Math.max(1, Math.ceil(total / 50)) } } };
}
const settle = async () => { await vue.nextTick(); await new Promise(resolve => setImmediate(resolve)); };

test('Changing search invalidates old response immediately during debounce; latest rows and pagination win', async () => {
  const f = fixture();
  f.rows.value = [{ Nik: 'previous' }];
  f.page.value = 3;
  f.total.value = 120;
  f.search.value = 'first';
  f.onSearch();
  f.flush();
  assert.equal(f.requests[0].params.search, 'first');
  f.search.value = '';
  f.onSearch();
  f.search.value = 'second';
  f.onSearch();
  assert.equal(f.timers.size, 1);
  assert.equal(f.rows.value.length, 0);
  assert.equal(f.page.value, 1);
  assert.equal(f.total.value, 0);
  f.requests[0].resolve(response('first', 3, 120));
  await settle();
  assert.equal(f.rows.value.length, 0);
  assert.equal(f.loading.value, true);
  assert.equal(f.events.filter(e => e[0] === 'loaded').length, 0);
  f.flush();
  assert.equal(f.requests.length, 2);
  assert.equal(f.requests[1].params.search, 'second');
  assert.equal(f.requests[1].params.page, 1);
  f.requests[1].resolve(response('second'));
  await settle();
  assert.equal(f.rows.value[0].Nama, 'second');
  assert.equal(f.total.value, 1);
  assert.equal(f.lastPage.value, 1);
  assert.equal(f.loading.value, false);
  f.unmount();
});

test('Out-of-order requests and stale errors cannot replace current search or show stale error toast', async () => {
  const f = fixture();
  f.search.value = 'first'; f.onSearch(); f.flush();
  f.search.value = 'second'; f.onSearch(); f.flush();
  f.requests[1].resolve(response('second'));
  await settle();
  f.requests[0].resolve(response('first', 4, 200));
  await settle();
  assert.equal(f.rows.value[0].Nama, 'second');
  assert.equal(f.page.value, 1);
  f.search.value = 'third'; f.onSearch(); f.flush();
  f.search.value = 'fourth'; f.onSearch();
  f.requests[2].reject(Error('stale error'));
  await settle();
  assert.equal(f.errors.length, 0);
  assert.equal(f.events.filter(e => e[0] === 'load-error').length, 0);
  f.flush();
  f.requests[3].reject(Error('current error'));
  await settle();
  assert.deepEqual(f.errors, ['current error']);
  assert.equal(f.loading.value, false);
  f.unmount();
});

test('Clearing search removes query parameter; refresh cancels queued search and unmount ignores pending response', async () => {
  const f = fixture();
  f.search.value = ''; f.onSearch();
  const refresh = f.refresh();
  assert.equal(f.timers.size, 0);
  assert.equal(f.requests[0].params.search, undefined);
  f.requests[0].resolve(response('all'));
  await refresh;
  f.flush();
  assert.equal(f.requests.length, 1);
  f.search.value = 'later'; f.onSearch(); f.flush();
  f.search.value = 'queued'; f.onSearch();
  f.unmount();
  assert.equal(f.timers.size, 0);
  f.requests[1].resolve(response('later'));
  await settle();
  assert.equal(f.rows.value.length, 0);
});

test('Absensi row identity combines code + date; original edit and delete identifiers remain intact', () => {
  const source = read('views/absensi/AbsensiView.vue');
  const navigation = [];
  const handlers = compile(source.match(/<script setup lang="ts">([\s\S]*?)<\/script>/)[1] + '\nexport { absensiRowKey, bukaEdit, konfirmasiHapus, target };', name => {
    if (name === 'vue') return vue;
    if (name === 'vue-router') return { useRouter: () => ({ push: value => navigation.push(value) }) };
    if (name === 'vue-toastification') return { useToast: () => ({}) };
    return {};
  });
  const rows = [{ Nik: '4734', Tanggal: '2026-10-01' }, { Nik: '4734', Tanggal: '2026-10-11' }, { Nik: '2291', Tanggal: '2026-10-11' }];
  const f = fixture({ rowKey: handlers.absensiRowKey });
  assert.equal(new Set(rows.map((row, i) => f.rowIdentity(row, i))).size, 3);
  assert.equal(f.rowIdentity(rows[0], 0), f.rowIdentity({ ...rows[0] }, 9));
  assert.equal(f.rowIdentity(rows[0], 0), f.rowIdentity({ ...rows[0], Tanggal: '2026-10-01T00:00:00.000Z' }, 0));
  const normal = fixture({ primaryKey: 'Nomor' });
  assert.equal(normal.rowIdentity({ Nomor: 'PJ.2610.0001' }, 0), 'PJ.2610.0001');
  handlers.bukaEdit(rows[0]);
  assert.equal(navigation[0].query.nik, '4734');
  assert.equal(navigation[0].query.tanggal, '2026-10-01');
  handlers.konfirmasiHapus(rows[0]);
  assert.equal(handlers.target.value.Nik, '4734');
  assert.equal(handlers.target.value.Tanggal, '2026-10-01');
  assert.match(source, /primary-key="Nik"/);
  assert.match(source, /:row-key="absensiRowKey"/);
  assert.match(read('components/BaseBrowse.vue'), /:key="renderRowKeys\[idx\]"/);
  f.unmount(); normal.unmount();
});
