import "vuetify/styles";
import "@mdi/font/css/materialdesignicons.css";
import { createVuetify } from "vuetify";
import * as components from "vuetify/components";
import * as directives from "vuetify/directives";

/** Tema Web HRD Kencana — Steel Blue, gaya desktop klasik (sama seperti HRD Delphi). */
const kencanaTheme = {
  dark: false,
  colors: {
    primary: "#1B5E9E",
    "primary-darken-1": "#14487C",
    "primary-lighten-1": "#4C9BD6",
    secondary: "#12324F",
    "secondary-darken-1": "#0B2136",
    success: "#059669",
    info: "#1B5E9E",
    warning: "#D97706",
    error: "#DC2626",
    background: "#E8ECF1",
    surface: "#F0F3F8",
    "surface-variant": "#E0E4EA",
    "on-surface": "#12324F",
    "on-primary": "#ffffff",
  },
};

const kencanaDarkTheme = {
  dark: true,
  colors: {
    primary: "#4C9BD6",
    "primary-darken-1": "#1B5E9E",
    secondary: "#8494A7",
    success: "#34D399",
    info: "#60A5FA",
    warning: "#FBBF24",
    error: "#F87171",
    background: "#0B2136",
    surface: "#12324F",
    "surface-variant": "#1B3E60",
    "on-surface": "#E2E8F0",
    "on-primary": "#0B2136",
  },
};

export default createVuetify({
  components,
  directives,
  theme: {
    defaultTheme: "kencanaTheme",
    themes: {
      kencanaTheme,
      kencanaDarkTheme,
    },
  },
  defaults: {
    VBtn: {
      style: "font-size: 11px; letter-spacing: 0.02em; font-weight: 600; border-radius: 0;",
    },
    VTextField: {
      density: "compact",
      variant: "outlined",
      hideDetails: "auto",
      style: "font-size: 11px; border-radius: 0;",
    },
    VSelect: {
      density: "compact",
      variant: "outlined",
      hideDetails: "auto",
      style: "font-size: 11px; border-radius: 0;",
    },
    VAutocomplete: {
      density: "compact",
      variant: "outlined",
      hideDetails: "auto",
      style: "font-size: 11px; border-radius: 0;",
    },
    VTextarea: {
      density: "compact",
      variant: "outlined",
      hideDetails: "auto",
      style: "font-size: 11px; border-radius: 0;",
    },
    VCheckbox: {
      density: "compact",
      hideDetails: "auto",
    },
    VCard: {
      rounded: false,
      elevation: 0,
    },
    VDataTable: {
      density: "compact",
    },
  },
});
