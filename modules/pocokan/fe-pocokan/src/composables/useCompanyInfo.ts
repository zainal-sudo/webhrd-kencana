import { ref } from "vue";
import { perusahaanApi, type PerusahaanInfo } from "@/api/master/perusahaanApi";

// Cache di level module — cukup fetch sekali per sesi browser,
// dipakai bareng oleh semua halaman cetak (PO, SO, Invoice, dst).
const companyInfo = ref<PerusahaanInfo | null>(null);
const isLoadingCompany = ref(false);
let fetchPromise: Promise<PerusahaanInfo> | null = null;

export function useCompanyInfo() {
  const fetchCompanyInfo = async (): Promise<PerusahaanInfo> => {
    if (companyInfo.value) return companyInfo.value;
    if (fetchPromise) return fetchPromise;

    isLoadingCompany.value = true;
    fetchPromise = perusahaanApi
      .getInfo()
      .then((data) => {
        companyInfo.value = data;
        return data;
      })
      .catch((e) => {
        // Fallback aman kalau gagal fetch (koneksi/DB error) —
        // biar halaman cetak tetap bisa jalan tanpa crash.
        companyInfo.value = {
          nama: "-",
          alamat: "-",
          kota: "-",
          notelp: "-",
          nofax: "-",
          kdpos: "-",
        };
        console.error("Gagal memuat data perusahaan:", e);
        return companyInfo.value;
      })
      .finally(() => {
        isLoadingCompany.value = false;
        fetchPromise = null;
      });

    return fetchPromise;
  };

  return {
    companyInfo,
    isLoadingCompany,
    fetchCompanyInfo,
  };
}
