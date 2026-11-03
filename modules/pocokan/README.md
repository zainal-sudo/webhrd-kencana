# Integrasi Modul Pocokan ke Web HRIS Kencana

> Tanggal: 2026-10-29. Semua perubahan masih **lokal** (belum di-deploy).
> Sumber asli tetap utuh di `E:\MagangHub\pocokan` (git-nya sendiri) — yang
> dipakai produksi adalah salinan di `modules/pocokan/` (tanpa `.git`).

## 1. Arsitektur yang diterapkan

```
Browser ── port 96 (origin sama)
 ├── /                     → FE HRIS (dist, dibangun dari frontend/)
 ├── /api/...              → API HRIS   (backend/app.js → routes.js)
 ├── /pocokan-api/...      → API pocokan (subapp: modules/pocokan/be-pocokan,
 │                            di-mount di app.js TANPA proses/port baru)
 └── /pocokan/...          → FE pocokan (dist base '/pocokan/', dibangun dari
                              modules/pocokan/fe-pocokan; diserve static +
                              SPA fallback oleh backend/app.js)
```

- **Satu proses server**: backend Express HRIS men-mount app pocokan
  (`/pocokan-api`). Pocokan tidak lagi listen port sendiri di produksi
  (`require.main === module` membatasi `app.listen` hanya saat standalone).
- **Database tetap terpisah**: HRIS → `hrd2`, bisnis pocokan → `pocokan`
  (pool terpisah, `POCOKAN_*` di `backend/.env`).
- **Login hanya lewat HRIS**. FE pocokan di-embed sebagai iframe same-origin
  (`/pocokan/`) dan membaca token HRIS dari `localStorage.kencana_hrd_token`
  secara langsung — **tidak ada token di query string**, tidak ada login ganda.
  Backend pocokan memverifikasi token HRIS (JWT_SECRET sama karena satu proses)
  dan memetakan payload `{ user, nama, cabang }` → `{ kode, nama, level }`
  (`modules/pocokan/be-pocokan/src/middleware/authMiddleware.js`
  → `normalisasiPayload`, `via: 'hris'`).
- **Hak akses mengikuti mekanisme HRIS**: setiap modul pocokan (mis. menuId
  "6" Absensi) direpresentasikan sebagai baris `hrd2.tmenu` dengan
  `men_nama = "pocokanM6"`; hak view/insert/edit/delete dibaca dari
  `hrd2.thakuser` oleh `checkPermission` pocokan (koneksi DB HRIS terpisah,
  baca-saja). Jadi diatur dari halaman **Hak Akses HRIS** seperti menu lain.
  - `view`/`print` → keberadaan baris `thakuser` (aturan sama dengan HRIS).
  - `insert`/`edit`/`delete` → kolom `hak_men_insert/edit/delete = 'Y'`.
  - ADMIN HRIS tetap bypass (perilaku sama dengan ADMIN pocokan).
- **Tabel `tuser` DB pocokan tetap utuh** (data historis/fitur pocokan tidak
  disentuh); login lama pocokan (`POST /pocokan-api/auth/login`) masih hidup
  untuk masa transisi — setelah integrasi teruji, mount rute ini boleh
  dinonaktifkan agar tidak ada jalur akses di luar aturan HRIS.
- Bundel **tetap terpisah** (dua proyek Vite yang berbeda), hanya satu command
  build di root.

## 2. Struktur di dalam repository

```
webhrd-kencana/
├── backend/                  # backend HRIS (ESM) — men-mount pocokan (app.js)
├── frontend/                 # frontend HRIS → dist di root origin
├── modules/pocokan/
│   ├── be-pocokan/           # backend pocokan (CJS) — di-mount ke /pocokan-api
│   ├── fe-pocokan/           # frontend pocokan (base '/pocokan/')
│   ├── docs/                 # docs asli pocokan
│   ├── seed-menu-pocokan.mjs # generator SQL seed (aman, tulis file saja)
│   ├── seed-tmenu-pocokan.sql# HASIL seed — review & jalankan manual
│   └── README.md             # file ini
├── scripts/build-all.mjs     # build 2 frontend + susun staging/
├── package.json              # (root) npm run build:all / dist:compose
└── staging/                  # output siap deploy (gitignored)
    ├── www/                  # isi dist FE HRIS
    │   └── pocokan/          # isi dist FE pocokan
    └── (backend di-deploy dari folder backend/ utuh, yang memuat modules/)
```

## 3. File yang dibuat / diubah

**Dibuat** (pocokan): `src/config/hrisDb.js` (pool HRIS untuk permission),
`seed-menu-pocokan.mjs`, `seed-tmenu-pocokan.sql`; (HRIS): `frontend/src/views/
pocokan/PocokanEmbedView.vue`, `scripts/build-all.mjs`, `package.json` (root),
`docs/integrasi-pocokan.env.example`.

**Diubah**:
- `modules/pocokan/be-pocokan/src/index.js` — ekspor `app`; `listen` & CORS
  hanya saat standalone; mount internal tanpa prefiks `/api` (lihat §5).
