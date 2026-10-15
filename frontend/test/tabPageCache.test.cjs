const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const vue = require('vue');
const pinia = require('pinia');
const { createRouter, createMemoryHistory, RouterView } = require('vue-router');

function load(file, dependencies) {
  const source = fs.readFileSync(path.join(__dirname, '../src', file), 'utf8');
  const module = { exports: {} };
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText,
    { module, exports: module.exports, URLSearchParams, require: name => dependencies[name] || require(name) });
  return module.exports;
}
const { useTabsStore } = load('stores/tabsStore.ts', {});
const { useTabPageCache } = load('composables/useTabPageCache.ts', { '@/stores/tabsStore': { useTabsStore } });

// Real Vue KeepAlive lifecycle, using an in-memory renderer (no browser/DOM needed).
async function fixture(realRouter = false) {
  function removeNode(node) {
    if (!node.parent) return;
    const i = node.parent.children.indexOf(node);
    if (i >= 0) node.parent.children.splice(i, 1);
    node.parent = null;
  }
  const renderer = vue.createRenderer({
    createElement: type => ({ type, children: [], parent: null }),
    createText: text => ({ text, parent: null }), createComment: text => ({ text, parent: null }),
    insert(node, parent, anchor) {
      if (node.parent) removeNode(node);
      const index = anchor ? parent.children.indexOf(anchor) : -1;
      parent.children.splice(index < 0 ? parent.children.length : index, 0, node); node.parent = parent;
    },
    remove: removeNode,
    setText: (node, text) => { node.text = text; },
    setElementText: (node, text) => { node.text = text; node.children = []; },
    parentNode: node => node.parent,
    nextSibling: node => node.parent?.children[node.parent.children.indexOf(node) + 1] || null,
    patchProp() {},
  });
  const instance = pinia.createPinia();
  pinia.setActivePinia(instance);
  const tabs = useTabsStore();
  tabs.initDefaultTabs();
  const routeId = vue.ref('/dashboard');
  const states = new Map(), mounts = new Map(), destroyed = [];
  const Page = vue.defineComponent({
    name: 'TestForm', props: ['id'],
    setup(props) {
      const id = props.id;
      const state = vue.reactive({ employee: '', filter: '', selected: [] });
      states.set(id, state); mounts.set(id, (mounts.get(id) || 0) + 1);
      vue.onUnmounted(() => destroyed.push(id));
      return () => vue.h('div', state.employee);
    },
  });
  const router = realRouter ? createRouter({ history: createMemoryHistory(), routes: [
    { path: '/:pathMatch(.*)*', component: Page, props: route => ({ id: tabs.generateTabId(route.path, route.query) }) },
  ] }) : null;
  router?.afterEach(to => {
    tabs.openTab({ path: to.path, query: to.query, title: to.path, closable: to.path !== '/dashboard' });
  });
  if (router) { await router.push('/dashboard'); await router.isReady(); }
  const Root = vue.defineComponent({ setup() {
    const id = () => router ? tabs.generateTabId(router.currentRoute.value.path, router.currentRoute.value.query) : routeId.value;
    const { currentPage, includedPages } = useTabPageCache(id);
    const cached = page => vue.h(vue.KeepAlive, { key: tabs.cacheVersion, include: includedPages.value, max: 12 },
      () => vue.h(currentPage.value, { key: id(), page }));
    if (router) return () => vue.h(RouterView, null, { default: ({ Component }) => cached(Component) });
    return () => vue.h(vue.KeepAlive, { key: tabs.cacheVersion, include: includedPages.value, max: 12 },
      () => vue.h(currentPage.value, { key: routeId.value, page: vue.h(Page, { id: routeId.value, key: routeId.value }) }));
  } });
  const app = renderer.createApp(Root); app.use(instance); if (router) app.use(router);
  app.mount({ children: [] }); await vue.nextTick();
  async function open(path, query) {
    if (router) {
      await router.push({ path, query }); await vue.nextTick();
      routeId.value = tabs.generateTabId(path, query);
      return routeId.value;
    }
    tabs.openTab({ path, query, title: path, closable: path !== '/dashboard' });
    routeId.value = tabs.generateTabId(path, query); await vue.nextTick();
    return routeId.value;
  }
  async function close(id) {
    const active = routeId.value === id;
    tabs.closeTab(id);
    if (active && router) {
      const next = tabs.tabs.find(tab => tab.id === tabs.activeTabId);
      await router.push({ path: next.path, query: next.query }); routeId.value = next.id;
    } else if (active) routeId.value = tabs.activeTabId;
    await vue.nextTick();
  }
  return { tabs, routeId, states, mounts, destroyed, open, close, dispose: () => app.unmount() };
}

