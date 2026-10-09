import { reactive } from "vue";
import { api } from "@/api/axios";
import type { Pagination } from "@/types";

export function useKaryawanLookup(endpoint: string) {
  let requestId = 0;
  let context: Record<string, unknown> = {};
  const state = reactive({
    rows: [] as Record<string, any>[],
    loading: false,
    error: "",
    pagination: { page: 1, per_page: 25, total: 0, last_page: 1 } as Pagination,
    sortBy: "",
    sortDir: "asc",
    async load(page = 1) {
      const id = ++requestId;
      state.loading = true;
      state.error = "";
      // Do not leave stale selectable rows after an error or during a request.
      state.rows = [];
      try {
        const { data } = await api.get(endpoint, {
          params: { ...context, page, per_page: state.pagination.per_page, ...(state.sortBy ? { sort_by: state.sortBy, sort_dir: state.sortDir } : {}) },
        });
        if (id !== requestId) return;
        state.rows = data.data || [];
        state.pagination = { ...data.pagination, last_page: Math.max(1, data.pagination?.last_page || 1) };
        if (page > state.pagination.last_page) await state.load(state.pagination.last_page);
      } catch (error) {
        if (id !== requestId) return;
        state.error = "Gagal mencari karyawan. Silakan coba lagi.";
        throw error;
      } finally {
        if (id === requestId) state.loading = false;
      }
    },
    async search(search: unknown, scope: Record<string, unknown> = {}) {
      context = { ...scope, search };
      await state.load(1);
    },
    async sort(key: string) {
      if (state.sortBy !== key) {
        state.sortBy = key;
        state.sortDir = "asc";
      } else if (state.sortDir === "asc") {
        state.sortDir = "desc";
      } else {
        state.sortBy = "";
        state.sortDir = "asc";
      }
      await state.load(1);
    },
  });
  return state;
}

export type KaryawanLookup = ReturnType<typeof useKaryawanLookup>;
