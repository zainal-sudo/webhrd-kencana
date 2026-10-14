import { createApp } from "vue";
import { createPinia } from "pinia";
import Toast, { POSITION } from "vue-toastification";
import "vue-toastification/dist/index.css";

import App from "./App.vue";
import router from "./router";
import vuetify from "./plugins/vuetify";
import { installScrollbarLayout } from "./utils/scrollbarLayout";

import "./assets/main.css";
import "./assets/design-system.css";
import "./assets/theme.css";
import "./assets/dialogs.css";

const app = createApp(App);
const pinia = createPinia();

app.use(pinia);
app.use(router);
app.use(vuetify);
app.use(Toast, {
  position: POSITION.TOP_RIGHT,
  timeout: 3500,
  closeOnClick: true,
  pauseOnHover: true,
  draggable: true,
  hideProgressBar: false,
  toastClassName: "kencana-toast",
});

app.mount("#app");
// Include dialogs/popups teleported outside #app as well as ordinary pages.
const disposeScrollbarLayout = installScrollbarLayout(document.body);
if (import.meta.hot) import.meta.hot.dispose(disposeScrollbarLayout);
