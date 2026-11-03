# Integrasi Pocokan — Absensi Wajah

## Audit database (30 September 2026)

Audit read-only menggunakan `be-pocokan/src/config/database.js` dan `.env`
existing, pada database VPS yang dipakai Pocokan.

| Pemeriksaan | Hasil |
| --- | --- |
| Database server | MariaDB 10.5.29 |
| `tabsensi.ab_kar_kode` | `VARCHAR(10)`, NOT NULL |
| `tabsensi.ab_tanggal` | DATE, NOT NULL |
| Primary key `tabsensi` | `(ab_kar_kode, ab_tanggal)` |
| Kolom lainnya `tabsensi` | `ab_hari DOUBLE`, `ab_jamlembur DOUBLE`, `ab_pab_kode VARCHAR(5)`, nullable |
| `tkaryawan.kar_kode` | `VARCHAR(15)`, primary key |
| `tabsensi_wajah.karyawan_id` | `VARCHAR(50)` |
| Panjang ID master | 971 row; maksimum 4 karakter; 0 ID >10 karakter |
| Karyawan aktif | 93 |
| Mapping unit | `kar_pab_kode` ke `tpabrik.pab_kode`; 0 karyawan tanpa pasangan unit |
| Panjang kode unit | Maksimum 3 karakter; 0 unit >5 karakter |
| Sumber wajah saat audit | 5 row, seluruhnya Hadir dengan jam masuk dan foto |
| Orphan / duplikat sumber saat audit | 0 / 0 |
| Engine | `tabsensi`, `tkaryawan`, `tpabrik`: MyISAM; `tabsensi_wajah`: InnoDB |
| Trigger tabel terkait | Tidak ditemukan |

Tidak diperlukan perubahan schema. ID kandidat >10 karakter pada penarikan
berikutnya menghasilkan HTTP 409 **sebelum penulisan**, dengan pesan untuk audit
kompatibilitas; aplikasi tidak melakukan ALTER atau truncation otomatis.

## File implementasi

Pocokan:

- `be-pocokan/src/services/transaksi/absensiService.js`: `tarikWajah`, dan
  `saveAbsensi` untuk input manual (nilai kehadiran, baris lembur saja, kosongkan semua).
- `be-pocokan/src/services/transaksi/prosesGajiService.js`: `saveProsesGaji` menerima
  payload kosong supaya potongan bisa dikosongkan kembali.
- `be-pocokan/src/controllers/transaksi/absensiController.js`: response summary/error.
- `be-pocokan/src/routes/transaksi/absensiRoutes.js`: route dengan middleware existing.
- `fe-pocokan/src/api/transaksi/absensiApi.ts`: API client dan tipe summary.
- `fe-pocokan/src/views/transaksi/AbsensiView.vue`: tombol, loading, feedback, refresh, peringatan belum disimpan, konfirmasi kosongkan-semua.
- `fe-pocokan/src/views/transaksi/ProsesGajiView.vue`: status dirty potongan, konfirmasi kosongkan-semua.
- `fe-pocokan/src/stores/tabsStore.ts`: registry close guard generik.
- `fe-pocokan/src/components/TabView.vue`: sinkronisasi `activeTabId` dengan route saat navigasi ditolak.
- `fe-pocokan/src/router/index.ts`: `afterEach` hanya membuka tab untuk navigasi yang berhasil.

Absensi Wajah, root `E:\MagangHub\absensi-pocokan\absensiPocokan`:

- `server.js`: filter/validasi aktif, blokir pembuatan master, pemeriksaan schema read-only.
- `public/index.html`: pendaftaran wajah memakai existing active employee.

Verifikasi:

- `be-pocokan/test/absensiWajah.integration.test.js`.
- `fe-pocokan/test/absensiWajah.test.cjs`.

## Endpoint Pocokan

### Pilihan SEMUA pada Unit Absensi

Filter Unit di `AbsensiView.vue` menyediakan `SEMUA — Semua Unit` selain unit
individual. Nilai protokol `pabKode: "SEMUA"` berlaku untuk GET karyawan,
Tarik Absensi, dan Save manual. Pilihan default tetap unit pertama seperti semula.

- GET menampilkan karyawan aktif dari seluruh unit terdaftar, dengan kolom Unit
  masing-masing dan nilai absensi pada tanggal terpilih.
