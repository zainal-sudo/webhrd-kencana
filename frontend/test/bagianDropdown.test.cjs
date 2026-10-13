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

function component(source, dependencies = {}) {
  const { descriptor } = parse(source);
  const script = compileScript(descriptor, { id: 'bagian-dropdown', inlineTemplate: true });
  const module = { exports: {} };
  vm.runInNewContext(ts.transpileModule(script.content, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText,
    { module, exports: module.exports, require: name => name === 'vue' ? vue : dependencies[name] });
  return module.exports.default;
}
const FSelect = component(fs.readFileSync(path.join(root, 'components/fields/FSelect.vue'), 'utf8'));

for (const name of ['Lembur', 'Ijin2']) {
  test(`${name}: Bagian uses a dropdown after Pabrik selection; All Bagian disables it and stored selection is displayed`, async () => {
    const source = fs.readFileSync(path.join(root, `views/transaksi/${name}Form.vue`), 'utf8');
    const tag = source.match(/<FSelect[^>]*label="Bagian \(filter\)"[^\n]*\/>/)[0];
    assert.doesNotMatch(source, /bagian-list|bagian-wrap|<FText[^>]*label="Bagian \(filter\)"/);
    assert.match(source, new RegExp(`/transaksi/${name === 'Lembur' ? 'lembur' : 'ijin2'}/bagian-options`));
    // Render the real field markup from each page with the actual shared select.
    // No API/database requests; all choices below are synthetic.
    const Field = component(`<script setup lang="ts">
      import FSelect from '@/components/fields/FSelect.vue';
      defineProps<{ values: { pabrik: string; bagian: string }; bagianOptions: string[]; allBag: boolean }>();
      </script><template>${tag}</template>`, { '@/components/fields/FSelect.vue': { default: FSelect } });
    async function render(pabrik, allBag = false, bagian = '') {
      return renderToString(vue.createSSRApp(Field, { values: { pabrik, bagian }, bagianOptions: ['BAGIAN TEST A', 'BAGIAN TEST B'], allBag }));
    }
    const empty = await render('');
    assert.match(empty, /<select[^>]*disabled/);
    assert.match(empty, /Pilih Pabrik terlebih dahulu/);
    const active = await render('P-TEST', false, 'BAGIAN TEST B');
    assert.doesNotMatch(active, /<select[^>]*disabled/);
    assert.match(active, /<select value="BAGIAN TEST B">/);
    assert.match(active, /<option value="BAGIAN TEST B">BAGIAN TEST B<\/option>/);
    assert.match(active, /Pilih Bagian/);
    assert.match(await render('P-TEST', true), /<select[^>]*disabled/);
    assert.match(source, /bagian: allBag.value \? "" : values.bagian/);
  });
}
