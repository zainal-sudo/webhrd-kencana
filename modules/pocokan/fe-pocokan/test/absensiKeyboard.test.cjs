const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const http = require("node:http");
const { spawn } = require("node:child_process");
const { once } = require("node:events");
const { parse, compileScript } = require("@vue/compiler-sfc");
const ts = require("typescript");

const chrome = process.env.CHROME_PATH || [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "/usr/bin/google-chrome", "/usr/bin/chromium",
].find((file) => fs.existsSync(file));
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const makePage = () => {
  const filename = path.resolve(__dirname, "../src/views/transaksi/AbsensiView.vue");
  const { descriptor } = parse(fs.readFileSync(filename, "utf8"));
  const compiled = compileScript(descriptor, { id: "absensi-keyboard", inlineTemplate: true });
  const script = ts.transpileModule(compiled.content, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return `<!doctype html><html><head><meta charset="utf-8"><style>${descriptor.styles.map((style) => style.content).join("\n")}</style></head>
  <body><div id="app"></div><script src="/vue.js"></script><script>
  window.feedback = []; window.saves = []; window.rowClicks = 0;
  window.grid = Vue.reactive({ reverse: false, query: '', page: 1 });
  const data = [
    { no: 1, id: 'A', nama: 'Ani', unit: 'U1', bagian: 'Admin', kehadiran: 1, jamlembur: 12 },
    { no: 2, id: 'B', nama: 'Budi', unit: 'U1', bagian: 'Gudang', kehadiran: 0.5, jamlembur: 2 },
    { no: 3, id: 'C', nama: 'Cici', unit: 'U1', bagian: 'Admin', kehadiran: null, jamlembur: null },
  ];
  // Real inputs and SFC handlers, with a small browse fixture controlling the
  // rendered order/page. Chrome performs native focus, selection and editing.
  const Browse = Vue.defineComponent({
    props: ['items'],
    setup(props, { slots, expose }) {
      const matching = () => [...props.items].filter(row => row.nama.toLowerCase().includes(grid.query)).sort((a, b) => grid.reverse ? b.no - a.no : a.no - b.no);
      expose({ getExportItems: matching });
      return () => {
        window.rows = props.items;
        const shown = matching().slice((grid.page - 1) * 2, grid.page * 2);
        return Vue.h('section', [
          slots['filter-left']?.(), slots['filter-right']?.(), slots['extra-actions']?.(),
          Vue.h('button', { id: 'before-grid' }, 'Before grid'),
          Vue.h('table', {}, [Vue.h('tbody', {}, shown.map(item => Vue.h('tr', { key: item.no, onClick: () => rowClicks++ }, [
            Vue.h('td', {}, item.nama),
            Vue.h('td', {}, slots['item.kehadiran']?.({ item })),
            Vue.h('td', {}, slots['item.jamlembur']?.({ item })),
          ])))]),
          Vue.h('button', { id: 'after-grid' }, 'After grid'),
        ]);
      };
    },
  });
  const imports = {
    vue: Vue,
    'vue-router': { useRoute: () => ({ path: '/transaksi/absensi' }), onBeforeRouteLeave: guard => { window.leaveGuard = guard; } },
    '@/stores/tabsStore': { useTabsStore: () => ({ setCloseGuard() {} }) },
    'vue-toastification': { useToast: () => Object.fromEntries(['info', 'success', 'warning', 'error'].map(level => [level, message => feedback.push({level, message})])) },
    '@/components/BaseBrowse.vue': { default: Browse },
    '@/api/master/unitApi': { unitApi: { getAll: async () => [{ kode: 'U1', nama: 'Unit 1' }] } },
    '@/api/transaksi/absensiApi': { absensiApi: {
      getKaryawan: async () => data.map(row => ({ ...row })),
      save: async payload => saves.push(JSON.parse(JSON.stringify(payload))),
      tarikWajah: () => new Promise(resolve => { window.finishPull = () => resolve({ message: 'OK', data: { inserted: 0, updated: 0, skipped: 0 } }); }),
    } },
    '@/utils/exportExcel': { exportToExcel() {} },
    '@tabler/icons-vue': new Proxy({}, { get: () => () => Vue.h('svg') }),
  };
  const module = { exports: {} }; const exports = module.exports;
  const require = name => { if (!(name in imports)) throw new Error('Unexpected import: ' + name); return imports[name]; };
  ${script}
  const app = Vue.createApp(module.exports.default);
  const passthrough = tag => Vue.defineComponent({ setup(_, { attrs, slots }) { return () => Vue.h(tag, attrs, slots.default?.()); } });
  app.component('v-btn', passthrough('button'));
  app.component('v-chip', passthrough('span'));
  app.component('v-dialog', Vue.defineComponent({ props: ['modelValue'], setup(props, { slots }) { return () => props.modelValue ? Vue.h('dialog', { open: true }, slots.default?.()) : null; } }));
  app.component('v-card', passthrough('article'));
  app.component('v-card-actions', passthrough('footer'));
  app.mount('#app');
  </script></body></html>`;
};

test("Absensi keyboard navigation and numeric editing in a real browser", {
  skip: !chrome ? "Set CHROME_PATH to run browser keyboard checks" : false,
  timeout: 45000,
}, async (t) => {
  const page = makePage();
  const vueScript = fs.readFileSync(require.resolve("vue/dist/vue.global.prod.js"));
  const server = http.createServer((req, res) => {
    res.setHeader("Content-Type", req.url === "/vue.js" ? "application/javascript" : "text/html");
    res.end(req.url === "/vue.js" ? vueScript : page);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const temporaryRoot = path.resolve(os.tmpdir());
  const profile = fs.mkdtempSync(path.join(temporaryRoot, "pocokan-keyboard-"));
  const browser = spawn(chrome, [
    "--headless=new", "--disable-gpu", "--no-sandbox", "--no-first-run", "--no-default-browser-check",
    "--remote-debugging-port=0", `--user-data-dir=${profile}`, "about:blank",
  ], { windowsHide: true, stdio: "ignore" });
  let socket;
  t.after(async () => {
    socket?.close();
    browser.kill();
    await new Promise((resolve) => server.close(resolve));
    // Only this test's newly created profile may be removed recursively.
    assert.ok(path.resolve(profile).startsWith(temporaryRoot + path.sep));
    assert.ok(path.basename(profile).startsWith("pocokan-keyboard-"));
    try { fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } catch {}
  });
  const portFile = path.join(profile, "DevToolsActivePort");
  for (let i = 0; !fs.existsSync(portFile) && i < 150; i++) await delay(100);
  assert.ok(fs.existsSync(portFile), "Chrome should start its debugging endpoint");
  const port = fs.readFileSync(portFile, "utf8").split("\n")[0];
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  socket = new WebSocket(targets.find((target) => target.type === "page").webSocketDebuggerUrl);
  await once(socket, "open");
  let sequence = 0;
  const pending = new Map();
  socket.addEventListener("message", ({ data }) => {
    const message = JSON.parse(data);
    if (message.method === "Runtime.exceptionThrown") console.error(JSON.stringify(message.params));
    if (message.method === "Page.javascriptDialogOpening") console.error(JSON.stringify(message.params));
    if (pending.has(message.id)) {
      pending.get(message.id)(message);
      pending.delete(message.id);
    }
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++sequence;
    const timeout = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 5000);
    pending.set(id, (message) => { clearTimeout(timeout); message.error ? reject(new Error(JSON.stringify(message.error))) : resolve(message.result); });
    socket.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async (expression) => {
    const result = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true })
      .catch((error) => { throw new Error(`${error.message}: ${expression}`); });
    assert.ok(!result.exceptionDetails, JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  const codes = { ".": 190, Tab: 9, Enter: 13, Escape: 27, F2: 113, ArrowLeft: 37, ArrowUp: 38, ArrowRight: 39, ArrowDown: 40, Backspace: 8, Delete: 46 };
  const press = async (key, shift = false) => {
    const params = { key, windowsVirtualKeyCode: codes[key] ?? key.toUpperCase().charCodeAt(0), modifiers: shift ? 8 : 0 };
    if (key.length === 1) params.text = key;
    await send("Input.dispatchKeyEvent", { type: "keyDown", ...params });
    await send("Input.dispatchKeyEvent", { type: "keyUp", ...params });
  };
  const focus = (cell) => evaluate(`document.querySelector('[data-absensi-cell="${cell}"]').focus()`);
  const active = () => evaluate("document.activeElement.dataset.absensiCell || document.activeElement.id");
  const clickButton = (label) => evaluate(`[...document.querySelectorAll('button')].find(button => button.textContent.trim() === ${JSON.stringify(label)}).click()`);
  const refreshGrid = (assignment) => evaluate(`(async () => { ${assignment}; await Vue.nextTick(); })()`);
  await send("Runtime.enable");
  await send("Page.enable");
  await send("Page.navigate", { url: `http://127.0.0.1:${server.address().port}` });
  for (let i = 0; i < 100; i++) {
    if (await evaluate("!!document.querySelector('[data-absensi-cell]')")) break;
    await delay(50);
  }

  await focus("1:kehadiran");
  await press("ArrowRight"); assert.equal(await active(), "1:jamlembur");
  await press("ArrowRight"); assert.equal(await active(), "1:jamlembur");
  await press("ArrowDown"); assert.equal(await active(), "2:jamlembur");
  await press("Enter", true); assert.equal(await active(), "1:jamlembur");
  await press("ArrowLeft"); assert.equal(await active(), "1:kehadiran");
  await press("Enter"); assert.equal(await active(), "2:kehadiran");
  await press("ArrowUp"); assert.equal(await active(), "1:kehadiran");
  await press("Tab"); assert.equal(await active(), "1:jamlembur");
  await press("Tab"); assert.equal(await active(), "2:kehadiran");
  await press("Tab", true); assert.equal(await active(), "1:jamlembur");
  assert.equal(await evaluate("rows[0].jamlembur"), 12, "Navigation must not increment number inputs");
  assert.equal(await evaluate("!!document.querySelector('.v-chip') || document.querySelector('#app').textContent.includes('Belum disimpan')"), false);
  await focus("1:kehadiran"); await press("Tab", true); assert.equal(await active(), "before-grid");
  await focus("2:jamlembur"); await press("Tab"); assert.equal(await active(), "after-grid");
  await focus("2:jamlembur"); await press("Enter"); assert.equal(await active(), "2:jamlembur");
  assert.equal(await evaluate("rows.length"), 3, "Enter at the boundary must not add employees");

  await focus("1:jamlembur"); await press("F2"); await press("ArrowRight");
  assert.equal(await active(), "1:jamlembur");
  assert.equal(await evaluate("document.activeElement.classList.contains('is-editing')"), true);
  await press("3"); assert.equal(await evaluate("rows[0].jamlembur"), 123, "F2 permits native editing inside the value");
  await press("Escape"); assert.equal(await evaluate("rows[0].jamlembur"), 123, "Escape preserves the edit");
  await press("ArrowDown"); assert.equal(await active(), "2:jamlembur");
  await press("4"); await press("5"); assert.equal(await evaluate("rows[1].jamlembur"), 45, "Typing replaces the old value, then accepts multiple digits");
  await press("Backspace"); assert.equal(await evaluate("rows[1].jamlembur"), "");
  await focus("1:kehadiran"); await press("0"); await press("."); await press("5");
  assert.equal(await evaluate("rows[0].kehadiran"), 0.5);
  await press("Delete"); assert.equal(await evaluate("rows[0].kehadiran"), "");
  assert.equal(await evaluate("document.querySelector('#app').textContent.includes('Belum disimpan')"), true);
  assert.equal(await evaluate("saves.length"), 0, "Keyboard edits do not save automatically");
  assert.equal(await evaluate("rowClicks"), 0);

  await refreshGrid("grid.reverse = true");
  await focus("3:kehadiran"); await press("Enter"); assert.equal(await active(), "2:kehadiran");
  await refreshGrid("grid.query = 'cici'");
  await focus("3:kehadiran"); await press("Enter"); assert.equal(await active(), "3:kehadiran");
  await refreshGrid("grid.query = ''; grid.page = 2");
  await focus("1:jamlembur"); await press("ArrowDown"); assert.equal(await active(), "1:jamlembur");
  await refreshGrid("grid.query = 'missing'"); assert.equal(await evaluate("document.querySelectorAll('[data-absensi-cell]').length"), 0);
  await refreshGrid("grid.query = ''; grid.page = 1; grid.reverse = false");
  await evaluate("document.querySelector('[data-absensi-cell]').click()");
  assert.equal(await evaluate("rowClicks"), 0, "Clicking editable inputs does not select rows");
  await clickButton("Save");
  assert.equal(await evaluate("saves.length"), 1);
  assert.equal(await evaluate("document.querySelector('#app').textContent.includes('Belum disimpan')"), false);
  await clickButton("Tarik Absensi");
  assert.equal(await evaluate("[...document.querySelectorAll('[data-absensi-cell]')].every(input => input.disabled)"), true);
  await evaluate("document.querySelector('[data-absensi-cell]').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }))");
  assert.equal(await evaluate("rows[0].kehadiran"), "");
  await evaluate("finishPull()");
  for (let i = 0; i < 50 && await evaluate("document.querySelector('[data-absensi-cell]').disabled"); i++) await delay(20);
  assert.equal(await evaluate("document.querySelector('[data-absensi-cell]').disabled"), false);
  await send("Browser.close");
});
