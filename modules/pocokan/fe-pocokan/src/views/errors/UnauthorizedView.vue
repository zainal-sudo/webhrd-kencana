<template>
  <div class="err-page">
    <div class="err-code">403</div>
    <div class="err-title">Akses Ditolak</div>
    <div class="err-sub">Anda tidak memiliki hak akses ke halaman ini.</div>
    <button class="err-btn" @click="$router.push('/')">
      Kembali ke Dashboard
    </button>
  </div>
</template>
<style scoped>
.err-page {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: #f1f1f8;
  gap: 10px;
  font-family: Inter, system-ui, sans-serif;
}
.err-code {
  font-size: 72px;
  font-weight: 800;
  color: #3B5998;
  line-height: 1;
}
.err-title {
  font-size: 20px;
  font-weight: 700;
  color: #1a1a1a;
}
.err-sub {
  font-size: 13px;
  color: rgba(0, 0, 0, 0.5);
}
.err-btn {
  margin-top: 12px;
  padding: 10px 24px;
  background: #3B5998;
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}
.err-btn:hover {
  background: #3B5998;
}
</style>
