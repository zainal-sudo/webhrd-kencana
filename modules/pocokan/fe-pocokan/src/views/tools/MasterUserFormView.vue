<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useToast } from "vue-toastification";
import { isAuthExpiredError } from "@/api/axios";
import BaseForm from "@/components/BaseForm.vue";
import { useTabsStore } from "@/stores/tabsStore";
import { IconUsers } from "@tabler/icons-vue";
import {
  masterUserFormApi,
  type MenuItem,
  type UserMenuPermission,
} from "@/api/tools/masterUserFormApi";

const route = useRoute();
const router = useRouter();
const toast = useToast();

const MENU_ID = "1";
const isEdit = computed(() => !!route.params.kode);
const isLoading = ref(false);
const isSaving = ref(false);

const showSaveDialog = ref(false);
const showCancelDialog = ref(false);
const showCloseDialog = ref(false);

// ── Form state ────────────────────────────────────────────────────────
const form = ref({
  kode: "",
  nama: "",
  password: "",
  editReport: 0, // USER_EDIT (int): hak edit laporan 0/1
});

const originalForm = ref<any>(null);

// ── Lookup ────────────────────────────────────────────────────────────
const allMenus = ref<MenuItem[]>([]);

// ── Permission state per menu ─────────────────────────────────────────
// Map: menu_id → { view_, insert_, edit_, delete_ }
const permissions = ref<Record<number, UserMenuPermission>>({});

const initPermissions = () => {
  const p: Record<number, UserMenuPermission> = {};
  for (const m of allMenus.value) {
    p[m.id] = {
      menu_id: m.id,
      view_: "N",
      insert_: "N",
      edit_: "N",
      delete_: "N",
    };
  }
  permissions.value = p;
};

const loadPermissions = (menus: UserMenuPermission[]) => {
  for (const m of menus) {
    if (permissions.value[m.menu_id]) {
      permissions.value[m.menu_id] = { ...m };
    }
  }
};

// ── Group menus by kategori (MEN_KETERANGAN: Setting/Library/Reports) ──
const menuGroups = computed(() => {
  const groups: {
    title: string;
    menus: (MenuItem & { perm: UserMenuPermission })[];
  }[] = [];

  const categorize = (menu: MenuItem) => {
    return menu.grp || "Lainnya";
  };

  const groupMap = new Map<
    string,
    (MenuItem & { perm: UserMenuPermission })[]
  >();
  const order = ["Setting", "Library", "Reports"];

  for (const m of allMenus.value) {
    const cat = categorize(m);
    if (!groupMap.has(cat)) groupMap.set(cat, []);
    groupMap.get(cat)!.push({
      ...m,
      perm: permissions.value[m.id] || {
        menu_id: m.id,
        view_: "N",
        insert_: "N",
        edit_: "N",
        delete_: "N",
      },
    });
  }

  for (const key of order) {
    if (groupMap.has(key)) {
      groups.push({ title: key, menus: groupMap.get(key)! });
    }
  }
  return groups;
});

// ── Toggle helpers ────────────────────────────────────────────────────
const togglePerm = (menuId: number, field: keyof UserMenuPermission) => {
  if (field === "menu_id") return;
  const p = permissions.value[menuId];
  if (!p) return;

  // View = akses menu. Nonaktifkan view → row tidak akan disimpan,
  // jadi flag insert/edit/delete ikut di-reset agar tampilan konsisten.
  if (field === "view_") {
    const next = p.view_ === "Y" ? "N" : "Y";
    p.view_ = next;
    if (next === "N") {
      p.insert_ = "N";
      p.edit_ = "N";
      p.delete_ = "N";
    }
    return;
  }
  p[field] = p[field] === "Y" ? "N" : "Y";
};

const toggleGroupAll = (
  group: (typeof menuGroups.value)[0],
  checked: boolean
) => {
  const val = checked ? "Y" : "N";
  for (const m of group.menus) {
    const p = permissions.value[m.id];
    if (p) {
      p.view_ = val;
      p.insert_ = val;
      p.edit_ = val;
      p.delete_ = val;
    }
  }
};

const isGroupAllChecked = (group: (typeof menuGroups.value)[0]) =>
  group.menus.every((m) => {
    const p = permissions.value[m.id];
    return (
      p &&
      p.view_ === "Y" &&
      p.insert_ === "Y" &&
      p.edit_ === "Y" &&
      p.delete_ === "Y"
    );
  });

const isGroupPartial = (group: (typeof menuGroups.value)[0]) =>
  !isGroupAllChecked(group) &&
  group.menus.some((m) => {
    const p = permissions.value[m.id];
    return (
      p &&
      (p.view_ === "Y" ||
        p.insert_ === "Y" ||
        p.edit_ === "Y" ||
        p.delete_ === "Y")
    );
  });

