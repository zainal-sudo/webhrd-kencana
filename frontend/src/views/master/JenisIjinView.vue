<script setup lang="ts">
import MasterView from "@/components/MasterView.vue";
import { MASTER_DEFS } from "@/config/masterSimple";

const def = MASTER_DEFS["jenisIjin"];
</script>

<template>
  <MasterView
    :title="def.title"
    :endpoint="def.endpoint"
    :columns="def.columns"
    :primary-key="def.primaryKey"
    :form-path="def.formPath"
    search-placeholder="Cari kode / keterangan..."
  />
</template>