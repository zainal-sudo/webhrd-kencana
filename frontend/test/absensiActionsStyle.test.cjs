const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../src/views/absensi/AbsensiView.vue'), 'utf8');

test('Absensi action layout has equal centered targets, spaced blue edit and red delete icons', () => {
  assert.match(source, /\.absensi-actions\s*\{[^}]*align-items: center;[^}]*justify-content: center;[^}]*gap: 12px;[^}]*flex-wrap: nowrap;/);
  assert.match(source, /\.absensi-actions \.row-btn\s*\{[^}]*width: 24px;[^}]*height: 24px;/);
  assert.match(source, /\.absensi-actions \.edit \{ color: #3b5998; \}/);
  assert.match(source, /\.absensi-actions \.del \{ color: #dc2626; \}/);
  assert.match(source, /\.absensi-actions \.material-symbols-outlined\s*\{[^}]*font-size: 16px;/);
  assert.match(source, /\.absensi-actions \.row-btn:focus-visible/);
});

test('Absensi action buttons retain handlers and order, with accessible button semantics', () => {
  const actions = source.match(/<template #row-actions="\{ row \}">([\s\S]*?)<\/template>/)[1];
  assert.match(actions, /class="absensi-actions"/);
  assert.match(actions, /type="button"[^>]*aria-label="Ubah jam absensi"[^>]*@click="bukaEdit\(row\)"/);
  assert.match(actions, /type="button"[^>]*aria-label="Hapus absensi"[^>]*@click="konfirmasiHapus\(row\)"/);
  assert.ok(actions.indexOf('bukaEdit(row)') < actions.indexOf('konfirmasiHapus(row)'));
  assert.match(actions, /aria-hidden="true">edit<\/span>/);
  assert.match(actions, /aria-hidden="true">delete<\/span>/);
});
