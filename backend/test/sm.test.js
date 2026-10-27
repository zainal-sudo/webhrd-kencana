import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

/**
 * Staff Movement Bulanan (ufrmProsesSMBulanan, `frmProsesSMBulanan`).
 * Read-only: refreshdata2 (rekap per bagian) + LihatDetail (popup bantuan).
 * Mock saja, tanpa koneksi DB.
 */
function muat(reqs, names) {
    const calls = []
    const respond = (sql, params) => {
        calls.push({ sql, params: params || [] })
        for (const { match, hasil } of reqs) if (match.test(sql)) return hasil
        return [[]]
    }
    const scope = {
        pool: { async query(sql, params) { return respond(sql, params) } },
        success: (res, data, message) => { res.body = { success: true, data, message } },
        error: (res, message, status) => { res.body = { success: false, message, status } },
        sendExcel: (res, title, columns, data) => { res.body = { title, columns, data } },
    }
    vm.createContext(scope)
    const source = readFileSync(new URL('../src/controllers/transaksi/smBulananController.js', import.meta.url), 'utf8')
    vm.runInContext(
        source.replace(/^import .*\r?\n/gm, '')
            .replace(/^export const /gm, 'const ')
            .replace(/^export async function /gm, 'async function ') +
        `\nglobalThis.handlers = { ${names.join(', ')} };`,
        scope
    )
    const handlers = {}
    for (const n of names) handlers[n] = (req, res) => scope.handlers[n](req, res || {}, (err) => { throw err })
    return { handlers, calls }
}

const next = (err) => { throw err }

