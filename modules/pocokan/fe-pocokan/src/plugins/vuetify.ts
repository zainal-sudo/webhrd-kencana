import "vuetify/styles";
import "@mdi/font/css/materialdesignicons.css";
import { createVuetify } from "vuetify";
import * as components from "vuetify/components";
import * as directives from "vuetify/directives";

// ─── Tema FINANCE — Biru Royal ──────────────────────────────────────────────
// Beda dari Garmen (biru #1565c0) → Finance pakai biru tua #3B5998 / #3B5998
const financeTheme = {
  dark: false,
  colors: {
    // Primary — biru tua elegan
    primary: "#3B5998",
    "primary-darken-1": "#3B5998",
    "primary-lighten-1": "#38388e",

    // Secondary — blue untuk aksen
    secondary: "#000069",
    "secondary-darken-1": "#00004d",

    // Status colors
    success: "#4343a0",
    info: "#0288d1",
    warning: "#f57c00",
    error: "#c62828",

    // Surface
    background: "#f1f1f8", // biru sangat muda
    surface: "#ffffff",
    "surface-variant": "#e8e8f5",
    "on-surface": "#1a1a1a",
    "on-primary": "#ffffff",
  },
};

const financeDarkTheme = {
  dark: true,
  colors: {
    primary: "#6666bb",
    "primary-darken-1": "#4343a0",
    secondary: "#4d4db6",
    success: "#8181c7",
    info: "#4fc3f7",
    warning: "#ffb74d",
    error: "#ef5350",
    background: "#0d0d1a",
    surface: "#1a1a2e",
    "surface-variant": "#1e1e3a",
    "on-surface": "#e8e8f5",
    "on-primary": "#0d0d1a",
  },
};

export default createVuetify({
  components,
  directives,
  theme: {
    defaultTheme: "financeTheme",
    themes: {
      financeTheme,
      financeDarkTheme,
    },
  },
  defaults: {
    VBtn: {
      style: "font-size: 12px; letter-spacing: 0.02em; font-weight: 600;",
    },
    VTextField: {
      density: "compact",
      variant: "outlined",
      hideDetails: "auto",
      style: "font-size: 12px;",
    },
    VSelect: {
      density: "compact",
      variant: "outlined",
      hideDetails: "auto",
      style: "font-size: 12px;",
    },
    VAutocomplete: {
      density: "compact",
      variant: "outlined",
      hideDetails: "auto",
      style: "font-size: 12px;",
    },
    VTextarea: {
      density: "compact",
      variant: "outlined",
      hideDetails: "auto",
      style: "font-size: 12px;",
    },
    VCheckbox: {
      density: "compact",
      hideDetails: "auto",
    },
    VCard: {
      rounded: "lg",
      elevation: 1,
    },
    VDataTable: {
      density: "compact",
    },
  },
});
