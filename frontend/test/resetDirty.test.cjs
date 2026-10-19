const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const vue = require('vue');
const { parse, compileScript } = require('@vue/compiler-sfc');
const { renderToString } = require('@vue/server-renderer');
const root = path.join(__dirname, '../src');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
function compile(source, dependencies = {}, globals = {}) {
  const module = { exports: {} };
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText,
    { module, exports: module.exports, require: name => dependencies[name] || {}, ...globals });
  return module.exports;
}
const snapshot = compile(read('utils/formSnapshot.ts'));
function resetFixture(targets, blocked = vue.ref(false)) {
  let confirmations = 0;
  const { useTransactionReset } = compile(read('composables/useTransactionReset.ts'), { vue, '@/utils/formSnapshot': snapshot },
    { window: { confirm() { confirmations++; return true; } } });
  return { reset: useTransactionReset(targets, { blocked: () => blocked.value, afterRestore() {} }), confirmations: () => confirmations };
}
test('Dirty comparison ignores key order but detects values, missing keys, nested rows and array order', () => {
  assert.ok(snapshot.sameFormState({ b: null, a: { x: 1, y: '07:00:00' } }, { a: { y: '07:00:00', x: 1 }, b: null }));
  for (const [left, right] of [[{ x: null }, {}], [{ x: 0 }, { x: null }], [{ x: false }, { x: true }], [[1, 2], [2, 1]], [[{ x: 1 }], [{ x: 2 }]]]) {
    assert.equal(snapshot.sameFormState(left, right), false);
  }
});
test('Pristine forms cannot reset; deep/ref changes enable immediately and manual restoration disables again', async () => {
  const values = vue.reactive({ name: 'Ani', amount: 0, schedule: { time: '07:00:00' } });
  const rows = vue.ref([{ nik: '001', time: '08:00:00' }]);
  const { reset, confirmations } = resetFixture({ values, rows });
  await reset.initialize(); assert.equal(reset.dirty.value, false); assert.equal(reset.disabled.value, true);
  assert.equal(reset.reset(), false); assert.equal(confirmations(), 0);
  values.name = 'Budi'; assert.equal(reset.disabled.value, false);
  values.name = 'Ani'; assert.equal(reset.disabled.value, true);
  values.schedule.time = '09:00:00'; assert.equal(reset.dirty.value, true);
  values.schedule.time = '07:00:00'; assert.equal(reset.dirty.value, false);
  rows.value[0].time = '09:00:00'; assert.equal(reset.disabled.value, false);
  rows.value[0].time = '08:00:00'; assert.equal(reset.disabled.value, true);
  rows.value.push({ nik: '002', time: '10:00:00' }); assert.equal(reset.dirty.value, true);
  rows.value.pop(); assert.equal(reset.dirty.value, false);
  rows.value[0].nik = 'CHANGED'; assert.equal(reset.reset(), true); await vue.nextTick();
  assert.equal(reset.disabled.value, true); assert.equal(reset.dirty.value, false);
  assert.equal(confirmations(), 1); assert.equal(reset.reset(), false); assert.equal(confirmations(), 1);
});
test('Capture/invalidate refresh dirty state and pending/load/save blockers still override dirty inputs', async () => {
  const values = vue.reactive({ nik: '001' }), blocked = vue.ref(false);
  const { reset } = resetFixture({ values }, blocked);
  reset.capture(); values.nik = '002'; assert.equal(reset.disabled.value, false);
  blocked.value = true; assert.equal(reset.disabled.value, true);
  blocked.value = false; assert.equal(reset.disabled.value, false);
  reset.capture(); assert.equal(reset.dirty.value, false); assert.equal(reset.disabled.value, true);
  values.nik = '003'; reset.invalidate(); assert.equal(reset.dirty.value, false); assert.equal(reset.disabled.value, true);
  reset.capture(); values.nik = '004';
  let done; const api = reset.trackApi({ get() { return new Promise(resolve => { done = resolve; }); } });
  const pending = api.get(); assert.equal(reset.disabled.value, true);
  done(); await pending; assert.equal(reset.disabled.value, false);
});
function employeeFixture() {
  const source = read('views/master/KaryawanForm.vue');
  const block = source.slice(source.indexOf('const canChangeStatus ='), source.indexOf('const memuat = ref(false)'));
  const upload = source.slice(source.indexOf('function onPilihFoto'), source.indexOf('onUnmounted(() =>', source.indexOf('function onPilihFoto')));
  const readers = [];
  class Reader {
    constructor() { readers.push(this); this.aborted = false; }
    readAsDataURL() {}
    abort() { this.aborted = true; this.onabort?.(); }
  }
  return { readers, ...compile(block + upload + '\nexport { values, anak, pendidikan, pengalaman, keahlian, jadwalTerpilih, pkwt, fotoBase64, fotoInput, fotoPending, resetDirty, resetSnapshot, captureForm, resetForm, onPilihFoto };', {},
    { ...vue, ...snapshot, isEdit: vue.ref(false), memuat: vue.ref(false), todaySql: () => '2026-10-14',
      jadwalMenu: vue.ref(false), cariJadwal: vue.ref(''), window: { confirm: () => true }, FileReader: Reader, toast: { error() {} },
      auth: { user: { user_kode: 'hrd' } } }) };
}
test('Employee Reset tracks identity/details/schedule changes and becomes clean after restoring or resetting', () => {
  const f = employeeFixture(); assert.equal(f.resetDirty.value, false); assert.equal(f.resetForm(), false);
  f.values.kar_tgl_masuk = '2020-01-01'; assert.equal(f.resetDirty.value, true);
  f.values.kar_tgl_masuk = '2026-10-14'; assert.equal(f.resetDirty.value, false);
  for (const [list, row] of [[f.anak, { nama: 'Child' }], [f.pendidikan, { jenjang: 'SMA' }], [f.pengalaman, { perusahaan: 'A' }],
    [f.keahlian, { nama: 'Skill' }], [f.jadwalTerpilih, 1], [f.pkwt, { periode: 1 }]]) {
    list.value.push(row); assert.equal(f.resetDirty.value, true); list.value.pop(); assert.equal(f.resetDirty.value, false);
  }
  f.anak.value.push({ nama: 'Child' }); assert.equal(f.resetForm(), true); assert.equal(f.resetDirty.value, false);
});
test('Employee pending photo read enables Reset; reset aborts upload and original photo is a clean baseline', () => {
  const f = employeeFixture(); f.fotoBase64.value = 'original-photo'; f.resetSnapshot.value = f.captureForm();
  assert.equal(f.resetDirty.value, false);
  const input = { files: [{ size: 100 }], value: 'new.jpg' }; f.fotoInput.value = input;
  f.onPilihFoto({ target: input }); assert.equal(f.fotoPending.value, true); assert.equal(f.resetDirty.value, true);
  assert.equal(f.resetForm(), true); assert.ok(f.readers[0].aborted); assert.equal(f.fotoPending.value, false);
  assert.equal(f.resetDirty.value, false); assert.equal(f.fotoBase64.value, 'original-photo');
  f.onPilihFoto({ target: { files: [{ size: 100 }] } });
  f.readers[1].result = 'new-photo'; f.readers[1].onload();
  assert.equal(f.fotoPending.value, false); assert.equal(f.resetDirty.value, true);
  f.fotoBase64.value = 'original-photo'; assert.equal(f.resetDirty.value, false);
});
test('Actual footer disables Reset for clean forms or missing callback, enables only dirty forms', async () => {
  const { descriptor } = parse(read('components/BaseForm.vue'));
  const Component = compile(compileScript(descriptor, { id: 'dirty-reset', inlineTemplate: true }).content,
    { vue, 'vue-router': { useRouter: () => ({}) }, 'vue-toastification': { useToast: () => ({}) },
      '@/stores/tabsStore': { useTabsStore: () => ({}) }, '@/stores/authStore': { useAuthStore: () => ({}) },
      '@/utils/formEnter': { nextFormField() {} }, '@/components/MsIcon.vue': { default: vue.defineComponent({ setup: () => () => null }) } }).default;
  for (const props of [{ resetFn() {}, resetDisabled: true }, { resetFn() {}, resetDisabled: false }, {}]) {
    const app = vue.createSSRApp(Component, { title: 'Form', showSave: false, ...props });
    for (const tag of ['v-dialog', 'v-card', 'v-card-item', 'v-card-title', 'v-card-text', 'v-card-actions', 'v-spacer', 'v-btn']) app.component(tag, vue.defineComponent({ setup: () => () => null }));
    const html = await renderToString(app);
    const button = html.match(/<button[^>]*class="form-btn ghost"[^>]*>Reset<\/button>/)[0];
    assert.equal(button.includes('disabled'), !props.resetFn || props.resetDisabled === true);
  }
});
