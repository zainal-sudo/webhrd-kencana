<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from "vue";
import { useRoute, useRouter, onBeforeRouteLeave } from "vue-router";
import { useToast } from "vue-toastification";
import FSelect from "@/components/fields/FSelect.vue";
import MsIcon from "@/components/MsIcon.vue";
import { api, getErrorMessage } from "@/api/axios";
import { useAuthStore } from "@/stores/authStore";
import { usePermissionStore } from "@/stores/permissionStore";
import { useTabsStore } from "@/stores/tabsStore";
import { permissionFromApi, permissionToApi, changePermission, type PermissionAction, type UserPermissionRow } from "@/utils/userPermissions";
const route = useRoute();
const initialKode = String(route.query.kode || "");
const tabs = useTabsStore();
// Keep the identity of this page when another cached tab becomes active.
const tabId = tabs.generateTabId(route.path, { ...route.query });
const router = useRouter(), toast = useToast(), auth = useAuthStore(), permissions = usePermissionStore();
const users = ref<{ Kode: string; Nama: string }[]>([]);
const kodeAktif = ref(initialKode), loadedKode = ref("");
const items = ref<UserPermissionRow[]>([]);
const memuat = ref(true), menyimpan = ref(false), loaded = ref(false), loadError = ref("");
const snapshot = ref("");
let request = 0, disposed = false;
const canEdit = computed(() => auth.can("frmUser", "edit"));
const serialize = () => JSON.stringify(items.value.map(permissionToApi));
const dirty = computed(() => loaded.value && serialize() !== snapshot.value);
const canSave = computed(() => canEdit.value && loaded.value && !!loadedKode.value && kodeAktif.value === loadedKode.value && !memuat.value && !menyimpan.value);
const grup = computed(() => {
  const groups: Record<number, UserPermissionRow[]> = {};
  for (const item of items.value) (groups[item.men_modul] ||= []).push(item);
  return Object.entries(groups).map(([modul, list]) => ({ modul, list }));
});
function menuLabel(item: UserPermissionRow) {
  return String(item.men_keterangan || item.men_nama || "")
    .replace(/\bAkhit\b/gi, "Akhir")
    // Tampilan nama modul di form ini: "Sandi BPJS" ditulis "Sandi" (data DB tidak diubah).
    .replace(/\bSandi BPJS\b/gi, "Sandi");
}
function updateTabTitle(kode: string) {
  const tab = tabs.tabs.find(item => item.id === tabId);
  if (!tab) return;
  const name = users.value.find(user => user.Kode === kode)?.Nama?.trim() || kode;
  tab.title = name ? `Hak Akses \u00b7 ${name}` : "Hak Akses";
}
async function load(kode: string, preserveError = false) {
  const seq = ++request;
  updateTabTitle(kode);
  loaded.value = false; memuat.value = true; items.value = [];
  if (!preserveError) loadError.value = "";
  if (!kode) { loadedKode.value = ""; memuat.value = false; return; }
  try {
    const { data } = await api.get(`/master/user/${encodeURIComponent(kode)}/hak`);
    if (disposed || seq !== request) return;
    items.value = data.data.map(permissionFromApi);
    loadedKode.value = kode; loaded.value = true; snapshot.value = serialize();
  } catch (err) {
    if (disposed || seq !== request) return;
    loadError.value = getErrorMessage(err, "Gagal memuat hak akses.");
  } finally { if (!disposed && seq === request) memuat.value = false; }
}
onMounted(async () => {
  try {
    const { data } = await api.get("/master/user");
    if (disposed) return;
    users.value = data.data;
    await load(initialKode);
  } catch (err) {
    if (!disposed) { loadError.value = getErrorMessage(err, "Gagal memuat daftar user."); memuat.value = false; }
  }
});
onUnmounted(() => { disposed = true; ++request; });
function discardAllowed() { return !auth.isAuthenticated || !dirty.value || window.confirm("Perubahan hak akses belum disimpan. Tinggalkan perubahan?"); }
onBeforeRouteLeave(() => !auth.isAuthenticated || !auth.can("frmUser") || (!menyimpan.value && discardAllowed()));
async function gantiUser() {
  if (menyimpan.value || !discardAllowed()) { kodeAktif.value = loadedKode.value; return; }
  await load(String(kodeAktif.value || ""));
}
function toggle(item: UserPermissionRow, action: PermissionAction, checked: boolean) {
  if (!canSave.value) return;
  changePermission(item, action, checked);
}
const permissionColumns: { action: PermissionAction; label: string }[] = [
  { action: "view", label: "Lihat" }, { action: "insert", label: "Tambah" },
  { action: "edit", label: "Ubah" }, { action: "delete", label: "Hapus" },
];
function columnState(list: UserPermissionRow[], action: PermissionAction) {
  const count = list.filter(item => item[action]).length;
  return { checked: list.length > 0 && count === list.length, partial: count > 0 && count < list.length };
}
function setAll(list: UserPermissionRow[], action: PermissionAction, checked: boolean) {
  for (const item of list) toggle(item, action, checked);
}
async function simpan() {
  if (!canSave.value) return;
  const target = loadedKode.value;
  menyimpan.value = true;
  let saved = false;
  try {
    const { data } = await api.put(`/master/user/${encodeURIComponent(target)}/hak`, { user_kode: target, items: items.value.map(permissionToApi) });
    saved = true;
    if (disposed) return;
    toast.success(data.message || "Hak akses berhasil disimpan.");
    if (String(auth.user?.user_kode || "").toUpperCase() === target.toUpperCase()) {
      await auth.refreshProfile(); permissions.build();
      if (!auth.can("frmUser")) {
        loaded.value = false; items.value = []; snapshot.value = "";
        await router.replace("/dashboard"); return;
      }
    }
    await load(target);
  } catch (err) {
    if (disposed) return;
    loadError.value = saved ? "Hak akses tersimpan, tetapi profil/menu belum berhasil dimuat ulang. Muat ulang halaman." : getErrorMessage(err, "Gagal menyimpan hak akses. Muat ulang untuk memeriksa kondisi aktual.");
    toast.error(loadError.value);
    await load(target, true);
  } finally { menyimpan.value = false; }
}
</script>

