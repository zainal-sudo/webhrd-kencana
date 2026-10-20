const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const axios = require('axios');
const pinia = require('pinia');
const vue = require('vue');
const root = path.join(__dirname, '../src');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const tick = () => new Promise(setImmediate);
function compile(source, dependencies, globals = {}) {
  const module = { exports: {} };
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText,
    { module, exports: module.exports, require: id => dependencies[id] || {}, AbortController, CustomEvent, ...globals });
  return module.exports;
}
function fixture(token = 'session-a') {
  const values = new Map(token ? [['kencana_hrd_token', token]] : []);
  const localStorage = { getItem: k => values.get(k) ?? null, setItem: (k, v) => values.set(k, String(v)), removeItem: k => values.delete(k) };
  const events = [], requests = [];
  const sessionValues = new Map();
  const sessionStorage = { getItem: key => sessionValues.get(key) ?? null, setItem: (key, value) => sessionValues.set(key, value), removeItem: key => sessionValues.delete(key) };
  const globals = { localStorage, sessionStorage, crypto: require('node:crypto').webcrypto, window: { dispatchEvent: event => events.push(event.type) } };
  const transport = compile(read('api/axios.ts'), { axios }, globals);
  transport.api.defaults.adapter = config => new Promise((resolve, reject) => requests.push({ config,
    reply(data = {}, status = 200) {
      const response = { data, status, statusText: 'Fixture', headers: {}, config };
      if (status >= 400) reject(new axios.AxiosError('Request failed', 'ERR_BAD_REQUEST', config, null, response));
      else resolve(response);
    }, fail() { reject(new axios.AxiosError('Network Error', 'ERR_NETWORK', config)); },
  }));
  const start = async (url, config) => {
    const done = transport.api.get(url, config).then(value => ({ value }), error => ({ error }));
    await tick(); return { done, request: requests.at(-1) };
  };
  const authApi = { login: async () => ({ token: 'session-b', user: { user_kode: 'B' }, menus: [] }),
    me: async () => ({ user_kode: 'A', user_nama: 'A', menus: [] }) };
  const loginMarkers = compile(read('utils/agendaLoginMarker.ts'), {}, globals);
  const authModule = compile(read('stores/authStore.ts'), { pinia, '@/api': { authApi }, '@/api/axios': transport, '@/utils/agendaLoginMarker': loginMarkers }, globals);
  const instance = pinia.createPinia(), auth = authModule.useAuthStore(instance);
  if (token) auth.user = { user_kode: 'A', user_nama: 'A' };
  const permissionModule = compile(read('stores/permissionStore.ts'), { pinia, '@/stores/authStore': { useAuthStore: () => auth }, '@/utils/menuMap': { GRUP: {}, definisiMenu: () => null } });
  const permission = permissionModule.usePermissionStore(instance);
  return { ...transport, values, sessionValues, loginMarkers, events, requests, localStorage, start, auth, authApi, permission };
}
function assertSilent(f, result) {
  assert.ok(axios.isCancel(result.error));
  assert.equal(f.getErrorMessage(result.error), '');
}
test('Manual logout cancels pending requests; late 401 never emits expiry or token toast', async () => {
  const f = fixture(), a = await f.start('/dashboard'), b = await f.start('/master/karyawan');
  f.auth.logout();
  assert.equal(a.request.config.signal.aborted, true); assert.equal(b.request.config.signal.aborted, true);
  a.request.reply({ message: 'Token tidak ditemukan' }, 401); b.request.reply({ message: 'Token tidak ditemukan' }, 401);
  assertSilent(f, await a.done); assertSilent(f, await b.done);
  assert.deepEqual(f.events, []); assert.equal(f.auth.user, null);
});
test('Protected request after logout is cancelled before reaching adapter', async () => {
  const f = fixture(); f.auth.logout();
  const result = await f.api.get('/dashboard').catch(error => ({ error }));
  assertSilent(f, result); assert.equal(f.requests.length, 0); assert.deepEqual(f.events, []);
});
test('Active session 401 emits exactly one expiry, cancels siblings and blocks further protected calls', async () => {
  const f = fixture(), a = await f.start('/me'), b = await f.start('/dashboard');
  a.request.reply({ message: 'Token expired' }, 401); assertSilent(f, await a.done);
  assert.equal(b.request.config.signal.aborted, true);
  b.request.reply({ message: 'Token expired' }, 401); assertSilent(f, await b.done);
  assert.deepEqual(f.events, ['auth:expired']);
  assertSilent(f, await f.api.get('/master/karyawan').catch(error => ({ error })));
  assert.equal(f.requests.length, 2);
});
test('Invalid login is an ordinary inline error, without bearer header or expiry dialog', async () => {
  const f = fixture(), a = await f.start('/login');
  assert.equal(a.request.config.headers.Authorization, undefined);
  a.request.reply({ message: 'Password salah' }, 401);
  const result = await a.done;
  assert.equal(axios.isCancel(result.error), false); assert.equal(f.getErrorMessage(result.error), 'Password salah');
  assert.deepEqual(f.events, []);
});
test('Old-session success and errors cannot affect the next login, even when token text repeats', async () => {
  for (const status of [200, 401, 500]) {
    const f = fixture(), a = await f.start('/me');
    f.auth.logout(); f.auth.setToken('session-a'); f.auth.user = { user_kode: 'B' };
    a.request.reply({ user_kode: 'A', message: 'Old error' }, status);
    assertSilent(f, await a.done); assert.deepEqual(f.events, []);
    const b = await f.start('/me'); b.request.reply({ user_kode: 'B' }); assert.ok((await b.done).value);
  }
});
test('New login resets the expired-session latch', async () => {
  const f = fixture(), a = await f.start('/me'); a.request.reply({}, 401); await a.done;
  await f.auth.login('B', 'password');
  const b = await f.start('/me'); assert.equal(b.request.config.headers.Authorization, 'Bearer session-b');
  b.request.reply({}); assert.ok((await b.done).value);
});
test('Network errors and access denied remain visible and do not expire the session', async () => {
  const f = fixture(), a = await f.start('/me'); a.request.fail();
  assert.equal(f.getErrorMessage((await a.done).error), 'Network Error');
  const b = await f.start('/master/user'); b.request.reply({ message: 'Akses ditolak' }, 403);
  const result = await b.done; assert.equal(result.error.isForbidden, true);
  assert.equal(f.getErrorMessage(result.error), 'Akses ditolak'); assert.deepEqual(f.events, []);
});
test('Caller AbortSignal is still respected', async () => {
  const f = fixture(), controller = new AbortController(), a = await f.start('/me', { signal: controller.signal });
  controller.abort(); assert.equal(a.request.config.signal.aborted, true);
  a.request.reply({}); assertSilent(f, await a.done); assert.deepEqual(f.events, []);
});
test('Late profile response cannot repopulate user, menus or storage after logout/new login', async () => {
  for (const loginAgain of [false, true]) {
    const f = fixture(), wait = deferred(); f.authApi.me = () => wait.promise;
    const refresh = f.auth.refreshProfile();
    f.auth.logout(); if (loginAgain) await f.auth.login('B', 'password');
    wait.resolve({ user_kode: 'A', menus: [{ men_nama: 'old-menu' }] });
    assert.equal(await refresh, false);
    assert.equal(f.auth.user?.user_kode ?? null, loginAgain ? 'B' : null);
    assert.equal(f.auth.menus.length, 0);
    assert.equal(f.localStorage.getItem(f.USER_KEY), loginAgain ? JSON.stringify({ user_kode: 'B' }) : null);
  }
});
test('Late login response cannot restore a session that was logged out', async () => {
  const f = fixture(''), wait = deferred(); f.authApi.login = () => wait.promise;
  const login = f.auth.login('A', 'password').catch(error => ({ error }));
  f.auth.logout(); wait.resolve({ token: 'old', user: { user_kode: 'A' }, menus: [] });
  assertSilent(f, await login); assert.equal(f.auth.user, null); assert.equal(f.auth.token, '');
});
test('Permission refresh cannot build old menus after reset/logout', async () => {
  const f = fixture(), wait = deferred(); f.authApi.me = () => wait.promise;
  let builds = 0; f.permission.build = () => { builds++; };
  const loading = f.permission.fetchAll(); f.auth.logout(); f.permission.reset();
  wait.resolve({ user_kode: 'A', menus: [{ men_nama: 'old-menu' }] }); await loading;
  assert.equal(builds, 0); assert.equal(f.permission.loaded, false); assert.equal(f.permission.loading, false);
});
test('Expired dialog ignores logged-out/login-page events and closes synchronously on session changes', () => {
  const source = read('App.vue'), dialog = vue.ref(false), authStore = vue.reactive({ token: 'A', isAuthenticated: true }), route = { path: '/dashboard' };
  const logic = source.slice(source.indexOf('watch(() => authStore.token'), source.indexOf('onMounted(() =>'));
  const scope = vue.effectScope(), context = { watch: vue.watch, authStore, route, showExpiredDialog: dialog };
  vm.createContext(context); scope.run(() => vm.runInContext(logic + '\nglobalThis.expire = onAuthExpired;', context));
  try {
    context.expire(); assert.equal(dialog.value, true);
    authStore.token = ''; authStore.isAuthenticated = false; assert.equal(dialog.value, false);
    context.expire(); assert.equal(dialog.value, false);
    authStore.token = 'B'; authStore.isAuthenticated = true; route.path = '/login';
    context.expire(); assert.equal(dialog.value, false);
  } finally { scope.stop(); }
});
test('Toast filter ignores only empty cancellation messages; normal errors remain', () => {
  const source = read('main.ts');
  const block = source.slice(source.indexOf('const toastOptions:'), source.indexOf('app.use(Toast, toastOptions)'));
  const result = compile(block + '\nexport { toastOptions };', {}, { POSITION: { TOP_RIGHT: 'top-right' } }).toastOptions;
  assert.equal(result.filterBeforeCreate({ content: '' }), false);
  const toast = { content: 'Database gagal terhubung' }; assert.equal(result.filterBeforeCreate(toast), toast);
});

