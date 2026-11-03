import { ref, computed, onMounted, type Ref } from "vue";
import { useRoute } from "vue-router";
import { usePermissionStore } from "@/stores/permissionStore";
import { useToast } from "vue-toastification";
import {
  exportStyledHeader,
  exportStyledDetail,
  type ExportColumn,
} from "@/utils/styledExport";

interface UseBrowseOptions<T> {
  menuId?: string;
  fetchApi: () => Promise<T[]>;
  immediate?: boolean;
  deleteApi?: (id: string) => Promise<void>;
  /** Function to fetch detail rows for a given header key. Enables export dialog. */
  getDetailApi?: (key: string) => Promise<any[]>;
  /** The field name in items used as key for fetching detail (default: "Nomor") */
  detailKeyField?: string;
  /** Column definitions for styled export */
  columns?: ExportColumn[];
  /** Detail column definitions for styled export (when exporting detail) */
  detailColumns?: ExportColumn[];
  /** Export title (shown at top of Excel) */
  exportTitle?: string;
  /** If true, shows export dialog. Auto-detected if getDetailApi is provided. */
  hasDetail?: boolean;
}

export function useBrowse<T = any>(options: UseBrowseOptions<T>) {
  const route = useRoute();
  const permissionStore = usePermissionStore();
  const toast = useToast();

  const items = ref<T[]>([]) as Ref<T[]>;
  const isLoading = ref(false);
  const selected = ref<T[]>([]);
  const browseRef = ref<{
    getExportItems: () => T[];
    clearSearch?: () => void;
  } | null>(null);
  const getExportItems = (): T[] => browseRef.value?.getExportItems() ?? items.value;

  // ── Export dialog state ──────────────────────────────────────────────
  const showExportDialog = ref(false);
  const isExporting = ref(false);
  const detailKeyField = options.detailKeyField || "Nomor";

  /** Whether this browse has detail data (auto-detected or explicit) */
  const hasDetail = computed(
    () => options.hasDetail === true || !!options.getDetailApi,
  );

  const resolvedMenuId = computed(() => {
    if (options.menuId) return options.menuId;
    return permissionStore.getMenuIdByRoute(route.path) || "";
  });

  const canView = computed(() => permissionStore.can(resolvedMenuId.value, "view"));
  const canInsert = computed(() => permissionStore.can(resolvedMenuId.value, "insert"));
  const canEdit = computed(() => permissionStore.can(resolvedMenuId.value, "edit"));
  const canDelete = computed(() => permissionStore.can(resolvedMenuId.value, "delete"));
  const canPrint = computed(() => permissionStore.can(resolvedMenuId.value, "print"));
  const canExport = computed(() => permissionStore.can(resolvedMenuId.value, "view"));

  const isSingleSelected = computed(() => selected.value.length === 1);
  const selectedItem = computed(() => selected.value[0] || null);

  const clearSelection = () => {
    selected.value = [];
  };

  const fetchData = async () => {
    if (!canView.value) {
      toast.error("Akses ditolak: Anda tidak memiliki izin untuk menu ini.");
      return;
    }
    isLoading.value = true;
    clearSelection();
    try {
      items.value = await options.fetchApi();
    } catch (error: any) {
      toast.error(error.response?.data?.message || "Gagal memuat data.");
    } finally {
      isLoading.value = false;
    }
  };

  const deleteData = async (id: string) => {
    if (!options.deleteApi) return;
    if (!canDelete.value) {
      toast.error("Akses ditolak: Anda tidak memiliki hak hapus.");
      return;
    }
    try {
      await options.deleteApi(id);
      toast.success("Data berhasil dihapus.");
      await fetchData();
    } catch (error: any) {
      toast.error(error.response?.data?.message || "Gagal menghapus data.");
    }
  };

  // ── Export functions ───────────────────────────────────────────────

  /** Export header data only (styled with exceljs) */
  const exportHeaderOnly = async (fileName = "Export_Data") => {
    const exportItems = getExportItems();
    if (!canExport.value) {
      toast.error("Akses ditolak.");
      return;
    }
    if (!exportItems.length) {
      toast.warning("Tidak ada data untuk diexport.");
      return;
    }

    isExporting.value = true;
    try {
      const cols: ExportColumn[] = options.columns || inferColumns(exportItems[0]);

      await exportStyledHeader({
        title: options.exportTitle || fileName,
        columns: cols,
        items: exportItems as unknown as Record<string, any>[],
        fileName,
      });
      toast.success(`Berhasil export ke ${fileName}.xlsx`);
    } catch {
      toast.error("Gagal melakukan export Excel.");
    } finally {
      isExporting.value = false;
    }
  };

  /** Export detail (header + detail merged in flat sheet, styled) */
  const exportDetailOnly = async (fileName = "Export_Data") => {
    const exportItems = getExportItems();
    if (!canExport.value) {
      toast.error("Akses ditolak.");
      return;
    }
    if (!exportItems.length) {
      toast.warning("Tidak ada data untuk diexport.");
      return;
    }
    if (!options.getDetailApi) {
      toast.error("Detail API tidak tersedia.");
      return;
    }

    isExporting.value = true;
    toast.info("Sedang mengambil data detail...");

    try {
      // Fetch all details in parallel
      const keys = exportItems.map(
        (item: any) => item[detailKeyField] as string,
      );

      const results = await Promise.allSettled(
        keys.map((key) => options.getDetailApi!(key)),
      );

      // Build detail map: key -> detail rows
      const detailMap: Record<string, Record<string, any>[]> = {};
      let errorCount = 0;

      results.forEach((result, idx) => {
        if (result.status === "fulfilled" && Array.isArray(result.value)) {
          detailMap[keys[idx]] = result.value;
        } else {
          errorCount++;
        }
      });

      // Count total detail rows
      let totalDetails = 0;
      for (const key of Object.keys(detailMap)) {
        totalDetails += detailMap[key].length;
      }

      if (totalDetails === 0) {
        toast.warning("Tidak ada data detail ditemukan.");
        return;
      }

      // Determine columns
      const headerCols: ExportColumn[] =
        options.columns || inferColumns(exportItems[0]);

      // Infer detail columns from first non-empty detail
      let detailCols: ExportColumn[] = options.detailColumns || [];
      if (detailCols.length === 0) {
        for (const key of Object.keys(detailMap)) {
          if (detailMap[key].length > 0) {
            detailCols = inferColumns(detailMap[key][0], detailKeyField);
            break;
          }
        }
      }

      await exportStyledDetail({
        title: options.exportTitle || fileName,
        headerColumns: headerCols,
        detailColumns: detailCols,
        detailKeyField,
        headerItems: exportItems as unknown as Record<string, any>[],
        detailMap,
        fileName,
      });

      const msg = errorCount > 0
        ? `Export berhasil (${totalDetails} detail, ${errorCount} error).`
        : `Berhasil export ${totalDetails} detail ke ${fileName}_Detail.xlsx`;
      toast.success(msg);
    } catch {
      toast.error("Gagal melakukan export detail Excel.");
    } finally {
      isExporting.value = false;
    }
  };

  /** Main export handler — shows dialog if has detail, direct export otherwise */
  const handleExport = () => {
    if (!canExport.value) {
      toast.error("Akses ditolak.");
      return;
    }
    if (!getExportItems().length) {
      toast.warning("Tidak ada data untuk diexport.");
      return;
    }

    // If no detail, export directly
    if (!hasDetail.value) {
      exportHeaderOnly();
      return;
    }

    // Has detail → show dialog
    showExportDialog.value = true;
  };

  onMounted(() => {
    if (options.immediate !== false) fetchData();
  });

  return {
    browseRef,
    getExportItems,
    items,
    isLoading,
    selected,
    canView,
    canInsert,
    canEdit,
    canDelete,
    canPrint,
    canExport,
    isSingleSelected,
    selectedItem,
    hasDetail,
    fetchData,
    clearSelection,
    deleteData,
    // Export
    showExportDialog,
    isExporting,
    handleExport,
    exportHeaderOnly,
    exportDetailOnly,
    exportToExcel: exportHeaderOnly, // backward compat
  };
}

// ── Auto-infer columns from first data row ──────────────────────────
function inferColumns(sample: any, excludeKey?: string): ExportColumn[] {
  if (!sample) return [];
  return Object.keys(sample)
    .filter((k) => k !== excludeKey)
    .map((key) => ({
      key,
      title: key,
      align: typeof sample[key] === "number" ? ("right" as const) : ("left" as const),
      numFmt: typeof sample[key] === "number" ? "#,##0" : undefined,
    }));
}
