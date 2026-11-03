<script setup lang="ts">
import { ref, onMounted } from "vue";
import { useRouter } from "vue-router";
import { useAuthStore } from "@/stores/authStore";
import { useToast } from "vue-toastification";
import { IconEye, IconEyeOff, IconLogin } from "@tabler/icons-vue";

import logoUrl from "@/assets/logo.png";
import bgImage from "@/assets/bg-finance.jpg";

const router = useRouter();
const authStore = useAuthStore();
const toast = useToast();

const username = ref("");
const password = ref("");
const showPass = ref(false);
const isLoading = ref(false);
const usernameRef = ref<any>(null);

const appVersion = __APP_VERSION__;

// Referensi uLogin.pas: FormShow → set focus ke edtUser saat tampil
onMounted(() => {
  setTimeout(() => usernameRef.value?.focus(), 100);
});

const handleLogin = async () => {
  if (!username.value.trim()) {
    toast.warning("Username harus diisi.");
    usernameRef.value?.focus();
    return;
  }
  if (!password.value) {
    toast.warning("Password harus diisi.");
    return;
  }

  isLoading.value = true;
  try {
    await authStore.login(username.value.trim().toUpperCase(), password.value);
    toast.success(`Selamat datang, ${authStore.userName}!`);

    // PENTING: router.push harus di-await + di-catch.
    // Semua route di-lazy-load (component: () => import(...)), jadi navigasi
    // ini sebenarnya nge-fetch chunk JS. Kalau fetch itu gagal (network
    // hiccup / HMR restart / chunk lama sudah tidak ada setelah deploy baru),
    // push() akan reject secara silent tanpa .catch — user kelihatan
    // "nyangkut" di halaman login walau login-nya sendiri sukses (token
    // sudah tersimpan), karena document.title sempat berubah duluan lewat
    // navigation guard sebelum chunk-nya gagal dimuat.
    await router.push("/").catch((err: any) => {
      const isChunkError =
        err?.name === "ChunkLoadError" ||
        /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i.test(
          err?.message ?? ""
        );

      if (isChunkError) {
        // Token & user sudah ada di localStorage → full reload akan
        // langsung masuk Dashboard tanpa perlu login ulang.
        window.location.href = "/";
        return;
      }

      console.error("Navigation error setelah login:", err);
      toast.error("Gagal membuka halaman utama. Silakan coba lagi.");
    });
  } catch (e: any) {
    const msg = e?.response?.data?.message ?? e?.message ?? "Login gagal.";
    toast.error(msg);
    usernameRef.value?.focus();
  } finally {
    isLoading.value = false;
  }
};

// Enter di username → pindah ke password (edtUserKeyPress di Delphi)
const onUsernameEnter = () => {
  const pwEl = document.getElementById("login-password");
  pwEl?.focus();
};
</script>

<template>
  <div class="login-page">
    <!-- Background decorative -->
    <div class="login-bg">
      <div
        class="bg-img-overlay"
        :style="{ backgroundImage: `url(${bgImage})` }"
      />
      <div class="bg-circle bg-circle-1" />
      <div class="bg-circle bg-circle-2" />
      <div class="bg-circle bg-circle-3" />
    </div>

    <div class="login-container">
      <!-- Left panel — brand -->
      <div class="login-left">
        <div class="brand-area">
          <div class="brand-logo-wrap">
            <img :src="logoUrl" alt="Logo" class="brand-logo-img" />
          </div>
          <h1 class="brand-name">P O C O K A N</h1>
          <p class="brand-tagline">Sistem P O C O K A N</p>
        </div>

        <div class="brand-version">v{{ appVersion }}</div>
      </div>

      <!-- Right panel — form login -->
      <div class="login-right">
        <div class="login-card">
          <div class="login-card-header">
            <h2 class="login-title">Masuk ke Sistem</h2>
            <p class="login-sub">Gunakan akun yang diberikan oleh IT</p>
          </div>

          <div class="login-form">
            <!-- Username -->
            <div class="field-group">
              <label class="field-label">Username</label>
              <input
                ref="usernameRef"
                v-model="username"
                type="text"
                class="field-input"
                placeholder="Masukkan username..."
                autocomplete="username"
                @keydown.enter="onUsernameEnter"
                :disabled="isLoading"
              />
            </div>

            <!-- Password -->
            <div class="field-group">
              <label class="field-label">Password</label>
              <div class="field-pass-wrap">
                <input
                  id="login-password"
                  v-model="password"
                  :type="showPass ? 'text' : 'password'"
                  class="field-input field-input-pass"
                  placeholder="Masukkan password..."
                  autocomplete="current-password"
                  @keydown.enter="handleLogin"
                  :disabled="isLoading"
                />
                <button
                  class="pass-toggle"
                  @click="showPass = !showPass"
                  type="button"
                  tabindex="-1"
                >
                  <IconEyeOff v-if="showPass" :size="16" :stroke-width="1.8" />
                  <IconEye v-else :size="16" :stroke-width="1.8" />
                </button>
              </div>
            </div>

            <!-- Button login -->
            <button
              class="btn-login"
              @click="handleLogin"
              :disabled="isLoading"
            >
              <span v-if="isLoading" class="btn-spinner" />
              <IconLogin v-else :size="17" :stroke-width="2" />
              <span>{{ isLoading ? "Memproses..." : "Masuk" }}</span>
            </button>
          </div>

          <div class="login-footer">
            <span>© {{ new Date().getFullYear() }} IT Support</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* ── Page ── */