const qRekap = { match: /FROM \(SELECT bm_bagian AS bagian FROM tbudgetmpp/, hasil: [[{ bagian: 'Produksi A', baru: 2, mutasiin: 1, mutasiout: 1 }]] }
const qMutasi = { match: /UNION/, hasil: [[{ bagian: 'Produksi A', baru: 2, mutasiin: 1, mutasiout: 1 }]] }

/* ── Rekap (refreshdata2) ── */
test('Rekap: baris tbudgetmpp + hitungan karyawan baru / mutasi / keluar', async () => {
    const { handlers, calls } = muat([qRekap], ['getProsesSMBulanan'])
    const res = {}
    await handlers.getProsesSMBulanan({ query: { pabrik: 'P01', tahun: 2026, bulan: 10 } }, res, next)
    assert.equal(res.body.success, true)
    assert.equal(res.body.data.sumber, 'budget', 'budget ada -> sumber budget')
    assert.equal(res.body.data.rows[0].total, 3, 'total = baru + mutasiin (hitung Delphi)')
    assert.equal(res.body.data.rows[0].total2, 1, 'total2 = jumlah pengurangan (mock punya mutasiout 1)')
    assert.match(calls[0].sql, /CONCAT\(j\.jab_nama, ' ', k\.kar_bagian\) = x\.bagian/)
    assert.match(calls[0].sql, /MONTH\(k\.kar_tgl_masuk\)/, 'Karyawan Baru dari tanggal masuk')
    assert.match(calls[0].sql, /mut_jab_kode2/, 'Mutasi In sisi baru pabrik tujuan')
    assert.match(calls[0].sql, /mut_pab_kode2/, 'pabrik mutasi in dari pab tujuan')
    assert.match(calls[0].sql, /mut_jab_kode\b/, 'Mutasi Out sisi lama')
    assert.match(calls[0].sql, /MONTH\(kl\.kl_tanggal\)/, 'hitung keluar')
    assert.ok(/bm_pab_kode = \? AND bm_tahun = \?/.test(calls[0].sql), 'where budget')
    assert.ok(calls[0].params.filter(v => v === 'P01').length >= 4, 'pabrik dipakai di setiap sub-select')
    assert.ok([...calls[0].params].includes(10), 'bulan 1..12 dipakai')
    assert.ok([...calls[0].params].includes(2026), 'tahun dipakai')
})

test('Rekap: bila tbudgetmpp tahun itu kosong, pakai union movement bulan tsb', async () => {
    const { handlers, calls } = muat([
        { match: /FROM \(SELECT bm_bagian AS bagian FROM tbudgetmpp/, hasil: [[]] },
        qMutasi,
    ], ['getProsesSMBulanan'])
    const res = {}
    await handlers.getProsesSMBulanan({ query: { pabrik: 'P01', tahun: 2026, bulan: 10 } }, res, next)
    assert.equal(res.body.data.sumber, 'mutasi', 'fallback union movement')
    assert.equal(calls.length, 2, 'budget dulu, baru fallback')
    assert.match(calls[1].sql, /UNION/)
    assert.match(calls[1].sql, /kar_tgl_masuk/, 'bagian karyawan baru bulan itu')
    assert.match(calls[1].sql, /mut_bagian2/, 'bagian tujuan mutasi')
    assert.match(calls[1].sql, /kl_tanggal/, 'bagian karyawan keluar')
    assert.ok(calls[1].params.filter(v => v === 'P01').length >= 8, 'pabrik di tiap blok union + hitungan')
})

test('Rekap: daftar kl_alasan layak (pindah / study / pensiun / kasus)', async () => {
    const { handlers, calls } = muat([qRekap], ['getProsesSMBulanan'])
    const res = {}
    await handlers.getProsesSMBulanan({ query: { pabrik: 'P01', tahun: 2026, bulan: 10 } }, res, next)
    if (res.body.success === false) assert.fail(res.body.message)
    for (const alasan of ['Pindah ke perusahaan lain', 'Melanjutkan study', 'Lain lain', 'Pensiun',
        'Pemberhentian sementara', 'Tidak lolos training', 'Kasus']) {
        assert.ok(calls[0].params.some(v => String(v).toLowerCase() === `${alasan.toLowerCase()}%`), `alasan ${alasan}`)
    }
})

test('Rekap: tolak bulan di luar 1..12', async () => {
    const { handlers } = muat([], ['getProsesSMBulanan'])
    const res = {}
    await handlers.getProsesSMBulanan({ query: { pabrik: 'P01', tahun: 2026, bulan: 13 } }, res, next)
    assert.equal(res.body.success, false)
    const res2 = {}
    await handlers.getProsesSMBulanan({ query: { pabrik: 'P01', tahun: 2026, bulan: 0 } }, res2, next)
    assert.equal(res2.body.success, false)
})

test('Rekap: export xlsx terbit dengan kolom lengkap', async () => {
    const { handlers, calls } = muat([qRekap], ['getProsesSMBulanan'])
    const res = {}
    await handlers.getProsesSMBulanan({ query: { pabrik: 'P01', tahun: 2026, bulan: 10, export: 'xlsx' } }, res, next)
    assert.equal(res.body.title, 'Staff Movement Bulanan')
    assert.ok(res.body.columns.includes('total2'), 'kolom total pengurangan terekspor')
    assert.ok(calls[0].sql.includes('FROM (SELECT bm_bagian AS bagian FROM tbudgetmpp'))
})

/* ── Detail (LihatDetail1Click) ── */
test('Detail: Karyawan Baru memakai kar_tgl_masuk', async () => {
    const { handlers, calls } = muat([], ['getDetailSMBulanan'])
    const res = {}
    await handlers.getDetailSMBulanan({ query: { pabrik: 'P01', tahun: 2026, bulan: 10, bagian: 'Produksi A', kolom: 'baru' } }, res, next)
    assert.match(calls[0].sql, /kar_tgl_masuk AS tanggal/)
    assert.deepEqual([...calls[0].params], [10, 2026, 'P01', 'Produksi A'])
})

test('Detail: Mutasi In memakai sisi baru (jab2/bagian2/pabrik2)', async () => {
    const { handlers, calls } = muat([], ['getDetailSMBulanan'])
    const res = {}
    await handlers.getDetailSMBulanan({ query: { pabrik: 'P01', tahun: 2026, bulan: 10, bagian: 'Produksi A', kolom: 'mutasiin' } }, res, next)
    assert.match(calls[0].sql, /mut_jab_kode2/)
    assert.match(calls[0].sql, /mut_pab_kode2/)
    const res2 = {}
    await handlers.getDetailSMBulanan({ query: { pabrik: 'P01', tahun: 2026, bulan: 10, bagian: 'Produksi A', kolom: 'mutasiout' } }, res2, next)
    assert.match(calls[1].sql, /mut_jab_kode\b/)
    assert.match(calls[1].sql, /mut_pab_kode\b/)
})

test('Detail: alasan keluar memakai LIKE band+%', async () => {
    const { handlers, calls } = muat([], ['getDetailSMBulanan'])
    const res = {}
    await handlers.getDetailSMBulanan({ query: { pabrik: 'P01', tahun: 2026, bulan: 10, bagian: 'Produksi A', kolom: 'pindah' } }, res, next)
    assert.match(calls[0].sql, /kl_alasan LIKE \?/)
    assert.deepEqual([...calls[0].params.slice(-1)], ['Pindah ke perusahaan lain%'])
    const res2 = {}
    await handlers.getDetailSMBulanan({ query: { pabrik: 'P01', tahun: 2026, bulan: 10, bagian: 'Produksi A', kolom: 'tidaklolos' } }, res2, next)
    assert.deepEqual([...calls[1].params.slice(-1)], ['Tidak lolos training%'])
})

test('Detail: tolak kolom tidak dikenal / bagian kosong', async () => {
    const { handlers } = muat([], ['getDetailSMBulanan'])
    const res = {}
    await handlers.getDetailSMBulanan({ query: { pabrik: 'P01', tahun: 2026, bulan: 10, bagian: 'A', kolom: 'ngasal' } }, res, next)
    assert.equal(res.body.success, false)
    const res2 = {}
    await handlers.getDetailSMBulanan({ query: { pabrik: 'P01', tahun: 2026, bulan: 10, kolom: 'pindah' } }, res2, next)
    assert.equal(res2.body.success, false)
})

/* ── Pendaftaran route & menu ── */
test('Route + menu frontend terdaftar di bawah Proses MPP Bulanan', async () => {
    const router = readFileSync(new URL('../src/routes/transaksiRoutes.js', import.meta.url), 'utf8')
    for (const p of ['/sm/proses', '/sm/detail']) {
        assert.ok(router.includes(`'${p}'`), `route ${p} ada`)
    }
    assert.ok(router.includes('frmProsesSMBulanan'))
    const feRouter = readFileSync(new URL('../../frontend/src/router/index.ts', import.meta.url), 'utf8')
    assert.ok(feRouter.includes('/transaksi/staff-movement-bulanan'), 'route FE ada')
    const menu = readFileSync(new URL('../../frontend/src/utils/menuMap.ts', import.meta.url), 'utf8')
    assert.match(menu, /frmProsesSMBulanan: \{[^}]*grup: "transaksi"[^}]*ready: true/)
    assert.doesNotMatch(menu, /"frmProsesSMBulanan"/, 'tidak lagi di MENU_DIABAIKAN')
    const posisi = menu.indexOf('frmprosesMPPBulanan')
    const posisiSm = menu.indexOf('frmProsesSMBulanan')
    assert.ok(posisiSm > posisi, 'urutkan setelah MPP Bulanan di menuMap')
})
