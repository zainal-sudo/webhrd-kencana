import { ref } from "vue";

/** Shared invalidation for open loan browse tabs after a successful write. */
export const pinjamanRevision = ref(0);
export function notifyPinjamanSaved() {
  pinjamanRevision.value += 1;
}
