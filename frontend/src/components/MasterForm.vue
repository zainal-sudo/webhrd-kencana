<script setup lang="ts">
import { ref, reactive, computed, onMounted } from "vue";
import { useRoute } from "vue-router";
import { useToast } from "vue-toastification";
import BaseForm from "@/components/BaseForm.vue";
import FText from "@/components/fields/FText.vue";
import FSelect from "@/components/fields/FSelect.vue";
import FDate from "@/components/fields/FDate.vue";
import FNumber from "@/components/fields/FNumber.vue";
import FTextarea from "@/components/fields/FTextarea.vue";
import { api, getErrorMessage } from "@/api/axios";

export interface MasterField {
  key: string;
  label: string;
  type?: "text" | "select" | "date" | "number" | "textarea";
  required?: boolean;
  disabled?: boolean;
  placeholder?: string;
  options?: { label: string; value: string | number }[];
  /** kolom ini adalah primary key (terkunci saat edit) */
  isKey?: boolean;
  span?: 1 | 2 | 3;
  rows?: number;
}

const props = withDefaults(
  defineProps<{
    endpoint: string;
    title: string;
    subtitle?: string;
    icon?: string;
    moduleCrumb: { label: string; path: string };
    returnPath: string;
    fields: MasterField[];
    /** param route untuk mode edit, default "id" */
    idParam?: string;
    label?: string;
  }>(),
  { subtitle: "", icon: "edit_note", idParam: "id", label: "" }
);

const route = useRoute();
const toast = useToast();

const isEdit = computed(() => !!route.query[props.idParam]);
const idValue = computed(() => (route.query[props.idParam] as string) || "");
const values = reactive<Record<string, any>>({});
const saving = ref(false);

onMounted(async () => {
  for (const f of props.fields) values[f.key] = null;
  if (!isEdit.value) return;
  try {
    const { data } = await api.get(`${props.endpoint}/${encodeURIComponent(idValue.value)}`);
    for (const f of props.fields) {
      values[f.key] = data.data[f.key] ?? null;
    }
  } catch (e) {
    toast.error(getErrorMessage(e, "Gagal memuat data"));
  }
});

async function save(): Promise<string> {
  for (const f of props.fields) {
    if (f.required && (values[f.key] === null || values[f.key] === undefined || String(values[f.key]).trim() === "")) {
      throw new Error(`${f.label} wajib diisi`);
    }
  }
  saving.value = true;
  try {
    if (isEdit.value) {
      await api.put(`${props.endpoint}/${encodeURIComponent(idValue.value)}`, { ...values });
      return "Data berhasil diperbarui.";
    }
    await api.post(props.endpoint, { ...values });
    return "Data berhasil disimpan.";
  } finally {
    saving.value = false;
  }
}

const gridCols = computed(() => {
  const maxSpan = props.fields.reduce((m, f) => Math.max(m, f.span || 1), 1);
  return maxSpan;
});
</script>

<template>
  <BaseForm
    :title="title"
    :subtitle="isEdit ? 'Ubah data' : subtitle"
    :icon="icon"
    :crumbs="[
      { label: moduleCrumb.label, path: moduleCrumb.path },
      { label: isEdit ? 'Edit' : 'Tambah' },
    ]"
    :save-fn="save"
    :return-path="returnPath"
  >
    <template #form-content>
      <div class="card">
        <div class="card-head">
          <span>{{ isEdit ? 'Edit' : 'Tambah' }} {{ title }}</span>
        </div>
        <div class="card-body">
          <div class="form-grid" :style="{ gridTemplateColumns: `repeat(${gridCols}, minmax(0, 1fr))` }">
            <div v-for="f in fields" :key="f.key" class="cell" :style="{ gridColumn: `span ${f.span || 1}` }">
              <FText
                v-if="!f.type || f.type === 'text'"
                v-model="values[f.key]"
                :label="f.label"
                :required="f.required"
                :disabled="f.disabled || (f.isKey && isEdit)"
                :placeholder="f.placeholder"
              />
              <FSelect
                v-else-if="f.type === 'select'"
                v-model="values[f.key]"
                :label="f.label"
                :options="f.options || []"
                :required="f.required"
                :disabled="f.disabled || (f.isKey && isEdit)"
                :placeholder="f.placeholder"
                show-clear
              />
              <FDate
                v-else-if="f.type === 'date'"
                v-model="values[f.key]"
                :label="f.label"
                :required="f.required"
                :disabled="f.disabled || (f.isKey && isEdit)"
              />
              <FNumber
                v-else-if="f.type === 'number'"
                v-model="values[f.key]"
                :label="f.label"
                :required="f.required"
                :disabled="f.disabled || (f.isKey && isEdit)"
                :placeholder="f.placeholder"
              />
              <FTextarea
                v-else-if="f.type === 'textarea'"
                v-model="values[f.key]"
                :label="f.label"
                :required="f.required"
                :disabled="f.disabled"
                :placeholder="f.placeholder"
                :rows="f.rows || 3"
              />
            </div>
          </div>
        </div>
      </div>
    </template>
  </BaseForm>
</template>

<style scoped>
.card {
  border: 1px solid var(--ds-border, #b0b8c4);
  background: #fff;
}
.card-head {
  padding: 8px 12px;
  background: var(--ds-surface-variant, #e0e4ea);
  border-bottom: 1px solid var(--ds-border, #c0c8d4);
  font-size: 12px;
  font-weight: 800;
  color: var(--ds-on-surface, #12324f);
}
.card-body {
  padding: 14px;
}
.form-grid {
  display: grid;
  gap: 12px;
}
.cell {
  min-width: 0;
}
</style>