test('Switching tabs preserves drafts; closing active form and reopening creates fresh state only there', async () => {
  const f = await fixture();
  try {
    const a = await f.open('/transaksi/pinjaman/form'); f.states.get(a).employee = 'Andi';
    const b = await f.open('/master/karyawan/form'); f.states.get(b).employee = 'Budi';
    await f.open('/transaksi/pinjaman/form');
    assert.equal(f.states.get(a).employee, 'Andi'); assert.equal(f.mounts.get(a), 1);
    await f.close(a);
    assert.ok(f.destroyed.includes(a)); assert.ok(!f.destroyed.includes(b));
    await f.open('/transaksi/pinjaman/form');
    assert.equal(f.states.get(a).employee, ''); assert.equal(f.mounts.get(a), 2);
    await f.open('/master/karyawan/form'); assert.equal(f.states.get(b).employee, 'Budi');
  } finally { f.dispose(); }
});

test('Real RouterView navigation reopens fresh Add/Edit pages and leaves other open drafts intact', async () => {
  const f = await fixture(true);
  try {
    const add = await f.open('/transaksi/pinjaman/form'); f.states.get(add).employee = 'Chosen Employee';
    const edit = await f.open('/transaksi/pinjaman/form', { nomor: 'PJ.2610.0001' }); f.states.get(edit).employee = 'Unsaved correction';
    await f.open('/transaksi/pinjaman/form'); assert.equal(f.states.get(add).employee, 'Chosen Employee');
    await f.close(add); assert.ok(f.destroyed.includes(add)); assert.equal(f.states.get(edit).employee, 'Unsaved correction');
    await f.open('/transaksi/pinjaman/form'); assert.equal(f.states.get(add).employee, '');
    await f.close(edit); await f.open('/transaksi/pinjaman/form', { nomor: 'PJ.2610.0001' });
    assert.equal(f.mounts.get(edit), 2); assert.equal(f.states.get(edit).employee, '');
  } finally { f.dispose(); }
});

test('Closing inactive tab evicts its state immediately without resetting the active tab', async () => {
  const f = await fixture();
  try {
    const a = await f.open('/list'); f.states.get(a).filter = 'Ani'; f.states.get(a).selected.push('001');
    const b = await f.open('/form'); f.states.get(b).employee = 'Keep me';
    await f.close(a);
    assert.ok(f.destroyed.includes(a)); assert.equal(f.mounts.get(b), 1);
    assert.equal(f.states.get(b).employee, 'Keep me');
    await f.open('/list'); assert.equal(f.states.get(a).filter, ''); assert.equal(f.states.get(a).selected.length, 0);
  } finally { f.dispose(); }
});

test('Different Edit query tabs are isolated; equivalent query order shares the same tab', async () => {
  const f = await fixture();
  try {
    const a = await f.open('/form', { mode: 'edit', nomor: '001' }); f.states.get(a).employee = 'Edit A';
    const b = await f.open('/form', { nomor: '002', mode: 'edit' }); f.states.get(b).employee = 'Edit B';
    assert.equal(await f.open('/form', { nomor: '001', mode: 'edit' }), a);
    assert.equal(f.mounts.get(a), 1); assert.equal(f.states.get(a).employee, 'Edit A');
    await f.close(b); await f.open('/form', { mode: 'edit', nomor: '002' });
    assert.equal(f.states.get(b).employee, ''); assert.equal(f.states.get(a).employee, 'Edit A');
  } finally { f.dispose(); }
});

