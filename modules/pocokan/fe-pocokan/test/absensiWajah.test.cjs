// Mount SFC asli dengan renderer Vue in-memory (tanpa dependency browser baru).
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const vue = require("vue");
const vueRouter = require("vue-router");
const { parse, compileScript } = require("@vue/compiler-sfc");
const ts = require("typescript");

const TABS_STORE = "@/stores/tabsStore";
const ABSENSI_PATH = "/transaksi/absensi";
const GAJI_PATH = "/transaksi/proses-gaji";

// ── Harness ────────────────────────────────────────────────────────────
const makeEnv = () => {
  const node = (type, text = "") => ({ type, text, props: {}, children: [], parent: null });
  const all = (el) => [el, ...el.children.flatMap(all)];
  const text = (el) => el.text + el.children.map(text).join("");
  const renderer = vue.createRenderer({
    createElement: type => node(type), createText: text => node("text", text), createComment: text => node("comment", text),
    setText: (el, text) => { el.text = text; },
    setElementText: (el, text) => { el.text = text; el.children = []; },
    patchProp: (el, key, previous, value) => { el.props[key] = value; },
    insert(el, parent, anchor = null) {
      if (el.parent) el.parent.children.splice(el.parent.children.indexOf(el), 1);
      el.parent = parent;
      const index = anchor ? parent.children.indexOf(anchor) : -1;
      if (index < 0) parent.children.push(el); else parent.children.splice(index, 0, el);
    },
    remove(el) { if (el.parent) el.parent.children.splice(el.parent.children.indexOf(el), 1); },
    parentNode: el => el.parent,
    nextSibling: el => el.parent?.children[el.parent.children.indexOf(el) + 1],
  });
  return { node, all, text, renderer };
};

// Rekam nilai v-model dari binding SFC tanpa membutuhkan browser DOM, dan
// sambungkan handler input/change lewat model assigner milik vnode agar test
// bisa mensimulasikan ketikan admin.
const patchVModel = () => {
  const hooks = [];
  for (const directive of [vue.vModelText, vue.vModelSelect]) {
    for (const key of ["created", "mounted", "beforeUpdate", "updated"]) {
      if (directive[key]) {
        hooks.push([directive, key, directive[key]]);
        directive[key] = (el, binding, vnode) => {
          el.modelValue = binding.value;
          el.vnode = vnode;
          if (!el.wired) {
            el.wired = true;
            const apply = (e) => {
              const assign = el.vnode && el.vnode.props && el.vnode.props["onUpdate:modelValue"];
              if (assign) assign(e && e.target ? e.target.value : "");
            };
            el.oninput = apply;
            el.onchange = apply;
          }
        };
      }
    }
  }
  return hooks;
};

// BaseBrowse dipin dengan stub: mengirim "refresh" saat filter berubah (pola
// browse asli) dan menyiarkan items ke test supaya bisa disimulasikan edit.
const browseStub = (captured, columns = ["kehadiran", "jamlembur"]) => vue.defineComponent({
  props: ["items", "filterValues"], emits: ["refresh"],
  setup(props, { slots, emit }) {
    vue.watch(() => props.filterValues, () => emit("refresh"), { deep: true });
    return () => {
      captured.items = props.items;
      return vue.h("main", [
        slots["filter-left"]?.(), slots["extra-actions"]?.(),
        ...props.items.map(item => vue.h("article", [
          ...columns.map(key => slots[`item.${key}`]?.({ item })),
        ])),
      ]);
    };
  },
});

// TabBar peniru: tombol X per tab, "Tutup Tab Lain", dan "Tutup Semua Tab".
// Logika tutup tetap milik tabsStore yang asli.
const tabBarStub = (store) => vue.defineComponent({
  setup() {
    const closeBtn = (tab) => vue.h("button", {
      "data-tab": tab.id,
      title: `Tutup tab ${tab.title}`,
      disabled: !tab.closable,
      onClick: () => { void store.closeTab(tab.id); },
    }, `x:${tab.title}`);
    return () => vue.h("nav", [
      ...store.tabs.map(closeBtn),
      vue.h("button", { "data-other": "1", onClick: () => { void store.closeOtherTabs(store.activeTabId); } }, "Tutup Tab Lain"),
      vue.h("button", { "data-all": "1", onClick: () => { void store.closeAllTabs(); } }, "Tutup Semua Tab"),
    ]);
  },
});

// TabView peniru: mengikuti activeTabId ke route tab tersebut, seperti
// TabView asli. Tanpa ini, tutup tab tidak akan memindahkan route.
// TEST 23 memakai TabView asli supaya sinkronisasi di file itu ikut diuji.
const tabViewStub = (store, router) => vue.defineComponent({
  setup() {
    vue.watch(() => store.activeTabId, (id) => {
      const tab = store.tabs.find(t => t.id === id);
      if (!tab || tab.path === router.currentRoute.value.path) return;
      router.push(tab.path).then(failure => {
        if (!failure) return;
        const current = store.tabs.find(t => t.path === router.currentRoute.value.path);
        if (current && current.id !== id) store.setActiveTab(current.id);
      }).catch(() => {});
    });
    return () => vue.h(vueRouter.RouterView);
  },
});

// tabsStore asli dimuat langsung dari file sumbernya (defineStore di-stub
// sebagai fungsi biasa) supaya yang diuji adalah kode yang berjalan di aplikasi.
const muatTabsStore = () => {
  const file = path.resolve(__dirname, "../src/stores/tabsStore.ts");
  const compiled = ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const clearedSessions = [];
  const module = { exports: {} };
  const overrides = {
    vue,
    // reactive() diperlukan supaya store.tabs terbaca sebagai array, bukan
    // Ref, sama seperti store Pinia sungguhan.
    pinia: {
      defineStore: (_id, setup) => {
        let instance;
        return () => (instance ??= vue.reactive(setup()));
      },
    },
    "@/utils/viewSession": { clearViewSession: (p) => clearedSessions.push(p) },
  };
  vm.runInNewContext(compiled.outputText, {
    module, exports: module.exports, console,
    require: name => { assert.ok(Object.hasOwn(overrides, name), `Unexpected import ${name}`); return overrides[name]; },
  }, { filename: file });
  return { useTabsStore: module.exports.useTabsStore, clearedSessions };
};

