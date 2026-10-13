const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const vue = require('vue');
const root = path.join(__dirname, '../src');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
function evaluate(source, requireModule, globals = {}) {
  const module = { exports: {} };
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
    { module, exports: module.exports, require: requireModule, ...globals });
  return module.exports;
}
const script = file => read(file).match(/<script setup lang="ts">([\s\S]*?)<\/script>/)[1];
const wireFilters = evaluate(read('utils/columnFilter.ts'), require);
const plain = value => JSON.parse(JSON.stringify(value));
function fixture() {
  let exposed;
  const posts = [], gets = [], errors = [];
  const mockVue = { ...vue, onMounted() {}, onActivated() {}, onUnmounted() {}, watch() {} };
  const api = {
    async get(url, config) { gets.push({ url, ...config }); return { data: { data: [], pagination: { page: 1, total: 0, last_page: 1 } } }; },
    async post(url, body, config) { posts.push({ url, body, ...config }); return { data: { message: 'OK' } }; },
  };
  const requireModule = name => {
    if (name === 'vue') return mockVue;
    if (name === 'vue-router') return { useRouter: () => ({}) };
    if (name === 'vue-toastification') return { useToast: () => ({ success() {}, error: message => errors.push(message) }) };
    if (name === '@/stores/tabsStore') return { useTabsStore: () => ({}) };
    if (name === '@/api/axios') return { api, getErrorMessage: e => e.message };
    if (name === '@/utils/format') return { firstDayOfMonth: () => '2026-10-01', todaySql: () => '2026-10-13' };
    if (name === '@/utils/columnFilter') return wireFilters;
    return {};
  };
  const base = evaluate(script('components/BaseBrowse.vue') + '\nexport { search, startDate, endDate, filterSets, page, buildParams };', requireModule, {
    defineProps: () => ({ endpoint: '/laporan/tidak-masuk', hasPeriod: true, defaultStart: '2026-10-01' }),
    withDefaults: (props, defaults) => ({ ...Object.fromEntries(Object.entries(defaults).map(([key, value]) => [key, typeof value === 'function' ? value() : value])), ...props }),
    defineEmits: () => () => {}, defineExpose: value => { exposed = value; },
    window: { clearTimeout() {} },
  });
  const view = evaluate(script('views/laporan/TidakMasukView.vue') + '\nexport { browse, filterProses, tanya, jalankan, dialog, memproses };', requireModule);
  view.browse.value = exposed;
  return { base, view, posts, gets, errors, api };
}

for (const mode of ['alpha', 'jadwal-libur']) {
  test(`${mode}: period/search/HO/Sabtu/NULL and empty filters match browse across all pages, with frozen confirmation and retained filters`, async () => {
    const f = fixture();
    f.base.startDate.value = '2026-10-03';
    f.base.endDate.value = '2026-10-10';
    f.base.search.value = ' employee ';
    f.base.page.value = 3;
    Object.assign(f.base.filterSets, {
      Pabrik: [wireFilters.filterKey('HO')], Hari: [wireFilters.filterKey('Sabtu')],
      Jenis_Ijin: [wireFilters.filterKey(null), wireFilters.filterKey('')],
    });
    const expected = plain(f.base.buildParams(false));
    assert.equal(expected.search, 'employee');
    assert.deepEqual(expected.filterSet_Pabrik, ['HO']);
    assert.deepEqual(expected.filterSet_Hari, ['Sabtu']);
    assert.equal(expected.filterNull_Jenis_Ijin, '1');
    assert.equal(expected.filterEmpty_Jenis_Ijin, '1');
    assert.equal(expected.page, undefined);
    assert.equal(expected.per_page, undefined);
    f.view.tanya(mode);
    assert.equal(f.view.dialog.value, true);
    assert.deepEqual(plain(f.view.filterProses.value), expected);
    // Change active controls after confirmation: POST must retain its snapshot.
    f.base.filterSets.Pabrik = [wireFilters.filterKey('K01')];
    f.base.startDate.value = '2026-10-01';
    f.base.search.value = 'changed';
    await f.view.jalankan();
    assert.equal(f.posts.length, 1);
    assert.equal(f.posts[0].url, `/laporan/tidak-masuk/${mode}-otomatis`);
    assert.deepEqual(plain(f.posts[0].params), expected);
    assert.equal(f.view.dialog.value, false);
    assert.equal(f.gets.length, 1);
    assert.equal(f.gets[0].params.page, 3);
    assert.deepEqual(plain(f.gets[0].params.filterSet_Pabrik), ['K01']);
    assert.equal(f.gets[0].params.search, 'changed');
    assert.equal(f.base.startDate.value, '2026-10-01');
    assert.equal(f.errors.length, 0);
    const source = read('views/laporan/TidakMasukView.vue');
    assert.match(source, /ref="browse"/);
    assert.doesNotMatch(source, /:key="versi"/);
    assert.match(source, /di seluruh halaman hasil filter/);
  });
}

test('Invalid/missing period or unavailable browse never opens mass action or sends an unfiltered POST', async () => {
  const f = fixture();
  for (const [start, end] of [['', '2026-10-13'], ['2026-10-13', ''], ['2026-10-13', '2026-10-01']]) {
    f.base.startDate.value = start; f.base.endDate.value = end;
    f.view.tanya('alpha');
    await f.view.jalankan();
    assert.equal(f.view.dialog.value, false);
    assert.equal(f.posts.length, 0);
  }
  f.view.browse.value = null;
  f.view.tanya('jadwal-libur');
  await f.view.jalankan();
  assert.equal(f.posts.length, 0);
  assert.equal(f.errors.length, 4);
});

test('No checklist filter still sends the visible period; failure retains confirmation and does not reset browse', async () => {
  const f = fixture();
  f.view.tanya('alpha');
  assert.deepEqual(plain(f.view.filterProses.value), { start_date: '2026-10-01', end_date: '2026-10-13' });
  f.view.memproses.value = 'alpha';
  await f.view.jalankan();
  assert.equal(f.posts.length, 0);
  f.view.memproses.value = null;
  f.api.post = async () => { throw new Error('POST failed'); };
  await f.view.jalankan();
  assert.equal(f.view.dialog.value, true);
  assert.equal(f.view.memproses.value, null);
  assert.deepEqual(f.errors, ['POST failed']);
  assert.equal(f.gets.length, 0);
});
