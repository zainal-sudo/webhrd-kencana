const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '../src/views/dashboard/DashboardView.vue');
const source = fs.readFileSync(root, 'utf8');

function block(selector) {
  const start = source.indexOf(selector);
  assert.ok(start >= 0, `${selector} ada di DashboardView.vue`);
  const open = source.indexOf('{', start);
  let depth = 0, end = open;
  for (let i = open; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}') { depth--; if (!depth) { end = i; break; } }
  }
  return source.slice(open, end + 1);
}

test('Hover baris menu dashboard tidak lagi mewarnai garis (bukan biru tebel)', () => {
  const hover = block('.modul-item:hover');
  assert.doesNotMatch(hover, /border-color/, 'hover tidak mengubah warna garis pemisah');
  assert.match(hover, /background:\s*#f1f1f8/, 'sorot latar tetap ada');
  assert.match(hover, /color:\s*#3b5998/, 'teks biru tetap ada');
});

test('Pemisah antar baris tetap abu-abu tipis; baris paling bawah tetap tanpa garis', () => {
  const base = block('.modul-item').replace('.modul-item:hover', '');
  assert.match(base, /border-bottom:\s*1px solid #f3f4f6/, 'pemisah antar baris tetap ada');
  const last = block('.modul-item:last-child');
  assert.match(last, /border-bottom:\s*none/, 'baris terakhir tanpa garis (seperti Sandi)');
});
