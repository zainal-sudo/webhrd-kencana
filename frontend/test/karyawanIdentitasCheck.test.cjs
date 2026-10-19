const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../src/views/master/KaryawanForm.vue'), 'utf8');
const ref = v => ({ value: v });

/** Jalankan fungsi async dari form dengan api/values tiruan. */
async function jalankanFungsi(nama, contextExtra = {}) {
  const fn = source.match(new RegExp(`async function ${nama}\\(\\) \\{[\\s\\S]*?\\n\\}`))[0]
    .replace(/: PemakaiIdentitas\[\]/g, '')
    .replace(/: string\b/g, '');
  const cekIdentitasAktif = contextExtra.cekIdentitasAktif ?? ref([]);
  const cekIdentitasRiwayat = contextExtra.cekIdentitasRiwayat ?? ref([]);
  const context = {
    String, api: { get: async () => ({ data: { data: { ditemukan: [] } } }) },
    values: { kar_noidentitas: '' }, isEdit: ref(false), nik: ref(''), identitasAwal: ref(''),
    cekIdentitasAktif, cekIdentitasRiwayat, cekIdentitasJalan: ref(false),
    cekIdentitasSeq: 0, cekIdentitasDibatalkan: false,
    resetCekIdentitas() { cekIdentitasAktif.value = []; cekIdentitasRiwayat.value = []; },
    ...contextExtra,
  };
  vm.createContext(context);
  await vm.runInContext(`(async () => { ${fn.replace(`async function ${nama}()`, `globalThis.jalan = async function ${nama}()`)} })(); jalan();`, context);
  return context;
}

test('Pre-check memanggil endpoint cek-identitas dan memisahkan aktif vs riwayat', async () => {
  let paramsDipanggil = null;
  const ctx = await jalankanFungsi('jalankanCekIdentitas', {
    values: { kar_noidentitas: '3309' },
    api: { get: async (url, opts) => { paramsDipanggil = { url, params: opts.params }; return { data: { data: { ditemukan: [
      { nik: '009', nama: 'Aktif Orang', aktif: true, tgl_masuk: null, tgl_keluar: null },
      { nik: '008', nama: 'Pernah Kerja', aktif: false, tgl_masuk: '2018-01-01', tgl_keluar: '2021-01-01' },
    ] } } }; } },
  });
  assert.equal(paramsDipanggil.url, '/master/karyawan/cek-identitas');
  assert.equal(paramsDipanggil.params.noidentitas, '3309');
  assert.equal(ctx.cekIdentitasAktif.value.length, 1);
  assert.equal(ctx.cekIdentitasAktif.value[0].nik, '009');
  assert.equal(ctx.cekIdentitasRiwayat.value.length, 1);
  assert.equal(ctx.cekIdentitasRiwayat.value[0].nik, '008');
});

test('Edit mengirim nik sendiri agar record yang sedang diedit dikecualikan backend', async () => {
  let paramsDipanggil = null;
  await jalankanFungsi('jalankanCekIdentitas', {
    values: { kar_noidentitas: '3309' }, isEdit: ref(true), nik: ref('001'),
    api: { get: async (url, opts) => { paramsDipanggil = opts.params; return { data: { data: { ditemukan: [] } } }; } },
  });
  assert.equal(paramsDipanggil.nik, '001');
});

test('Edit tanpa mengubah identitas tidak memicu pre-check (tidak duplicate diri sendiri)', async () => {
  let dipanggil = false;
  await jalankanFungsi('jalankanCekIdentitas', {
    values: { kar_noidentitas: '3309' }, isEdit: ref(true), nik: ref('001'), identitasAwal: ref('3309'),
    api: { get: async () => { dipanggil = true; return { data: { data: { ditemukan: [] } } }; } },
  });
  assert.equal(dipanggil, false);
});

