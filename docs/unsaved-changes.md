# Draft yang belum disimpan

Draft hanya berada di memori tab. Konfirmasi pindah halaman tidak membuang draft;
konfirmasi penutupan tab/logout menjelaskan bahwa draft akan hilang. Cancel tidak
mengubah route, tab aktif, atau daftar tab. Refresh/tutup browser memakai dialog
bawaan browser bila tersedia, sedangkan kembali dari tab browser lain memberi
pengingat. Tidak ada autosave atau penyimpanan draft di localStorage/backend.

## Cakupan form

| Route/kelompok | Pelacakan |
| --- | --- |
| `/master/{jabatan,departemen,pabrik,hari-libur,jadwal,status-karyawan,jenis-ijin,pekerjaan,pendidikan,keterangan-mutasi}/form` | Snapshot `MasterForm` melalui `useTransactionReset` |
| `/master/karyawan/form` | Snapshot identitas, detail, jadwal, PKWT dan foto; termasuk pembacaan foto yang belum selesai |
| `/master/sandi-bpjs/form` | Snapshot `useTransactionReset`; tidak menulis credential ke penyimpanan draft |
| `/master/perusahaan` | Snapshot field perusahaan |
| `/absensi/form` | Snapshot form dan reset existing |
| `/absensi/import` | File yang belum diunggah beserta periode/pabrik; proses import/proses absensi memblokir penutupan |
| `/transaksi/{pinjaman,ijin,ijin-v2,mutasi,keluar,lembur,lembur-v2,perubahan-status,permintaan-karyawan,realisasi-permintaan,bank-pelamar,rekrutmen,penilaian-3-bulan,sp}/form` | Snapshot/reset existing, terpisah per path dan query tab |
| `/transaksi/pinjaman/pelunasan` | Pilihan untuk diproses; tidak dimuat ulang otomatis saat draft pilihan masih ada |
| `/gaji/setting`, `/gaji/proses` | Snapshot baris grid dan file potongan; reaktivasi tidak menimpa draft |
| `/setting/user/form`, `/setting/user/form/:kode` | Snapshot input user |
| `/setting/user` | Password reset yang sedang diisi; proses reset/hapus melindungi tab selama request |
| `/setting/hak-akses` | Snapshot izin; guard navigasi lokal diganti guard terpusat. Error simpan mempertahankan input; respons `reload_required` menonaktifkan simpan sampai reload |
| `/setting/menu` | Snapshot baris menu; penyimpanan parsial yang gagal tidak ditandai bersih |
| `/setting/generator-otorisasi` | Input kode sampai generasi berhasil |
| Kalender Agenda pada sidebar | Draft global saat editor terbuka; close dialog/editor juga meminta konfirmasi |

Browse/laporan, filter/pencarian, status tab bagian dalam form, pemilihan untuk
melihat data, dan export tidak menandai halaman sebagai draft. Aksi langsung
verifikasi lembur hari libur, proses massal Tidak Masuk, dan hapus pada BaseBrowse
melindungi penutupan selama request berjalan tanpa membuat draft filter.
Form publik `/penilaian/*`, Login, Dashboard, serta halaman error tidak memakai
penjaga draft form HRIS.

## Integrasi form baru

Form berbasis `useTransactionReset` terdaftar otomatis. Form lain memakai
`useDraftSnapshot` atau `useUnsavedChanges`; state harus memuat data yang relevan
untuk simpan/proses, bukan state filter/tampilan. Capture hanya setelah load yang
berhasil. Untuk save khusus, ambil ticket `beginSave()` sebelum request dan panggil
finish dengan `true` hanya sesudah mutasi berhasil; `false` pada finally aman
dipanggil berulang. BaseForm melakukannya bersama untuk form turunannya.

Navigasi pembuka tab memakai `stageTab` lalu router; router baru mengaktifkan
tab setelah berhasil. Penutupan memakai `useTabNavigation`; operasi massal
mengonfirmasi seluruh tab terdampak sekali. `resetTabs` adalah jalur paksa untuk
pergantian sesi dan menghapus registry. Batas 12 tab tidak mengorbankan draft:
hanya tab bersih yang boleh dikeluarkan otomatis.

## Verifikasi

`unsavedChanges.test.cjs` menguji registry, router, tab massal, batas tab, sesi,
snapshot simpan, dan lifecycle event browser. `unsavedChanges.browser.cjs` memakai
Vue, Pinia, Router, KeepAlive, TabBar, BaseForm, dan composable sebenarnya dengan
form fixture/API simulasi. Dialog confirm dimock pada smoke test. Refresh/tutup
browser harus juga diperiksa manual; dialog native tidak dapat dipastikan muncul
pada semua browser atau saat aplikasi mobile dihentikan paksa.

Hasil verifikasi implementasi: 139 tes terkait (termasuk smoke test browser)
lulus, dan production build beserta type-check lulus. Suite frontend yang lebih
luas belum seluruhnya hijau: terdapat kegagalan assertion tampilan/keyboard dan
fixture browser. Pemeriksaan read-only dengan source `HEAD` mengulang 17 kegagalan
lama pada kelompok tampilan Absensi/Pinjaman, ikon/hover, grid keyboard, dan FTime.
Beberapa fixture browser lama juga gagal menghasilkan report, termasuk timeout;
penyebab lengkapnya belum diaudit. Smoke test draft memakai browser headless dan
berhasil menghasilkan report untuk skenario yang dijelaskan di atas.