- Tarik memakai satu request dan satu named lock per tanggal. Summary merupakan
  total seluruh unit; aktif/bukti hadir/validitas ID tetap diperiksa. Setiap INSERT
  memakai `kar_pab_kode` asli. Tidak ada DELETE atau perubahan lembur dari Tarik.
- Save mode SEMUA mengambil unit karyawan dari master sebelum penulisan, menolak
  karyawan nonaktif/unit tidak valid sebelum DELETE, dan tidak mempercayai unit
  kiriman browser. Penggantian baris hanya berlaku untuk ID dalam payload pada
  tanggal terpilih, sehingga data nonaktif yang tidak ditampilkan tidak terhapus.
  Nilai `SEMUA` tidak pernah ditulis sebagai `ab_pab_kode`.
- Warning perubahan belum disimpan tetap berlaku saat beralih ke/dari SEMUA.

Verifikasi tambahan: TEST 33 frontend (opsi, GET, satu request Tarik, refresh,
Save lintas unit), serta dua test database untuk Tarik/idempotency/lembur dan
GET/Save/unit master/perlindungan nonaktif/tanggal lain. Total terbaru: 25 test
frontend dan 24 hasil test backend (termasuk test induk).

`POST /api/transaksi/absensi/tarik-wajah`

Middleware mengikuti Save Absensi: `verifyToken` dan `checkPermission(9, "insert")`.
Payload mengikuti nama parameter unit existing:

```json
{ "tanggal": "2026-09-25", "pabKode": "U1" }
```

`U1` adalah contoh unit fixture, bukan kode unit produksi. Backend memeriksa
tanggal kalender dan keberadaan unit di `tpabrik`; ID karyawan diambil dari DB.

Contoh response:

```json
{
  "success": true,
  "data": { "ditemukan": 5, "inserted": 3, "updated": 2, "skipped": 0 },
  "message": "Tarik absensi berhasil. 5 karyawan ditandai hadir."
}
```

- `ditemukan`: jumlah kandidat karyawan aktif unik dengan bukti hadir valid.
- `inserted`: kandidat yang dimasukkan sebagai row baru.
- `updated`: row existing yang diproses, termasuk row yang sudah `ab_hari = 1`.
- `skipped`: jumlah record sumber yang tidak diproses, termasuk duplikat,
  status/bukti tidak valid, nonaktif, orphan, atau kandidat yang menjadi tidak
  eligible saat penulisan. Karyawan unit lain tidak dihitung. Orphan tidak punya
  unit sehingga dihitung pada lingkup tanggal terpilih.

Tidak ada kandidat adalah HTTP 200 dengan pesan tidak ada data. Input salah:
HTTP 400. Penarikan tanggal yang sama sedang berjalan atau ID terlalu panjang:
HTTP 409. Database error: HTTP 500 dengan summary parsial bila tersedia, tanpa
detail SQL/kredensial.

## Query, idempotency, dan perlindungan data

Seleksi menggunakan `SELECT DISTINCT`, join
`tabsensi_wajah.karyawan_id = tkaryawan.kar_kode`, dengan filter:

```sql
w.tanggal = ? AND k.kar_isaktif = 1 AND k.kar_pab_kode = ?
AND w.status = 'Hadir' AND w.jam_masuk IS NOT NULL
AND w.foto_masuk IS NOT NULL AND TRIM(w.foto_masuk) <> ''
```

Bukti hadir tersebut mengikuti POST aplikasi wajah yang mewajibkan foto dan
mengisi jam masuk. Record Izin/Alpha atau tanpa bukti masuk dilewati.

Mapping target:

```text
ab_kar_kode = tkaryawan.kar_kode
ab_tanggal = tanggal pilihan
ab_pab_kode = tkaryawan.kar_pab_kode
ab_hari = 1
ab_jamlembur = tidak diisi (NULL) pada INSERT, default kolom
```

`ab_jamlembur` sengaja dibiarkan kosong pada baris hasil penarikan. Default kolom
adalah NULL, sehingga jam lembur baru terisi setelah diinput manual. Mengisi 0
akan menyamar sebagai lembur yang sudah dihitung nol dan menutupi data yang
belum diinput. Pada row existing, `ON DUPLICATE KEY UPDATE` hanya menyentuh
`ab_hari`, jadi nilai lembur yang sudah ada tidak tersentuh.

