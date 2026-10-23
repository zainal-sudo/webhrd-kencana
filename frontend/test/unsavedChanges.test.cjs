const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const pinia = require('pinia');
const root = path.join(__dirname, '../src');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
function load(source, globals) {
  const module = { exports: {} };
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { module, exports: module.exports, URLSearchParams, ...globals });
  return module.exports;
}
function fixture() {
  const confirms = [], alerts = [], windowEvents = new Map(), documentEvents = new Map();
  let accept = true;
  const window = { confirm: text => { confirms.push(text); return accept; }, alert: text => alerts.push(text),
    addEventListener: (name, listener) => windowEvents.set(name, listener), removeEventListener: name => windowEvents.delete(name) };
  const document = { visibilityState: 'visible', title: '', addEventListener: (name, listener) => documentEvents.set(name, listener), removeEventListener: name => documentEvents.delete(name) };
  const registry = load(read('utils/unsavedChanges.ts'), { window, document });
  const tabsModule = load(read('stores/tabsStore.ts'), { require: name => name === 'pinia' ? pinia : registry });
  const tabs = tabsModule.useTabsStore(pinia.createPinia()); tabs.initDefaultTabs();
  const states = new Map();
  function draft(id, title = id) {
    const state = { text: '', busy: false };
    const registration = registry.registerDraft(id, { title, state: () => ({ text: state.text }), dirty: () => !!state.text, busy: () => state.busy });
    states.set(id, state);
    return { state, registration };
  }
  const auth = { isAuthenticated: true, menus: [], can: () => true };
  const router = { beforeEach(fn) { this.before = fn; }, afterEach(fn) { this.after = fn; } };
  load(read('router/index.ts').slice(read('router/index.ts').indexOf('const router = createRouter')), {
    routes: [], createRouter: () => router, createWebHistory() {}, useAuthStore: () => auth,
    useTabsStore: () => tabs, usePermissionStore: () => ({}), confirmDraftNavigation: registry.confirmDraftNavigation, window, document,
  });
  const route = (path, query = {}) => ({ path, query, fullPath: tabs.generateTabId(path, query), meta: { requiresAuth: true } });
  return { registry, tabs, draft, confirms, alerts, windowEvents, documentEvents, document, router, auth, route, accept: value => { accept = value; } };
}

test('Route cancel leaves active tab/list unchanged; confirmed navigation retains draft and has one prompt', async () => {
  const f = fixture(), from = f.route('/form', { id: '001' }), to = f.route('/other');
  f.tabs.openTab({ title: 'Form', path: from.path, query: from.query, closable: true });
  const { state } = f.draft(from.fullPath); state.text = 'draft';
  const before = JSON.stringify(f.tabs.tabs);
  f.tabs.stageTab({ path: to.path, title: 'Other', closable: true }); f.accept(false);
  assert.equal(await f.router.before(to, from), false); f.router.after(to, from, { type: 4 });
  assert.equal(f.tabs.activeTabId, from.fullPath); assert.equal(JSON.stringify(f.tabs.tabs), before);
  assert.equal(f.confirms.length, 1);
  f.accept(true); assert.equal(await f.router.before(to, from), true); f.router.after(to, from);
  assert.equal(f.tabs.activeTabId, to.fullPath); assert.equal(state.text, 'draft');
  assert.equal(f.registry.isTabDirty(from.fullPath), true); assert.equal(f.confirms.length, 2);
});

test('Clean form, restored values, and same route do not prompt; identity includes query', async () => {
  const f = fixture(), from = f.route('/form', { id: '001' }), other = f.route('/form', { id: '002' });
  const first = f.draft(from.fullPath), second = f.draft(other.fullPath);
  first.state.text = 'draft'; assert.equal(f.registry.isTabDirty(other.fullPath), false);
  assert.equal(await f.router.before(from, from), true);
  first.state.text = ''; second.state.text = '';
  assert.equal(await f.router.before(other, from), true); assert.equal(f.confirms.length, 0);
});

test('Save snapshot: failed save remains dirty; successful save preserves newer edits', () => {
  const f = fixture(), { state } = f.draft('/form'); state.text = 'submitted';
  const failed = f.registry.beginDraftSave('/form'); assert.equal(f.registry.isTabBusy('/form'), true);
  failed(false); assert.equal(f.registry.isTabDirty('/form'), true);
  const success = f.registry.beginDraftSave('/form'); state.text = 'newer'; success(true);
  assert.equal(f.registry.isTabBusy('/form'), false); assert.equal(f.registry.isTabDirty('/form'), true);
  state.text = 'submitted'; assert.equal(f.registry.isTabDirty('/form'), false);
  success(false); assert.equal(f.registry.isTabDirty('/form'), false);
});

test('Asynchronous validation checkpoints the state at submission, not at the earlier Save click', () => {
  const f = fixture(), { state } = f.draft('/form'); state.text = 'before validation';
  const finish = f.registry.beginDraftSave('/form');
  state.text = 'submitted after validation'; f.registry.checkpointDraftSave('/form');
  state.text = 'edited while request pending'; finish(true);
  assert.equal(f.registry.isTabDirty('/form'), true);
  state.text = 'submitted after validation'; assert.equal(f.registry.isTabDirty('/form'), false);
});