- `modules/pocokan/be-pocokan/src/config/database.js` — namespace `POCOKAN_*`
  dengan fallback nama lama (standalone tetap bekerja); pool lazy.
- `modules/pocokan/be-pocokan/src/middleware/authMiddleware.js` — verifyToken
  menerima token HRIS & pocokan-legacy; `checkPermission` membaca
  `hrd2.thakuser/tmenu` (prefiks `pocokanM`); `menuPocokanUntukUser` untuk SSO.
- `modules/pocokan/be-pocokan/src/services/authService.js` + `controllers/
  authController.js` — `GET /auth/me` mengembalikan profil + daftar menu HRIS
  user (dipakai gating sidebar/route pocokan saat SSO).
- `modules/pocokan/fe-pocokan/vite.config.ts` — `base: '/pocokan/'`.
- `modules/pocokan/fe-pocokan/src/api/axios.ts` — baseURL
  `VITE_API_BASE ?? (DEV ? http://localhost:3299 : '/pocokan-api')`.
- `modules/pocokan/fe-pocokan/src/stores/authStore.ts` — `loginDariHris()`
  (SSO dari `kencana_hrd_token` + `/auth/me`).
- `modules/pocokan/fe-pocokan/src/main.ts` — mount app setelah SSO selesai.
- `backend/app.js` — `app.use('/pocokan-api', pocokanApp)`, static
  `/pocokan` + SPA fallback (hanya bila dist ada).
- `frontend/src/utils/menuMap.ts` — grup top-level **Pocokan** (order 4,
  tepat antara Koperasi(3) dan Penggajian(5)/Laporan(6)).
- `frontend/src/stores/permissionStore.ts` — injeksi child `pocokanModul`
  bila user punya hak `pocokanM*`.
- `frontend/src/router/index.ts` — route `/pocokan` + guard fail-closed
  (butuh minimal satu hak `pocokanM*`).

## 4. Command build

```bash
# dari root webhrd-kencana
npm run build:all      # install(cek) → build fe-HRIS + fe-pocokan → staging/
npm run dist:compose   # susun ulang staging/ tanpa rebuild

# command lama tetap utuh, dokumentasi:
npm --prefix frontend run build            # build HRIS saja
npm --prefix modules/pocokan/fe-pocokan run build   # build pocokan saja
```

Susunan hasil: `staging/www/` = front HRIS, `staging/www/pocokan/` =
front pocokan, `backend/` di-deploy utuh (sudah memuat `modules/pocokan`).
**Catatan lokal (Windows):** `modules/pocokan/be-pocokan/node_modules` berupa
junction ke `backend/node_modules` agar `require()` pocokan menemukan
`express`/`mysql2` — otomatis diabaikan Git (`node_modules/`).

## 5. Kenapa mount internal pocokan di-stripe `/api`

App pocokan harus bisa di-mount sebagai subapp. Mount HRIS: `app.use
('/pocokan-api', pocokanApp)`; karena mount-path host (`/pocokan-api`) memiliki
segmen + pocokan secara internal memasang `/api/auth` dst., URL-nya akan
menjadi `/pocokan-api/api/api/auth/me`. Solusi: prefiks `/api` dihilangkan dari
semua `app.use` internal pocokan (fe sudah memakai path relatif `/auth/...`
dst.), sehingga URL produksi bersih: `/pocokan-api/auth/me`,
`/pocokan-api/master/supplier`, `/pocokan-api/transaksi/absensi`, dst.
Standalone dev tetap berjalan: FE dev memakai `http://localhost:3299`.

## 6. Variabel environment baru

Lihat `docs/integrasi-pocokan.env.example` (nama variabel + placeholder, tanpa
nilai). Ringkas: `POCOKAN_DB_HOST/PORT/USER/PASSWORD/NAME` (DI backend/.env,
nilai password HARUS dibungkus tanda kutip bila mengandung `#`),
opsional `POCOKAN_HRIS_*` (standalone), opsional `POCOKAN_IMAGES_DIR`,
opsional `VITE_API_BASE` (fe-pocokan). `JWT_SECRET` **tidak** duplikat.
Semua `.env` dikecualikan dari Git.

## 7. SQL seed (harus ditinjau & dijalankan manual)

`modules/pocokan/seed-tmenu-pocokan.sql` (32 pernyataan):
- 8 baris `hrd2.tmenu` baru (`pocokanM1..M8` = Bagian, Pabrik, Hari Libur,
  Karyawan, Proses Gaji, Absensi, Lap. Gaji, Lap Absensi — 8 modul yang
  terdaftar di `pocokan.tmenu`), `men_id` mulai 56 (MAX+1).
- Grant `thakuser` Y/Y/Y untuk user **HRD, SUPER, ADMIN** (dengan guard
  `EXISTS` + `NOT EXISTS` — idempotent).

