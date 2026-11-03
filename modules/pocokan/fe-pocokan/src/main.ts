import { createApp } from "vue";
import { createPinia } from "pinia";
import Toast, { POSITION } from "vue-toastification";
import "vue-toastification/dist/index.css";

import App from "./App.vue";
import router from "./router";
import vuetify from "./plugins/vuetify";
import { useAuthStore } from "./stores/authStore";

import "./assets/main.css";
import "pivottable/dist/pivot.css";
import "jquery-ui-dist/jquery-ui.css";

const app = createApp(App);
const pinia = createPinia();

/* SSO: pegang token HRIS & profil dari /auth/me sebelum router terpasang
 * supaya route guard baca state yang benar. Top-level await tidak tersedia
 * pada target build es2020 → mount dilakukan setelah SSO selesai. */
app.use(pinia);
const authStore = useAuthStore();
authStore
  .loginDariHris()
  .catch(() => undefined)
  .finally(() => {
    app.use(router);
    app.use(vuetify);
    app.use(Toast, {
      position: POSITION.TOP_RIGHT,
      timeout: 3500,
      closeOnClick: true,
      pauseOnHover: true,
      draggable: true,
      hideProgressBar: false,
      toastClassName: "finance-toast",
    });

    // ⬅️ PENTING: tunggu router selesai resolve route pertama SEBELUM mount.
    // Tanpa ini, App.vue bisa sempat render dengan layout default (DefaultLayout)
    // duluan sebelum route.meta (mis. layout: "BlankLayout" utk halaman print)
    // sempat kebaca — dan TabView di dalam DefaultLayout langsung nge-push
    // balik ke tab aktif terakhir (dari sessionStorage) sebelum rute yang benar
    // sempat render. Ini penyebab halaman print "mental" balik ke Browse.
    router.isReady().then(() => {
      app.mount("#app");
    });
  });