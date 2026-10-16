const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const vue = require('vue');
const { parse, compileScript } = require('@vue/compiler-sfc');
const read = file => fs.readFileSync(path.join(__dirname, '../src', file), 'utf8');
function evaluate(source, dependencies = {}) {
  const module = { exports: {} };
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText,
    { module, exports: module.exports, require: name => dependencies[name] });
  return module.exports;
}
const config = evaluate(read('config/accountAvatars.ts'));
test('Specific accounts override automatic choices, independent of case/outer spaces', () => {
  for (const [code, expected] of Object.entries({ hrd: 2, super: 12, p1: 1, p2: 7, p4: 9 })) {
    assert.equal(config.accountAvatarNumber(code), expected);
    assert.equal(config.accountAvatarNumber(` ${code.toUpperCase()} `), expected);
  }
  for (const code of ['new-user', 'operator', 'toString', '__proto__', 'constructor']) {
    const chosen = config.accountAvatarNumber(code);
    assert.ok(Number.isInteger(chosen) && chosen >= 1 && chosen <= 12);
    assert.equal(config.accountAvatarNumber(code.toUpperCase()), chosen);
    assert.equal(evaluate(read('config/accountAvatars.ts')).accountAvatarNumber(code), chosen);
  }
  assert.equal(config.accountAvatarNumber(' '), null);
  const choices = new Set(Array.from({ length: 100 }, (_, i) => config.accountAvatarNumber(`user-${i}`)));
  assert.equal(choices.size, 12);
});
test('All twelve local assets are square PNGs with alpha and distinct content', () => {
  const contents = new Set();
  for (let i = 1; i <= 12; i++) {
    const png = fs.readFileSync(path.join(__dirname, `../public/img/avatars/avatar-${i}.png`));
    assert.equal(png.toString('hex', 0, 8), '89504e470d0a1a0a');
    assert.equal(png.readUInt32BE(16), 296);
    assert.equal(png.readUInt32BE(20), 296);
    assert.equal(png[25], 6); // RGBA transparency outside the circular crop.
    contents.add(png.toString('base64'));
  }
  assert.equal(contents.size, 12);
});
test('Mounted avatar changes with account, falls back on errors, and ignores unrelated rerenders', async () => {
  const calls = [];
  const { descriptor } = parse(read('components/AccountAvatar.vue').replace('import.meta.env.BASE_URL', '"/"'));
  const component = evaluate(compileScript(descriptor, { id: 'avatar-test', inlineTemplate: true }).content, {
    vue, '@/config/accountAvatars': { accountAvatarNumber(code) { calls.push(code); return config.accountAvatarNumber(code); } },
  }).default;
  const node = type => ({ type, children: [], props: {} });
  const renderer = vue.createRenderer({
    createElement: node, createText: text => ({ ...node('#text'), text }), createComment: node,
    setText(n, text) { n.text = text; }, setElementText(n, text) { n.text = text; },
    patchProp(n, key, old, value) { n.props[key] = value; },
    insert(n, parent, anchor) { n.parent = parent; const i = parent.children.indexOf(anchor); parent.children.splice(i < 0 ? parent.children.length : i, 0, n); },
    remove(n) { n.parent.children.splice(n.parent.children.indexOf(n), 1); },
    parentNode: n => n.parent, nextSibling: () => null,
  });
  const username = vue.ref('hrd'), clock = vue.ref(0), root = node('root');
  const app = renderer.createApp({ setup: () => () => vue.h(component, { username: username.value, title: String(clock.value) }) });
  app.mount(root);
  const child = () => root.children[0].children.find(n => n.type === 'img' || n.type === 'span');
  assert.equal(child().props.src, '/img/avatars/avatar-2.png');
  clock.value++; await vue.nextTick();
  assert.deepEqual(calls, ['hrd']);
  child().props.onError(); await vue.nextTick();
  assert.equal(child().text, 'H');
  username.value = 'super'; await vue.nextTick();
  assert.equal(child().props.src, '/img/avatars/avatar-12.png');
  username.value = ''; await vue.nextTick();
  assert.equal(child().text, '?');
  username.value = 'HRD'; await vue.nextTick();
  assert.equal(child().props.src, '/img/avatars/avatar-2.png');
  app.unmount();
});
