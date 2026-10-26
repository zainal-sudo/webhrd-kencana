import { nextTick, ref, watch } from "vue";

/** Fokuskan elemen (mis. kotak pencarian karyawan) begitu dialog terbuka,
 *  supaya bisa langsung mengetik tanpa klik pakai kursor dulu. */
export function useDialogFocus(open: () => unknown) {
  const target = ref<HTMLElement | null>(null);
  watch(open, (value) => {
    if (!value) return;
    // Dialog Vuetify merender kontennya setelah model berubah.
    nextTick(() => target.value?.focus());
  });
  return target;
}
