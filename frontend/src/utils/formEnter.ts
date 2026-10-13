import { nextTick } from "vue";

/** Enter advances editable single-line fields, never submits or targets buttons. */
export async function nextFormField(event: KeyboardEvent) {
  if (event.key !== "Enter" || event.defaultPrevented || event.isComposing || event.repeat) return;
  const target = event.target as HTMLInputElement | HTMLSelectElement | null;
  if (!target?.matches('input, select') || target.matches('[type="button"], [type="submit"], [type="reset"]')) return;
  if (target.closest('form.lookup-search, form[role="search"]')) return;
  event.preventDefault();
  if (target.matches(':disabled, [readonly]')) return;
  // Commit v-model.lazy/change handlers before finding the next visible field.
  target.dispatchEvent(new Event("change", { bubbles: true }));
  await nextTick();
  if (!target.checkValidity()) {
    target.reportValidity();
    return;
  }
  const scope = target.closest('form, .form-panel, [role="dialog"]');
  if (!scope) return;
  const fields = Array.from(scope.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>('input, select, textarea'));
  const index = fields.indexOf(target);
  if (index < 0) return;
  const candidates = event.shiftKey ? fields.slice(0, index).reverse() : fields.slice(index + 1);
  candidates.find(field => !field.matches(':disabled, [readonly], [type="hidden"], [type="button"], [type="submit"], [type="reset"]')
    && field.tabIndex >= 0 && !field.closest('[hidden], [inert], [aria-hidden="true"]')
    && field.getClientRects().length > 0)?.focus();
}
