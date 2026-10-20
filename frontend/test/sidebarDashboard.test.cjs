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

async function render(routePath, collapsed = false) {
  const { descriptor } = parse(source.replace('</script>', '\ncapture(collapsed);\n</script>'));
  const script = compileScript(descriptor, { id: 'sidebar-test', inlineTemplate: true }).content;
  const module = { exports: {} };
  const menus = [{ key: 'master', label: 'MASTER', icon: 'groups', children: [{ key: 'frmKaryawan', label: 'Karyawan', route: '/master/karyawan', icon: 'person' }] }];
  vm.runInNewContext(ts.transpileModule(script, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText,
    { module, exports: module.exports, capture: ref => { ref.value = collapsed; }, require(name) {
      if (name === 'vue') return vue;
      if (name === '@/stores/authStore') return { useAuthStore: () => ({ isAuthenticated: true, user: { user_kode: 'hrd' }, token: 'test' }) };
      if (name === '@/composables/useAgendaNotice') return { useAgendaNotice: () => ({ open: vue.ref(false), count: vue.ref(1), failure: vue.ref(''), refreshKey: vue.ref(0), loginNoticeCount: vue.ref(0), loginOngoingCount: vue.ref(0), loginAllDayCount: vue.ref(0), dismissLoginNotice() {}, refresh() {} }) };
      if (name === '@/composables/useAgendaStartNotice') return { useAgendaStartNotice: () => ({ notices: vue.ref([]), dismiss() {}, pauseNotice() {}, resumeNotice() {} }) };
      if (name === '@/components/AgendaNotificationZone.vue') return { default: { render: () => null } };
      if (name === 'vue-router') return { useRoute: () => ({ path: routePath }), useRouter: () => ({ push() {} }) };
      if (name === '@/components/MsIcon.vue') return { default: vue.defineComponent({ props: ['name'], setup: props => () => vue.h('i', { 'data-icon': props.name }) }) };
      if (name === '@/stores/permissionStore') return { usePermissionStore: () => ({ menuTree: menus, loaded: true }) };
      if (name === '@/stores/tabsStore') return { useTabsStore: () => ({ openTab() {} }) };
      if (name === '@/utils/icon') return { normalizeIcon: value => value };
      if (name === '@/composables/useTabNavigation') return { useTabNavigation: () => ({ closeAllTabs() {} }) };
      throw Error(name);
    } });
  return renderToString(vue.createSSRApp(module.exports.default));
}
test('Dashboard is in the sidebar header beside collapse, not in MASTER or duplicated in the nav', async () => {
  const html = await render('/dashboard');
  assert.match(html, /class="menu-item dashboard-item active"/);
  assert.match(html, /aria-current="page"/); assert.match(html, /data-icon="dashboard"/);
  assert.ok(html.indexOf('dashboard-item') < html.indexOf('class="menu-group"'));
  assert.ok(html.indexOf('dashboard-item') < html.indexOf('class="sidebar-collapse"'));
  assert.ok(html.indexOf('class="sidebar-collapse"') < html.indexOf('class="sidebar-nav"'));
  assert.equal((html.match(/class="menu-item dashboard-item/g) || []).length, 1);
  assert.ok(!html.includes('dashboard-divider'));
  assert.match(source, /\.sidebar-head \{[^}]*border-bottom: 1px solid/);
});
test('Other menu active state is unchanged; collapsed Dashboard retains accessible icon-only button', async () => {
  const html = await render('/master/karyawan');
  assert.match(html, /class="menu-item dashboard-item"/);
  assert.ok(!html.match(/dashboard-item[^>]*aria-current="page"/));
  assert.match(html, /class="menu-item active"/);
  const collapsed = await render('/dashboard', true);
  assert.match(collapsed, /aria-label="Dashboard" title="Dashboard"/);
  assert.match(collapsed, /data-icon="dashboard"/);
  assert.ok(!collapsed.includes('class="menu-item-text">Dashboard'));
});
test('Dashboard delegates to existing router and does not add a MASTER child or change tab management', () => {
  assert.match(source, /@click="router.push\('\/dashboard'\)"/);
  const dashboard = source.match(/<button type="button" class="menu-item dashboard-item"[\s\S]*?<\/button>/)[0];
  assert.ok(!dashboard.includes('go(')); assert.ok(!dashboard.includes('openTab'));
  assert.match(source, /\.dashboard-item:focus-visible/);
  assert.match(source, /\.sidebar.collapsed \.sidebar-head \{ flex-direction: column/);
  assert.match(source, /\.menu-item.active \{[^}]*background:[^}]*border-left-color:/);
});

test('Agenda sits above close-all-tabs with a notice and accessible collapsed icon', async () => {
  const html = await render('/dashboard');
  assert.ok(html.indexOf('agenda-menu-button') < html.indexOf('title="Tutup semua tab"'));
  assert.ok(html.includes('agenda-notice-dot'));
  const collapsed = await render('/dashboard', true);
  assert.ok(collapsed.includes('aria-label="Kalender Agenda, ada agenda hari ini"'));
  assert.ok(!collapsed.includes('>Kalender Agenda</span>'));
});
