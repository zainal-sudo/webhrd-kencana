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
