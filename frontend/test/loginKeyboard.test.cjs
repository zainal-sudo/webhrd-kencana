const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const vue = require('vue');
const source = fs.readFileSync(path.join(__dirname, '../src/views/auth/LoginView.vue'), 'utf8');

function fixture(login = async () => {}) {
  const calls = [];
  const module = { exports: {} };
  const script = source.match(/<script setup lang="ts">([\s\S]*?)<\/script>/)[1];
  vm.runInNewContext(ts.transpileModule(script + '\nexport { username, password, loading, errorMsg, passwordInput, usernameEnter, passwordEnter, doLogin };',
    { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText,
    { module, exports: module.exports, require(name) {
      if (name === 'vue') return vue;
      if (name === 'vue-router') return { useRouter: () => ({ push: route => calls.push(['route', route]) }) };
      if (name === '@/stores/authStore') return { useAuthStore: () => ({ login: async (...args) => { calls.push(['login', ...args]); await login(); } }) };
      if (name === '@/stores/permissionStore') return { usePermissionStore: () => ({ reset: () => calls.push(['permissions-reset']), fetchAll: async () => calls.push(['permissions-load']) }) };
      if (name === '@/stores/tabsStore') return { useTabsStore: () => ({ resetTabs: () => calls.push(['tabs-reset']) }) };
      if (name === '@/api') return { pickError: () => 'Login gagal' };
      return {};
    } });
  const field = { focused: false, focus() { this.focused = true; } };
  module.exports.passwordInput.value = field;
  return { ...module.exports, calls, field };
}
test('Enter in username focuses password without attempting login, including prefilled password', () => {
  const f = fixture(); f.username.value = 'super'; f.password.value = 'prefilled';
  f.errorMsg.value = 'Old error'; f.usernameEnter({});
  assert.ok(f.field.focused); assert.equal(f.calls.length, 0); assert.equal(f.errorMsg.value, '');
});
test('Empty/whitespace username stays put with validation; empty password never logs in', async () => {
  const f = fixture(); f.username.value = '  '; f.usernameEnter({});
  assert.equal(f.field.focused, false); assert.equal(f.errorMsg.value, 'Kode user wajib diisi');
  f.username.value = 'super'; await f.passwordEnter({});
  assert.equal(f.calls.length, 0); assert.equal(f.errorMsg.value, 'Kode user dan password wajib diisi');
});
test('Enter in password logs in once and preserves existing authorization/tab initialization', async () => {
  const f = fixture(); f.username.value = ' super '; f.password.value = '  secret  ';
  await f.passwordEnter({});
  assert.deepEqual(f.calls, [['login', 'SUPER', '  secret  '], ['tabs-reset'], ['permissions-reset'], ['permissions-load'], ['route', '/dashboard']]);
  assert.equal(f.loading.value, false);
});
test('Pending login rejects repeated Enter and button clicks; keyboard repeat/composition do nothing', async () => {
  let finish;
  const f = fixture(() => new Promise(resolve => { finish = resolve; }));
  f.username.value = 'super'; f.password.value = 'secret';
  for (const event of [{ repeat: true }, { isComposing: true }]) {
    f.usernameEnter(event); await f.passwordEnter(event);
  }
  assert.equal(f.field.focused, false); assert.equal(f.calls.length, 0);
  const first = f.passwordEnter({}); assert.equal(f.loading.value, true);
  await f.passwordEnter({}); await f.doLogin(); f.usernameEnter({});
  assert.equal(f.calls.filter(call => call[0] === 'login').length, 1); assert.equal(f.field.focused, false);
  finish(); await first; assert.equal(f.loading.value, false);
});
test('Failed login displays error and allows retry', async () => {
  const f = fixture(async () => { throw Error('Bad credentials'); });
  f.username.value = 'super'; f.password.value = 'secret';
  await f.passwordEnter({}); assert.equal(f.errorMsg.value, 'Login gagal'); assert.equal(f.loading.value, false);
  await f.passwordEnter({}); assert.equal(f.calls.filter(call => call[0] === 'login').length, 2);
  assert.ok(!f.calls.some(call => call[0] === 'route'));
});
test('Template uses prevented keydown instead of username login-on-keyup and disables fields during login', () => {
  assert.match(source, /@keydown.enter.prevent="usernameEnter"/);
  assert.match(source, /ref="passwordInput"/);
  assert.match(source, /@keydown.enter.prevent="passwordEnter"/);
  assert.ok(!source.includes('@keyup.enter="doLogin"'));
  assert.equal((source.match(/:disabled="loading"/g) || []).length, 3);
});
