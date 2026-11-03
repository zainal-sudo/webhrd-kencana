// utils/viewSession.ts
//
// Semua view browse/laporan menyimpan state filter (search, periode, halaman)
// ke sessionStorage agar tetap ada saat browser di-refresh. Akibatnya, kalau
// tab ditutup lalu menu dibuka lagi, state lama ikut terbaca lagi.
//
// Saat sebuah tab ditutup, state view tsb harus dibersihkan supaya buka menu
// lagi selalu tampil seperti awal. Fungsi ini menghapus:
//  1. Key dinamis BaseBrowse: `finance_browse_${path}`
//  2. Key statis per modul yang didaftarkan di VIEW_STORAGE_KEYS di bawah.

const VIEW_STORAGE_KEYS: Record<string, string> = {
  "/transaksi/po": "finance_periode_po",
  "/transaksi/penjualan": "finance_periode_penjualan",
  "/transaksi/bpb": "inv_periode_bpb",
  "/transaksi/bayarSupplier": "pembayaran_supplier",
  "/transaksi/retur": "finance_periode_retur",
};

/**
 * Hapus state filter yang tersimpan di sessionStorage untuk sebuah route.
 * Dipanggil saat tab ditutup agar buka menu kembali selalu fresh.
 */
export const clearViewSession = (path: string): void => {
  try {
    // 1. Key dinamis milik BaseBrowse (search, halaman, perPage, filterState)
    sessionStorage.removeItem(`finance_browse_${path}`);
    // 2. Key statis milik view browse/laporan tertentu
    const staticKey = VIEW_STORAGE_KEYS[path];
    if (staticKey) sessionStorage.removeItem(staticKey);
  } catch {
    /* sessionStorage tidak tersedia — abaikan */
  }
};