// ── Presets ───────────────────────────────────────────────────────────
const setPreset = (preset: "full" | "viewOnly" | "none") => {
  for (const id of Object.keys(permissions.value)) {
    const p = permissions.value[Number(id)];
    if (preset === "full") {
      p.view_ = "Y";
      p.insert_ = "Y";
      p.edit_ = "Y";
      p.delete_ = "Y";
    } else if (preset === "viewOnly") {
      p.view_ = "Y";
      p.insert_ = "N";
      p.edit_ = "N";
      p.delete_ = "N";
    } else {
      p.view_ = "N";
      p.insert_ = "N";
      p.edit_ = "N";
      p.delete_ = "N";
    }
  }
};

// ── Hitung jumlah hak aktif ───────────────────────────────────────────
const activeCount = computed(() => {
  let count = 0;
  for (const p of Object.values(permissions.value)) {
    if (p.view_ === "Y") count++;
    if (p.insert_ === "Y") count++;
    if (p.edit_ === "Y") count++;
    if (p.delete_ === "Y") count++;
  }
  return count;
});

const totalSlots = computed(() => Object.keys(permissions.value).length * 4);

// ── Load ──────────────────────────────────────────────────────────────
onMounted(async () => {
  isLoading.value = true;
  try {
    allMenus.value = await masterUserFormApi.getAllMenus();
    initPermissions();

    if (isEdit.value) {
      const d = await masterUserFormApi.getDetail(
        decodeURIComponent(route.params.kode as string)
      );
      form.value = {
        kode: d.kode,
        nama: d.nama,
        password: d.password,
        editReport: d.editReport,
      };
      loadPermissions(d.menus);
      originalForm.value = {
        form: JSON.parse(JSON.stringify(form.value)),
        perms: JSON.parse(JSON.stringify(permissions.value)),
      };
    }
  } catch (e: any) {
    if (isAuthExpiredError(e)) return;
    toast.error(e.response?.data?.message ?? "Gagal memuat data.");
    router.back();
  } finally {
    isLoading.value = false;
  }
});

// ── Validasi + Simpan ─────────────────────────────────────────────────
const validateSave = () => {
  if (!form.value.kode.trim()) {
    toast.warning("Kode user wajib diisi.");
    return;
  }
  if (!form.value.nama.trim()) {
    toast.warning("Nama user wajib diisi.");
    return;
  }
  showSaveDialog.value = true;
};
const tabsStore = useTabsStore();
const confirmSave = async () => {
  isSaving.value = true;
  try {
    const menuList = Object.values(permissions.value);
    await masterUserFormApi.save({
      ...form.value,
      menus: menuList,
      isEdit: isEdit.value,
    });
    toast.success("User berhasil disimpan.");
    showSaveDialog.value = false;

    // AMBIL TAB SAAT INI DAN PAKSA JADIKAN CLOSABLE = TRUE
    const currentTab = tabsStore.tabs.find((t) => t.id === route.path);
    if (currentTab) {
      currentTab.closable = true; // Paksa izinkan tutup
    }

    // Tutup tab berdasarkan path route aktif
    tabsStore.closeTab(route.path);

    // Pindah ke halaman master user
    router.push({ name: "MasterUser" });
  } catch (e: any) {
    if (isAuthExpiredError(e)) return;
    toast.error(e.response?.data?.message ?? "Gagal menyimpan.");
  } finally {
    isSaving.value = false;
  }
};
const confirmCancel = () => {
  showCancelDialog.value = false;
  if (isEdit.value && originalForm.value) {
    form.value = JSON.parse(JSON.stringify(originalForm.value.form));
    permissions.value = JSON.parse(JSON.stringify(originalForm.value.perms));
  } else {
    form.value = {
      kode: "",
      nama: "",
      password: "",
      editReport: 0,
    };
    initPermissions();
  }
};

const confirmClose = () => {
  showCloseDialog.value = false;

  // Tutup tab form agar tidak nangkring di tab bar (KeepAlive bisa
  // memunculkan lagi state form lama kalau tab tidak ditutup).
  const currentTab = tabsStore.tabs.find((t) => t.id === route.path);
  if (currentTab) {
    currentTab.closable = true; // paksa izinkan tutup
  }
  tabsStore.closeTab(route.path);

  router.push({ name: "MasterUser" });
};
</script>

