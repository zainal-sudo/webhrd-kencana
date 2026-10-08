<script setup lang="ts">
import { ref } from "vue";
import { useRouter } from "vue-router";
import { useToast } from "vue-toastification";
import MsIcon from "@/components/MsIcon.vue";
import { useTabsStore } from "@/stores/tabsStore";
import { getErrorMessage } from "@/api/axios";

const props = withDefaults(
  defineProps<{
    title: string;
    subtitle?: string;
    icon?: string;
    crumbs?: { label: string; path?: string }[];
    saveFn?: () => Promise<string>;
    hint?: string;
    returnPath?: string;
    saveLabel?: string;
    /** Opsional: hanya form yang memasang callback ini memiliki reset data. */
    resetFn?: () => boolean | void;
    resetDisabled?: boolean;
  }>(),
  {
    subtitle: "",
    icon: "edit_note",
    crumbs: () => [],
    saveFn: undefined,
    hint: "",
    returnPath: "",
    saveLabel: "Simpan",
    resetFn: undefined,
    resetDisabled: false,
  }
);

const router = useRouter();
const toast = useToast();
const tabsStore = useTabsStore();

const saving = ref(false);
const showSuccess = ref(false);
const successMsg = ref("Data berhasil disimpan.");

async function doSave() {
  if (!props.saveFn) return;
  saving.value = true;
  try {
    const msg = await props.saveFn();
    successMsg.value = msg || "Data berhasil disimpan.";
    showSuccess.value = true;
  } catch (e) {
    toast.error(getErrorMessage(e));
  } finally {
    saving.value = false;
  }
}

function closeTab() {
  showSuccess.value = false;
  const target = props.returnPath;
  // Tutup tab form aktif
  const activeId = tabsStore.activeTabId;
  if (activeId) tabsStore.closeTab(activeId);
  if (target) {
    router.push(target);
  }
}

function doReset() {
  if (props.resetFn) {
    if (saving.value || props.resetDisabled || props.resetFn() === false) return;
  }
  showSuccess.value = false;
}

function goCrumb(path?: string) {
  if (!path) return;
  router.push(path);
}
</script>

<template>
  <div class="form-panel">
    <!-- Breadcrumb -->
    <div class="crumbs" v-if="crumbs.length > 0">
      <template v-for="(c, i) in crumbs" :key="i">
        <button
          class="crumb"
          :class="{ current: i === crumbs.length - 1 }"
          @click="goCrumb(c.path)"
        >
          {{ c.label }}
        </button>
        <MsIcon v-if="i < crumbs.length - 1" name="chevron_right" :size="14" />
      </template>
    </div>

    <!-- Header -->
    <div class="form-header">
      <span class="header-icon">
        <MsIcon :name="icon" :size="18" />
      </span>
      <div class="header-text">
        <strong>{{ title }}</strong>
        <small>{{ subtitle }}</small>
      </div>
    </div>

    <!-- Body -->
    <div class="form-body">
      <slot name="form-content"></slot>
    </div>

    <!-- Bottom bar -->
    <div class="form-footer">
      <div class="footer-left">
        <slot name="footer-left">
          <span class="hint" v-if="hint">
            <MsIcon name="info" :size="13" />
            {{ hint }}
          </span>
        </slot>
      </div>
      <div class="footer-actions">
        <slot name="footer-actions">
          <button class="form-btn ghost" :disabled="!!resetFn && (saving || resetDisabled)" @click="doReset">Reset</button>
          <button class="form-btn primary" :disabled="saving" @click="doSave">
            <MsIcon v-if="saving" name="progress_activity" :size="15" />
            <MsIcon v-else name="save" :size="15" />
            <span>{{ saving ? "Menyimpan..." : saveLabel }}</span>
          </button>
        </slot>
      </div>
    </div>

    <!-- Success dialog -->
    <v-dialog v-model="showSuccess" max-width="400" persistent>
      <v-card rounded="false">
        <v-card-item class="py-3">
          <div class="d-flex align-center">
            <span class="material-symbols-outlined" style="color: #059669; margin-right: 8px">check_circle</span>
            <v-card-title class="text-body-1 font-weight-bold pa-0">Sukses</v-card-title>
          </div>
        </v-card-item>
        <v-card-text class="text-body-2 pb-1">{{ successMsg }}</v-card-text>
        <v-card-actions class="pa-4 pt-2">
          <v-spacer />
          <v-btn variant="text" color="grey-darken-2" @click="showSuccess = false">Tetap di Halaman</v-btn>
          <v-btn color="primary" variant="flat" @click="closeTab">Tutup</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<style scoped>
.form-panel {
  height: 100%;
  min-height: 0;
  overflow: hidden;
  border: 1px solid var(--ds-border, #b0b8c4);
  background: var(--ds-surface, #f0f3f8);
  display: flex;
  flex-direction: column;
}
.crumbs {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 10px;
  background: var(--ds-surface-variant, #e6e9ef);
  border-bottom: 1px solid var(--ds-border, #c3cad4);
}
.crumb {
  border: none;
  background: transparent;
  font-family: "Plus Jakarta Sans", sans-serif;
  font-size: 11px;
  color: var(--ds-primary, #3b5998);
  cursor: pointer;
  font-weight: 600;
}
.crumb.current {
  color: #55637a;
  cursor: default;
  font-weight: 700;
}
.form-header {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  background: linear-gradient(180deg, #42587f 0%, #334a6e 100%);
  border-bottom: 2px solid var(--ds-primary, #3b5998);
}
.header-icon {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.14);
  color: #fff;
  border: 1px solid rgba(255, 255, 255, 0.2);
}
.header-text {
  display: flex;
  flex-direction: column;
  line-height: 1.15;
}
.header-text strong {
  color: #fff;
  font-size: 14px;
  font-weight: 800;
}
.header-text small {
  color: rgba(255, 255, 255, 0.65);
  font-size: 11px;
}
.form-body {
  padding: 14px;
  flex: 1;
  min-height: 0;
  overflow: auto;
}
.form-footer {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 8px 12px;
  border-top: 1px solid var(--ds-border, #b0b8c4);
  background: var(--ds-surface-variant, #e6e9ef);
}
.footer-left {
  flex: 1;
}
.hint {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  color: #b45309;
}
.footer-actions {
  display: flex;
  gap: 6px;
}
.form-btn {
  height: 32px;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 14px;
  border: 1px solid var(--ds-border, #b0b8c4);
  font-family: "Plus Jakarta Sans", sans-serif;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  border-radius: 0;
}
.form-btn.ghost {
  background: #fff;
  color: var(--ds-on-surface, #1b2d4a);
}
.form-btn.ghost:hover {
  background: var(--ds-surface, #f0f3f8);
}
.form-btn.primary {
  background: var(--ds-primary, #3b5998);
  border-color: var(--ds-primary-dark, #2c4472);
  color: #fff;
}
.form-btn.primary:hover:not(:disabled) {
  background: var(--ds-primary-darken-1, #2c4472);
}
.form-btn:disabled {
  opacity: 0.65;
  cursor: not-allowed;
}
</style>