test('Closing inactive dirty tab and close-other/all are atomic on cancel, with one aggregate prompt', () => {
  const f = fixture();
  for (const id of ['/a', '/b', '/c']) { f.tabs.openTab({ path: id, title: id, closable: true }); f.draft(id).state.text = id; }
  const before = JSON.stringify(f.tabs.tabs); f.accept(false);
  assert.equal(f.tabs.closeTab('/a'), false); assert.equal(JSON.stringify(f.tabs.tabs), before);
  assert.equal(f.tabs.closeOtherTabs('/c'), false); assert.equal(JSON.stringify(f.tabs.tabs), before);
  assert.equal(f.tabs.closeAllTabs(), false); assert.equal(JSON.stringify(f.tabs.tabs), before);
  assert.equal(f.confirms.length, 3); assert.equal(f.tabs.activeTabId, '/c');
});

test('Approved closing operation suppresses duplicate route/store confirmations; busy processes block discard', async () => {
  const f = fixture(); f.tabs.openTab({ path: '/form', title: 'Form', closable: true });
  const { state } = f.draft('/form'); state.text = 'draft'; state.busy = true;
  assert.equal(f.registry.confirmDraftDiscard(['/form']), false); assert.equal(f.confirms.length, 0); assert.equal(f.alerts.length, 1);
  state.busy = false;
  await f.registry.discardDraftsAndRun(['/form'], async () => {
    assert.equal(f.registry.confirmDraftNavigation('/form'), true);
    assert.equal(f.tabs.closeTab('/form'), true);
  });
  assert.equal(f.confirms.length, 1);
});

test('Tab limit evicts only clean tabs; no clean candidate prevents navigation without losing drafts', async () => {
  const f = fixture();
  for (let i = 0; i < 11; i++) { const id = '/form' + i; f.tabs.openTab({ path: id, title: id, closable: true }); f.draft(id).state.text = 'draft'; }
  const before = JSON.stringify(f.tabs.tabs);
  assert.equal(await f.router.before(f.route('/new'), f.route('/form10')), false);
  assert.equal(JSON.stringify(f.tabs.tabs), before); assert.equal(f.alerts.length, 1);
  // A clean existing tab can be evicted without touching any dirty one.
  f.registry.clearDrafts(); for (let i = 1; i < 11; i++) f.draft('/form' + i).state.text = 'draft';
  f.tabs.openTab({ path: '/new', title: 'New', closable: true });
  assert.equal(f.tabs.tabs.length, 12); assert.equal(f.tabs.tabs.some(tab => tab.id === '/form0'), false);
  for (let i = 1; i < 11; i++) assert.ok(f.tabs.tabs.some(tab => tab.id === '/form' + i));
});

test('Forced expiry/reset and revoked permissions bypass draft warnings', async () => {
  const f = fixture(); f.draft('/form').state.text = 'draft'; f.accept(false);
  f.auth.isAuthenticated = false;
  assert.equal((await f.router.before(f.route('/form'), f.route('/form'))).path, '/login');
  f.tabs.resetTabs(); assert.equal(f.registry.protectedTabIds().length, 0); assert.equal(f.confirms.length, 0);
  f.auth.isAuthenticated = true; f.auth.can = () => false; f.draft('/form').state.text = 'draft';
  const from = f.route('/form'); from.meta.form = 'revoked';
  assert.equal(await f.router.before(f.route('/dashboard'), from), true); assert.equal(f.confirms.length, 0);
});

test('Browser hooks attach only with draft/process; visibility return reminds once; cleanup removes listeners', () => {
  const f = fixture(), notices = [], { state, registration } = f.draft('/form');
  const dispose = f.registry.installDraftBrowserHooks(text => notices.push(text));
  assert.equal(f.windowEvents.has('beforeunload'), false);
  state.text = 'draft'; f.registry.publishDrafts(); assert.equal(f.windowEvents.has('beforeunload'), true);
  let prevented = false; const event = { preventDefault() { prevented = true; } };
  f.windowEvents.get('beforeunload')(event); assert.equal(prevented, true);
  f.document.visibilityState = 'hidden'; f.documentEvents.get('visibilitychange')();
  f.document.visibilityState = 'visible'; f.documentEvents.get('visibilitychange')(); f.documentEvents.get('visibilitychange')();
  assert.equal(notices.length, 1);
  state.text = ''; state.busy = true; f.registry.publishDrafts(); assert.equal(f.windowEvents.has('beforeunload'), true);
  state.busy = false; f.registry.publishDrafts(); assert.equal(f.windowEvents.has('beforeunload'), false);
  registration.dispose(); assert.equal(f.registry.protectedTabIds().length, 0);
  dispose(); assert.equal(f.documentEvents.size, 0);
});

test('Every internal entry form and standalone editor has an explicit draft integration', () => {
  const standalone = new Set(['/master/perusahaan', '/gaji/setting', '/gaji/proses', '/setting/user', '/setting/hak-akses', '/setting/menu', '/setting/generator-otorisasi', '/absensi/import', '/transaksi/pinjaman/pelunasan']);
  let count = 0;
  for (const match of read('router/index.ts').matchAll(/path:\s*"([^"]+)"[\s\S]*?component:\s*\(\)\s*=>\s*import\("@\/([^" ]+\.vue)"\)/g)) {
    if (!match[1].includes('/form') && !standalone.has(match[1])) continue;
    assert.match(read(match[2]), /useTransactionReset|useDraftSnapshot|useUnsavedChanges|<MasterForm/, match[1]);
    count++;
  }
  assert.equal(count, 38);
  assert.match(read('components/AgendaCalendar.vue'), /global: true/);
  assert.doesNotMatch(read('features/penilaian/mountLegacyForm.ts'), /useUnsavedChanges/);
});