<template>
  <BaseForm
    title="Master User"
    :menu-id="MENU_ID"
    :icon="IconUsers"
    :is-loading="isLoading"
    :is-saving="isSaving"
    :is-edit-mode="isEdit"
    v-model:show-save-dialog="showSaveDialog"
    v-model:show-cancel-dialog="showCancelDialog"
    v-model:show-close-dialog="showCloseDialog"
    @validate-save="validateSave"
    @confirm-save="confirmSave"
    @confirm-cancel="confirmCancel"
    @confirm-close="confirmClose"
  >
    <!-- ── LEFT COLUMN ── -->
    <template #left-column>
      <div class="left-col-wrap">
        <!-- Info User -->
        <div class="form-section">
          <div class="form-section-title">Informasi User</div>

          <div class="field-row">
            <label class="field-lbl">Kode <span class="req">*</span></label>
            <input
              v-model="form.kode"
              class="form-inp mono"
              :readonly="isEdit"
              placeholder="Kode user"
              maxlength="10"
            />
          </div>

          <div class="field-row">
            <label class="field-lbl">Nama <span class="req">*</span></label>
            <input
              v-model="form.nama"
              class="form-inp"
              placeholder="Nama lengkap"
              maxlength="30"
            />
          </div>

          <div class="field-row">
            <label class="field-lbl">Password</label>
            <input
              v-model="form.password"
              type="password"
              class="form-inp"
              placeholder="Password"
              maxlength="15"
              autocomplete="new-password"
            />
          </div>

          <div class="check-row">
            <label class="check-item">
              <input
                type="checkbox"
                :checked="form.editReport === 1"
                @change="
                  form.editReport = ($event.target as HTMLInputElement).checked
                    ? 1
                    : 0
                "
              />
              <span>Edit Report</span>
            </label>
          </div>
        </div>

        <!-- Preset & Summary -->
        <div class="form-section">
          <div class="form-section-title">Preset Hak Akses</div>
          <div class="preset-wrap">
            <button
              class="preset-btn green"
              type="button"
              @click="setPreset('full')"
            >
              Full
            </button>
            <button
              class="preset-btn blue"
              type="button"
              @click="setPreset('viewOnly')"
            >
              View Only
            </button>
            <button
              class="preset-btn grey"
              type="button"
              @click="setPreset('none')"
            >
              Reset
            </button>
          </div>
          <div class="perm-summary">
            <span class="perm-count">{{ activeCount }}</span>
            <span class="perm-total"> / {{ totalSlots }} hak aktif</span>
          </div>
        </div>
      </div>
    </template>

    <!-- ── RIGHT COLUMN ── -->
    <template #right-column>
      <div class="right-col-wrap">
        <div class="form-section-title">Hak Akses Menu</div>

        <div class="perm-scroll">
          <div
            v-for="group in menuGroups"
            :key="group.title"
            class="perm-group"
          >
            <!-- Group header -->
            <div class="group-header">
              <label class="group-check">
                <input
                  type="checkbox"
                  :checked="isGroupAllChecked(group)"
                  :indeterminate="isGroupPartial(group)"
                  @change="
                    toggleGroupAll(
                      group,
                      ($event.target as HTMLInputElement).checked
                    )
                  "
                />
                <span class="group-title">{{ group.title }}</span>
              </label>
              <div class="group-cols">
                <span class="col-lbl">View</span>
                <span class="col-lbl">Insert</span>
                <span class="col-lbl">Edit</span>
                <span class="col-lbl">Delete</span>
              </div>
            </div>

            <!-- Menu rows -->
            <div v-for="m in group.menus" :key="m.id" class="perm-row">
              <div class="perm-menu-info">
                <span class="perm-id">{{ m.id }}</span>
                <span class="perm-nama">{{ m.nama }}</span>
              </div>
              <div class="perm-checks">
                <input
                  type="checkbox"
                  :checked="permissions[m.id]?.view_ === 'Y'"
                  @change="togglePerm(m.id, 'view_')"
                  class="perm-cb"
                />
                <input
                  type="checkbox"
                  :checked="permissions[m.id]?.insert_ === 'Y'"
                  @change="togglePerm(m.id, 'insert_')"
                  class="perm-cb"
                />
                <input
                  type="checkbox"
                  :checked="permissions[m.id]?.edit_ === 'Y'"
                  @change="togglePerm(m.id, 'edit_')"
                  class="perm-cb"
                />
                <input
                  type="checkbox"
                  :checked="permissions[m.id]?.delete_ === 'Y'"
                  @change="togglePerm(m.id, 'delete_')"
                  class="perm-cb"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>
  </BaseForm>
</template>

<style scoped>
/* ── Left column ── */
.left-col-wrap {
  height: 100%;
  overflow-y: auto;
  overflow-x: hidden;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding-right: 4px;
}
.form-section {
  background: white;
  border: 1px solid #c8c8e6;
  border-radius: 8px;
  border-top: 3px solid #3B5998;
  padding: 12px 14px;
}
.form-section-title {
  font-size: 10px;
  font-weight: 700;
  color: #3B5998;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  margin-bottom: 10px;
}