.login-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(
    135deg,
    rgba(13, 13, 43, 0.82) 0%,
    rgba(27, 27, 94, 0.78) 100%
  );
  position: relative;
  overflow: hidden;
  font-family: "Inter", system-ui, sans-serif;
}

.bg-img-overlay {
  position: absolute;
  inset: 0;
  background-size: cover;
  background-position: center;
  background-repeat: no-repeat;
  opacity: 0.18;
  filter: blur(1px);
  transform: scale(1.05);
}

/* Decorative circles */
.login-bg {
  position: absolute;
  inset: 0;
  pointer-events: none;
}
.bg-circle {
  position: absolute;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(46, 46, 125, 0.25), transparent 70%);
}
.bg-circle-1 {
  width: 600px;
  height: 600px;
  top: -200px;
  left: -150px;
}
.bg-circle-2 {
  width: 400px;
  height: 400px;
  bottom: -100px;
  right: -100px;
}
.bg-circle-3 {
  width: 300px;
  height: 300px;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background: radial-gradient(
    circle,
    rgba(102, 102, 187, 0.1),
    transparent 70%
  );
}

/* ── Container ── */
.login-container {
  position: relative;
  z-index: 1;
  display: flex;
  width: 860px;
  min-height: 520px;
  border-radius: 20px;
  overflow: hidden;
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.5);
}

/* ── Left panel ── */
.login-left {
  width: 320px;
  flex-shrink: 0;
  background: linear-gradient(160deg, #3B5998, #3B5998 60%, #38388e);
  padding: 40px 32px;
  display: flex;
  flex-direction: column;
  color: white;
}
.brand-area {
  margin-bottom: 36px;
}
.brand-logo-wrap {
  width: 60px;
  height: 60px;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.15);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 16px;
}
.brand-logo-img {
  width: 42px;
  height: 42px;
  object-fit: contain;
}
.brand-name {
  font-size: 28px;
  font-weight: 800;
  margin: 0 0 4px;
  letter-spacing: 0.05em;
}
.brand-tagline {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.65);
  margin: 0;
}

.brand-features {
  flex: 1;
}
.feature-item {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.8);
  margin-bottom: 10px;
}
.feature-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #a5a5d6;
  flex-shrink: 0;
}
.brand-version {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.35);
  margin-top: auto;
}

/* ── Right panel ── */
.login-right {
  flex: 1;
  background: white;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40px;
}
.login-card {
  width: 100%;
  max-width: 340px;
}

.login-card-header {
  margin-bottom: 28px;
}
.login-title {
  font-size: 22px;
  font-weight: 700;
  color: #1a1a1a;
  margin: 0 0 4px;
}
.login-sub {
  font-size: 13px;
  color: rgba(0, 0, 0, 0.45);
  margin: 0;
}

/* Form fields */
.login-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.field-group {
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.field-label {
  font-size: 12px;
  font-weight: 600;
  color: #374151;
}
.field-input {
  height: 40px;
  border: 1.5px solid #d1d5db;
  border-radius: 8px;
  padding: 0 12px;
  font-size: 13px;
  color: #111;
  background: #fafafa;
  outline: none;
  transition: border-color 0.2s, box-shadow 0.2s;
  width: 100%;
  box-sizing: border-box;
}
.field-input:focus {
  border-color: #3B5998;
  box-shadow: 0 0 0 3px rgba(46, 46, 125, 0.12);
  background: white;
}
.field-input:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.field-pass-wrap {
  position: relative;
}
.field-input-pass {
  padding-right: 40px;
}
.pass-toggle {
  position: absolute;
  right: 10px;
  top: 50%;
  transform: translateY(-50%);
  background: none;
  border: none;
  cursor: pointer;
  color: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  padding: 4px;
}
.pass-toggle:hover {
  color: #3B5998;
}

/* Login button */
.btn-login {
  height: 42px;
  border-radius: 10px;
  background: #3B5998;
  color: white;
  border: none;
  cursor: pointer;
  font-size: 14px;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  transition: background 0.2s, transform 0.1s, box-shadow 0.2s;
  margin-top: 4px;
  box-shadow: 0 4px 12px rgba(46, 46, 125, 0.3);
}
.btn-login:hover:not(:disabled) {
  background: #3B5998;
  box-shadow: 0 6px 16px rgba(46, 46, 125, 0.4);
}
.btn-login:active:not(:disabled) {
  transform: translateY(1px);
}
.btn-login:disabled {
  opacity: 0.65;
  cursor: not-allowed;
}

/* Spinner */
.btn-spinner {
  width: 16px;
  height: 16px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: white;
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

/* Footer */
.login-footer {
  margin-top: 24px;
  text-align: center;
  font-size: 11px;
  color: rgba(0, 0, 0, 0.3);
}

/* Responsive */
@media (max-width: 640px) {
  .login-left {
    display: none;
  }
  .login-container {
    width: 95%;
    min-height: unset;
  }
  .login-right {
    padding: 32px 24px;
  }
}
</style>
