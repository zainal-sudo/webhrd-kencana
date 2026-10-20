const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const vue = require('vue');
const { parse, compileScript } = require('@vue/compiler-sfc');
const { renderToString } = require('@vue/server-renderer');
const source = fs.readFileSync(path.join(__dirname, '../src/components/layout/AppSidebar.vue'), 'utf8');
const groups = () => [{ key: 'master', label: 'MASTER', icon: 'inventory_2', children: [
  { key: 'employee', label: 'Karyawan', route: '/master/karyawan', icon: 'person' },
  { key: 'position', label: 'Jabatan', route: '/master/jabatan', icon: 'badge' },
] }, { key: 'koperasi', label: 'KOPERASI', icon: 'storefront', children: [
  { key: 'loan', label: 'Pinjaman', route: '/transaksi/pinjaman', icon: 'payments' },
] }];
function fixture() {
  const mounted = [], unmounted = [], timers = new Map(), listeners = new Map(), calls = [];
  let timer = 0;
  const route = vue.reactive({ path: '/master/karyawan' });
  const permissions = vue.reactive({ menuTree: groups(), loaded: true });
  const global = {
    window: { innerWidth: 1000, innerHeight: 600, addEventListener: (key, fn) => listeners.set(key, fn), removeEventListener: key => listeners.delete(key) },
    document: { addEventListener: (key, fn) => listeners.set(key, fn), removeEventListener: key => listeners.delete(key) },
    setTimeout: fn => { timers.set(++timer, fn); return timer; }, clearTimeout: id => timers.delete(id),
  };
  function requireModule(name) {
    if (name === 'vue') return { ...vue, onMounted: fn => mounted.push(fn), onUnmounted: fn => unmounted.push(fn) };
    if (name === '@/stores/authStore') return { useAuthStore: () => ({ isAuthenticated: false }) };
    if (name === '@/composables/useAgendaNotice') return { useAgendaNotice: () => ({ open: vue.ref(false), count: vue.ref(0), failure: vue.ref(''), refreshKey: vue.ref(0), loginNoticeCount: vue.ref(0), loginOngoingCount: vue.ref(0), loginAllDayCount: vue.ref(0), dismissLoginNotice() {}, refresh() {} }) };
    if (name === '@/composables/useAgendaStartNotice') return { useAgendaStartNotice: () => ({ notices: vue.ref([]), dismiss() {}, pauseNotice() {}, resumeNotice() {} }) };
    if (name === '@/components/AgendaNotificationZone.vue') return { default: { render: () => null } };
    if (name === 'vue-router') return { useRoute: () => route, useRouter: () => ({ push: path => calls.push(['route', path]) }) };
    if (name === '@/stores/permissionStore') return { usePermissionStore: () => permissions };
    if (name === '@/stores/tabsStore') return { useTabsStore: () => ({ openTab: tab => calls.push(['tab', tab]) }) };
    if (name === '@/composables/useTabNavigation') return { useTabNavigation: () => ({ closeAllTabs() {} }) };
    if (name === '@/utils/icon') return { normalizeIcon: value => value };
    if (name === '@/components/MsIcon.vue') return { default: vue.defineComponent({ props: ['name'], setup: props => () => vue.h('i', { 'data-icon': props.name }) }) };
    throw Error(name);
  }
  function evaluate(script, extra = {}) {
    const module = { exports: {} };
    vm.runInNewContext(ts.transpileModule(script, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText,
      { module, exports: module.exports, require: requireModule, ...global, ...extra });
    return module.exports;
  }
  const scope = vue.effectScope();
  const state = scope.run(() => evaluate(source.match(/<script setup lang="ts">([\s\S]*?)<\/script>/)[1] +
    '\nexport { collapsed, openGroupKey, flyoutKey, flyoutGroup, flyout, flyoutAnchor, flyoutPosition, showFlyout, scheduleClose, cancelClose, closeFlyout, groupClick, groupKeydown, dismissOutside, focusOut, escapeFlyout, go };'));
  const anchor = { focused: false, getBoundingClientRect: () => ({ left: 0, right: 54, top: 550 }),
    contains: target => target === anchor, focus() { this.focused = true; } };
  return { ...state, route, permissions, anchor, global, calls, timers, listeners,
    event: () => ({ currentTarget: anchor }), mount: () => mounted.forEach(fn => fn()),
    flushTimers() { const pending = [...timers.values()]; timers.clear(); pending.forEach(fn => fn()); },
    dispose() { unmounted.forEach(fn => fn()); scope.stop(); }, evaluate };
}
test('Collapsed hover opens authorized children at viewport-safe position; expanded group click retains existing toggle', async () => {
  const f = fixture();
  try {
    f.showFlyout('master', f.event()); assert.equal(f.flyoutKey.value, '');
    f.groupClick('master', f.event()); assert.equal(f.openGroupKey.value, '');
    f.collapsed.value = true; await vue.nextTick();
    f.showFlyout('master', f.event());
    assert.equal(f.flyoutGroup.value.label, 'MASTER'); assert.equal(f.flyoutGroup.value.children.length, 2);
    const position = f.flyoutPosition.value;
    assert.equal(position.left, 60); assert.ok(position.top < 550); assert.ok(position.top >= 8);
    assert.ok(position.maxHeight <= 584);
    f.closeFlyout(); f.showFlyout('unauthorized', f.event()); assert.equal(f.flyoutKey.value, '');
    f.groupClick('koperasi', f.event()); assert.equal(f.flyoutKey.value, 'koperasi');
  } finally { f.dispose(); }
});
test('Hover bridge delay is canceled by entering panel; leaving closes without stale timers', async () => {
  const f = fixture();
  try {
    f.collapsed.value = true; await vue.nextTick(); f.showFlyout('master', f.event());
    f.scheduleClose(); assert.equal(f.timers.size, 1); assert.equal(f.flyoutKey.value, 'master');
    f.cancelClose(); f.flushTimers(); assert.equal(f.flyoutKey.value, 'master');
    f.scheduleClose(); f.showFlyout('koperasi', f.event()); f.flushTimers(); assert.equal(f.flyoutKey.value, 'koperasi');
    f.scheduleClose(); f.flushTimers(); assert.equal(f.flyoutKey.value, '');
  } finally { f.dispose(); }
});
test('Keyboard can enter flyout; focus transfer stays open, Escape restores trigger and outside click closes', async () => {
  const f = fixture();
  try {
    f.collapsed.value = true; await vue.nextTick();
    const child = { focused: false, focus() { this.focused = true; } };
    f.flyout.value = { contains: target => target === child, querySelector: () => child };
    let prevented = false;
    await f.groupKeydown('master', { ...f.event(), key: 'Enter', preventDefault() { prevented = true; } });
    assert.ok(prevented); assert.ok(child.focused);
    f.focusOut({ relatedTarget: child }); assert.equal(f.timers.size, 0);
    f.dismissOutside({ target: child }); assert.equal(f.flyoutKey.value, 'master');
    f.dismissOutside({ target: f.anchor }); assert.equal(f.flyoutKey.value, 'master');
    f.escapeFlyout({ key: 'Escape', preventDefault() {} }); assert.equal(f.flyoutKey.value, ''); assert.ok(f.anchor.focused);
    f.showFlyout('master', f.event()); f.dismissOutside({ target: {} }); assert.equal(f.flyoutKey.value, '');
  } finally { f.dispose(); }
});
test('Navigation, expanding sidebar, permission removal and resize close flyout; listener/timer cleanup is complete', async () => {
  const f = fixture();
  try {
    f.mount(); assert.equal(f.listeners.size, 3);
    f.collapsed.value = true; await vue.nextTick(); f.showFlyout('master', f.event());
    f.route.path = '/transaksi/pinjaman'; await vue.nextTick(); assert.equal(f.flyoutKey.value, '');
    f.showFlyout('master', f.event()); f.collapsed.value = false; await vue.nextTick(); assert.equal(f.flyoutKey.value, '');
    f.collapsed.value = true; await vue.nextTick(); f.showFlyout('master', f.event());
    f.permissions.menuTree = [groups()[1]]; await vue.nextTick(); assert.equal(f.flyoutKey.value, '');
    f.showFlyout('koperasi', f.event()); f.listeners.get('resize')(); assert.equal(f.flyoutKey.value, '');
    f.go('/transaksi/pinjaman'); assert.equal(f.calls[0][1].title, 'Pinjaman'); assert.deepEqual(f.calls[1], ['route', '/transaksi/pinjaman']);
    f.scheduleClose();
  } finally { f.dispose(); }
  assert.equal(f.timers.size, 0); assert.equal(f.listeners.size, 0);
});
test('Actual teleported flyout renders child routes and active highlight without clipping inside sidebar', async () => {
  const f = fixture();
  try {
    const { descriptor } = parse(source.replace('</script>', '\ncapture({ collapsed, showFlyout });\n</script>'));
    const Component = f.evaluate(compileScript(descriptor, { id: 'flyout-test', inlineTemplate: true }).content, {
      capture(state) { state.collapsed.value = true; state.showFlyout('master', f.event()); },
    }).default;
    const context = {};
    const html = await renderToString(vue.createSSRApp(Component), context);
    assert.ok(html.includes('aria-controls="sidebar-flyout"'));
    assert.ok(!html.includes('class="sidebar-flyout"'));
    assert.ok(context.teleports.body.includes('MASTER — menu'));
    assert.ok(context.teleports.body.includes('Karyawan')); assert.ok(context.teleports.body.includes('Jabatan'));
    assert.ok(context.teleports.body.includes('class="flyout-item active"'));
    assert.ok(context.teleports.body.includes('aria-current="page"'));
    assert.match(source, /\.sidebar-flyout \{ position: fixed;[^}]*overflow-y: auto/);
    assert.match(source, /\.sidebar-flyout \{[^}]*background: var\(--ds-sidebar-bg, #1b2d4a\); color: rgba\(255, 255, 255, 0\.78\)/);
    assert.match(source, /\.flyout-item.active \{ background: rgba\(59, 89, 152, 0\.35\); color: #fff; border-left-color: #5b79b8/);
  } finally { f.dispose(); }
});
