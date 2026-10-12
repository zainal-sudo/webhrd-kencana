import { computed, defineComponent, watch, type Component, type PropType, type VNode } from "vue";
import { useTabsStore } from "@/stores/tabsStore";

/** Give each tab its own KeepAlive name so closing it evicts only that page. */
export function useTabPageCache(currentTabId: () => string) {
  const tabsStore = useTabsStore();
  const wrappers = new Map<string, Component>();
  const nameFor = (id: string) => `TabPage:${id}`;
  const includedPages = computed(() => tabsStore.tabs.map(tab => nameFor(tab.id)));
  const currentPage = computed(() => {
    const id = currentTabId();
    let wrapper = wrappers.get(id);
    if (!wrapper) {
      wrapper = defineComponent({
        name: nameFor(id),
        // Pass the RouterView vnode as a prop, not a reactive slot. Inactive
        // wrappers must retain their own page rather than follow the new route.
        props: { page: { type: Object as PropType<VNode>, required: true } },
        setup(props) {
          return () => props.page;
        },
      });
      wrappers.set(id, wrapper);
    }
    return wrapper;
  });

  watch(() => tabsStore.tabs.map(tab => tab.id), ids => {
    const open = new Set(ids);
    for (const id of wrappers.keys()) {
      if (!open.has(id)) wrappers.delete(id);
    }
  });

  return { currentPage, includedPages };
}