Penulisan memakai `INSERT ... SELECT ... ON DUPLICATE KEY UPDATE ab_hari = 1`.
Status aktif, unit, panjang kode, serta keberadaan bukti hadir diperiksa ulang
di statement penulisan. PK existing mencegah duplikasi; update hanya `ab_hari`,
termasuk ketika row lama menyimpan unit berbeda. Lembur existing tetap utuh.

MyISAM tidak mendukung rollback. Named lock per database/tanggal mengatur
penarikan bersamaan; upsert per karyawan aman diulang jika koneksi gagal di tengah.
Frontend menyegarkan data juga pada kegagalan agar hasil parsial terlihat.
Response request baca lama tidak menimpa hasil refresh terbaru.

## Master aktif dan history

- `GET /api/karyawan`: aktif saja; dipakai dropdown pendaftaran dan fallback manual.
- `GET /api/karyawan/descriptors`: descriptor karyawan aktif saja.
- `PUT /api/karyawan/:id/face`: UPDATE bersyarat `kar_isaktif = 1`.
- `POST /api/absensi`: cek aktif, lalu periksa ulang aktif di INSERT/UPDATE.
- `GET /api/absensi/hari-ini`: daftar operasional aktif saja.
- `GET /api/absensi/laporan`: tetap tanpa filter aktif.

`POST /api/karyawan` sebelumnya membuat record `tkaryawan`. Call site yang
ditemukan adalah cabang pendaftaran master baru pada `public/index.html`.
Form nama/bagian/pabrik baru dihapus. Route dipertahankan dan mengembalikan HTTP
403 beserta petunjuk membuat/mengaktifkan karyawan melalui Pocokan, sehingga
client lama tidak bisa membuat master independen.

Penonaktifan tidak menghapus foto, descriptor, maupun absensi lama. Inisialisasi
schema otomatis lama diganti SELECT pemeriksaan agar startup tidak menjalankan
CREATE/ALTER tanpa persetujuan.

## Verifikasi

SQL service dan endpoint Express aplikasi wajah diuji pada server MariaDB
menggunakan **TEMPORARY TABLE per koneksi**, menyalin tipe, PK, collation, dan
engine schema yang diaudit. Semua fixture membayangi tabel asli dan hilang saat
koneksi ditutup. Tidak ada penulisan fixture ke tabel produksi atau perubahan
schema permanen. Listener/TLS startup wajah diganti test harness; handler HTTP
dan SQL yang diuji adalah kode aplikasi asli.

| Test wajib | Hasil |
| --- | --- |
| 1. Aktif + wajah tanggal terpilih -> hadir 1 | Lulus SQL |
| 2. Tanpa wajah tanggal terpilih -> tidak ditandai hadir | Lulus SQL |
| 3. Nonaktif + wajah -> tidak ditarik | Lulus SQL |
| 4. Existing 0/lembur 2 -> 1/lembur 2 | Lulus SQL |
| 5. Row baru -> hadir 1, lembur kosong | Lulus SQL |
| 6. Tarik dua kali -> satu row, konsisten | Lulus SQL |
| 7. Dua sumber sama -> satu kandidat | Lulus SQL |
| 8. Nonaktif tidak ada di pendaftaran/descriptor/manual | Lulus HTTP + pengisian dropdown JS asli |
| 9. History dan biometrik nonaktif bertahan | Lulus HTTP + SQL |
| 10. Klik -> refresh -> Kehadiran 1 | Lulus mount SFC Vue, API distub |

Tambahan: validasi tanggal/unit/ID panjang, orphan, Izin/Alpha, jam/foto kosong,
perubahan status tepat sebelum write, error DB parsial dan retry, empty response,
lock penarikan bersamaan, serta penarikan ulang tidak mengisi lembur kosong.

Dampak ke gaji sudah dicek: `prosesGajiService` memakai
`Number(ab_jamlembur) || 0` dan `lapGajiService` memakai
`IF(ab_jamlembur > 2, ...)` lalu `Number(...) || 0`, keduanya aman terhadap NULL
dan menghasilkan nilai yang sama dengan 0.

Catatan: `SUM(IF(ab_jamlembur > 2, 2, ab_jamlembur))` mengembalikan NULL bila
seluruh baris dalam periode memiliki lembur kosong. `lapGajiService` memetakan
NULL tersebut ke 0, sehingga total lembur tetap 0.

## Perilaku jam lembur

`ab_jamlembur` tidak diisi nol, di dua tempat:

