<script setup lang="ts">
import MasterForm from "@/components/MasterForm.vue";
import { MASTER_DEFS } from "@/config/masterSimple";

const def = MASTER_DEFS["jabatan"];
</script>

<template>
  <MasterForm
    :title="def.title"
    :endpoint="def.endpoint"
    :fields="def.fields"
    :module-crumb="{ label: def.title, path: def.listPath }"
    :return-path="def.listPath"
  />
</template>
