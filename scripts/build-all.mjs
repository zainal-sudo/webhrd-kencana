/**
 * build-all.mjs — satu command build dari root repository webhrd-kencana.
 *
 *   npm run build:all          → build fe-HRIS + fe-Pocokan + susun staging
 *   npm run dist:compose       → hanya menyusun ulang folder deploy dari hasil
 *                                build yang sudah ada (tanpa rebuild)
 *
 * Susunan hasil (tidak menimpa frontend/dist — hanya disalin):
 *   staging/
 *     www/            → isi dist fe-HRIS (root web port 96)
 *     www/pocokan/    → isi dist fe-Pocokan (base '/pocokan/')
 *     backend/        → backend HRIS (app.js + src/) spt biasa di-deploy
 *
 * Catatan: backend Pocokan TIDAK di-copy manual — source-nya ada di
 * modules/pocokan/be-pocokan dan di-mount oleh backend HRIS (satu proses),
 * jadi cukup deploy folder backend HRIS yang memuat modules/pocokan.
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const composeOnly = process.argv.includes("--compose-only");
const np = process.platform === "win32" ? "npm.cmd" : "npm";

function run(cmd, cwd) {
  console.log(`\n▶ ${cmd}   (cwd: ${path.relative(root, cwd) || "."})`);
  execSync(cmd, { cwd, stdio: "inherit" });
}

/** Install bila belum ada node_modules. */
function ensureDeps(dir, name) {
  if (fs.existsSync(path.join(dir, "node_modules"))) return;
  console.log(`▶ npm install (${name})`);
  execSync(`${np} install --no-fund --no-audit`, {
    cwd: dir,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
}

function rmrf(p) {
  fs.rmSync(p, { recursive: true, force: true });
}

/** Salin folder memakai robocopy (Windows) / cp -r (Unix).
 * robocopy exit code 1–7 berarti sukses (1 = file ter-copy) → jangan dianggap
 * gagal bila < 8. */
function copyDir(src, dest) {
  rmrf(dest);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  if (process.platform === "win32") {
    try {
      execSync(`robocopy "${src}" "${dest}" /E /NFL /NDL /NJH /NJS`, { stdio: "ignore" });
    } catch (e) {
      const code = e?.status ?? e?.code;
      if (!(code >= 1 && code < 8)) throw e;
    }
  } else {
    fs.cpSync(src, dest, { recursive: true });
  }
}

const feHris = path.join(root, "frontend");
const fePocokan = path.join(root, "modules", "pocokan", "fe-pocokan");

if (!composeOnly) {
  ensureDeps(feHris, "fe-HRIS");
  ensureDeps(fePocokan, "fe-Pocokan");

  // Build HRIS langsung: perintah asli tidak diubah.
  run("npm run build", feHris);
  // Build Pocokan dengan base /pocokan/ (vite.config.ts sudah menyetel base).
  run("npm run build", fePocokan);
}

/* ── Susun folder deploy (staging) ── */
const staging = path.join(root, "staging");
rmrf(staging);

const www = path.join(staging, "www");
copyDir(path.join(feHris, "dist"), www);
copyDir(path.join(fePocokan, "dist"), path.join(www, "pocokan"));

/* Structural sanity: path asset tidak boleh tertukar. */
const cekIndex = (dir, harusAda) => {
  const idx = path.join(dir, "index.html");
  if (!fs.existsSync(idx)) throw new Error(`index.html tidak ditemukan: ${idx}`);
  const html = fs.readFileSync(idx, "utf8");
  if (!html.includes(harusAda))
    throw new Error(`asset path tidak sesuai di ${idx} (expect base "${harusAda}")`);
};
cekIndex(www, "/");
cekIndex(path.join(www, "pocokan"), "/pocokan/");

console.log("\n✅ build selesai. Susunan deploy siap di ./staging:");
console.log("   staging/www/          → root web :96 (front HRIS)");
console.log("   staging/www/pocokan/  → modul Pocokan");
console.log("   backend/ (deploy folder backend HRIS utuh — sudah memuat modules/pocokan)");