- `tarikWajah`: kolom tidak disebut pada INSERT, jadi default NULL yang dipakai.
- `saveAbsensi`: `Number(item.jamlembur) || 0` diganti pengecekan apakah nilai
  benar-benar terisi. Kosong menjadi NULL; angka yang diisi pengguna, termasuk
  0, disimpan apa adanya.

Konsekuensi: row hasil Tarik Absensi tidak lagi bisa berubah menjadi `0` hanya
karena tombol Save ditekan setelah penarikan.

## Input manual: setengah hari dan lembur saja

Dua perubahan pada `saveAbsensi` (`be-pocokan/src/services/transaksi/absensiService.js`)
dan form `AbsensiView.vue`. Tidak ada perubahan schema: `ab_hari` sudah
`DOUBLE NULL` (dikonfirmasi ulang lewat `information_schema`).

### 0,5 hari

Nilai kehadiran yang boleh diisi manual adalah `0` (tidak hadir), `0,5` (setengah
hari), `1` (hadir), dan `2` (dua hari). Semuanya bertipe `DOUBLE` di database, jadi setengah hari
tidak pernah dibulatkan.

- Frontend: input Kehadiran memakai `step="0.5"` (dulu `step="1"`), dengan `max="2"`,
  jadi nilai yang valid adalah 0, 0,5, 1, dan 2, dan teks di input memberi tahu nilainya.
- `NILAI_KEHADIRAN = [0, 0.5, 1, 2]` divalidasi sebelum request. Nilai di luar daftar
  ditolak di browser dengan toast; tidak pernah sampai ke backend.
- Backend melakukan pemeriksaan yang sama sebelum `DELETE`, jadi payload yang
  ditolak tidak menghapus data lama.
- Penarikan wajah tidak berubah: `tarikWajah` selalu menulis `ab_hari = 1`.

### Jam lembur tanpa kehadiran

Tombol Save sebelumnya hanya aktif bila ada Minimal satu kehadiran terisi. Sekarang
Save aktif bila **kehadiran atau jam lembur** terisi di baris mana pun.

Baris yang hanya punya lembur disimpan dengan `ab_hari = NULL` — bukan `0`. Kalau
`0`, "admin belum mengisi kehadiran" akan tersamar jadi "tidak hadir" pada
laporan, dan keduanya tidak bisa dibedakan lagi. Baris tanpa kehadiran maupun
lembur tetap tidak dibuat.

Dampaknya ke pembacaan `ab_hari`:

| Pembaca | Perlakuan NULL | Aman |
|---|---|---|
| `prosesGajiService` | `kehadiran += Number(row.ab_hari) \|\| 0` | ya, dihitung 0 hari |
| `lapGajiService` | `SUM(ab_hari)` | ya, `SUM` mengabaikan NULL |
| `lapAbsensiService` | `kehadiran: Number(row.kehadiran) \|\| 0` | ya, tampil `0` |

Jadi baris lembur saja menambah 0 hari + lembur ke gaji, sama seperti absensi
tidak hadir. `SUM` di SQL dan `Number(null) || 0` di JS sudah diverifikasi
terhadap MariaDB yang dipakai.

Interaksi dengan penarikan wajah: `tarikWajah` memakai
`ON DUPLICATE KEY UPDATE ab_hari = 1` tanpa menyentuh `ab_jamlembur`, jadi baris
lembur saja yang kemudian menarik wajah berubah menjadi hadir penuh dengan lembur
yang tetap utuh.

## Mengosongkan kembali nilai (kehadiran, lembur, potongan)

Tiga kolom yang bisa dikosongkan admin: `Kehadiran` dan `Jam Lembur` di halaman
Absensi, `Potongan` di halaman Proses Gaji.

### Yang sebenarnya sudah bekerja dan yang jadi titik macetnya

Mengosongkan satu sel per baris **sudah** bisa dilakukan sebelumnya: `v-model.number`
memberi `""` saat input dikosongkan, `terisi()` memperlakukannya sebagai belum diisi,
dan pola `DELETE` + `INSERT` ulang di backend membuat baris itu hilang. Yang
macet adalah kasus terakhir: ketika tabel menjadi **seluruhnya kosong**.

Tombol Save di kedua halaman memakai "ada isian" sebagai syarat aktif
(`hasSaveableInput` / `hasFilledPotongan`), dan kedua backend melempar error kalau
tidak ada satu pun nilai terisi. Akibatnya admin bisa mengosongkan 92 dari 93 baris,
menyimpan, lalu tidak bisa menyelesaikan baris terakhirnya.