test('Request captures its session immediately before logout, without an interceptor microtask race', async () => {
  const f = fixture();
  const done = f.api.get('/me').then(value => ({ value }), error => ({ error }));
  const request = f.requests[0];
  assert.ok(request);
  assert.equal(request.config.headers.Authorization, 'Bearer session-a');
  f.auth.logout(); f.auth.setToken('session-b');
  assert.equal(request.config.signal.aborted, true);
  request.reply({ user_kode: 'A' }); assertSilent(f, await done);
  assert.deepEqual(f.events, []);
});

test('Only successful explicit login creates a new agenda nonce; profile restore does not, logout clears it', async () => {
  const f = fixture('');
  assert.equal(f.sessionValues.size, 0);
  await f.auth.login('B', 'password');
  const first = f.loginMarkers.readAgendaLoginMarker('b'); assert.ok(first);
  assert.equal(f.sessionValues.size, 1);
  f.authApi.me = async () => ({ user_kode: 'B', user_nama: 'B', menus: [] });
  await f.auth.refreshProfile(); assert.equal(f.loginMarkers.readAgendaLoginMarker('b').nonce, first.nonce);
  assert.equal(f.loginMarkers.consumeAgendaLoginMarker('B', first.nonce), true);
  await f.auth.refreshProfile(); assert.equal(f.sessionValues.size, 0);
  f.auth.logout(); assert.equal(f.sessionValues.size, 0);
  await f.auth.login('B', 'password'); assert.notEqual(f.loginMarkers.readAgendaLoginMarker('b').nonce, first.nonce);
  f.auth.logout(); assert.equal(f.sessionValues.size, 0);
  f.authApi.login = async () => { throw Error('Wrong password') };
  await assert.rejects(f.auth.login('B', 'wrong'), /Wrong password/); assert.equal(f.sessionValues.size, 0);
});