<template>
  <div class="page hak-user-page">
    <div class="sticky-header">
    <header class="page-head">
      <div class="page-heading">
        <span class="page-icon"><MsIcon name="admin_panel_settings" :size="21" /></span>
        <div><h1>Hak Akses User</h1><p>Atur hak Lihat, Tambah, Ubah, dan Hapus per modul.</p></div>
      </div>
      <button type="button" class="btn back-button" :disabled="menyimpan" @click="router.back()"><MsIcon name="arrow_back" :size="16" />Kembali</button>
    </header>
    <div class="bar-top">
      <FSelect v-model="kodeAktif" label="Pilih User" searchable placeholder="Cari kode atau nama user..." menu-class="hak-user-select-menu" menu-transition="fade-transition" :options="users.map(user => ({ label: `${user.Kode} - ${user.Nama}`, value: user.Kode }))" :disabled="menyimpan || memuat" @update:model-value="gantiUser" />
      <button type="button" class="btn primary" :disabled="!canSave" @click="simpan"><MsIcon name="save" :size="16" /><span>{{ menyimpan ? 'Menyimpan...' : 'Simpan Hak Akses' }}</span></button>
    </div>
    </div>
    <div v-if="loadError" class="notice err" role="alert"><span>{{ loadError }}</span><button type="button" class="btn" :disabled="memuat || menyimpan" @click="load(String(kodeAktif || ''))">Muat ulang</button></div>
    <p v-if="dirty" class="notice dirty-notice" role="status"><MsIcon name="info" :size="16" />Ada perubahan yang belum disimpan.</p>
    <div class="permission-body" :aria-busy="memuat">
      <div v-if="memuat" class="loading" role="status">Memuat hak akses...</div>
      <p v-else-if="!kodeAktif" class="empty-state">Pilih user untuk melihat hak akses.</p>
      <fieldset v-for="group in memuat ? [] : grup" :key="group.modul" class="fs permission-card" :disabled="!canSave">
        <legend>Modul {{ group.modul }}</legend>
        <div class="table-scroll" tabindex="0" :aria-label="`Tabel izin Modul ${group.modul}`">
          <table class="tbl">
            <colgroup><col class="menu-column" /><col /><col v-for="column in permissionColumns" :key="column.action" class="permission-column" /></colgroup>
            <thead><tr>
            <th scope="col" class="menu-code">Menu</th><th scope="col">Keterangan</th>
            <th v-for="column in permissionColumns" :key="column.action" scope="col" class="c">
              <span class="permission-title">{{ column.label }}</span>
              <label class="select-all">
                <input type="checkbox" :checked="columnState(group.list, column.action).checked" :indeterminate="columnState(group.list, column.action).partial" :aria-checked="columnState(group.list, column.action).partial ? 'mixed' : columnState(group.list, column.action).checked" :aria-label="`Semua ${column.label} pada Modul ${group.modul}`" @change="setAll(group.list, column.action, ($event.target as HTMLInputElement).checked)" />
                <span>Semua</span>
              </label>
            </th>
          </tr></thead>
            <tbody><tr v-for="item in group.list" :key="item.men_id"><td class="mono">{{ item.men_id }}</td><td>{{ menuLabel(item) }}</td>
              <td v-for="action in (['view', 'insert', 'edit', 'delete'] as const)" :key="action" class="c"><input type="checkbox" :aria-label="`${menuLabel(item)}: ${action}`" :checked="item[action]" @change="toggle(item, action, ($event.target as HTMLInputElement).checked)" /></td>
            </tr></tbody>
          </table>
        </div>
      </fieldset>
    </div>
  </div>
