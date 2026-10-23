const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function fixture(key, handler = async () => {}) {
  const calls = [], errors = [];
  let refreshes = 0;
  const scope = {
    deletingKey: { value: key }, deleting: { value: false }, deleteDialog: { value: true },
    props: { endpoint: '/transaksi/bank-pelamar' },
    api: { async delete(url) { calls.push(url); await handler(url); } },
    toast: { success() {}, error(message) { errors.push(message); } },
    getErrorMessage: e => e.message,
    refreshAfterDelete() { refreshes++; },
  };
  const source = fs.readFileSync(path.join(__dirname, '../src/components/BaseBrowse.vue'), 'utf8');
  const start = source.indexOf('async function doDelete()');
  const code = source.slice(start, source.indexOf('/** Optional module-specific', start));
  vm.runInNewContext(ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText
    + '\nglobalThis.remove = doDelete;', scope);
  return { ...scope, calls, errors, refreshes: () => refreshes };
}

test('Bank Pelamar delete sends its slash-delimited number as one encoded route parameter', async () => {
  const nomor = '001/HRD/REKRUIT/10/26';
  const f = fixture(nomor);
  await f.remove();
  assert.deepEqual(f.calls, ['/transaksi/bank-pelamar/001%2FHRD%2FREKRUIT%2F10%2F26']);
  const segment = f.calls[0].split('/').at(-1);
  assert.equal(decodeURIComponent(segment), nomor);
  assert.equal(f.deleteDialog.value, false);
  assert.equal(f.refreshes(), 1);
  assert.equal(f.deleting.value, false);
});

test('Shared browse delete preserves simple keys and encodes reserved characters exactly once', async () => {
  for (const key of ['PJ.2610.0001', '00123', 'A/B #?%&']) {
    const f = fixture(key);
    await f.remove();
    assert.equal(decodeURIComponent(f.calls[0].split('/').at(-1)), key);
    assert.equal(f.refreshes(), 1);
  }
});

test('Rejected delete keeps dialog open and does not refresh or report success', async () => {
  const f = fixture('001/HRD/REKRUIT/10/26', async () => { throw Error('Pelamar sudah dipakai di data panggilan'); });
  await f.remove();
  assert.equal(f.deleteDialog.value, true);
  assert.deepEqual(f.errors, ['Pelamar sudah dipakai di data panggilan']);
  assert.equal(f.refreshes(), 0);
  assert.equal(f.deleting.value, false);
});

test('Pending or missing-key delete does not send duplicate requests', async () => {
  const empty = fixture(null);
  await empty.remove();
  assert.equal(empty.calls.length, 0);
  let release;
  const f = fixture('001/HRD/REKRUIT/10/26', () => new Promise(resolve => { release = resolve; }));
  const pending = f.remove();
  await f.remove();
  assert.equal(f.calls.length, 1);
  release();
  await pending;
  assert.equal(f.refreshes(), 1);
});