/* ── Fields ── */
.field-row {
  display: flex;
  flex-direction: column;
  gap: 3px;
  margin-bottom: 9px;
}
.field-row:last-child {
  margin-bottom: 0;
}
.field-lbl {
  font-size: 11px;
  font-weight: 600;
  color: #4b5563;
}
.req {
  color: #e53935;
}

.form-inp {
  height: 30px;
  border: 1px solid #d1d5db;
  border-radius: 5px;
  padding: 0 8px;
  font-size: 11px;
  outline: none;
  background: white;
  color: #111827;
  width: 100%;
  box-sizing: border-box;
  transition: border-color 0.15s;
}
.form-inp:focus {
  border-color: #3B5998;
  box-shadow: 0 0 0 2px rgba(46, 46, 125, 0.1);
}
.form-inp:read-only {
  background: #f9fafb;
  color: #6b7280;
}
.form-inp.mono {
  font-family: monospace;
}
select.form-inp {
  cursor: pointer;
}

/* ── Checkboxes ── */
.check-row {
  display: flex;
  gap: 16px;
  margin-top: 4px;
}
.check-item {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  font-weight: 600;
  color: #374151;
  cursor: pointer;
}
.check-item input {
  accent-color: #3B5998;
  width: 14px;
  height: 14px;
  cursor: pointer;
}

/* ── Select with arrow ── */
.select-wrap {
  position: relative;
}
.form-select {
  height: 30px;
  border: 1px solid #d1d5db;
  border-radius: 5px;
  padding: 0 28px 0 8px;
  font-size: 11px;
  outline: none;
  background: white;
  color: #111827;
  width: 100%;
  box-sizing: border-box;
  cursor: pointer;
  appearance: none;
  -webkit-appearance: none;
  transition: border-color 0.15s;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%236b7280'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 10px center;
}
.form-select:focus {
  border-color: #3B5998;
  box-shadow: 0 0 0 2px rgba(46, 46, 125, 0.1);
}

/* ── Presets ── */
.preset-wrap {
  display: flex;
  gap: 6px;
  margin-bottom: 8px;
}
.preset-btn {
  flex: 1;
  height: 30px;
  border: none;
  border-radius: 5px;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.15s;
}
.preset-btn:hover {
  opacity: 0.85;
}
.preset-btn.green {
  background: #3B5998;
  color: white;
}
.preset-btn.blue {
  background: #1565c0;
  color: white;
}
.preset-btn.grey {
  background: #e5e7eb;
  color: #374151;
}

.perm-summary {
  font-size: 11px;
  color: #6b7280;
  text-align: center;
  padding-top: 4px;
}
.perm-count {
  font-weight: 700;
  color: #3B5998;
  font-size: 14px;
}
.perm-total {
  font-weight: 500;
}

/* ── Right column — permissions ── */
.right-col-wrap {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: white;
  border: 1px solid #c8c8e6;
  border-radius: 8px;
  border-top: 3px solid #3B5998;
  overflow: hidden;
}
.right-col-wrap > .form-section-title {
  padding: 10px 14px 0;
  margin-bottom: 0;
  flex-shrink: 0;
}
.perm-scroll {
  flex: 1;
  overflow-y: auto;
  padding: 8px 14px 14px;
}

/* ── Group ── */
.perm-group {
  margin-bottom: 12px;
}
.perm-group:last-child {
  margin-bottom: 0;
}

.group-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: #3B5998;
  border-radius: 5px;
  padding: 6px 10px;
  margin-bottom: 2px;
}
.group-check {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
}
.group-check input {
  accent-color: #ffd54f;
  width: 14px;
  height: 14px;
  cursor: pointer;
}
.group-title {
  font-size: 11px;
  font-weight: 700;
  color: white;
  text-transform: uppercase;
}
.group-cols {
  display: grid;
  grid-template-columns: repeat(4, 50px);
  text-align: center;
}
.col-lbl {
  font-size: 9px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.7);
  text-transform: uppercase;
}

/* ── Permission row ── */
.perm-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 5px 10px;
  border-bottom: 1px solid #f0f0f0;
  transition: background 0.1s;
}
.perm-row:hover {
  background: rgba(46, 46, 125, 0.04);
}
.perm-row:last-child {
  border-bottom: none;
}

.perm-menu-info {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 0;
}
.perm-id {
  font-size: 10px;
  font-weight: 700;
  color: #3B5998;
  background: #e8e8f5;
  border-radius: 3px;
  padding: 1px 5px;
  min-width: 24px;
  text-align: center;
  flex-shrink: 0;
}
.perm-nama {
  font-size: 11px;
  color: #374151;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.perm-checks {
  display: grid;
  grid-template-columns: repeat(4, 50px);
  justify-items: center;
  flex-shrink: 0;
}
.perm-cb {
  width: 15px;
  height: 15px;
  cursor: pointer;
  accent-color: #3B5998;
}
</style>
