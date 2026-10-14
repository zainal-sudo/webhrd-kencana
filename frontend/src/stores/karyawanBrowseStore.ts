import { defineStore } from "pinia";

export type KaryawanBrowseStatus = "all" | "aktif" | "nonaktif";

/** Filter dashboard disimpan terpisah dari query route agar tetap satu tab. */
export const useKaryawanBrowseStore = defineStore("karyawanBrowse", {
  state: () => ({
    status: "all" as KaryawanBrowseStatus,
    revision: 0,
    notifyStatus: false,
  }),
  actions: {
    setStatus(status: KaryawanBrowseStatus, notify = false) {
      this.status = status;
      this.notifyStatus = notify;
      // Pilihan ulang juga membersihkan pencarian, filter kolom dan pagination.
      this.revision += 1;
    },
  },
});
