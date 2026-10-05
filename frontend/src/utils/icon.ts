const MAPPING: Record<string, string> = {
  "pi pi-home": "home",
  "pi pi-users": "group",
  "pi pi-user": "person",
  "pi pi-user-edit": "manage_accounts",
  "pi pi-id-card": "badge",
  "pi pi-folder": "folder",
  "pi pi-folder-open": "folder_open",
  "pi pi-file": "description",
  "pi pi-file-edit": "edit_note",
  "pi pi-cog": "settings",
  "pi pi-calendar": "calendar_month",
  "pi pi-calendar-plus": "event_available",
  "pi pi-chart-line": "show_chart",
  "pi pi-chart-bar": "bar_chart",
  "pi pi-dollar": "payments",
  "pi pi-list": "list_alt",
  "pi pi-shield": "security",
  "pi pi-sign-out": "logout",
  "pi pi-plus": "add",
  "pi pi-pencil": "edit",
  "pi pi-trash": "delete",
  "pi pi-search": "search",
  "pi pi-refresh": "refresh",
  "pi pi-check": "check",
  "pi pi-check-circle": "check_circle",
  "pi pi-times": "close",
  "pi pi-dashboard": "dashboard",
  "pi pi-briefcase": "work",
  "pi pi-building": "business",
  "pi pi-arrows-alt": "swap",
  "pi pi-arrow-right": "arrow_forward",
  "pi pi-clock": "schedule",
  "pi pi-book": "menu_book",
  "pi pi-sitemap": "account_tree",
  "pi pi-window-maximize": "crop_free",
  "pi pi-lock": "lock",
  "pi pi-circle": "circle",
  "pi pi-circle-fill": "circle",
  "pi pi-database": "storage",
  "pi pi-info-circle": "info",
  "pi pi-question-circle": "help",
  "pi pi-server": "dns",
  "pi pi-cloud": "cloud",
  "pi pi-table": "table_view",
  "pi pi-filter": "filter_list",
  "pi pi-exclamation-circle": "error",
  "pi pi-print": "print",
  "pi pi-download": "download",
  "pi pi-external-link": "open_in_new",
  "pi pi-sliders-h": "tune",
  "pi pi-th-large": "grid_view",
  "pi pi-bars": "menu",
  "pi pi-building-columns": "apartment",
  "pi pi-building_column": "apartment",
  "pi pi-box": "inventory_2",
  "pi pi-wallet": "wallet",
  "pi pi-user-plus": "person_add",
  "pi pi-file-plus": "note_add",
  "pi pi-map-marker": "location_on",
  "pi pi-tags": "sell",
  "pi pi-tag": "sell",
};

// Nama Material Symbols yang TIDAK ADA (kalau dirender jadi teks mentah
// yang melebar seperti "BUILDING_COLUMNS" di screenshot menu Unit).
// Dipetakan ke ikon valid yang mirip.
const ALIAS: Record<string, string> = {
  building_columns: "apartment",
  building_column: "apartment",
  ing_columns: "apartment",
  columns: "view_column",
  pi_pi_building_columns: "apartment",
  pi_pi_circle: "circle",
  pi_pi_bars: "menu",
};

export function normalizeIcon(icon?: string | null): string {
  if (!icon) return "circle";
  const key = icon.trim().toLowerCase();
  if (MAPPING[key]) return MAPPING[key];
  let name: string;
  if (key.startsWith("pi pi-")) {
    name = key.replace("pi pi-", "").replace(/-/g, "_");
  } else {
    name = key.replace(/-/g, "_").replace(/\s+/g, "_");
  }
  if (ALIAS[name]) return ALIAS[name];
  // Guard: nama tidak valid (ada spasi, terlalu panjang, masih ada prefix pi)
  // fallback ke lingkaran kecil supaya layout sidebar tidak jebol
  // seperti kasus menu Unit yang tampil teks "ING_COLUMNS".
  if (!/^[a-z0-9_]+$/.test(name) || name.length > 24 || name.includes("pi_")) {
    return "circle";
  }
  return name;
}