// Keep script-only fixtures using the real shared draft modules. Form registration
// is inactive outside a mounted Vue component; browser tests cover that lifecycle.
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
function prepare(context) {
  if (!context) return context;
  if (!context.require) {
    context.useUnsavedChanges ||= source => ({ rebase() {}, beginSave: () => () => {}, dirty: source.dirty });
    return context;
  }
  if (context.require.__draftAware) return context;
  const original = context.require, cache = new Map();
  const modules = new Set(['@/utils/unsavedChanges', '@/composables/useUnsavedChanges', '@/composables/useTabNavigation']);
  function resolve(name) {
    if (name === 'vue') return { ...require('vue'), ...original(name) };
    if (name === 'vue-router') return { ...require('vue-router'), ...original(name) };
    if (name === '@/stores/tabsStore') {
      let result;
      try { result = original(name); } catch (error) { if (error.code !== 'MODULE_NOT_FOUND') throw error; return {}; }
      if (!result.useTabsStore) return result;
      return { ...result, useTabsStore: (...args) => {
        const store = result.useTabsStore(...args);
        if (!store.stageTab && store.openTab) store.stageTab = store.openTab;
        store.generateTabId ||= (path, query = {}) => path + (Object.keys(query).length ? '?' + new URLSearchParams(query) : '');
        return store;
      } };
    }
    if (!modules.has(name)) return original(name);
    if (cache.has(name)) return cache.get(name).exports;
    const module = { exports: {} }; cache.set(name, module);
    const source = fs.readFileSync(path.join(__dirname, '../../src', name.slice(2) + '.ts'), 'utf8');
    vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
      { ...context, module, exports: module.exports, require: resolve, window: context.window || { confirm: () => true, alert() {} } });
    return module.exports;
  }
  resolve.__draftAware = true;
  context.require = resolve;
  context.useUnsavedChanges ||= (...args) => resolve('@/composables/useUnsavedChanges').useUnsavedChanges(...args);
  return context;
}
module.exports = { ...vm,
  runInNewContext: (code, context, ...args) => vm.runInNewContext(code, prepare(context), ...args),
  runInContext: (code, context, ...args) => vm.runInContext(code, prepare(context), ...args),
};
