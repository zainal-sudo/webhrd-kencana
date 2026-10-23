const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');
const { parse, compileScript } = require('@vue/compiler-sfc');
const esbuild = require('esbuild');
const root = path.join(__dirname, '../src');
const browser = [process.env.CHROME_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(file => file && fs.existsSync(file));

test('Mounted draft forms: sidebar/tab cancel, cached drafts, failed save, newer edits during save, inactive close and cleanup', { skip: !browser }, async () => {
  const guard = fs.readFileSync(path.join(root, 'router/index.ts'), 'utf8').split('router.beforeEach')[1];
  const entry = `
    import {createApp,defineComponent,h,KeepAlive,computed,onMounted,reactive,nextTick} from 'vue';
    import {createPinia,setActivePinia} from 'pinia';
    import {createRouter,createMemoryHistory,RouterView,useRoute} from 'vue-router';
    import BaseForm from '@/components/BaseForm.vue';
    import TabBar from '@/components/TabBar.vue';
    import {useTransactionReset} from '@/composables/useTransactionReset';
    import {useTabPageCache} from '@/composables/useTabPageCache';
    import {useTabNavigation} from '@/composables/useTabNavigation';
    import {useTabsStore} from '@/stores/tabsStore';
    import {confirmDraftNavigation,protectedTabIds} from '@/utils/unsavedChanges';
    window.messages=[];window.accept=true;window.confirm=text=>{window.messages.push(text);return window.accept};
    window.alert=()=>{};window.auth={isAuthenticated:true,menus:[],can:()=>true};
    const useAuthStore=()=>window.auth,usePermissionStore=()=>({});
    const Page=defineComponent({setup(){
      const identity=String(useRoute().query.id||'1');const values=reactive({name:identity==='2'?'Beta':''});
      const reset=useTransactionReset({values},{afterRestore(){}});onMounted(reset.capture);
      async function save(){if(window.failSave)throw Error('Save failed');if(window.pendingSave)await new Promise(resolve=>{window.finishSave=resolve});return 'Saved'}
      return()=>h(BaseForm,{title:'Form '+identity,saveFn:save,newFormPath:'/form',transactionModule:'test',returnPath:'/other'},
        {'form-content':()=>h('input',{id:'name',value:values.name,onInput:event=>{values.name=event.target.value}})});
    }});
    const Empty=defineComponent({setup:()=>()=>h('p','Other page')});
    const router=createRouter({history:createMemoryHistory(),routes:[{path:'/form',component:Page,meta:{title:'Form',form:'test'}},{path:'/other',component:Empty,meta:{title:'Other'}},{path:'/dashboard',component:Empty,meta:{title:'Dashboard'}}]});
    router.beforeEach${guard.replace(/export default router;?/, '')}
    const Root=defineComponent({setup(){const tabs=useTabsStore(),route=useRoute();const id=computed(()=>tabs.generateTabId(route.path,route.query));
      const {currentPage,includedPages}=useTabPageCache(()=>id.value);window.nav=useTabNavigation();window.tabs=tabs;window.router=router;window.protectedIds=protectedTabIds;
      return()=>h('div',[h(TabBar),h('button',{id:'sidebar',onClick:()=>{tabs.stageTab({path:'/other',title:'Other',closable:true});router.push('/other')}},'Sidebar'),
        h(RouterView,{}, {default:({Component})=>h(KeepAlive,{key:tabs.cacheVersion,include:includedPages.value,max:12},{default:()=>h(currentPage.value,{key:id.value,page:Component})})})]);
    }});
    const pinia=createPinia();setActivePinia(pinia);
    (async()=>{await router.push('/form?id=1');createApp(Root).use(pinia).use(router).mount('#app');await nextTick();window.fixtureReady=true})();
  `;
  const result = await esbuild.build({ stdin: { contents: entry, loader: 'ts', resolveDir: path.join(__dirname, '..') }, bundle: true, write: false, format: 'iife', define: { 'process.env.NODE_ENV': '"production"' },
    plugins: [{ name: 'draft-browser-fixture', setup(build) {
      build.onResolve({ filter: /^@\// }, args => {
        if (['@/stores/authStore', '@/components/MsIcon.vue', '@/api/axios'].includes(args.path)) return { path: args.path, namespace: 'mock' };
        const target = path.join(root, args.path.slice(2));
        return { path: fs.existsSync(target) ? target : target + '.ts' };
      });
      build.onResolve({ filter: /^vue-toastification$/ }, args => ({ path: args.path, namespace: 'mock' }));
      build.onLoad({ filter: /.*/, namespace: 'mock' }, () => ({ contents: `export default {render:()=>null};export const useAuthStore=()=>window.auth,useToast=()=>({success(){},error(){}}),getErrorMessage=e=>e.message;` }));
      build.onLoad({ filter: /\.vue$/ }, args => {
        const { descriptor } = parse(fs.readFileSync(args.path, 'utf8'));
        return { contents: compileScript(descriptor, { id: 'draft-fixture', inlineTemplate: true }).content, loader: 'ts', resolveDir: path.dirname(args.path) };
      });
    } }],
  });
  const probe = async function () {
    const checks = [], delay = () => new Promise(resolve => setTimeout(resolve, 50));
    const check = (name, ok) => checks.push({ name, ok: !!ok });
    const input = text => { const field = document.getElementById('name'); field.value = text; field.dispatchEvent(new Event('input', { bubbles: true })); };
    try {
      for (let i = 0; i < 50 && !window.fixtureReady; i++) await delay();
      await delay(); check('pristine', window.messages.length === 0 && window.protectedIds().length === 0);
      input('Alice'); await delay(); window.accept = false; document.getElementById('sidebar').click(); await delay();
      check('sidebar cancel atomic', window.router.currentRoute.value.path === '/form' && window.tabs.activeTabId === '/form?id=1' && !window.tabs.tabs.some(tab => tab.path === '/other') && document.getElementById('name').value === 'Alice' && window.messages.length === 1);
      window.accept = true; document.getElementById('sidebar').click(); await delay();
      await window.router.push('/form?id=1'); await delay(); check('cached draft retained', document.getElementById('name').value === 'Alice');
      await window.router.push('/form?id=2'); await delay(); check('separate identity', document.getElementById('name').value === 'Beta');
      input('Draft two'); await delay(); window.accept = false;
      const firstTab = [...document.querySelectorAll('.tab-btn')].find(el => el.textContent.includes('Form'));
      firstTab.click(); await delay(); check('tab cancel atomic', window.tabs.activeTabId === '/form?id=2' && document.getElementById('name').value === 'Draft two');
      window.accept = true; await window.router.push('/form?id=1'); await delay();
      const save = () => [...document.querySelectorAll('button')].find(el => el.textContent.trim() === 'Simpan Tutup');
      window.failSave = true; save().click(); await delay(); check('failed save dirty', window.protectedIds().includes('/form?id=1') && document.getElementById('name').value === 'Alice');
      window.failSave = false; window.pendingSave = true; save().click(); await delay();
      check('busy close blocked', await window.nav.closeTab('/form?id=1') === false && window.tabs.tabs.some(tab => tab.id === '/form?id=1'));
      input('Alice newer'); await delay(); window.pendingSave = false; window.finishSave(); await delay();
      check('newer edit survives save', window.router.currentRoute.value.fullPath === '/form?id=1' && document.getElementById('name').value === 'Alice newer' && window.protectedIds().includes('/form?id=1'));
      const before = window.messages.length; window.accept = false; await window.nav.closeTab('/form?id=2'); await delay();
      check('inactive close cancel', window.tabs.tabs.some(tab => tab.id === '/form?id=2') && window.messages.length === before + 1);
      window.accept = true; await window.nav.closeTab('/form?id=2'); await delay(); check('inactive close cleanup', !window.protectedIds().includes('/form?id=2'));
      save().click(); await delay(); check('save close clean', window.router.currentRoute.value.path === '/other' && !window.tabs.tabs.some(tab => tab.id === '/form?id=1') && window.protectedIds().length === 0);
    } catch (error) { checks.push({ error: error.stack }); }
    document.body.append(Object.assign(document.createElement('pre'), { id: 'draft-report', textContent: JSON.stringify(checks) }));
  };
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'unsaved-draft-')), file = path.join(dir, 'index.html');
  fs.writeFileSync(file, '<div id="app"></div><script>' + result.outputFiles[0].text + '</script><script>(' + probe + ')();</script>');
  const output = spawnSync(browser, ['--headless', '--no-sandbox', '--disable-gpu', '--disable-background-networking', '--user-data-dir=' + path.join(dir, 'profile'), '--virtual-time-budget=9000', '--dump-dom', pathToFileURL(file).href], { encoding: 'utf8', timeout: 25000, maxBuffer: 4e6 });
  const report = output.stdout?.match(/<pre id="draft-report">([^<]+)<\/pre>/);
  assert.ok(report, output.error?.message || 'Browser report missing');
  const checks = JSON.parse(report[1].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'));
  assert.equal(checks.length, 11, JSON.stringify(checks));
  for (const check of checks) assert.equal(check.ok, true, JSON.stringify(checks));
});