test('Identitas kosong → state reset, tidak ada request', async () => {
  let dipanggil = false;
  const ctx = await jalankanFungsi('jalankanCekIdentitas', {
    values: { kar_noidentitas: '  ' },
    cekIdentitasAktif: ref([{ nik: 'x' }]),
    api: { get: async () => { dipanggil = true; return { data: { data: { ditemukan: [] } } }; } },
  });
  assert.equal(dipanggil, false);
  assert.equal(ctx.cekIdentitasAktif.value.length, 0);
});

/** Ekstrak blok guard pre-check identitas di dalam simpan(). */
function guardSimpan(contextExtra) {
  const blok = source.match(/const identitasKini = [^;]+;[\s\S]*?\n  \}/)[0];
  const context = { String, Error, values: { kar_noidentitas: '3309' }, isEdit: ref(false), identitasAwal: ref(''), cekIdentitasAktif: ref([]), jalankanCekIdentitas: async () => {}, ...contextExtra };
  vm.createContext(context);
  vm.runInContext(`globalThis.jalan = async function () { ${blok} };`, context);
  return context.jalan();
}

test('Guard simpan: identitas aktif lain → throw dengan pesan blokir', async () => {
  await assert.rejects(() => guardSimpan({ cekIdentitasAktif: ref([{ nik: '009', nama: 'Aktif Orang' }]) }), {
    message: 'No. Identitas ini sudah digunakan oleh karyawan aktif: 009 - Aktif Orang.',
  });
});

test('Guard simpan: case rehire nonaktif TIDAK diblokir (cekIdentitasAktif kosong → lolos)', async () => {
  await assert.doesNotReject(() => guardSimpan({ cekIdentitasAktif: ref([]) }));
});

test('Simpan memanggil tampilan warning backend setelah response sukses', () => {
  assert.match(source, /tampilkkanPeringatanIdentitas\(data\.data\?\.peringatan_identitas\)/);
  const fn = source.match(/function tampilkkanPeringatanIdentitas\([\s\S]*?\n\}/)[0]
    .replace(/\(peringatan\?:[^)]*\)/g, '(peringatan)');
  const toasts = [];
  const context = { String, Array, toast: { warning: m => toasts.push(m) }, formatTanggal: () => '01-01-2021' };
  vm.createContext(context);
  vm.runInContext(`globalThis.jalan = ${fn.replace('function tampilkkanPeringatanIdentitas', 'function')}; jalan([{ nik: '008', nama: 'Pernah Kerja', tgl_keluar: '2021-01-01' }]);`, context);
  assert.equal(toasts.length, 1, 'warning non-blokir tampil sebagai toast');
  assert.match(toasts[0], /008 - Pernah Kerja/);
  assert.match(toasts[0], /keluar 01-01-2021/);
  assert.match(toasts[0], /masuk kembali/);
  // Kosong / undefined → tidak ada toast.
  vm.runInContext('jalan([]); jalan(undefined);', context);
  assert.equal(toasts.length, 1);
});

test('Pesan error/warning dirender dekat field (bukan alert browser native)', () => {
  assert.ok(!/window\.alert|[^.\w]alert\(/.test(source), 'tidak boleh memakai alert native');
  assert.match(source, /cekIdentitasAktif\.length/);
  assert.match(source, /cekIdentitasRiwayat\.length/);
  assert.match(source, /role="alert"/);
  assert.match(source, /role="status"/);
  assert.match(source, /No\. Identitas ini sudah digunakan oleh karyawan aktif/);
  assert.match(source, /pernah terdaftar/);
});

test('Warning/error ikut hilang saat nilai berubah (watch reset + debounce)', () => {
  const watchBody = source.match(/watch\(\s*\(\) => values\.kar_noidentitas,[\s\S]*?\n\}\);/)[0];
  assert.match(watchBody, /resetCekIdentitas\(\)/);
  assert.match(watchBody, /clearTimeout\(cekIdentitasTimer\)/);
  assert.match(watchBody, /setTimeout\(jalankanCekIdentitas, 400\)/);
});
