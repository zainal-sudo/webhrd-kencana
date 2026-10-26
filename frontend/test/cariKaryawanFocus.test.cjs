const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vue = require('vue');

const root = path.join(__dirname, '../src');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

const DIALOGS = {
  'views/absensi/AbsensiForm.vue': 'cariKaryawan',
  'views/transaksi/IjinForm.vue': 'cariOpen',
  'views/transaksi/Ijin2Form.vue': 'cariOpen',
  'views/transaksi/KeluarForm.vue': 'cariOpen',
  'views/transaksi/LemburForm.vue': 'cariOpen',
  'views/transaksi/Lembur2Form.vue': 'cariOpen',
  'views/transaksi/MutasiForm.vue': 'cariOpen',
  'views/transaksi/PenilaianForm.vue': 'cariOpen',
  'views/transaksi/PermintaanForm.vue': 'cariOpen',
  'views/transaksi/PerubahanStatusForm.vue': 'cariOpen',
  'views/transaksi/RekrutmenForm.vue': 'cariOpen',
  'views/transaksi/RiilPermintaanForm.vue': 'cariOpen',
  'views/transaksi/SPForm.vue': 'cariOpen',
  'views/transaksi/PinjamanForm.vue': 'cariOpen',
};

test('useDialogFocus: dialog terbuka -> kotak cari langsung fokus (bisa ketik tanpa klik)', async () => {
  const { useDialogFocus } = await import('../src/composables/useDialogFocus.ts').catch(() => ({}));
  let mod = useDialogFocus;
  if (!mod) {
    // Fallback: jalankan lewat fixture compile bila import .ts langsung tak didukung.
    const ts = require('typescript');
    const vm = require('node:vm');
    const src = read('composables/useDialogFocus.ts');
    const out = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    const module = { exports: {} };
    vm.runInNewContext(out, { module, exports: module.exports, require: () => vue });
    mod = module.exports.useDialogFocus;
  }
  const focusCalls = [];
  const open = vue.ref(false);
  const scope = vue.effectScope();
  scope.run(() => {
    const target = mod(() => open.value);
    target.value = { focus: () => focusCalls.push('focus') };
  });
  open.value = true;
  await vue.nextTick();
  await vue.nextTick();
  assert.equal(focusCalls.length, 1, 'focus terpanggil sekali begitu dialog dibuka');
  open.value = false;
  await vue.nextTick();
  assert.equal(focusCalls.length, 1, 'dialog tutup: tidak dipicu lagi');
  scope.stop();
});

test('Semua 14 dialog cari memakai useDialogFocus dan ref="cariInput" konsisten', () => {
  for (const [file, openRef] of Object.entries(DIALOGS)) {
    const source = read(file);
    assert.ok(source.includes('useDialogFocus'), `${file}: import/penanda useDialogFocus ada`);
    assert.match(source, new RegExp(`const cariInput = useDialogFocus\\(\\(\\) => ${openRef}\\.value\\);`),
      `${file}: cariInput terikat ke dialog ${openRef}`);
    // Input pencarian di dialog memakai ref="cariInput" — cukup 1 padanan.
    const inputs = [...source.matchAll(/<input[^>]*v-model="(kataCari|kataCariKaryawan|keyword)"/g)].map(m => m[0]);
    assert.ok(inputs.some(tag => tag.includes('ref="cariInput"')), `${file}: input v-model pencarian memakai ref="cariInput"`);
    // Ref dialog memang ada dinyatakan.
    assert.match(source, new RegExp(`const ${openRef} = ref\\(false\\);`), `${file}: ref dialog ${openRef} dinyatakan`);
    // Template memakai dialog (v-dialog atau overlay Pinjaman) pada ref yang sama.
    assert.ok(new RegExp(`v-model="${openRef}"|v-if="${openRef}"`).test(source), `${file}: template mengikat dialog ke ${openRef}`);
  }
});