### Perbaikan

| Letak | Sebelum | Sesudah |
|---|---|---|
| `AbsensiView.vue` tombol Save | aktif bila ada isian | aktif bila tabel berubah dari hasil muat (`isDirty`) |
| `ProsesGajiView.vue` tombol Save | aktif bila ada potongan | aktif bila ada perubahan (`isDirty`, baru ditambahkan) |
| `handleSave` kedua halaman | menolak saat tak ada isian | mengabaikan; meminta konfirmasi lalu kirim |
| `saveAbsensi` | `if (!filledItems.length) throw` | payload kosong diterima, `DELETE` tetap jalan, `savedCount: 0` |
| `saveProsesGaji` | `if (!preparedItems.length) throw` | sama |

Memakai `isDirty` (bukan "ada isian") menjaga satu hal penting: halaman yang baru
dimuat dan belum disentuh tidak bisa dipakai untuk menghapus data. Membuka
keadaan "kosong total" hanya bisa dicapai kalau admin benar-benar mengubah
beberapa sel lebih dulu, jadi tombol Save yang mati di keadaan awal bukan
sekadar aturan yang dilonggarkan.

### Konfirmasi untuk penghapusan massal

Menyimpan tabel yang seluruhnya kosong berarti menghapus semua data absensi
tanggal & unit itu, atau semua potongan pada periode itu. Karena itu
`handleSave` meminta konfirmasi dulu, hanya pada kasus "tak ada isian tersisa" —
mengosongkan sebagian baris tidak perlu konfirmasi karena baris lain masih
terisi dan tidak ada data yang hilang diam-diam.

Pesan konfirmasi menyebut konsekuensinya eksplisit:

```
Tidak ada kehadiran atau jam lembur yang terisi.

Menyimpan akan mengosongkan seluruh data absensi tanggal ini untuk unit yang dipilih. Lanjutkan?
```

`confirm()` bawaan browser dipakai di kedua halaman, sama seperti aksi destruktif
lain di aplikasi ini (`Hapus Invoice`, `Batalkan Pembayaran`, dan lainnya).
Halaman Absensi punya dialog sendiri untuk discard, tapi itu untuk pertanyaan
yang berbeda ("perubahan belum disimpan akan hilang") dan tidak dipakai ulang
supaya tidak mengabulkan dua maksud dalam satu dialog.

Pesan sukses juga dibedakan supaya admin tahu apa yang terjadi:
`"Seluruh data absensi tanggal ini dikosongkan."` / `"Seluruh data potongan periode
ini dikosongkan."`, bukan pesan "berhasil disimpan" yang biasa.

### Konsekuensi ke pembacaan

Tidak ada perubahan semantik pada NULL — `NULL` sudah dihitung 0 oleh
`prosesGajiService`, `lapGajiService`, dan `lapAbsensiService` (tabel di atas).
Yang hilang adalah **baris**-nya, persis seperti ketika admin tidak pernah
mengisi kolom itu, jadi arti "belum diisi" tetap satu.

Dua hal yang perlu diketahui:

- Baris `tabsensi` untuk karyawan yang sudah tidak aktif ikut terhapus, karena
  `DELETE` di-scope per `ab_pab_kode` + `ab_tanggal`, bukan per karyawan. Ini
  perilaku yang sudah ada pada setiap Save, bukan hal baru dari fitur ini.
- Baris `tgajimingguan` juga menyimpan `gm_gapok`/`gm_hari`/`gm_jamlembur` sebagai
  snapshot. Mengosongkan semua potongan untuk satu periode ikut menghapus snapshot
  itu. Tidak ada pembacaan kolom tersebut di mana pun (`lapGajiService` hanya
  membaca `gm_potongan`, kehadiran dan lembur dihitung ulang dari `tabsensi`), jadi
  laporan gaji tidak berubah.

## Peringatan perubahan belum disimpan

### Potongan pada halaman Proses Gaji

`ProsesGajiView.vue` juga memakai fingerprint Potongan untuk warning menu/tab
dan registry `setCloseGuard` yang sama untuk X, Tutup Tab, atau Tutup Semua Tab.
Dialog bertuliskan "Perubahan Belum Disimpan" dan menyebut perubahan potongan
yang akan hilang. Batal menjaga route, tab aktif, dan nilai manual; Ya melanjutkan
tanpa menyimpan otomatis. Penanda `closingOwnTab` mencegah dialog kedua saat
penutupan tab menyebabkan perpindahan route. Guard tetap hidup di KeepAlive
dan dilepas saat unmount. Refresh/tutup browser memakai `beforeunload`.

