import { computed, isRef, nextTick, ref, toRaw, unref, watch } from "vue";
import type { AxiosInstance } from "axios";

type Targets = Record<string, any>;
const clone = (value: any): any => JSON.parse(JSON.stringify(toRaw(value)));

/** Scoped opt-in reset for transaction forms; never performs a request. */
export function useTransactionReset(targets: Targets, options: {
  isEdit?: () => boolean;
  blocked?: () => boolean;
  afterRestore: () => void;
}) {
  const ready = ref(false);
  const restoring = ref(false);
  const pending = ref(0);
  let snapshot: Targets | null = null;
  const disabled = computed(() => !ready.value || restoring.value || pending.value > 0 || !!options.blocked?.());

  function capture() {
    snapshot = Object.fromEntries(Object.entries(targets).map(([key, value]) => [key, clone(unref(value))]));
    ready.value = true;
  }
  function invalidate() {
    snapshot = null;
    ready.value = false;
  }
  async function initialize() {
    // Include watcher-triggered requests and their assignments in the baseline.
    do {
      await nextTick();
      if (pending.value > 0) await new Promise<void>(resolve => {
        const stop = watch(pending, value => { if (value === 0) { stop(); resolve(); } });
      });
      await nextTick();
    } while (pending.value > 0);
    // A failed Edit load must never create a default/partially loaded snapshot.
    if (options.isEdit?.() && !ready.value) return;
    capture();
  }
  function reset(): boolean {
    if (disabled.value || !snapshot) return false;
    const message = options.isEdit?.()
      ? "Kembalikan form ke data terakhir yang dimuat dan buang perubahan yang belum disimpan?"
      : "Kembalikan form ke kondisi awal dan buang perubahan yang belum disimpan?";
    if (!window.confirm(message)) return false;
    restoring.value = true;
    for (const [key, target] of Object.entries(targets)) {
      const value = clone(snapshot[key]);
      if (isRef(target)) target.value = value;
      else {
        for (const name of Object.keys(target)) if (!(name in value)) delete target[name];
        Object.assign(target, value);
      }
    }
    options.afterRestore();
    // Keep guards active until queued Vue watchers have finished.
    void nextTick().then(() => { restoring.value = false; });
    return true;
  }
  function trackApi(api: AxiosInstance): AxiosInstance {
    return new Proxy(api, {
      get(target, key, receiver) {
        const value = Reflect.get(target, key, receiver);
        if (!["get", "post", "put", "delete", "patch"].includes(String(key)) || typeof value !== "function") return value;
        return async (...args: any[]) => {
          pending.value++;
          try { return await value.apply(target, args); }
          finally { pending.value--; }
        };
      },
    });
  }
  return { ready, restoring, disabled, capture, invalidate, initialize, reset, trackApi };
}
