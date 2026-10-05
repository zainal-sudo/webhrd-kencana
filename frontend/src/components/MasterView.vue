<script setup lang="ts">
import BaseBrowse from "@/components/BaseBrowse.vue";
import type { BrowseColumn } from "@/types";

withDefaults(
  defineProps<{
    endpoint: string;
    title: string;
    subtitle?: string;
    icon?: string;
    columns: BrowseColumn[];
    primaryKey: string;
    addLabel?: string;
    formPath?: string;
    searchPlaceholder?: string;
    perPage?: number;
    canDelete?: boolean;
  }>(),
  {
    subtitle: "",
    icon: "table_view",
    addLabel: "Tambah",
    formPath: "",
    searchPlaceholder: "Cari...",
    perPage: 25,
    canDelete: true,
  }
);
</script>

<template>
  <BaseBrowse
    :module-title="title"
    :module-subtitle="subtitle"
    :endpoint="endpoint"
    :columns="columns"
    :primary-key="primaryKey"
    :add-label="addLabel"
    :add-form-path="formPath"
    :edit-form-path="formPath"
    :search-placeholder="searchPlaceholder"
    :per-page="perPage"
    :can-delete="canDelete"
  >
    <template v-if="$slots.default" #default="slotProps">
      <slot v-bind="slotProps" />
    </template>
  </BaseBrowse>
</template>
