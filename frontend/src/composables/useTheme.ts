import { ref, watch } from "vue";
import { useTheme } from "vuetify";

const T_KEY = "kencana_hrd_dark";
const dark = ref(false);

let initialized = false;

function readStored(): boolean {
  try {
    return localStorage.getItem(T_KEY) === "1";
  } catch {
    return false;
  }
}

export function useThemeToggle() {
  // WAJIB: useTheme() hanya boleh dipanggil di dalam setup().
  const theme = useTheme();

  function apply() {
    theme.global.name.value = dark.value ? "kencanaDarkTheme" : "kencanaTheme";
    if (dark.value) {
      document.documentElement.setAttribute("data-theme", "dark");
    } else {
      document.documentElement.removeAttribute("data-theme");
    }
  }

  if (!initialized) {
    initialized = true;
    dark.value = readStored();
    apply();
    watch(dark, () => {
      try {
        localStorage.setItem(T_KEY, dark.value ? "1" : "0");
      } catch {
        /* abaikan */
      }
      apply();
    });
  } else {
    apply();
  }

  return {
    dark,
    toggle() {
      dark.value = !dark.value;
    },
  };
}
