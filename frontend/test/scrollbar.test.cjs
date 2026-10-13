const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = file => fs.readFileSync(path.join(__dirname, '../src', file), 'utf8');

test('Horizontal scrollbars use shared 14px height without enlarging vertical scrollbars', () => {
  const css = read('assets/main.css');
  assert.match(css, /--ds-horizontal-scrollbar-size:\s*14px/);
  assert.match(css, /::-webkit-scrollbar\s*\{[^}]*width:\s*5px;[^}]*height:\s*var\(--ds-horizontal-scrollbar-size, 14px\) !important;/);
  for (const file of ['assets/design-system.css', 'components/TabBar.vue', 'views/master/KaryawanForm.vue']) {
    assert.match(read(file), /::-webkit-scrollbar\s*\{[^}]*height:\s*var\(--ds-horizontal-scrollbar-size, 14px\)/, file);
  }
  assert.match(read('views/master/KaryawanForm.vue'), /\.employee-scroll::-webkit-scrollbar\s*\{\s*width: 10px;/);
});
