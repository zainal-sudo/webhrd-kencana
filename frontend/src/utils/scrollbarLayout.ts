/** Keep the native vertical scrollbar full-height, with a synced horizontal
 * scrollbar inside the viewport. Only containers with BOTH native bars change.
 * No data/table DOM is moved; sticky headers, focus and wheel scrolling stay native.
 * Wide tables can opt out of JS synchronization with data-native-scrollbar on an ancestor.
 */
export function installScrollbarLayout(root: HTMLElement) {
  // Overlay scrollbars have no corner to fix. Other engines keep their native
  // layout rather than receive a second horizontal bar they cannot hide.
  if (!CSS.supports('selector(::-webkit-scrollbar)')) return () => {};
  const candidates = new Set<HTMLElement>();
  const enhanced = new Map<HTMLElement, {
    bar: HTMLDivElement;
    spacer: HTMLDivElement;
    onScroll: () => void;
    onHorizontal: () => void;
  }>();
  let frame = 0;
  let disposed = false;
  const number = (value: string) => parseFloat(value) || 0;
  const isProxy = (element: Element) => !!element.closest('[data-horizontal-scrollbar]');
  const usesNativeScroll = (element: Element) => !!element.closest('[data-native-scrollbar]');
  const setStyle = (element: HTMLElement, key: string, value: string) => {
    if (element.style.getPropertyValue(key) !== value) element.style.setProperty(key, value);
  };
  function schedule() {
    if (!disposed && !frame) frame = requestAnimationFrame(update);
  }
  const resize = new ResizeObserver(schedule);

  function discover(element: Element) {
    if (!(element instanceof HTMLElement) || isProxy(element) || usesNativeScroll(element)) return;
    const style = getComputedStyle(element);
    // Replaced controls and tables must never receive synthetic child elements.
    if (!/^(INPUT|TEXTAREA|SELECT|TABLE|TR|TBODY|THEAD|TFOOT|IMG|VIDEO|CANVAS)$/.test(element.tagName)
      && /^(auto|scroll)$/.test(style.overflowX) && /^(auto|scroll)$/.test(style.overflowY)
      && !candidates.has(element)) {
      candidates.add(element);
      resize.observe(element);
    }
  }
  function scan(element: Element) {
    if (isProxy(element) || usesNativeScroll(element)) return;
    discover(element);
    element.querySelectorAll('*').forEach(discover);
  }
  function remove(element: HTMLElement) {
    const state = enhanced.get(element);
    if (!state) return;
    element.removeEventListener('scroll', state.onScroll);
    state.bar.removeEventListener('scroll', state.onHorizontal);
    state.bar.remove();
    element.classList.remove('split-scrollbar');
    element.style.removeProperty('--scrollbar-inset-left');
    element.style.removeProperty('--scrollbar-inset-bottom');
    enhanced.delete(element);
  }
  function update() {
    frame = 0;
    for (const element of candidates) {
      if (!element.isConnected || usesNativeScroll(element)) {
        remove(element);
        resize.unobserve(element);
        candidates.delete(element);
        continue;
      }
      const style = getComputedStyle(element);
      const verticalWidth = element.offsetWidth - element.clientWidth - number(style.borderLeftWidth) - number(style.borderRightWidth);
      const horizontalHeight = element.offsetHeight - element.clientHeight - number(style.borderTopWidth) - number(style.borderBottomWidth);
      const state = enhanced.get(element);
      const both = element.clientHeight > 0 && element.clientWidth > 0
        && element.scrollWidth > element.clientWidth + 1 && element.scrollHeight > element.clientHeight + 1
        && verticalWidth > 0 && (state || horizontalHeight > 0)
        && /^(auto|scroll)$/.test(style.overflowX) && /^(auto|scroll)$/.test(style.overflowY);
      if (!both) { remove(element); continue; }
      if (!state) {
        const bar = document.createElement('div');
        const spacer = document.createElement('div');
        bar.dataset.horizontalScrollbar = '';
        bar.className = 'split-scrollbar-horizontal';
        bar.tabIndex = 0;
        bar.setAttribute('role', 'region');
        bar.setAttribute('aria-label', 'Geser horizontal');
        spacer.className = 'split-scrollbar-spacer';
        spacer.setAttribute('aria-hidden', 'true');
        bar.append(spacer);
        element.classList.add('split-scrollbar');
        element.append(bar);
        const onScroll = () => {
          if (Math.abs(bar.scrollLeft - element.scrollLeft) > 0.5) bar.scrollLeft = element.scrollLeft;
        };
        const onHorizontal = () => {
          if (Math.abs(element.scrollLeft - bar.scrollLeft) > 0.5) element.scrollLeft = bar.scrollLeft;
          onScroll();
        };
        element.addEventListener('scroll', onScroll, { passive: true });
        bar.addEventListener('scroll', onHorizontal, { passive: true });
        enhanced.set(element, { bar, spacer, onScroll, onHorizontal });
      }
      const current = enhanced.get(element)!;
      setStyle(element, '--scrollbar-inset-left', style.paddingLeft);
      setStyle(element, '--scrollbar-inset-bottom', style.paddingBottom);
      setStyle(current.bar, 'width', `${element.clientWidth}px`);
      setStyle(current.spacer, 'width', `${element.scrollWidth}px`);
      current.onScroll();
    }
  }
  const mutations = new MutationObserver(records => {
    let changed = false;
    for (const record of records) {
      const target = record.target instanceof Element ? record.target : record.target.parentElement;
      if (target && isProxy(target)) continue;
      if (target && usesNativeScroll(target) && record.attributeName !== 'data-native-scrollbar') continue;
      changed = true;
      if (record.type === 'attributes' && target) {
        if (record.attributeName === 'data-native-scrollbar' || (record.attributeName === 'class' && !enhanced.has(target as HTMLElement))) scan(target);
        else discover(target);
      }
      for (const node of record.addedNodes) if (node instanceof Element) scan(node);
    }
    if (changed) schedule();
  });
  scan(root);
  mutations.observe(root, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['class', 'style', 'hidden', 'data-native-scrollbar'] });
  window.addEventListener('resize', schedule, { passive: true });
  schedule();
  return () => {
    disposed = true;
    cancelAnimationFrame(frame);
    mutations.disconnect();
    resize.disconnect();
    window.removeEventListener('resize', schedule);
    for (const element of enhanced.keys()) remove(element);
    candidates.clear();
  };
}