Chip "Belum disimpan" hilang setelah Save berhasil, tetapi tetap ada jika Save
gagal. Data hasil muat tidak dianggap perubahan. Perhitungan gaji/backend tidak
diubah untuk warning ini. Perlindungan pergantian filter periode/unit pada
halaman Gaji tidak ditambahkan dalam permintaan ini.

TEST 28–32 menguji menu/tab dengan Batal dan Ya, X tanpa dialog ganda, Save
berhasil/gagal, halaman bersih, serta Tutup Semua Tab. Total frontend: 24 test.

Tombol Save hanya berlaku untuk edit manual (kehadiran dan jam lembur); Tarik
Absensi tidak menyimpan apa pun dari form. Isian manual baru masuk database
saat Save ditekan, jadi `AbsensiView` menyimpan sidik jari `id|kehadiran|jamlembur`
dari data yang terakhir dimuat dan menandainya belum tersimpan bila berbeda
(`"1"` dan `1` dianggap sama).

Saat ada perubahan belum tersimpan:

- Pindah tab atau menu: `onBeforeRouteLeave` menahan navigasi dan memunculkan
  dialog. TabBar memanggil `router.push` lewat `TabView`, jadi guard ini juga
  menutup klik tab, tutup tab lain, dan pindah menu.
- Ganti tanggal atau unit, atau tekan refresh: dialog muncul. Bila admin menekan
  Batal, tanggal dan unit dikembalikan ke nilai yang sedang ditampilkan dan
  muat ulang berikutnya ditekan agar filter tidak tampak berubah tanpa data yang
  sesuai.
- Klik Tarik Absensi: dialog muncul lebih dulu karena langkah akhirnya memuat
  ulang tabel.
