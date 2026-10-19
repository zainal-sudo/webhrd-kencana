const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { parse, compileStyle } = require('@vue/compiler-sfc');
const root = path.join(__dirname, '../src');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('Shared row icon hover uses the Master reference: rounded 6px, subtle role colors, no layout changes', () => {
  const css = read('assets/row-actions.css');
  assert.match(read('main.ts'), /import "\.\/assets\/row-actions.css"/);
  assert.match(css, /\.row-btn\s*\{[^}]*border-radius: 6px/);
  assert.match(css, /--row-action-hover: rgba\(59, 89, 152, 0.14\)/);
  for (const [role, color] of [['del', '220, 38, 38'], ['print', '15, 118, 110'], ['verify', '21, 128, 61'], ['unverify', '180, 83, 9']]) {
    assert.ok(css.includes(`.row-btn.${role} { --row-action-hover: rgba(${color}, 0.12); }`));
  }
  assert.match(css, /\.row-btn:not\(:disabled\):is\(:hover, :focus-visible\)\s*\{\s*background: var\(--row-action-hover\)/);
  assert.match(css, /\.row-btn:focus-visible\s*\{[^}]*outline: 2px solid currentColor/);
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.doesNotMatch(css, /!important|box-shadow|\b(?:width|height|padding|border):/);
});

test('Shared styles apply to slotted actions; local components no longer override hover colors', () => {
  for (const file of ['components/BaseBrowse.vue', 'views/absensi/AbsensiView.vue', 'views/master/SandiBpjsView.vue',
    'views/transaksi/BankPelamarForm.vue', 'views/transaksi/RekrutmenForm.vue']) {
    const source = read(file);
    assert.doesNotMatch(source, /(?:\.row-btn(?:\.(?:edit|del|print))?|\.delete-btn|\.absensi-actions \.(?:edit|del)):hover/);
    const { descriptor } = parse(source);
    for (const style of descriptor.styles) {
      assert.equal(compileStyle({ source: style.content, filename: file, id: 'data-v-test', scoped: style.scoped }).errors.length, 0);
    }
  }
  assert.match(read('views/transaksi/BankPelamarForm.vue'), /class="row-btn del"[^>]*title="Hapus baris"/);
  assert.match(read('views/master/SandiBpjsView.vue'), /class="row-btn del delete-btn"/);
  // These scoped selectors have higher specificity than the shared hover rule.
  // They must not force a transparent background while the icon is hovered.
  assert.doesNotMatch(read('views/master/SandiBpjsView.vue').match(/\.delete-btn\s*\{([^}]+)\}/)[1], /background:/);
  assert.doesNotMatch(read('views/absensi/AbsensiView.vue').match(/\.absensi-actions \.row-btn\s*\{([^}]+)\}/)[1], /background:/);
});

test('Holiday actions use rounded shared hover without widening the compact column or highlighting disabled actions', () => {
  const source = read('views/laporan/LemburHariLiburView.vue');
  assert.match(source, /\.report-page \.row-btn\s*\{[^}]*width: 16px; height: 24px/);
  assert.match(source, /\.row-btn::before\s*\{[^}]*inset: 0 -4px; border-radius: 6px/);
  assert.match(source, /\.row-btn:not\(:disabled\):is\(:hover, :focus-visible\)::before\s*\{ background: var\(--row-action-hover\)/);
  assert.match(source, /transition: inherit/);
  assert.doesNotMatch(source, /--action-hover|border-radius: 999px/);
});

test('Pinjaman trash matches Karyawan icon and bordered button dimensions without changing delete protection', () => {
  const loan = read('views/transaksi/PinjamanView.vue');
  const employee = read('views/master/KaryawanView.vue');
  const base = read('components/BaseBrowse.vue');
  assert.match(base, /<MsIcon name="delete" :size="14"/);
  assert.match(loan, /@click="requestDelete\(row\)"><MsIcon name="delete" :size="14"/);
  for (const source of [loan.match(/^\.delete-button\s*\{([^}]+)\}/m)[1], employee.match(/:deep\(\.row-btn.del\)\s*\{([^}]+)\}/)[1]]) {
    for (const value of ['width: 36px', 'height: 32px', 'border: 1px solid currentColor', 'border-radius: 6px']) assert.ok(source.includes(value), value);
  }
  assert.match(loan, /:disabled="deleting \|\| row.potong1_diproses_pada != null \|\| row.potong2_diproses_pada != null"/);
  assert.match(loan, /v-if="auth.can\('frmPinjam', 'delete'\)"/);
  assert.match(loan, /class="delete-confirm"[^>]*><MsIcon name="delete_forever" :size="18"/);
});
