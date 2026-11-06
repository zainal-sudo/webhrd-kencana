-- 20261021 — Tabel akses form penilaian via tautan (link berbatas waktu).
-- Dibuat manual oleh admin DB (bukan migrasi otomatis): InnoDB di server,
-- tanpa foreign key agar tidak mengunci urutan deploy backend/frontend.
--
-- Basis waktukses: koneksi web berjalan WIB; expires_at disimpan sebagai
-- DATETIME yang dibandingkan langsung dengan NOW() sisi DB (lihat
-- penilaianTokenService.js: `t.expires_at > ?`).

CREATE TABLE IF NOT EXISTS web_penilaian_access_token (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    token_hash CHAR(64) NOT NULL,
    form_type VARCHAR(20) NOT NULL,
    nik VARCHAR(20) NOT NULL,
    issued_by VARCHAR(20) NOT NULL,
    expires_at DATETIME NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_penilaian_token_hash (token_hash),
    KEY idx_penilaian_token_nik (nik),
    KEY idx_penilaian_token_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