- Refresh atau tutup browser: peringatan `beforeunload` bawaan browser.
- Menutup tab (tombol `x`, klik tengah, "Tutup Tab", "Tutup Tab Lain", "Tutup
  Tab ke Kanan", "Tutup Semua Tab"): dialog muncul, dijelaskan di bagian close
  guard di bawah.

Setelah Save berhasil, sidik jari disegarkan sehingga penanda hilang. Penanda
"Belum disimpan" juga ditampilkan sebagai chip di toolbar halaman Absensi.

### Close guard generik di tabsStore

Menutup tab tidak melewati router, melainkan langsung ke `tabsStore`, jadi
`onBeforeRouteLeave` tidak menangkapnya. `tabsStore` sekarang punya registry
close guard generik:

```ts
type TabCloseGuard = () => boolean | Promise<boolean>;
tabsStore.setCloseGuard(tabId, guard | null);
```

Store tidak tahu apa pun isi halaman: ia hanya memanggil guard yang terdaftar
untuk tab yang akan ditutup, dan menghormati hasil `true` (boleh) atau `false`
(batal). Peta guard disimpan di luar array `tabs` supaya tidak memicu
re-render, dan dibersihkan bersama `initDefaultTabs` dan `resetTabs`.

Perilaku yang dijaga:

- Tab tanpa guard ditutup **sinkron** seperti sebelumnya. Fungsi tutup
  (`closeTab`, `closeAllTabs`, `closeOtherTabs`, `closeTabsToRight`,
  `closeActiveTab`) mengembalikan `boolean | Promise<boolean>`: `boolean` bila
  tidak ada guard, `Promise` bila perlu konfirmasi. Sembilan form view yang
  memanggil `tabsStore.closeTab(path)` setelah simpan/batal tetap berperilaku
  sama karena tidak ada guard di sana.
- Guard dijalankan berurutan. Kalau satu menolak, **tidak ada** tab yang
  ditutup, supaya tidak ada tab tertutup sebagian yang memindahkan `activeTabId`
  dan memaksa pindah halaman.
- Guard yang melempar error dianggap batal, bukan tutup paksa, dan tidak
  menjadi unhandled rejection.
- `tab.onClose` tetap notifikasi seperti sebelumnya dan tidak berubah.

Pendaftaran di `AbsensiView` dilakukan sekali saat setup untuk
`route.path`, dan dilepas di `onBeforeUnmount`. Guard sengaja tidak dilepas di
`onDeactivated`: selama instance masih di-cache KeepAlive, isian yang belum
tersimpan masih hidup di sana dan tab itu masih bisa ditutup dari TabBar.

Dialog untuk tutup tab memakai `v-dialog` yang sama dengan kasus lain, dengan
pesan berbeda ("Tutup tab ini?..." vs "Keluar dari halaman ini?..."). Satu aksi
hanya menghasilkan satu dialog: ketika tutup tab disetujui, `closingOwnTab`
ditandai supaya `onBeforeRouteLeave` yang menyala akibat TabView pindah ke tab
lain tidak menanyakan hal yang sama lagi. Penanda itu dibuang di `onActivated`
(tab dibuka lagi) supaya tidak membuat penjagaan berikutnya lolos diam-diam.

### Navigasi yang dibatalkan tidak boleh jadi tab

Menambahkan guard route membuat navigasi bisa **dibatalkan**, dan itu
membongkar bug lama di `router/index.ts`:

```ts
router.afterEach((to) => {          // argumen ketiga (failure) diabaikan
  tabsStore.openTab({ title, path: to.path, ... });
});
```

vue-router memanggil `afterEach` dengan atau tanpa `failure` — termasuk untuk
navigasi yang dibatalkan guard, digantikan navigasi lain, atau di-redirect
(`triggerAfterEach(to, from, failure)`). Akibatnya satu klik menu menjadi lima
langkah:

1. `router.push(tujuan)` → `onBeforeRouteLeave` → dialog → admin menekan Batal
2. navigasi aborted, tetapi `afterEach` tetap jalan dan membuat tab untuk
   halaman yang tidak pernah dibuka, sekaligus memindahkan `activeTabId`
3. watcher `activeTabId` di `TabView` melihat tab aktif tidak sama dengan route
   sekarang, lalu `router.push(tujuan)` lagi
4. guard kepicu lagi → **dialog muncul dua kali**
5. tab bar memuat tab untuk halaman yang tidak pernah dirender → "menu baru
   terbuka tapi isinya kosong"

Bug ini sudah ada sejak dulu, hanya tidak terlihat karena sebelumnya tidak
pernah ada navigasi yang dibatalkan, jadi `failure` selalu `undefined`. Efek
sama juga terjadi pada navigasi yang di-redirect ke `/errors/unauthorized`:
dulu tab tetap dibuat untuk halaman tujuan yang tidak bisa diakses.

Perbaikannya dua bagian, keduanya generik dan tidak mengenal Absensi:

- `src/router/index.ts`: `afterEach` menerima `failure` dan berhenti kalau
  navigasi gagal, sehingga halaman yang batal tidak menjadi tab.
- `src/components/TabView.vue`: `TabBar.onTabClick` menandai `activeTabId`
  **sebelum** navigasi, jadi kalau `router.push` ditolak, watcher mengembalikan
  `activeTabId` ke tab yang cocok dengan `route.path` sekarang. Tanpa ini tab
  aktif dan isi layar tidak sinkron setelah admin menekan Batal.

Ditambah pengaman di `AbsensiView`: `konfirmasiBuang` mengembalikan promise
yang sama ketika dialognya sedang tampil. Sebelumnya pemanggilan kedua
menimpa `discardResolver`, sehingga pemanggilan pertama tidak pernah resolve dan
navigasinya menggantung selamanya. Semua pemanggilan dialog di halaman ini
bertanya hal yang sama ("buang perubahan?"), jadi berbagi jawaban aman.

Frontend test memakai renderer Vue in-memory dengan observasi binding v-model;
tidak menilai tampilan visual, kamera, atau recognition. Browser harness pada
sesi implementasi belum terhubung. Empat belas test (TEST 10-23) menjalankan
`onBeforeRouteLeave`, `tabsStore`, dan `TabView` asli melalui router sungguhan
(`createMemoryHistory`), bukan stub; `afterEach` di router test meniru
`router/index.ts` persis, termasuk pemeriksaan `failure`. TEST 23 memakai
`src/components/TabView.vue` apa adanya supaya perubahan di file itu ikut
diuji; test lain memakai tiruan agar tidak menggeser hasil test lama.

Keakuratan test dijaga dengan uji mutasi:

| Mutasi | Test yang gagal |
|---|---|
| `setCloseGuard` dimatikan | TEST 13, 14, 18, 19 |
| penanda `closingOwnTab` dimatikan | TEST 18 |
| `if (failure) return` di `afterEach` dimatikan | TEST 20 |
| pengembalian `activeTabId` di `TabView` dimatikan | TEST 23 |

Pengaman `konfirmasiBuang` yang berbagi promise belum punya test khusus: setelah
`afterEach` diperbaiki, tidak ada jalur di UI yang memicu dialog kedua untuk
satu navigasi.

Build produksi lulus. Type-check proyek masih melaporkan error pada file di luar
perubahan, antara lain `invApi.ts`, `poApi.ts`, `TinyPivotOnly.vue`,
`exportExcel.ts`, dan `SpkFormView.vue`; tidak ada diagnostic pada file integrasi.

Menjalankan ulang (PowerShell, dari `be-pocokan`):

```powershell
$env:RUN_DB_INTEGRATION='1'
$env:FACE_APP_DIR='E:\MagangHub\absensi-pocokan\absensiPocokan'
node --test test/absensiWajah.integration.test.js
```

Dari `fe-pocokan`:

```powershell
node --test test/absensiWajah.test.cjs
npm.cmd run build
```

Sembilan belas test frontend: TEST 10 (Tarik Absensi memakai filter aktif dan
mencegah submit ganda), TEST 11 (perubahan belum disimpan menahan pindah tab),
TEST 12 (batal saat ganti filter mengembalikan tampilan, Save menutup status
belum tersimpan), TEST 13 (A: tutup tab + Batal menjaga tab dan isian), TEST 14
(B: tutup tab + Ya menutup tab), TEST 15 (C: tab bersih langsung tertutup tanpa
dialog), TEST 16 (D: setelah Save tab langsung tertutup), TEST 17 (E: tab lain
tanpa guard tetap tertutup sinkron), TEST 18 (F: tidak ada dialog kedua dari
route guard), TEST 19 (G: Batal tidak merusak guard untuk percobaan berikutnya),
TEST 20–23 (navigasi yang dibatalkan tidak menjadi tab hantu), TEST 24 (lembur
saja mengaktifkan dan menjalankan Save, kehadiran tetap terkirim `null`), TEST 25
(step `0.5` diterima; 0,3 / 2 / -1 ditolak tanpa request), TEST 26 (mengosongkan
seluruh isian tetap bisa disimpan setelah konfirmasi; menolak konfirmasi tidak
mengirim request), TEST 26b (mengosongkan sebagian baris tidak memicu
konfirmasi), TEST 27 (potongan kosongkan-semua di halaman Proses Gaji asli).

Test backend (`be-pocokan/test/absensiWajah.integration.test.js`) sekarang 22
subtest, termasuk enam untuk penyimpanan manual: 0,5 diterima bersama 0 dan
1; nilai di luar daftar ditolak **sebelum** `DELETE` sehingga baris lama utuh;
lembur saja tersimpan dengan `ab_hari` NULL dan baris tanpa isian tidak dibuat;
mengosongkan semua baris menghapus data lama; mengosongkan sebagian hanya
menghapus baris itu dan tidak menyentuh lembur milik baris lain; pada
`saveProsesGaji`, potongan kosongkan-semua menghapus baris lama sementara
potongan negatif tetap ditolak tanpa menghapus data.

Uji mutasi:

| Mutasi | Test yang gagal |
|---|---|
| `NILAI_KEHADIRAN` dikembalikan ke `[0, 1]` | TEST 25 |
| `hasSaveableInput` di tombol Save diganti `hasFilledKehadiran` | TEST 24 |
| Tombol Save Absensi dikembalikan ke syarat `hasSaveableInput` | TEST 26 |
| Konfirmasi kosongkan-semua dihapus dari `AbsensiView` | TEST 26 |
| Tombol Save Proses Gaji dikembalikan ke syarat `hasFilledPotongan` | TEST 27 |
| Konfirmasi kosongkan-semua dihapus dari `ProsesGajiView` | TEST 27 |
| `if (!filledItems.length) throw` dikembalikan ke `saveAbsensi` | subtest kosongkan semua |
| `if (!preparedItems.length) throw` dikembalikan ke `saveProsesGaji` | subtest potongan kosong |

Konfigurasi koneksi tetap berasal dari environment existing. Folder aplikasi
wajah yang diaudit memiliki `.env.example`, tanpa `.env` lokal; kesesuaian
environment proses deployment wajah dengan database Pocokan belum diperiksa.
Test integrasi menggunakan koneksi `.env` Pocokan dan tidak menyalin kredensial.