// SFC asli (AbsensiView, TabView) dimuat lewat vm sandbox supaya yang diuji
// adalah kode yang benar-benar jalan di aplikasi, bukan tiruan.
const compileSfc = (relPath, overrides, id, globals = {}) => {
  const file = path.resolve(__dirname, relPath);
  const { descriptor } = parse(fs.readFileSync(file, "utf8"));
  const script = compileScript(descriptor, { id, inlineTemplate: true });
  const compiled = ts.transpileModule(script.content, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
  const module = { exports: {} };
  vm.runInNewContext(compiled.outputText, {
    module, exports: module.exports, console,
    window: { addEventListener() {}, removeEventListener() {} },
    ...globals,
    require: name => { assert.ok(Object.hasOwn(overrides, name), `Unexpected import ${name}`); return overrides[name]; },
  }, { filename: file });
  return module.exports.default;
};

// confirm() dipakai halaman untuk Aksi destruktif (mengosongkan semua isian),
// jadi harus bisa diamati dan dikendalikan jawaban test.
const buatKonfirmasi = () => {
  const riwayat = [];
  let jawaban = true;
  return {
    riwayat,
    jawab(value) { jawaban = value; },
    fn: (pesan) => { riwayat.push(pesan); return jawaban; },
  };
};

const compileAbsensiView = ({ absensiApi, feedback, captured, tabsStore, konfirmasi }) =>
  compileSfc("../src/views/transaksi/AbsensiView.vue", {
    vue,
    "vue-router": vueRouter,
    [TABS_STORE]: { useTabsStore: () => tabsStore },
    "vue-toastification": { useToast: () => Object.fromEntries(["info", "success", "warning", "error"].map(level => [level, text => feedback.push({ level, text })])) },
    "@tabler/icons-vue": Object.fromEntries(["IconClock", "IconDeviceFloppy", "IconDownload", "IconAlertTriangle"].map(name => [name, () => vue.h("svg")])),
    "@/components/BaseBrowse.vue": { default: browseStub(captured) },
    "@/api/master/unitApi": { unitApi: { getAll: async () => [{ kode: "U1", nama: "Unit 1" }] } },
    "@/api/transaksi/absensiApi": { absensiApi },
    "@/utils/exportExcel": { exportToExcel() {} },
  }, "test-absensi", { confirm: konfirmasi.fn });

// ProsesGajiView asli: dipakai TEST 27 (potongan bisa dikosongkan kembali).
const compileGajiView = ({ prosesGajiApi, feedback, captured, konfirmasi, tabsStore }) =>
  compileSfc("../src/views/transaksi/ProsesGajiView.vue", {
    vue,
    "vue-router": vueRouter,
    [TABS_STORE]: { useTabsStore: () => tabsStore },
    "vue-toastification": { useToast: () => Object.fromEntries(["info", "success", "warning", "error"].map(level => [level, text => feedback.push({ level, text })])) },
    "@tabler/icons-vue": Object.fromEntries(["IconCalculator", "IconDeviceFloppy", "IconDownload", "IconAlertTriangle"].map(name => [name, () => vue.h("svg")])),
    "@/components/BaseBrowse.vue": { default: browseStub(captured, ["potongan"]) },
    "@/api/master/unitApi": { unitApi: { getAll: async () => [{ kode: "U1", nama: "Unit 1" }] } },
    "@/api/transaksi/prosesGajiApi": { prosesGajiApi },
    "@/utils/exportExcel": { exportToExcel() {} },
  }, "test-gaji", { confirm: konfirmasi.fn });

// TabView asli: dipakai test yang menguji sinkronisasi activeTabId dengan route
// supaya perubahan di src/components/TabView.vue ikut tercakup.
const compileTabView = (tabsStore) =>
  compileSfc("../src/components/TabView.vue", {
    vue,
    "vue-router": vueRouter,
    [TABS_STORE]: { useTabsStore: () => tabsStore },
  }, "test-tabview");

const mountView = (rootComponent, { plugins = [] } = {}) => {
  const { node, all, text, renderer } = makeEnv();
  const root = node("root");
  const app = renderer.createApp(rootComponent);
  for (const plugin of plugins) app.use(plugin);
  // Vuetify tidak dirender sungguhan; cukup struktur elemen dan handler-nya.
  // v-dialog dicatat setiap kali dibuka supaya test bisa membuktikan dialog
  // tidak pernah muncul, termasuk setelah halamannya di-unmount.
  const dialogOpens = [];
  const passthrough = (tag) => vue.defineComponent({
    inheritAttrs: false,
    setup(_, { slots, attrs }) { return () => vue.h(tag, attrs, slots.default?.()); },
  });
  for (const tag of ["v-chip", "v-card", "v-card-title", "v-card-text", "v-card-actions"]) {
    app.component(tag, passthrough(tag));
  }
  // Render ke tag biasa (bukan "v-dialog" lagi) supaya stub tidak memanggil
  // dirinya sendiri saat membuat elemen.
  app.component("v-dialog", vue.defineComponent({
    props: ["modelValue"],
    inheritAttrs: false,
    setup(props, { slots, attrs }) {
      // Hitung transisi tutup->buka, bukan tiap render, supaya dialog yang
      // tetap terbuka tidak dihitung berulang.
      const wasOpen = vue.ref(props.modelValue === true);
      return () => {
        if (props.modelValue === true && !wasOpen.value) dialogOpens.push(true);
        wasOpen.value = props.modelValue === true;
        return vue.h("div", { ...attrs, "data-dialog": "1", modelValue: props.modelValue }, slots.default?.());
      };
    },
  }));
  app.component("v-btn", vue.defineComponent({
    props: ["loading", "disabled"],
    setup(props, { slots, attrs }) {
      return () => vue.h("button", { ...attrs, disabled: props.disabled }, props.loading ? slots.loader?.() : slots.default?.());
    },
  }));
  const hooks = patchVModel();
  const flush = async () => { await new Promise(resolve => setImmediate(resolve)); await vue.nextTick(); };
  app.mount(root);
  return {
    app, text, flush, dialogOpens,
    all: (el) => all(el ?? root),
    tabClose: (tabId) => all(root).find(el => el.type === "button" && el.props["data-tab"] === tabId),
    action: (name) => all(root).find(el => el.type === "button" && el.props[`data-${name}`] === "1"),
    button: (label) => all(root).filter(el => el.type === "button" && text(el).includes(label)),
    // Setelah halaman di-unmount (tab tertutup) elemen dialog ikut hilang;
    // dialogOpens tetap mencatat percobaan pembukaannya.
    dialog: () => all(root).find(el => el.props && el.props["data-dialog"] === "1"),
    dialogShown: () => dialogOpens.length > 0,
    unmount() { app.unmount(); for (const [directive, key, hook] of hooks) directive[key] = hook; },
  };
};

// Runner bersama: router sungguhan + TabBar + TabView + halaman Absensi asli.
const mountAbsensi = async ({ absensiApi, extraTabs = [], menuRoutes = [], realTabView = false } = {}) => {
  const calls = []; const feedback = []; const captured = {};
  const konfirmasi = buatKonfirmasi();
  const { useTabsStore, clearedSessions } = muatTabsStore();
  const store = useTabsStore();
  const api = absensiApi || {
    getKaryawan: async (unit, tanggal) => {
      calls.push({ kind: "get", unit, tanggal });
      return [{ no: 1, id: "A1", nama: "Aktif", unit, bagian: "Test", kehadiran: 0, jamlembur: 2 }];
    },
    tarikWajah: async () => ({ success: true, message: "ok", data: { ditemukan: 0, inserted: 0, updated: 0, skipped: 0 } }),
    save: async (payload) => { calls.push({ kind: "save", ...payload }); return { success: true, message: "ok" }; },
  };
  const view = compileAbsensiView({ absensiApi: api, feedback, captured, tabsStore: store, konfirmasi });

  store.openTab({ title: "Dashboard", path: "/", closable: false });
  store.openTab({ title: "Absensi", path: ABSENSI_PATH, closable: true });
  for (const tab of extraTabs) store.openTab(tab);

  const router = vueRouter.createRouter({
    history: vueRouter.createMemoryHistory(),
    routes: [
      { path: "/", component: { render: () => vue.h("p", "dashboard") } },
      { path: ABSENSI_PATH, component: view },
      ...extraTabs.map(tab => ({ path: tab.path, component: { render: () => vue.h("p", tab.path) } })),
      // Route tanpa tab: meniru menu yang diklik di sidebar, belum pernah dibuka.
      ...menuRoutes.map(menu => ({ path: menu.path, component: { render: () => vue.h("p", menu.label) } })),
    ],
  });
  // Meniru router/index.ts: afterEach membuka tab, TAPI hanya untuk navigasi
  // yang benar-benar berhasil. Navigasi yang dibatalkan guard tetap memicu
  // afterEach di vue-router, dan kalau ikut dibuatkan tab, TabView akan
  // mencoba push lagi sehingga guard kepicu dua kali.
  router.afterEach((to, _from, failure) => {
    if (failure) return;
    store.openTab({ title: String(to.path), path: to.path, query: to.query, closable: to.path !== "/" });
  });
  await router.push(ABSENSI_PATH);
  await router.isReady();

  const tabView = realTabView ? compileTabView(store) : tabViewStub(store, router);
  const env = mountView({
    render: () => vue.h("div", [
      vue.h(tabBarStub(store)), vue.h(tabView),
    ]),
  }, { plugins: [router] });
  return { ...env, store, router, calls, feedback, captured, clearedSessions, konfirmasi, api };
};

// Router dan store asli untuk menguji warning Potongan di menu/tab/X.
const mountGaji = async ({ prosesGajiApi } = {}) => {
  const calls = []; const feedback = []; const captured = {};
  const konfirmasi = buatKonfirmasi();
  const api = prosesGajiApi || {
    getData: async (unit, periode1, periode2) => {
      calls.push({ kind: "get", unit, periode1, periode2 });
      return [
        { no: 1, id: "A1", nama: "Aktif Satu", unit, bagian: "Test", gapok: 100, kehadiran: 1, lemburLE2: 0, lemburGT2: 0, potongan: null },
        { no: 2, id: "A2", nama: "Aktif Dua", unit, bagian: "Test", gapok: 200, kehadiran: 0.5, lemburLE2: 0, lemburGT2: 0, potongan: null },
      ];
    },
    save: async (payload) => { calls.push({ kind: "save", ...payload }); return { success: true, message: "ok" }; },
  };
  const { useTabsStore, clearedSessions } = muatTabsStore();
  const store = useTabsStore();
  const view = compileGajiView({ prosesGajiApi: api, feedback, captured, konfirmasi, tabsStore: store });
  store.openTab({ title: "Dashboard", path: "/", closable: false });
  store.openTab({ title: "Gaji", path: GAJI_PATH, closable: true });
  const router = vueRouter.createRouter({
    history: vueRouter.createMemoryHistory(),
    routes: [
      { path: "/", component: { render: () => vue.h("p", "dashboard") } },
      { path: GAJI_PATH, component: view },
      { path: "/menu-test", component: { render: () => vue.h("p", "menu") } },
    ],
  });
  router.afterEach((to, _from, failure) => {
    if (failure) return;
    store.openTab({ title: to.path, path: to.path, closable: to.path !== "/" });
  });
  await router.push(GAJI_PATH);
  await router.isReady();
  const tabView = compileTabView(store);
  const env = mountView({ render: () => vue.h("div", [vue.h(tabBarStub(store)), vue.h(tabView)]) }, { plugins: [router] });
  return { ...env, calls, feedback, captured, konfirmasi, api, store, router, clearedSessions };
};

const absensiTab = (store) => store.tabs.find(t => t.id === ABSENSI_PATH);
// Array dari dalam vm sandbox punya prototype berbeda, jadi deepEqual biasa
// akan gagal; salin ke array biasa lebih dulu.
const tabIds = (store) => Array.from(store.tabs, t => t.id);

// ── TEST 10: Tarik Absensi ─────────────────────────────────────────────
test("TEST 10: klik Tarik memakai filter aktif, loading mencegah submit ganda, lalu refresh Kehadiran", async () => {
  const calls = [];
  let completePull;
  let hadir = 0;
  const absensiApi = {
    getKaryawan: async (unit, tanggal) => {
      calls.push({ kind: "get", unit, tanggal });
      return [{ no: 1, id: "A1", nama: "Aktif", unit, bagian: "Test", kehadiran: hadir, jamlembur: 2 }];
    },
    tarikWajah: payload => {
      calls.push({ kind: "pull", ...payload });
      return new Promise(resolve => { completePull = result => { hadir = 1; resolve(result); }; });
    },
  };
  const env = await mountAbsensi({ absensiApi });
  const { all, text, flush, unmount } = env;
  try {
    await flush();
    const pullButton = all().find(el => el.type === "button" && text(el).includes("Tarik Absensi"));
    assert.ok(pullButton);
    assert.equal(all().find(el => el.type === "input" && el.props.max === "1").modelValue, 0);
    const selectedDate = calls[0].tanggal;
    assert.equal(calls[0].unit, "SEMUA", "halaman awal memuat seluruh unit");
    const firstClick = pullButton.props.onClick();
    await vue.nextTick();
    assert.equal(pullButton.props.disabled, true);
    assert.match(text(pullButton), /Menarik absensi/);
    await pullButton.props.onClick();
    assert.equal(calls.filter(c => c.kind === "pull").length, 1);
    assert.equal(calls.find(c => c.kind === "pull").pabKode, "SEMUA");
    assert.equal(calls.find(c => c.kind === "pull").tanggal, selectedDate);
    completePull({ success: true, message: "Tarik absensi berhasil. 1 karyawan ditandai hadir.", data: { ditemukan: 1, inserted: 0, updated: 1, skipped: 0 } });
    await firstClick; await flush();
    assert.equal(calls.filter(c => c.kind === "get").length, 2);
    assert.equal(pullButton.props.disabled, false);
    assert.ok(env.feedback.some(f => f.level === "success"));
    assert.equal(all().find(el => el.type === "input" && el.props.max === "1").modelValue, 1);
    assert.equal(all().find(el => el.type === "input" && el.props.type === "number" && !el.props.max).modelValue, 2);
  } finally {
    unmount();
  }
});

// ── TEST 11: guard pindah tab/menu ─────────────────────────────────────
test("TEST 11: perubahan belum disimpan menahan pindah tab, dan chip penanda muncul", async () => {
  const env = await mountAbsensi();
  const { all, text, button, router, store, flush, unmount } = env;
  try {
    await flush();
    // Muat bersih => tidak ada penanda, pindah halaman tidak boleh ditahan.
    assert.equal(all().find(el => el.type === "v-chip"), undefined);
    await router.push("/");
    assert.equal(router.currentRoute.value.path, "/");
    await router.push(ABSENSI_PATH);
    await flush();
    const callsBeforeEdit = env.calls.length;

    // Admin edit manual: kehadiran 0 -> 1 (setara mengetik pada v-model.number).
    env.captured.items[0].kehadiran = 1;
    await flush();
    const chip = all().find(el => el.type === "v-chip");
    assert.ok(chip, "chip 'Belum disimpan' harus tampil");
    assert.match(text(chip), /Belum disimpan/);

    // Pindah tab/menu -> tertahan, dialog konfirmasi terbuka.
    const nav = router.push("/");
    await flush();
    assert.equal(router.currentRoute.value.path, ABSENSI_PATH);
    const dialog = env.dialog();
    assert.equal(dialog.props.modelValue, true);
    assert.match(text(dialog), /belum disimpan akan hilang/);
    assert.equal(env.calls.length, callsBeforeEdit, "tidak boleh reload data saat dialog terbuka");

    // Ya, lanjutkan -> navigasi terjadi, isian manual tidak ikut tersimpan.
    button("Ya, Lanjutkan").forEach(el => el.props.onClick());
    await nav; await flush();
    assert.equal(router.currentRoute.value.path, "/");
    assert.equal(env.calls.length, callsBeforeEdit, "tidak ada request ke backend saat pindah tab");
    assert.ok(absensiTab(store), "tab Absensi tidak boleh ikut tertutup");
  } finally {
    unmount();
  }
});

// ── TEST 12: batal saat ganti filter, dan Save menutup status dirty ─────
test("TEST 12: batal pada ganti filter mengembalikan tampilan, Save menandai sudah tersimpan", async () => {
  const env = await mountAbsensi();
  const { all, text, button, flush, unmount } = env;
  try {
    await flush();
    const tanggalAwal = env.calls[0].tanggal;
    env.captured.items[0].kehadiran = 1;
    await flush();
    assert.ok(all().find(el => el.type === "v-chip"));

    // Admin ganti tanggal -> dialog; batal -> filter dikembalikan, tanpa reload.
    const dateInput = all().find(el => el.type === "input" && el.props.type === "date");
    dateInput.oninput({ target: { value: "2026-01-02" } });
    await flush();
    const dialog = env.dialog();
    assert.equal(dialog.props.modelValue, true);
    assert.match(text(dialog), /Ganti tanggal atau unit/);
    assert.equal(env.calls.length, 1);
    button("Batal").forEach(el => el.props.onClick());
    await flush(); await flush();
    assert.equal(env.calls.length, 1, "batal tidak boleh memuat ulang data");
    assert.equal(env.captured.items[0].kehadiran, 1, "isian manual tetap ada");
    assert.equal(all().find(el => el.type === "input" && el.props.type === "date").modelValue, tanggalAwal);
    assert.equal(env.dialog().props.modelValue, false, "dialog tidak muncul lagi");
    assert.ok(all().find(el => el.type === "v-chip"), "masih belum disimpan");

    // Save -> fingerprint disegarkan, penanda hilang dan tidak ada dialog lagi.
    await button("Save")[0].props.onClick();
    await flush();
    assert.equal(env.calls.find(c => c.kind === "save").tanggal, tanggalAwal);
    assert.equal(all().find(el => el.type === "v-chip"), undefined);
    assert.equal(env.dialog().props.modelValue, false);
  } finally {
    unmount();
  }
});

// ── TEST 13 (A): dirty + klik X + Batal -> tab tetap terbuka ───────────
test("TEST 13: Absensi belum tersimpan, klik X lalu Batal -> tab tetap terbuka dan edit utuh", async () => {
  const env = await mountAbsensi();
  const { captured, store, clearedSessions, button, flush, unmount } = env;
  try {
    await flush();
    captured.items[0].kehadiran = 1;
    await flush();

    env.tabClose(ABSENSI_PATH).props.onClick();
    await flush();
    assert.equal(env.dialog().props.modelValue, true, "dialog konfirmasi tutup tab harus muncul");
    // Dialog harus yang milik penutupan tab, bukan dialog pindah halaman yang
    // kebetulan muncul belakangan akibat route ikut berganti.
    assert.match(env.text(env.dialog()), /Tutup tab ini\?/);
    assert.ok(absensiTab(store), "tab tidak boleh tertutup sebelum dijawab");
    assert.deepEqual(clearedSessions, [], "state view tidak boleh di-reset sebelum dijawab");

    button("Batal").forEach(el => el.props.onClick());
    await flush();
    assert.ok(absensiTab(store), "setelah Batal tab Absensi harus tetap ada");
    assert.equal(store.activeTabId, ABSENSI_PATH, "route/tab aktif tidak boleh berubah");
    assert.equal(env.router.currentRoute.value.path, ABSENSI_PATH);
    assert.equal(captured.items[0].kehadiran, 1, "edit manual harus utuh");
    assert.deepEqual(clearedSessions, [], "tidak ada state view yang di-reset");
    assert.equal(env.dialog().props.modelValue, false);
  } finally {
    unmount();
  }
});

// ── TEST 14 (B): dirty + klik X + Tinggalkan -> tab tertutup ───────────
test("TEST 14: Absensi belum tersimpan, klik X lalu Ya -> tab tertutup", async () => {
  const env = await mountAbsensi();
  const { captured, store, clearedSessions, button, flush, unmount } = env;
  try {
    await flush();
    captured.items[0].kehadiran = 1;
    await flush();

    env.tabClose(ABSENSI_PATH).props.onClick();
    await flush();
    assert.equal(env.dialog().props.modelValue, true);
    assert.match(env.text(env.dialog()), /Tutup tab ini\?/);
    assert.equal(env.dialogOpens.length, 1, "hanya satu dialog untuk satu aksi");

    button("Ya, Lanjutkan").forEach(el => el.props.onClick());
    await flush(); await flush();
    assert.equal(absensiTab(store), undefined, "tab harus tertutup");
    assert.deepEqual(clearedSessions, [ABSENSI_PATH], "state view tab harus dibersihkan");
    assert.equal(store.activeTabId, "/", "tab aktif pindah ke tab yang tersisa");
    assert.equal(env.router.currentRoute.value.path, "/", "route mengikuti tab aktif");
  } finally {
    unmount();
  }
});

// ── TEST 15 (C): clean + klik X -> langsung tertutup, tanpa dialog ─────
test("TEST 15: Absensi tanpa perubahan, klik X -> langsung tertutup tanpa dialog", async () => {
  const env = await mountAbsensi();
  const { store, flush, unmount } = env;
  try {
    await flush();
    assert.equal(env.dialog().props.modelValue, false);
    env.tabClose(ABSENSI_PATH).props.onClick();
    await flush();
    assert.equal(absensiTab(store), undefined, "harus langsung tertutup");
    assert.equal(env.dialogShown(), false, "tidak boleh ada dialog");
    assert.deepEqual(tabIds(store), ["/"]);
  } finally {
    unmount();
  }
});

// ── TEST 16 (D): setelah Save + klik X -> langsung tertutup ────────────
test("TEST 16: setelah Save berhasil, klik X -> langsung tertutup tanpa dialog", async () => {
  const env = await mountAbsensi();
  const { captured, store, button, flush, unmount } = env;
  try {
    await flush();
    captured.items[0].kehadiran = 1;
    await flush();
    assert.ok(env.dialog().props.modelValue === false);
    assert.ok(env.all().find(el => el.type === "v-chip"), "sebelum Save harus terdirty");

    await button("Save")[0].props.onClick();
    await flush();
    assert.equal(env.calls.filter(c => c.kind === "save").length, 1);
    assert.equal(env.all().find(el => el.type === "v-chip"), undefined, "dirty state harus kembali false");

    env.tabClose(ABSENSI_PATH).props.onClick();
    await flush();
    assert.equal(absensiTab(store), undefined, "tab harus langsung tertutup");
    assert.equal(env.dialogShown(), false, "tidak boleh ada dialog setelah Save");
  } finally {
    unmount();
  }
});

// ── TEST 17 (E): tab lain tetap bisa ditutup seperti sebelumnya ────────
test("TEST 17: tab halaman lain tanpa guard tetap tertutup sinkron seperti sebelumnya", async () => {
  const env = await mountAbsensi({ extraTabs: [{ title: "Barang", path: "/transaksi/barang", closable: true }] });
  const { store, clearedSessions, flush, unmount } = env;
  try {
    await flush();
    assert.deepEqual(tabIds(store), ["/", ABSENSI_PATH, "/transaksi/barang"]);

    // Tab tanpa guard: closes sinkron, return boolean (bukan Promise).
    const result = store.closeTab("/transaksi/barang");
    assert.equal(result, true, "tanpa guard harus tetap sinkron");
    assert.equal(store.tabs.some(t => t.id === "/transaksi/barang"), false);
    assert.deepEqual(clearedSessions, ["/transaksi/barang"]);

    // Tab tidak bisa ditutup (Dashboard) tetap ditolak.
    assert.equal(store.closeTab("/"), false);
    assert.ok(store.tabs.some(t => t.id === "/"));

    // "Tutup Tab Lain" dari tab Absensi: tab non-closable (Dashboard) tetap
    // dipertahankan seperti sebelumnya, dan tidak ada dialog karena tidak ada
    // tab lain yang punya guard.
    env.action("other").props.onClick();
    await flush(); await flush();
    assert.deepEqual(tabIds(store), ["/", ABSENSI_PATH], "tab closable lain sudah tertutup");
    assert.equal(env.dialogShown(), false, "tab lain tidak memicu dialog");
  } finally {
    unmount();
  }
});

// ── TEST 18 (F): tidak ada double dialog route guard + close guard ─────
test("TEST 18: tutup tab yang disetujui tidak memunculkan dialog kedua dari route guard", async () => {
  const env = await mountAbsensi();
  const { captured, store, button, flush, unmount } = env;
  try {
    await flush();
    captured.items[0].kehadiran = 1;
    await flush();

    env.tabClose(ABSENSI_PATH).props.onClick();
    await flush();
    const dialog = env.dialog();
    assert.equal(dialog.props.modelValue, true);
    assert.match(env.text(dialog), /Tutup tab ini\?/);
    const beforeCount = env.dialogOpens.length;

    button("Ya, Lanjutkan").forEach(el => el.props.onClick());
    await flush(); await flush(); await flush();
    assert.equal(absensiTab(store), undefined, "tab tertutup");
    assert.equal(env.router.currentRoute.value.path, "/", "route sudah pindah");
    // Halaman sudah di-unmount (pindah ke Dashboard), jadi elemen dialog hilang.
    // Yang membuktikan tidak ada dialog kedua adalah jumlah pembukaannya.
    assert.equal(env.dialog(), undefined, "halaman sudah pindah");
    assert.equal(env.dialogOpens.length, beforeCount, "dialog tidak boleh dibuka kedua kali");
  } finally {
    unmount();
  }
});

// ── TEST 19: guard tetap bekerja setelah Batal, dan resetTabs melepas ──
test("TEST 19: Batal pada tutup tab tidak merusak guard untuk percobaan berikutnya", async () => {
  const env = await mountAbsensi();
  const { captured, store, button, flush, unmount } = env;
  try {
    await flush();
    captured.items[0].kehadiran = 1;
    await flush();

    env.tabClose(ABSENSI_PATH).props.onClick();
    await flush();
    button("Batal").forEach(el => el.props.onClick());
    await flush();
    assert.ok(absensiTab(store));

    // Percobaan kedua langsung disetujui: dialog muncul sekali lagi.
    env.tabClose(ABSENSI_PATH).props.onClick();
    await flush();
    assert.equal(env.dialog().props.modelValue, true);
    button("Ya, Lanjutkan").forEach(el => el.props.onClick());
    await flush(); await flush();
    assert.equal(absensiTab(store), undefined);
  } finally {
    unmount();
  }
});

// ── TEST 20: Batal pada pindah menu ─────────────────────────────────────
// Navigasi yang dibatalkan guard tetap memicu router.afterEach (vue-router
// memanggilnya dengan failure). Kalau afterEach tidak memeriksa `failure`,
// halaman yang batal ikut dibuatkan tab, TabView lalu mencoba push lagi, dan
// dialog muncul dua kali.
test("TEST 20: Batal pada pindah menu tidak membuat tab hantu dan tidak mengulang dialog", async () => {
  const env = await mountAbsensi({ menuRoutes: [{ path: GAJI_PATH, label: "gaji" }] });
  const { captured, store, router, button, flush, unmount } = env;
  try {
    await flush();
    captured.items[0].kehadiran = 1;
    await flush();

    // Sama seperti v-list-item :to di sidebar DefaultLayout.
    router.push(GAJI_PATH).catch(() => {});
    await flush();
    assert.equal(env.dialog().props.modelValue, true);
    assert.match(env.text(env.dialog()), /Keluar dari halaman ini\?/);
    assert.equal(env.dialogOpens.length, 1);

    button("Batal").forEach(el => el.props.onClick());
    await flush(); await flush(); await flush();

    assert.equal(env.dialogOpens.length, 1, "dialog tidak boleh dibuka ulang");
    assert.equal(store.tabs.find(t => t.id === GAJI_PATH), undefined, "halaman yang batal tidak boleh jadi tab");
    assert.equal(tabIds(store).length, 2, "jumlah tab tidak berubah");
    assert.equal(store.activeTabId, ABSENSI_PATH, "tab aktif tetap Absensi");
    assert.equal(router.currentRoute.value.path, ABSENSI_PATH, "route tetap Absensi");
    assert.equal(captured.items[0].kehadiran, 1, "edit manual tetap utuh");
    assert.ok(absensiTab(store), "tab Absensi tetap terbuka");
  } finally {
    unmount();
  }
});

// ── TEST 21: pindah menu yang disetujui tetap berfungsi normal ──────────
test("TEST 21: pindah menu yang disetujui membuka tab dan merender halamannya", async () => {
  const env = await mountAbsensi({ menuRoutes: [{ path: GAJI_PATH, label: "gaji" }] });
  const { store, router, button, flush, unmount } = env;
  try {
    await flush();
    env.captured.items[0].kehadiran = 1;
    await flush();

    router.push(GAJI_PATH).catch(() => {});
    await flush();
    assert.equal(env.dialogOpens.length, 1);
    button("Ya, Lanjutkan").forEach(el => el.props.onClick());
    await flush(); await flush(); await flush();

    assert.equal(env.dialogOpens.length, 1, "tidak boleh ada dialog kedua");
    assert.ok(store.tabs.find(t => t.id === GAJI_PATH), "tab Gaji terbuka");
    assert.equal(store.activeTabId, GAJI_PATH);
    assert.equal(router.currentRoute.value.path, GAJI_PATH);
    assert.match(env.text(env.all()[0]), /gaji/, "halaman tujuan benar-benar dirender");
  } finally {
    unmount();
  }
});

// ── TEST 22: Batal pada pindah tab ──────────────────────────────────────
// TabBar menandai tab aktif sebelum TabView melakukan push, jadi kalau
// navigasi ditolak, tab aktif harus dikembalikan ke route yang sedang tampil.
test("TEST 22: Batal pada pindah tab mengembalikan tab aktif ke route yang sedang tampil", async () => {
  const env = await mountAbsensi();
  const { captured, store, router, button, flush, unmount } = env;
  try {
    await flush();
    captured.items[0].kehadiran = 1;
    await flush();

    store.setActiveTab("/"); // TabBar.onTabClick -> TabView yang push
    await flush();
    assert.equal(env.dialog().props.modelValue, true);
    assert.equal(env.dialogOpens.length, 1);

    button("Batal").forEach(el => el.props.onClick());
    await flush(); await flush(); await flush();

    assert.equal(store.activeTabId, ABSENSI_PATH, "tab aktif harus balik ke Absensi");
    assert.equal(router.currentRoute.value.path, ABSENSI_PATH, "route tetap Absensi");
    assert.equal(captured.items[0].kehadiran, 1, "edit manual tetap utuh");
    assert.equal(env.dialogOpens.length, 1);
  } finally {
    unmount();
  }
});

// ── TEST 23: TEST 22 memakai TabView asli, bukan tiruan ─────────────────
test("TEST 23: TabView asli mengembalikan tab aktif saat navigasi ditolak", async () => {
  const env = await mountAbsensi({ realTabView: true });
  const { captured, store, router, button, flush, unmount } = env;
  try {
    await flush();
    assert.match(env.text(env.all()[0]), /Tarik Absensi/, "Absensi ter-render lewat TabView asli");
    captured.items[0].kehadiran = 1;
    await flush();

    store.setActiveTab("/");
    await flush();
    assert.equal(env.dialogOpens.length, 1);
    button("Batal").forEach(el => el.props.onClick());
    await flush(); await flush(); await flush();

    assert.equal(store.activeTabId, ABSENSI_PATH, "tab aktif harus balik ke Absensi");
    assert.equal(router.currentRoute.value.path, ABSENSI_PATH);
    assert.equal(captured.items[0].kehadiran, 1, "edit manual tetap utuh");
    assert.equal(env.dialogOpens.length, 1);

    // Disetujui: navigasi benar-benar pindah, tab ikut berganti.
    store.setActiveTab("/");
    await flush();
    button("Ya, Lanjutkan").forEach(el => el.props.onClick());
    await flush(); await flush(); await flush();
    assert.equal(router.currentRoute.value.path, "/");
    assert.equal(store.activeTabId, "/");
    assert.equal(env.dialogOpens.length, 2, "hanya boleh satu dialog per perpindahan");
  } finally {
    unmount();
  }
});

// Fixture tanpa isian apa pun supaya terlihat jelas kapan Save dibuka.
const kosongkan = (payloadCalls) => ({
  getKaryawan: async (unit) => [{ no: 1, id: "A1", nama: "Aktif", unit, bagian: "Test", kehadiran: null, jamlembur: null }],
  save: async payload => { payloadCalls.push({ kind: "save", ...payload }); return { success: true, message: "ok" }; },
  tarikWajah: async () => ({ success: true, message: "ok", data: { ditemukan: 0, inserted: 0, updated: 0, skipped: 0 } }),
});

// ── TEST 24: Save untuk lembur saja ─────────────────────────────────────
test("TEST 24: jam lembur saja sudah cukup untuk mengaktifkan dan menjalankan Save", async () => {
  const payloadCalls = [];
  const env = await mountAbsensi({ absensiApi: kosongkan(payloadCalls) });
  const { captured, all, text, button, flush, unmount } = env;
  try {
    await flush();
    const save = () => all().find(el => el.type === "button" && text(el).includes("Save"));
    assert.equal(save().props.disabled, true, "Save mati saat belum ada isian sama sekali");

    captured.items[0].jamlembur = 3;
    await flush();
    assert.ok(all().find(el => el.type === "v-chip"), "perubahan lembur harus menandai belum disimpan");
    assert.equal(save().props.disabled, false, "lembur saja harus bisa disimpan");

    await button("Save")[0].props.onClick();
    await flush();
    assert.equal(payloadCalls.length, 1, "harus ada satu request save");
    assert.equal(payloadCalls[0].items[0].jamlembur, 3);
    assert.equal(payloadCalls[0].items[0].kehadiran, null, "kehadiran kosong ikut terkirim, bukan diubah jadi 0");
    assert.equal(all().find(el => el.type === "v-chip"), undefined, "penanda hilang setelah Save");
  } finally {
    unmount();
  }
});

// ── TEST 25: kehadiran setengah hari ────────────────────────────────────
test("TEST 25: kehadiran menerima 0.5 dan 2, menolak nilai di luar 0/0.5/1/2", async () => {
  const payloadCalls = [];
  const env = await mountAbsensi({ absensiApi: kosongkan(payloadCalls) });
  const { captured, all, text, flush, unmount } = env;
  try {
    await flush();
    const hadir = all().find(el => el.type === "input" && el.props.max === "2");
    assert.equal(hadir.props.step, "0.5", "input harus memakai langkah 0.5 untuk nilai 0, 0.5, 1, 2");
    const save = () => all().find(el => el.type === "button" && text(el).includes("Save"));

    captured.items[0].kehadiran = 0.5;
    await flush();
    assert.equal(save().props.disabled, false);
    await save().props.onClick();
    await flush();
    assert.equal(payloadCalls.length, 1);
    assert.equal(payloadCalls[0].items[0].kehadiran, 0.5, "setengah hari harus tersimpan apa adanya");

    captured.items[0].kehadiran = 2;
    await flush();
    await save().props.onClick();
    await flush();
    assert.equal(payloadCalls.length, 2);
    assert.equal(payloadCalls[1].items[0].kehadiran, 2, "nilai 2 harus tersimpan apa adanya");

    // Nilai di luar daftar ditolak di frontend, jadi tidak sampai ke backend.
    for (const value of [0.3, 1.5, -1]) {
      captured.items[0].kehadiran = value;
      await flush();
      assert.equal(save().props.disabled, false, `${value} tetap boleh diklik supaya bisa ditolak dengan pesan`);
      await save().props.onClick();
      await flush();
      assert.equal(payloadCalls.length, 2, `nilai ${value} tidak boleh terkirim`);
      const warning = env.feedback.filter(f => f.level === "warning").at(-1);
      assert.match(warning.text, /Kehadiran hanya boleh diisi 0, 0\.5, 1, atau 2\./, `pesan tolak untuk ${value}`);
    }
  } finally {
    unmount();
  }
});

// ── TEST 26: kosongkan kembali kehadiran & lembur ───────────────────────
// Kosongnya SELURUH tabel dulu tidak bisa disimpan karena tombol Save memakai
// "ada isian" sebagai syarat. Padahal itulah cara mengembalikan nilai ke NULL.
const terisiSemua = (payloadCalls) => ({
  getKaryawan: async (unit) => [
    { no: 1, id: "A1", nama: "Aktif", unit, bagian: "Test", kehadiran: 1, jamlembur: 2 },
    { no: 2, id: "A2", nama: "Aktif Dua", unit, bagian: "Test", kehadiran: 0.5, jamlembur: 1 },
  ],
  save: async payload => { payloadCalls.push({ kind: "save", ...payload }); return { success: true, message: "ok" }; },
  tarikWajah: async () => ({ success: true, message: "ok", data: { ditemukan: 0, inserted: 0, updated: 0, skipped: 0 } }),
});

test("TEST 26: mengosongkan seluruh isian tetap bisa disimpan setelah dikonfirmasi", async () => {
  const payloadCalls = [];
  const env = await mountAbsensi({ absensiApi: terisiSemua(payloadCalls) });
  const { captured, all, text, button, flush, unmount } = env;
  try {
    await flush();
    const save = () => all().find(el => el.type === "button" && text(el).includes("Save"));
    assert.equal(save().props.disabled, true, "Save mati saat tabel sama persis dengan hasil muat");

    // Admin mengosongkan kehadiran dan lembur keduanya di semua baris.
    for (const item of captured.items) { item.kehadiran = null; item.jamlembur = null; }
    await flush();
    assert.ok(all().find(el => el.type === "v-chip"), "perubahan harus tetap ditandai belum disimpan");
    assert.equal(save().props.disabled, false, "Save harus terbuka meski tidak ada isian tersisa");

    // Batal di konfirmasi -> tidak ada request, isian tetap kosong di layar.
    env.konfirmasi.jawab(false);
    await save().props.onClick();
    await flush();
    assert.equal(payloadCalls.length, 0, "menolak konfirmasi tidak boleh menyimpan");
    assert.match(env.konfirmasi.riwayat.at(-1), /mengosongkan seluruh data absensi/, "konfirmasi harus menjelaskan akibatnya");
    assert.equal(captured.items[0].kehadiran, null, "nilai tetap kosong di layar");

    // Lanjutkan -> request tetap dikirim dan status dirty selesai.
    env.konfirmasi.jawab(true);
    await save().props.onClick();
    await flush();
    assert.equal(payloadCalls.length, 1, "harus ada satu request save");
    assert.equal(payloadCalls[0].items.length, 2, "semua baris tetap ikut terkirim");
    for (const item of payloadCalls[0].items) {
      assert.equal(item.kehadiran, null);
      assert.equal(item.jamlembur, null);
    }
    assert.ok(env.feedback.some(f => f.level === "success" && /dikosongkan/.test(f.text)));
    assert.equal(all().find(el => el.type === "v-chip"), undefined, "penanda hilang setelah Save");
  } finally {
    unmount();
  }
});

test("TEST 26b: mengosongkan sebagian baris tidak memicu konfirmasi", async () => {
  const payloadCalls = [];
  const env = await mountAbsensi({ absensiApi: terisiSemua(payloadCalls) });
  const { captured, all, text, button, flush, unmount } = env;
  try {
    await flush();
    // Hanya A1 yang dikosongkan; A2 masih punya nilai.
    captured.items[0].kehadiran = null;
    captured.items[0].jamlembur = null;
    await flush();
    await all().find(el => el.type === "button" && text(el).includes("Save")).props.onClick();
    await flush();
    assert.equal(payloadCalls.length, 1);
    assert.deepEqual(env.konfirmasi.riwayat, [], "tidak perlu konfirmasi kalau masih ada isian lain");
    assert.equal(payloadCalls[0].items[0].kehadiran, null);
    assert.equal(payloadCalls[0].items[1].kehadiran, 0.5, "baris lain tidak boleh ikut berubah");
  } finally {
    unmount();
  }
});

// ── TEST 27: potongan bisa dikosongkan kembali ──────────────────────────
test("TEST 27: mengosongkan semua potongan bisa disimpan setelah konfirmasi", async () => {
  const payloadCalls = [];
  const env = await mountGaji({ prosesGajiApi: {
    getData: async (unit, periode1, periode2) => {
      payloadCalls.push({ kind: "get", unit, periode1, periode2 });
      return [
        { no: 1, id: "A1", nama: "Aktif Satu", unit, bagian: "Test", gapok: 100, kehadiran: 1, lemburLE2: 0, lemburGT2: 0, potongan: 50000 },
        { no: 2, id: "A2", nama: "Aktif Dua", unit, bagian: "Test", gapok: 200, kehadiran: 0.5, lemburLE2: 0, lemburGT2: 0, potongan: 0 },
      ];
    },
    save: async payload => { payloadCalls.push({ kind: "save", ...payload }); return { success: true, message: "ok" }; },
  } });
  const { captured, all, text, button, flush, unmount } = env;
  try {
    await flush();
    assert.equal(payloadCalls.filter(c => c.kind === "get").length, 1, "halaman harus memuat data saat mount");
    const save = () => all().find(el => el.type === "button" && text(el).includes("Save"));
    assert.equal(save().props.disabled, true, "Save mati saat belum ada perubahan");

    for (const item of captured.items) { item.potongan = null; }
    await flush();
    assert.equal(save().props.disabled, false, "Save harus terbuka setelah semua potongan dikosongkan");

    env.konfirmasi.jawab(false);
    await save().props.onClick();
    await flush();
    assert.equal(payloadCalls.filter(c => c.kind === "save").length, 0, "menolak konfirmasi tidak boleh menyimpan");
    assert.match(env.konfirmasi.riwayat.at(-1), /mengosongkan seluruh data potongan/);

    env.konfirmasi.jawab(true);
    await save().props.onClick();
    await flush();
    const saved = payloadCalls.filter(c => c.kind === "save");
    assert.equal(saved.length, 1, "harus ada satu request save");
    assert.deepEqual(saved[0].items.map(i => i.potongan), [null, null], "potongan kosong harus terkirim apa adanya");
    assert.ok(env.feedback.some(f => f.level === "success" && /dikosongkan/.test(f.text)));
    assert.equal(save().props.disabled, true, "setelah Save, tombol kembali mati");
  } finally {
    unmount();
  }
});

test("TEST 28: potongan dirty menahan menu/tab; Batal menjaga isian dan tidak membuat tab hantu", async () => {
  const env = await mountGaji();
  try {
    await env.flush();
    assert.equal(env.all().find(el => el.type === "v-chip"), undefined);
    env.captured.items[0].potongan = 15000;
    await env.flush();
    assert.ok(env.all().find(el => el.type === "v-chip"));
    const nav = env.router.push("/menu-test");
    await env.flush();
    assert.match(env.text(env.dialog()), /Perubahan potongan yang belum disimpan/);
    env.button("Batal")[0].props.onClick();
    await nav; await env.flush();
    assert.equal(env.router.currentRoute.value.path, GAJI_PATH);
    assert.equal(env.store.tabs.some(t => t.path === "/menu-test"), false);
    assert.equal(env.captured.items[0].potongan, 15000);

    env.store.setActiveTab("/");
    await env.flush();
    env.button("Batal")[0].props.onClick();
    await env.flush(); await env.flush();
    assert.equal(env.store.activeTabId, GAJI_PATH);
    assert.equal(env.router.currentRoute.value.path, GAJI_PATH);
    assert.equal(env.captured.items[0].potongan, 15000);
    assert.equal(env.dialogOpens.length, 2);

    const lanjut = env.router.push("/menu-test");
    await env.flush();
    env.button("Ya, Lanjutkan")[0].props.onClick();
    await lanjut; await env.flush();
    assert.equal(env.router.currentRoute.value.path, "/menu-test");
    assert.equal(env.calls.filter(c => c.kind === "save").length, 0);
  } finally { env.unmount(); }
});

test("TEST 29: X Gaji meminta warning sekali; Batal tetap terbuka, Ya menutup tanpa dialog kedua", async () => {
  const env = await mountGaji();
  try {
    await env.flush();
    env.captured.items[0].potongan = 1000;
    await env.flush();
    env.tabClose(GAJI_PATH).props.onClick();
    await env.flush();
    assert.match(env.text(env.dialog()), /Tutup tab ini\? Perubahan potongan/);
    env.button("Batal")[0].props.onClick();
    await env.flush();
    assert.ok(env.store.tabs.some(t => t.id === GAJI_PATH));
    assert.equal(env.captured.items[0].potongan, 1000);
    assert.deepEqual(env.clearedSessions, []);
    env.tabClose(GAJI_PATH).props.onClick();
    await env.flush();
    env.button("Ya, Lanjutkan")[0].props.onClick();
    await env.flush(); await env.flush();
    assert.equal(env.store.tabs.some(t => t.id === GAJI_PATH), false);
    assert.equal(env.router.currentRoute.value.path, "/");
    assert.equal(env.dialogOpens.length, 2, "satu dialog per percobaan tutup");
  } finally { env.unmount(); }
});

test("TEST 30: Save potongan menghapus warning; tab bersih langsung ditutup", async () => {
  const env = await mountGaji();
  try {
    await env.flush();
    env.captured.items[0].potongan = 0;
    await env.flush();
    await env.button("Save")[0].props.onClick();
    await env.flush();
    assert.equal(env.all().find(el => el.type === "v-chip"), undefined);
    env.tabClose(GAJI_PATH).props.onClick();
    await env.flush(); await env.flush();
    assert.equal(env.store.tabs.some(t => t.id === GAJI_PATH), false);
    assert.equal(env.dialogOpens.length, 0);
  } finally { env.unmount(); }
});

test("TEST 31: Tutup Semua Tab juga melindungi potongan belum tersimpan", async () => {
  const env = await mountGaji();
  try {
    await env.flush();
    env.captured.items[0].potongan = 100;
    await env.flush();
    env.action("all").props.onClick();
    await env.flush();
    env.button("Batal")[0].props.onClick();
    await env.flush();
    assert.ok(env.store.tabs.some(t => t.id === GAJI_PATH));
    assert.equal(env.captured.items[0].potongan, 100);
  } finally { env.unmount(); }
});

test("TEST 33: filter SEMUA memuat semua unit dan mengirim satu request Tarik Absensi", async () => {
  const calls = [];
  const env = await mountAbsensi({ absensiApi: {
    getKaryawan: async (unit, tanggal) => {
      calls.push({ kind: "get", unit, tanggal });
      return unit === "SEMUA" ? [
        { id: "A1", unit: "U1", kehadiran: 1, jamlembur: null },
        { id: "B1", unit: "U2", kehadiran: 1, jamlembur: 2 },
      ] : [{ id: "A1", unit, kehadiran: 1, jamlembur: null }];
    },
    tarikWajah: async payload => {
      calls.push({ kind: "pull", ...payload });
      return { success: true, message: "ok", data: { ditemukan: 2, inserted: 1, updated: 1, skipped: 0 } };
    },
    save: async payload => { calls.push({ kind: "save", ...payload }); },
  } });
  try {
    await env.flush();
    assert.ok(env.all().find(el => el.type === "option" && el.props.value === "SEMUA"));
    env.all().find(el => el.type === "select").onchange({ target: { value: "SEMUA" } });
    await env.flush();
    assert.equal(calls.at(-1).unit, "SEMUA");
    assert.equal(env.captured.items.length, 2);
    await env.button("Tarik Absensi")[0].props.onClick();
    await env.flush();
    const pulls = calls.filter(c => c.kind === "pull");
    assert.equal(pulls.length, 1);
    assert.equal(pulls[0].pabKode, "SEMUA");
    assert.equal(calls.at(-1).kind, "get");
    assert.equal(calls.at(-1).unit, "SEMUA");
    env.captured.items[1].jamlembur = 3;
    await env.flush();
    await env.button("Save")[0].props.onClick();
    assert.equal(calls.at(-1).pabKode, "SEMUA");
    assert.equal(calls.at(-1).items[1].unit, "U2");
  } finally { env.unmount(); }
});

test("Gaji: opsi SEMUA menjadi default dan Save mengirim SEMUA", async () => {
  const env = await mountGaji();
  try {
    await env.flush();
    const option = env.all().find(el => el.type === "option" && el.props.value === "SEMUA");
    assert.ok(option);
    assert.equal(env.text(option), "SEMUA");
    assert.equal(env.calls.find(c => c.kind === "get").unit, "SEMUA");
    env.captured.items[0].potongan = 1000;
    await env.flush();
    await env.button("Save")[0].props.onClick();
    assert.equal(env.calls.find(c => c.kind === "save").pabKode, "SEMUA");
  } finally { env.unmount(); }
});

test("TEST 32: data Gaji hasil muat tidak memicu warning, Save gagal tetap dirty", async () => {
  const env = await mountGaji();
  try {
    await env.flush();
    await env.router.push("/");
    await env.router.push(GAJI_PATH);
    await env.flush();
    assert.equal(env.dialogOpens.length, 0);
    env.captured.items[0].potongan = 100;
    env.api.save = async () => { throw new Error("fixture gagal"); };
    await env.flush();
    await env.button("Save")[0].props.onClick();
    await env.flush();
    assert.ok(env.all().find(el => el.type === "v-chip"));
    env.tabClose(GAJI_PATH).props.onClick();
    await env.flush();
    assert.equal(env.dialog().props.modelValue, true);
    env.button("Batal")[0].props.onClick();
    await env.flush();
    assert.equal(env.captured.items[0].potongan, 100);
  } finally { env.unmount(); }
});