test('Close Others drops only removed pages; Close All and logout reset dispose caches', async () => {
  const f = await fixture();
  try {
    const a = await f.open('/a'); const b = await f.open('/b'); f.states.get(b).employee = 'Keep B';
    f.tabs.closeOtherTabs(b); await vue.nextTick();
    assert.ok(f.destroyed.includes(a)); assert.ok(!f.destroyed.includes(b));
    assert.equal(f.states.get(b).employee, 'Keep B');
    await f.open('/dashboard'); f.tabs.closeAllTabs(); await vue.nextTick();
    assert.ok(f.destroyed.includes(b));
    await f.open('/b'); assert.equal(f.states.get(b).employee, '');
    f.tabs.resetTabs(); f.routeId.value = '/dashboard'; await vue.nextTick();
    assert.equal(f.destroyed.filter(id => id === b).length, 2);
  } finally { f.dispose(); }
});

test('Automatic oldest-tab closure disposes cache and all 12 open tabs retain state', async () => {
  const f = await fixture();
  try {
    for (let i = 1; i <= 11; i++) { const id = await f.open(`/page${i}`); f.states.get(id).employee = `Draft ${i}`; }
    await f.open('/dashboard'); assert.equal(f.mounts.get('/dashboard'), 1);
    await f.open('/page12'); assert.equal(f.tabs.tabs.length, 12);
    assert.equal(f.tabs.tabs.some(tab => tab.id === '/page1'), false);
    assert.ok(f.destroyed.includes('/page1'));
    await f.open('/page2'); assert.equal(f.states.get('/page2').employee, 'Draft 2'); assert.equal(f.mounts.get('/page2'), 1);
    await f.open('/page1'); assert.equal(f.states.get('/page1').employee, '');
  } finally { f.dispose(); }
});

test('Reordering any tab preserves active page, cached drafts, and tab identity', async () => {
  const f = await fixture(true);
  try {
    const a = await f.open('/a'); f.states.get(a).employee = 'Draft A';
    const b = await f.open('/b'); f.states.get(b).employee = 'Draft B';
    const original = f.tabs.tabs.find(tab => tab.id === a);
    f.tabs.moveTab(a, 2); await vue.nextTick();
    assert.deepEqual(Array.from(f.tabs.tabs, tab => tab.id), ['/dashboard', b, a]);
    f.tabs.moveTab('/dashboard', 2); await vue.nextTick();
    assert.deepEqual(Array.from(f.tabs.tabs, tab => tab.id), [b, a, '/dashboard']);
    f.tabs.moveTab(a, 0); await vue.nextTick();
    assert.deepEqual(Array.from(f.tabs.tabs, tab => tab.id), [a, b, '/dashboard']);
    assert.equal(f.tabs.activeTabId, b); assert.equal(f.routeId.value, b);
    assert.equal(f.tabs.tabs[0], original);
    assert.equal(f.states.get(a).employee, 'Draft A');
    assert.equal(f.states.get(b).employee, 'Draft B');
    assert.deepEqual(f.destroyed, []);
    await f.open('/a'); assert.equal(f.mounts.get(a), 1);
    assert.equal(f.states.get(a).employee, 'Draft A');
  } finally { f.dispose(); }
});

test('Reordering ignores missing IDs and invalid positions and clamps out-of-range positions', () => {
  pinia.setActivePinia(pinia.createPinia());
  const tabs = useTabsStore();
  tabs.initDefaultTabs();
  tabs.openTab({ path: '/a', title: 'A', closable: true });
  tabs.moveTab('/missing', 0);
  tabs.moveTab('/a', NaN);
  tabs.moveTab('/a', 0.5);
  assert.deepEqual(Array.from(tabs.tabs, tab => tab.id), ['/dashboard', '/a']);
  tabs.moveTab('/a', -10);
  assert.deepEqual(Array.from(tabs.tabs, tab => tab.id), ['/a', '/dashboard']);
  tabs.moveTab('/a', 100);
  assert.deepEqual(Array.from(tabs.tabs, tab => tab.id), ['/dashboard', '/a']);
  assert.equal(tabs.activeTabId, '/a');
});