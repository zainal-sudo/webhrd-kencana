const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('Employee identity has four equal columns with full-width controls and labels above', () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/views/master/KaryawanForm.vue'), 'utf8');
  const identity = source.match(/<fieldset class="fs identity-main">([\s\S]*?)<\/fieldset>/)[1];
  for (const label of ['NIK', 'Nama Lengkap', 'Status Aktif', 'Kode Absensi']) assert.ok(identity.includes(label));
  assert.equal((identity.match(/<FText\b/g) || []).length, 2);
  assert.equal((identity.match(/<FSelect\b/g) || []).length, 1);
  assert.doesNotMatch(identity, /:span=/);
  assert.match(source, /\.grid\.identity-grid\s*\{\s*grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)/);
  assert.match(source, /\.identity-grid :deep\(\.field\)[^}]*flex-direction: column[^}]*align-items: stretch/);
  assert.match(source, /\.identity-grid :deep\(\.field label\)[^}]*flex: none[^}]*margin: 0/);
  assert.match(source, /\.identity-grid :deep\(\.field input\), \.identity-grid :deep\(\.select-wrap\)[^}]*width: 100%/);
  assert.match(source, /@media \(max-width: 900px\)[\s\S]*?\.grid\.identity-grid[^}]*repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(source, /@media \(max-width: 600px\)[\s\S]*?\.grid\.identity-grid[^}]*grid-template-columns: minmax\(0, 1fr\)/);
});
test('Employee NIK is non-focusable selectable text, not a read-only input, with aligned 30px height', () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/views/master/KaryawanForm.vue'), 'utf8');
  const nik = source.match(/<div class="field nik-field">([\s\S]*?)<\/div>\s*<\/div>/)[1];
  assert.match(nik, /class="nik-label">NIK/);
  assert.match(nik, /class="nik-value"/);
  assert.match(nik, /nik \|\| 'Otomatis setelah disimpan'/);
  assert.doesNotMatch(nik, /<input|<button|tabindex|@click|readonly/);
  assert.match(source, /\.nik-value \{[^}]*height: 30px; box-sizing: border-box/);
  assert.match(source, /\.nik-value \{[^}]*user-select: text; cursor: default/);
  assert.match(source, /\.nik-value \{[^}]*background: var\(--ds-surface-inset/);
  assert.match(source, /\.nik-value \{ border-radius: 8px; \}/);
  assert.match(source, /\.nik-label \{[^}]*margin: 0; line-height: 1\.4/);
});
