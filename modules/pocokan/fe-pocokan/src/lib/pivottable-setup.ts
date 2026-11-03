import $ from "jquery";

if (!($ as any).isFunction) {
  ($ as any).isFunction = (obj: any) => typeof obj === "function";
}
if (!($ as any).isArray) {
  ($ as any).isArray = Array.isArray;
}

let pivotLoaded = false;

export const initPivot = async () => Promise.resolve();
export const jQuery = (window as any).$;
