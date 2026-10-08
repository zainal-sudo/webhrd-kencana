<script setup lang="ts">
import { ref, computed, onMounted, onActivated } from "vue";
import { useRouter } from "vue-router";
import { useToast } from "vue-toastification";
import MsIcon from "@/components/MsIcon.vue";
import { useAuthStore } from "@/stores/authStore";
import { usePermissionStore } from "@/stores/permissionStore";
import { useTabsStore } from "@/stores/tabsStore";
import { pickError, safeGet } from "@/api";
import { formatNumber } from "@/utils/format";
import { normalizeIcon } from "@/utils/icon";

const router = useRouter();
const toast = useToast();
const authStore = useAuthStore();
const permissionStore = usePermissionStore();
const tabsStore = useTabsStore();

interface Ringkasan {
  totalKaryawan: number;
  karyawanAktif: number;
  karyawanKeluar: number;
  departments: number;
  jabatan: number;
  pabrik: number;
}

const data = ref<Ringkasan | null>(null);
const loading = ref(false);

const groups = computed(() => permissionStore.menuTree);

async function load() {
  loading.value = true;
  try {
    data.value = await safeGet<Ringkasan>("/master/ringkasan");
  } catch (e) {
    toast.error(pickError(e));
  } finally {
    loading.value = false;
  }
}

function open(node: { label: string; route?: string; icon?: string }) {
  if (!node.route) return;
  tabsStore.openTab({ title: node.label, path: node.route, icon: node.icon || "", closable: true });
  router.push(node.route);
}

onMounted(load);
let firstActivation = true;
onActivated(() => {
  if (firstActivation) {
    firstActivation = false;
    return;
  }
  load();
});
</script>

<template>
  <div class="dash">
    <div class="hero">
      <div class="hero-text">
        <strong>Selamat datang, {{ authStore.user?.user_nama || authStore.user?.user_kode }}</strong>
        <small>
          Kode user <b>{{ authStore.user?.user_kode }}</b> &middot;
          Pabrik/Cabang <b>{{ authStore.user?.user_akses || "Semua" }}</b>
        </small>
      </div>
      <button class="btn-refresh" :disabled="loading" @click="load">
        <MsIcon :name="loading ? 'progress_activity' : 'refresh'" :size="15" />
        <span>Muat ulang</span>
      </button>
    </div>

    <div class="kpi-row">
      <div class="kpi">
        <span class="kpi-icon blue"><MsIcon name="badge" :size="20" /></span>
        <div>
          <small>Total Karyawan</small>
          <strong>{{ formatNumber(data?.totalKaryawan ?? 0) }}</strong>
        </div>
      </div>
      <div class="kpi">
        <span class="kpi-icon green"><MsIcon name="how_to_reg" :size="20" /></span>
        <div>
          <small>Karyawan Aktif</small>
          <strong>{{ formatNumber(data?.karyawanAktif ?? 0) }}</strong>
        </div>
      </div>
      <div class="kpi">
        <span class="kpi-icon red"><MsIcon name="logout" :size="20" /></span>
        <div>
          <small>Sudah Keluar</small>
          <strong>{{ formatNumber(data?.karyawanKeluar ?? 0) }}</strong>
        </div>
      </div>
      <div class="kpi">
        <span class="kpi-icon amber"><MsIcon name="factory" :size="20" /></span>
        <div>
          <small>Pabrik / Unit</small>
          <strong>{{ formatNumber(data?.pabrik ?? 0) }}</strong>
        </div>
      </div>
      <div class="kpi">
        <span class="kpi-icon slate"><MsIcon name="account_tree" :size="20" /></span>
        <div>
          <small>Departemen</small>
          <strong>{{ formatNumber(data?.departments ?? 0) }}</strong>
        </div>
      </div>
      <div class="kpi">
        <span class="kpi-icon violet"><MsIcon name="engineering" :size="20" /></span>
        <div>
          <small>Jabatan</small>
          <strong>{{ formatNumber(data?.jabatan ?? 0) }}</strong>
        </div>
      </div>
    </div>

    <div class="modul-head">Modul yang dapat diakses</div>
    <div v-if="groups.length === 0" class="empty">
      <MsIcon name="lock" :size="20" />
      Belum ada modul yang diberikan. Hubungi administrator untuk hak akses.
    </div>
    <div class="modul-grid">
      <div v-for="g in groups" :key="g.key" class="modul-group">
        <div class="modul-group-head">
          <MsIcon :name="normalizeIcon(g.icon)" :size="16" />
          <span>{{ g.label }}</span>
        </div>
        <button
          v-for="c in g.children"
          :key="c.key"
          class="modul-item"
          @click="open(c)"
        >
          <MsIcon :name="normalizeIcon(c.icon) || 'chevron_right'" :size="14" />
          <span>{{ c.label }}</span>
          <MsIcon name="chevron_right" :size="14" class="chev" />
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.dash {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.hero {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 16px;
  background: linear-gradient(180deg, #12324f 0%, #1b3e60 100%);
  color: #fff;
  border: 1px solid #0b2136;
}
.hero-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.hero-text strong {
  font-size: 15px;
  font-weight: 800;
}
.hero-text small {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.65);
}
.hero-text b {
  color: #fff;
}
.btn-refresh {
  height: 30px;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 12px;
  border: 1px solid rgba(255, 255, 255, 0.25);
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
  font-family: "Plus Jakarta Sans", sans-serif;
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
}
.btn-refresh:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.18);
}
.kpi-row {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
  gap: 10px;
}
.kpi {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px;
  background: #fff;
  border: 1px solid var(--ds-border, #b0b8c4);
}
.kpi-icon {
  width: 38px;
  height: 38px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  flex-shrink: 0;
}
.kpi-icon.blue { background: #1b5e9e; }
.kpi-icon.green { background: #059669; }
.kpi-icon.red { background: #dc2626; }
.kpi-icon.amber { background: #d97706; }
.kpi-icon.slate { background: #475569; }
.kpi-icon.violet { background: #6d28d9; }
.kpi div {
  display: flex;
  flex-direction: column;
  line-height: 1.2;
}
.kpi small {
  font-size: 10.5px;
  color: #6b7a90;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  font-weight: 700;
}
.kpi strong {
  font-size: 20px;
  font-weight: 800;
  color: var(--ds-on-surface, #12324f);
}
.modul-head {
  font-size: 12px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--ds-on-surface, #12324f);
}
.modul-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
  gap: 10px;
}
.modul-group {
  border: 1px solid var(--ds-border, #b0b8c4);
  background: #fff;
  display: flex;
  flex-direction: column;
}
.modul-group-head {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 8px 12px;
  background: var(--ds-surface-variant, #e0e4ea);
  border-bottom: 1px solid var(--ds-border, #b0b8c4);
  font-size: 11px;
  font-weight: 800;
  text-transform: uppercase;
  color: var(--ds-primary, #1b5e9e);
}
.modul-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border: none;
  border-bottom: 1px solid #e6eaf0;
  background: #fff;
  cursor: pointer;
  font-family: "Plus Jakarta Sans", sans-serif;
  font-size: 12px;
  color: var(--ds-on-surface, #12324f);
  text-align: left;
}
.modul-item:hover {
  background: rgba(27, 94, 158, 0.08);
  color: var(--ds-primary, #1b5e9e);
}
.modul-item span {
  flex: 1;
}
.modul-item .chev {
  opacity: 0.35;
}
.empty {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 18px;
  border: 1px dashed var(--ds-border, #b0b8c4);
  color: #6b7a90;
  font-size: 12px;
}
</style>
