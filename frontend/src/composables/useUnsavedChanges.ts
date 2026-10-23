import { getCurrentInstance, onUnmounted, shallowRef, watch } from "vue";
import { useRoute } from "vue-router";
import { useTabsStore } from "@/stores/tabsStore";
import { APPLICATION_DRAFT, beginDraftSave, checkpointDraftSave, formState, isTabDirty, publishDrafts, registerDraft, type DraftSource } from "@/utils/unsavedChanges";

export function useUnsavedChanges(source: Omit<DraftSource, "title"> & { title?: string; global?: boolean }) {
  // Some pure snapshot tests use the composable outside a mounted component.
  const noop = { rebase() {}, checkpointSave() {}, beginSave: () => (_success: boolean) => {}, dirty: source.dirty };
  if (!getCurrentInstance()) return noop;
  const route = useRoute();
  if (!route || route.meta?.publicPenilaian) return noop;
  const id = source.global ? APPLICATION_DRAFT : useTabsStore().generateTabId(route.path, { ...route.query });
  const registration = registerDraft(id, { ...source, title: source.title || String(route.meta?.title || "form") });
  // Keep registry listeners outside the tracking getter: one form must not
  // subscribe to every other cached form's state through beforeunload checks.
  watch(() => [source.dirty(), formState(source.state()), source.busy?.(), source.enabled?.()], publishDrafts, { immediate: true });
  onUnmounted(registration.dispose);
  return { ...registration, checkpointSave: () => checkpointDraftSave(id), beginSave: () => beginDraftSave(id), dirty: () => isTabDirty(id) };
}

/** For forms without an existing reset snapshot. Loading never counts as editing. */
export function useDraftSnapshot(state: () => unknown, options: { ready?: () => boolean; busy?: () => boolean; title?: string } = {}) {
  const baseline = shallowRef<string | null>(null);
  const source = useUnsavedChanges({ state, title: options.title, busy: options.busy,
    enabled: options.ready,
    dirty: () => baseline.value !== null && (options.ready?.() ?? true) && baseline.value !== formState(state()),
  });
  function capture() { baseline.value = formState(state()); source.rebase(); }
  watch(() => options.ready?.() ?? true, ready => { if (ready) capture(); else baseline.value = null; }, { immediate: true, flush: "post" });
  return { capture, beginSave: source.beginSave, dirty: source.dirty };
}
