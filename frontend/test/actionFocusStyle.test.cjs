const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '../src');

test('Table action focus is a thicker inset outline without changing button/cell dimensions', () => {
  const source = fs.readFileSync(path.join(root, 'assets/main.css'), 'utf8');
  const rule = source.match(/\.app-shell tbody button:focus,[\s\S]*?\}/)?.[0];
  assert.ok(rule);
  assert.match(rule, /outline: 3px solid var\(--ds-primary[^;]*!important/);
  assert.match(rule, /outline-offset: -3px !important/);
  assert.match(rule, /box-shadow: none !important/);
  assert.doesNotMatch(rule, /(?:width|height|padding|margin):/);
});

test('Pinjaman toolbar can wrap at any available panel width and retains grouped Export/Tambah', () => {
  const source = fs.readFileSync(path.join(root, 'views/transaksi/PinjamanView.vue'), 'utf8');
  assert.match(source, /:deep\(\.toolbar-right\)[^}]*flex-wrap: wrap[^}]*width: 100%/);
  assert.doesNotMatch(source, /:deep\(\.toolbar-right\)[^}]*flex-wrap: nowrap/);
  assert.match(source, /\.loan-toolbar-actions[^}]*flex-wrap: nowrap[^}]*flex: 0 0 auto/);
  assert.match(source, /\.all-dates-button:focus-visible[^}]*outline-offset: -2px/);
});