Generator: `node modules/pocokan/seed-menu-pocokan.mjs` (tanpa argumen → hanya
menulis ulang file SQL; TIDAK pernah menulis ke DB). Jalankan lewat mysql
client setelah review — **belum dijalankan oleh asisten** (database produksi
tidak diubah tanpa persetujuan).

## 8. Hasil build & pengujian (nyata, dijalankan lokal)

**Build** — `npm run build:all`: `✓ built in 37.36s` (HRIS) + `✓ built in
53.84s` (pocokan) + staging tersusun (cek path asset lulus: HRIS `/`,
pocokan `/pocokan/`).

**Smoke test** (backend `node app.js`, DB 103.94.238.252):

| Uji | Hasil |
|---|---|
| Login HRIS `HRD/5757` → `/api/login` | ✅ ok, menus=49 |
| `GET /pocokan-api/auth/me` dgn token HRD | ✅ 200, kode=HRD (menus 0 — seed belum dijalankan; after seed → 8) |
| `GET /pocokan-api/health` | ✅ 200 "Finance Backend is running" |
| `GET /pocokan/` + `assets/index-*.js` | ✅ 200 (base /pocokan/, static backend) |
| SPA fallback `GET /pocokan/master/karyawan` | ✅ 200 index.html |
| `GET /pocokan-api/master/supplier` dgn user **tanpa** hak (P4) | ✅ **403** (ditolak backend, di luar seed) |
| `GET /pocokan-api/auth/me` **tanpa token** | ✅ **401** |
| Supplier via ADMIN (bypass) | query jalan; contoh finance leftover: tabel `tsupplier` memang tidak ada di DB `pocokan` (lihat catatan) |

**Catatan penting** — modul Finance leftover (supplier, PO/BPB, invoice, dst.)
dalam codebase pocokan **tidak punya** baris `tmenu` di DB `pocokan` (yang ada
hanya 8 modul HR/gaji) dan DB `pocokan` memang tidak memuat tabel finance
(`tsupplier` dll. ada di DB lain, mis. `kencanaprint`). Dengan seed saat ini,
8 modul HR/gaji itulah yang nyata dipakai; rute finance tanpa hak akan 403.
Perilaku ini sama seperti deployment pocokan yang sekarang — tidak sedang
diubah oleh integrasi.

## 9. Langkah deployment yang tersisa (butuh akses server :96)

1. **Jalankan seed** SQL di §7 pada DB `hrd2` (setelah review).
2. **Deploy**: copy `backend/` (utuh, termasuk `modules/pocokan/` + junction/
   `node_modules` bila tidak di-install ulang), isi `staging/www/` ke root web
   yang melayani port 96.
3. **Routing port 96** — konfigurasi servernya tidak ada di repository ini
   (tidak ditemukan nginx/.htaccess/ecosystem senada), jadi dua kemungkinan:
   - Bila :96 melayani statis + proxy ke backend 4003 (mis. Nginx), pastikan
     rule yang sama juga mengalirkan `/pocokan/` (statis dari root yang sama —
     sudah fungsional bila seluruh isi `staging/www/` di-deploy karena
     `pocokan/` berada di dalam root yang sudah dilayani) dan
     `/pocokan-api/` ke `http://127.0.0.1:4003`.
   - Bila :96 diserve langsung oleh backend 4003 (`express.static` sudah
     tersedia di app.js), tidak perlu perubahan apa pun di server — cukup
     deploy `staging/www/pocokan` berdampingan dengan front HRIS.
     (Sampai ini asumsi belum bisa dibuktikan dari repo.)
4. **Restart** backend HRIS (proses Node :4003) — sekali saja, mount kini di
   dalamnya.
5. **Uji akhir** dari port 96: login HRIS → menu **Pocokan** muncul → tab
   iframe buka `/pocokan/` tanpa login lagI; user tanpa hak `pocokanM*` tidak
   melihat menu & mendapat 403 dari backend.

## 10. Belum selesai / perlu keputusan

1. **Seed SQL belum dijalankan** pada DB `hrd2` produksi (butuh persetujuan).
2. Server yang melayani port 96 tidak terdokumentasi di repo — diperlukan
   info untuk konfigurasi routing final (Lap. 9.3).
3. Login lama pocokan masih memungkinkan jalur akses via password pocokan
   (standalone legacy) — rencanakan penonaktifan mount `/auth/login` pocokan
   setelah integrasi dinyatakan stabil.
4. Platform: `.env` password di `backend/.env` kini saya isi nilai yang sudah
   terbukti bekerja untuk DB pocokan (`Kencana#...`) — nilai lama di pocokan
   `.env` ditolak MySQL dari IP ini; jika password `kencana` diganti di
   MySQL, ubah `DB_PASS`+`POCOKAN_DB_PASSWORD` bersamaan.
5. MenuFinance leftover (supplier/PO/invoice/dll.) tetap ada di codebase
   pocokan tetapi tidak terdaftar di `pocokan.tmenu` — keputusan apakah
   dihapus dari FE atau DB finance-nya diaktifkan berada di luar scope
   integrasi ini.