</template>

<style scoped>
.hak-user-page {
  height: 100%; min-height: 0; display: flex; flex-direction: column; overflow: hidden;
  border: 1px solid var(--ds-border, #a0aab8); border-radius: var(--ds-radius-lg, 12px);
  background: var(--ds-surface, #f0f3f8); color: var(--ds-text, #1b2d4a);
  font-family: var(--ds-font, sans-serif);
}
.sticky-header { position: sticky; top: 0; z-index: 3; flex-shrink: 0; background: var(--ds-surface, #f0f3f8); }
.hak-user-page .page-head {
  display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-shrink: 0;
  padding: 8px 14px; border-bottom: 1px solid var(--ds-border-light, #c4cad3);
  background: var(--ds-surface-variant, #e0e4ea);
}
.page-heading { display: flex; align-items: center; gap: 8px; min-width: 0; }
.page-icon { flex-shrink: 0; width: 30px; height: 30px; display: grid; place-items: center; border-radius: 10px; background: var(--ds-primary-50, #e8edf5); color: var(--ds-primary, #3b5998); }
.hak-user-page h1 { margin: 0; font-size: 15px; font-weight: 700; line-height: 1.4; }
.hak-user-page .page-heading p { margin: 2px 0 0; font-size: 10px; line-height: 1.5; color: var(--ds-text-secondary, #5a6a7e); }
.bar-top { display: flex; align-items: flex-end; justify-content: space-between; flex-shrink: 0; flex-wrap: wrap; gap: 12px; padding: 8px 14px; }
.bar-top :deep(.field) { flex: 1 1 260px; max-width: 440px; min-width: 0; flex-direction: column; align-items: stretch; gap: 4px; }
.bar-top :deep(.field label) { flex: initial; width: auto; font-size: 11px; }
.bar-top :deep(.select-wrap) { width: 100%; }
.bar-top :deep(.searchable-select) { width: 100%; flex: initial; --v-input-control-height: 36px; }
.bar-top :deep(.searchable-select .v-field) { font-size: 12px; }
.bar-top :deep(.searchable-select .v-field__input) { min-height: 36px; }
.bar-top :deep(.searchable-select input[id^="fselect-"]) { height: 36px; }
.bar-top :deep(.searchable-select .v-autocomplete__selection) { font-size: 12px; font-weight: 600; }
.bar-top :deep(.searchable-select input) { font-weight: 600; }
:global(.hak-user-select-menu) { border-radius: 10px !important; max-height: min(260px, calc(100dvh - 32px)) !important; }
:global(.hak-user-select-menu .v-list) { max-height: inherit; overflow-y: auto; overscroll-behavior: contain; scrollbar-width: thin; scrollbar-color: var(--ds-border, #a0aab8) transparent; }
:global(.hak-user-select-menu .v-list-item--active) { color: var(--ds-primary, #3b5998); }

.btn { display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; gap: 6px; box-sizing: border-box; height: 36px; padding: 0 12px; border: 1px solid var(--ds-border-light, #c4cad3); border-radius: var(--ds-radius-md, 8px); background: var(--ds-surface-raised, #fff); color: var(--ds-text, #1b2d4a); font: inherit; font-size: 11px; font-weight: 600; cursor: pointer; white-space: nowrap; transition: background-color 150ms ease, border-color 150ms ease; }
.btn.primary { background: var(--ds-action, #3b5998); border-color: var(--ds-action, #3b5998); color: #fff; }
.btn:not(:disabled):hover { background: var(--ds-primary-50, #e8edf5); border-color: var(--ds-primary-200, #9aaad0); }
.btn.primary:not(:disabled):hover { background: var(--ds-primary-darken-1, #2c4472); border-color: var(--ds-primary-darken-1, #2c4472); }
.btn:disabled { opacity: .55; cursor: not-allowed; }
/* Scrollbar area kartu disembunyikan (area tetap bisa digulir) — scrollbar yang tampil hanya milik tabel. */
.permission-body { flex: 1; min-height: 0; overflow: auto; overscroll-behavior: contain; padding: 0 14px 14px; scrollbar-width: none; }
.permission-body::-webkit-scrollbar { display: none; }
.permission-card { min-width: 0; margin: 0 0 16px; padding: 16px; border: 1px solid var(--ds-border-light, #c4cad3); border-radius: var(--ds-radius-lg, 12px); background: var(--ds-surface-raised, #fff); }
.permission-card legend { float: left; width: 100%; padding: 0; margin: 0 0 12px; font-size: 13px; font-weight: 700; color: var(--ds-text, #1b2d4a); }
.table-scroll { clear: both; width: 100%; max-height: min(560px, max(180px, calc(100dvh - 300px))); overflow: auto; overscroll-behavior: auto; isolation: isolate; border: 1px solid var(--ds-border-light, #c4cad3); border-radius: var(--ds-radius-md, 8px); }
.tbl { width: 100%; min-width: 800px; table-layout: fixed; border-collapse: separate; border-spacing: 0; font-size: 11px; text-align: left; }
.tbl th { position: sticky; top: 0; z-index: 2; vertical-align: middle; box-shadow: 0 1px 0 var(--ds-border-light, #c4cad3); padding: 10px 12px; background: var(--ds-surface, #f0f3f8); border-bottom: 1px solid var(--ds-border-light, #c4cad3); color: var(--ds-text-secondary, #5a6a7e); font-weight: 600; white-space: nowrap; }
.tbl td { padding: 9px 12px; border-bottom: 1px solid var(--ds-border-light, #c4cad3); line-height: 1.4; }
.tbl tr:last-child td { border-bottom: 0; }
.tbl tbody tr:hover { background: var(--ds-primary-50, #e8edf5); }
.permission-title { display: block; margin-bottom: 8px; color: var(--ds-text, #1b2d4a); }
.select-all { width: 100%; display: inline-flex; align-items: center; justify-content: center; gap: 6px; color: var(--ds-text-secondary, #5a6a7e); font-size: 10px; font-weight: 500; cursor: pointer; }
.tbl .select-all input { margin: 0; }
fieldset:disabled .select-all { cursor: not-allowed; }
.tbl .c { text-align: center; }
.tbl .permission-column { width: 120px; }
.tbl .menu-column { width: 100px; }
.tbl td:nth-child(2) { overflow-wrap: anywhere; }
.mono { font-family: var(--ds-font-mono, monospace); color: var(--ds-text-muted, #8494a7); }
.tbl input { display: block; width: 16px; height: 16px; margin: 0 auto; accent-color: var(--ds-action, #3b5998); cursor: pointer; }
fieldset:disabled input { cursor: not-allowed; }
fieldset:disabled { opacity: .7; }
.notice { display: flex; align-items: center; flex-shrink: 0; gap: 8px; margin: 0 20px 12px; padding: 10px 12px; border: 1px solid var(--ds-border-light, #c4cad3); border-radius: var(--ds-radius-md, 8px); font-size: 11px; line-height: 1.5; }
.err { justify-content: space-between; flex-wrap: wrap; color: var(--ds-error, #dc2626); background: color-mix(in srgb, var(--ds-error, #dc2626) 5%, transparent); }
.dirty-notice { color: var(--ds-text-secondary, #5a6a7e); background: var(--ds-primary-50, #e8edf5); }
.loading, .empty-state { margin: 0; padding: 32px 16px; text-align: center; font-size: 12px; color: var(--ds-text-secondary, #5a6a7e); }
.btn:focus-visible, .table-scroll:focus-visible, .tbl input:focus-visible { outline: 2px solid var(--ds-primary, #3b5998); outline-offset: 2px; }
@media (max-width: 600px) {
  .hak-user-page .page-head { align-items: flex-start; padding: 8px 12px; gap: 10px; }
  .page-heading { align-items: flex-start; gap: 8px; }
  .page-icon { width: 32px; height: 32px; border-radius: 8px; }
  .hak-user-page h1 { font-size: 15px; }
  .back-button { padding: 0 8px; }
  .bar-top { padding: 8px 12px; gap: 8px; }
  .bar-top :deep(.field) { flex-basis: 100%; max-width: none; }
  .bar-top .primary { width: 100%; }
  .permission-body { padding: 0 12px 12px; }
  .permission-card { padding: 12px; }
  .notice { margin-right: 12px; margin-left: 12px; }
}
@media (prefers-reduced-motion: reduce) { .btn { transition: none; } }
</style>
