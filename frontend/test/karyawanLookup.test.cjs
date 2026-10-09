const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const vue = require('vue');

function createLookup(get) {
  const source = fs.readFileSync(require('node:path').join(__dirname, '../src/composables/useKaryawanLookup.ts'), 'utf8');
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(js, { module, exports: module.exports, require: name => name === 'vue' ? vue : { api: { get } } });
  return module.exports.useKaryawanLookup('/lookup');
}
const response = (page = 1, total = 60) => ({ data: { data: [{ Nik: String(page) }], pagination: { page, per_page: 25, total, last_page: Math.ceil(total / 25) } } });

test('pagination and sort preserve search/pabrik; normal mode sends no sort or filters', async () => {
  const calls = [];
  const lookup = createLookup(async (url, { params }) => { calls.push(params); return response(params.page); });
  await lookup.search('Ani', { pabrik: 'P01', aktif: 1 });
  assert.equal(lookup.sortBy, '');
  assert.equal(calls.at(-1).sort_by, undefined);
  await lookup.load(2);
  assert.equal(calls.at(-1).page, 2);
  assert.equal(calls.at(-1).pabrik, 'P01');
  await lookup.sort('Nik');
  assert.equal(calls.at(-1).page, 1);
  assert.equal(calls.at(-1).sort_dir, 'asc');
  await lookup.sort('Nik');
  assert.equal(calls.at(-1).sort_dir, 'desc');
  await lookup.sort('Nik');
  assert.equal(lookup.sortBy, '');
  assert.equal(calls.at(-1).sort_by, undefined);
  assert.equal(calls.at(-1).sort_dir, undefined);
  await lookup.sort('Nik');
  await lookup.sort('Nama');
  assert.equal(calls.at(-1).sort_by, 'Nama');
  assert.equal(calls.at(-1).sort_dir, 'asc');
  await lookup.search('Budi', { pabrik: 'P02' });
  assert.equal(calls.at(-1).page, 1);
  assert.equal(calls.at(-1).search, 'Budi');
  assert.equal(calls.at(-1).pabrik, 'P02');
  assert(!Object.keys(calls.at(-1)).some(key => key.startsWith('filter_')));
  assert.equal(lookup.loading, false);
});

test('empty results and a removed last page stay within valid pagination', async () => {
  const calls = [];
  const lookup = createLookup(async (url, { params }) => { calls.push(params.page); return response(params.page, 0); });
  await lookup.search('missing');
  assert.equal(lookup.pagination.last_page, 1);
  await lookup.load(3);
  assert.equal(calls.at(-1), 1);
  assert.equal(lookup.pagination.page, 1);
  assert.equal(lookup.loading, false);
});

test('late responses do not overwrite a newer search', async () => {
  const pending = [];
  const lookup = createLookup(() => new Promise(resolve => pending.push(resolve)));
  const oldRequest = lookup.search('old');
  const newRequest = lookup.search('new');
  pending[1](response(2));
  await newRequest;
  pending[0](response(1));
  await oldRequest;
  assert.equal(lookup.rows[0].Nik, '2');
});

test('failed requests clear selectable rows and allow retry', async () => {
  let fail = false;
  const lookup = createLookup(async () => { if (fail) throw Error('offline'); return response(); });
  await lookup.search('Ani');
  fail = true;
  await assert.rejects(lookup.load(2));
  assert.equal(lookup.rows.length, 0);
  assert(lookup.error);
  assert.equal(lookup.loading, false);
  fail = false;
  await lookup.load(1);
  assert.equal(lookup.error, '');
  assert.equal(lookup.rows.length, 1);
});

test('clear resets lookup state and ignores requests started before form reset', async () => {
  let resolve;
  const lookup = createLookup(() => new Promise(r => { resolve = r; }));
  const pending = lookup.search('Ani');
  lookup.clear();
  resolve(response(2));
  await pending;
  assert.equal(lookup.rows.length, 0);
  assert.equal(lookup.loading, false);
  assert.equal(lookup.pagination.page, 1);
  assert.equal(lookup.pagination.total, 0);
  assert.equal(lookup.sortBy, '');
});
