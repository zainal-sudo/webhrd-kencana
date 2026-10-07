import test from 'node:test'
import assert from 'node:assert/strict'
import ExcelJS from 'exceljs'
import * as XLSX from 'xlsx'
import { bacaBerkasAbsensi, simpanScanStaging, jamExcelKeTeks } from '../src/helpers/absensiImport.js'

const nik = '3201010101010001'
const tanggal = '2026-08-01'

async function excelBuffer(ext, sheets) {
    if (ext === 'xls') {
        const wb = XLSX.utils.book_new()
        sheets.forEach((rows, i) => XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), `Sheet${i + 1}`))
        return XLSX.write(wb, { type: 'buffer', bookType: 'biff8' })
    }
    const wb = new ExcelJS.Workbook()
    sheets.forEach((rows, i) => wb.addWorksheet(`Sheet${i + 1}`).addRows(rows))
    return Buffer.from(await wb.xlsx.writeBuffer())
}

for (const ext of ['xls', 'xlsx']) {
    test(`${ext}: header di tiap sheet memetakan urutan kolom berbeda`, async () => {
        const buffer = await excelBuffer(ext, [
            [[], ['Jam', 'Tipe', 'NIK', 'Tanggal'], ['07:00:00', 'I', nik, tanggal]],
            [['Tanggal', 'kar_Nik', 'Tipe', 'Jam Scan'], [tanggal, nik, 'O', '16:00:00']],
        ])
        const rows = await bacaBerkasAbsensi(buffer, `absensi.${ext}`)
        assert.equal(rows.length, 2)
        assert.equal(rows[0].values[rows[0].header.nik], nik)
        assert.equal(rows[0].values[rows[0].header.jam], '07:00:00')
        assert.equal(rows[1].values[rows[1].header.kar_nik], nik)
        assert.equal(rows[1].values[rows[1].header['jam scan']], '16:00:00')
    })

    test(`${ext}: tanpa header tidak membuang data pertama`, async () => {
        const pertama = [nik, tanggal, '07:00:00', 'I']
        const buffer = await excelBuffer(ext, [[pertama, [nik, tanggal, '16:00:00', 'O']]])
        const rows = await bacaBerkasAbsensi(buffer, `absensi.${ext}`)
        assert.equal(rows.length, 2)
        assert.equal(rows[0].header, null)
        assert.deepEqual(rows[0].values, pertama)
    })
}

for (const pemisah of [',', ';', '\t']) {
    test(`CSV: header, BOM, baris kosong, pemisah ${JSON.stringify(pemisah)}`, async () => {
        const teks = '\uFEFF\n' + [
            ['Tipe', 'NIK', 'Tanggal', 'Jam'].join(pemisah),
            ['I', `"${nik}"`, tanggal, '07:00:00'].join(pemisah),
        ].join('\r\n')
        const rows = await bacaBerkasAbsensi(Buffer.from(teks), 'absensi.csv')
        assert.equal(rows.length, 1)
        assert.equal(rows[0].values[rows[0].header.nik], nik)
    })
}

test('CSV tanpa header mempertahankan data pertama', async () => {
    const rows = await bacaBerkasAbsensi(Buffer.from(`${nik},${tanggal},07:00:00,I`), 'absensi.csv')
    assert.equal(rows.length, 1)
    assert.equal(rows[0].header, null)
    assert.equal(rows[0].values[0], nik)
})

test('XLS: jam numerik Excel dinormalisasi tanpa mengubah jam teks', async () => {
    const buffer = await excelBuffer('xls', [[
        ['NIK', 'Tanggal', 'Jam', 'Tipe'],
        [nik, 46235, 7 / 24, 'I'],
        [nik, 46235, 16 / 24, 'O'],
    ]])
    const rows = await bacaBerkasAbsensi(buffer, 'absensi.xls')
    assert.equal(rows[0].values[rows[0].header.tanggal], 46235)
    assert.equal(jamExcelKeTeks(rows[0].values[rows[0].header.jam]), '07:00:00')
    assert.equal(jamExcelKeTeks(rows[1].values[rows[1].header.jam]), '16:00:00')
    assert.equal(jamExcelKeTeks((7 * 3600 + 5 * 60 + 3) / 86400), '07:05:03')
    assert.equal(jamExcelKeTeks('07:00:00'), '07:00:00')
})

test('Format tidak didukung ditolak dengan pesan jelas', async () => {
    await assert.rejects(bacaBerkasAbsensi(Buffer.from('abc'), 'absensi.pdf'), /Format berkas tidak didukung/)
})

test('Sheet kosong dan berkas dengan header saja tidak menghasilkan baris data', async () => {
    const buffer = await excelBuffer('xlsx', [[], [['NIK', 'Tanggal', 'Jam', 'Tipe']]])
    assert.deepEqual(await bacaBerkasAbsensi(buffer, 'absensi.xlsx'), [])
})

// Mock kontrak upsert; tidak mengakses database HRD atau mengubah data pengguna.
function mockStaging() {
    const rows = new Map()
    return {
        rows,
        async query(sql, [nik, tanggal, jam]) {
            assert.match(sql, /ON DUPLICATE KEY UPDATE/)
            const key = `${nik}|${tanggal}`
            const row = rows.get(key) || { scan1: '00:00:00', scan2: '00:00:00' }
            if (sql.includes('UPDATE scan2')) {
                assert.match(sql, /scan2 = IF\(VALUES\(scan2\) = '00:00:00', scan2,/)
                assert.match(sql, /IF\(scan2 IS NULL OR scan2 = '00:00:00', VALUES\(scan2\), GREATEST\(scan2, VALUES\(scan2\)\)\)/)
                if (jam !== '00:00:00' && (!row.scan2 || row.scan2 === '00:00:00' || jam > row.scan2)) row.scan2 = jam
            } else {
                assert.match(sql, /scan1 = IF\(VALUES\(scan1\) = '00:00:00', scan1,/)
                assert.match(sql, /IF\(scan1 IS NULL OR scan1 = '00:00:00', VALUES\(scan1\), LEAST\(scan1, VALUES\(scan1\)\)\)/)
                if (jam !== '00:00:00' && (!row.scan1 || row.scan1 === '00:00:00' || jam < row.scan1)) row.scan1 = jam
            }
            rows.set(key, row)
        },
    }
}

test('Staging: masuk-keluar dan keluar-masuk menghasilkan pasangan yang sama', async () => {
    const masuk = { nik, tanggal, jam: '07:00:00', keluar: false }
    const keluar = { nik, tanggal, jam: '16:00:00', keluar: true }
    for (const urutan of [[masuk, keluar], [keluar, masuk]]) {
        const db = mockStaging()
        for (const b of urutan) await simpanScanStaging(db, b)
        assert.deepEqual(db.rows.get(`${nik}|${tanggal}`), { scan1: '07:00:00', scan2: '16:00:00' })
    }
})

test('Staging: masuk paling awal dan keluar paling akhir, bukan urutan baca', async () => {
    const db = mockStaging()
    for (const [jam, keluar] of [['17:00:00', true], ['08:00:00', false], ['07:00:00', false], ['16:00:00', true]]) {
        await simpanScanStaging(db, { nik, tanggal, jam, keluar })
    }
    assert.deepEqual(db.rows.get(`${nik}|${tanggal}`), { scan1: '07:00:00', scan2: '17:00:00' })
})

test('Staging: scan1 NULL dapat diisi tanpa menghapus scan2', async () => {
    const db = mockStaging()
    db.rows.set(`${nik}|${tanggal}`, { scan1: null, scan2: '16:00:00' })
    await simpanScanStaging(db, { nik, tanggal, jam: '07:00:00', keluar: false })
    assert.deepEqual(db.rows.get(`${nik}|${tanggal}`), { scan1: '07:00:00', scan2: '16:00:00' })
})

test('Staging: scan2 NULL dapat diisi tanpa menghapus scan1', async () => {
    const db = mockStaging()
    db.rows.set(`${nik}|${tanggal}`, { scan1: '07:00:00', scan2: null })
    await simpanScanStaging(db, { nik, tanggal, jam: '16:00:00', keluar: true })
    assert.deepEqual(db.rows.get(`${nik}|${tanggal}`), { scan1: '07:00:00', scan2: '16:00:00' })
})

function* permutasi(items) {
    if (!items.length) { yield []; return }
    for (let i = 0; i < items.length; i += 1) {
        const sisa = [...items.slice(0, i), ...items.slice(i + 1)]
        for (const urutan of permutasi(sisa)) yield [items[i], ...urutan]
    }
}

test('Staging: 720 urutan scan berulang menghasilkan MIN masuk / MAX keluar yang sama', async () => {
    const scans = [
        ['07:05:00', false], ['06:58:00', false], ['07:01:00', false],
        ['16:02:00', true], ['16:15:00', true], ['16:08:00', true],
    ]
    let jumlah = 0
    for (const urutan of permutasi(scans)) {
        const db = mockStaging()
        for (const [jam, keluar] of urutan) await simpanScanStaging(db, { nik, tanggal, jam, keluar })
        assert.deepEqual(db.rows.get(`${nik}|${tanggal}`), { scan1: '06:58:00', scan2: '16:15:00' })
        jumlah += 1
    }
    assert.equal(jumlah, 720)
})

test('Staging: upload berikutnya memperluas MIN/MAX, upload ulang tidak mengubah hasil', async () => {
    const db = mockStaging()
    db.rows.set(`${nik}|${tanggal}`, { scan1: '07:05:00', scan2: '16:02:00' })
    const scans = [['07:01:00', false], ['16:15:00', true], ['07:10:00', false], ['16:08:00', true]]
    for (let upload = 0; upload < 2; upload += 1) {
        for (const [jam, keluar] of scans) await simpanScanStaging(db, { nik, tanggal, jam, keluar })
        assert.deepEqual(db.rows.get(`${nik}|${tanggal}`), { scan1: '07:01:00', scan2: '16:15:00' })
    }
})

test('Staging: jam kosong tidak mengganti scan valid', async () => {
    const db = mockStaging()
    db.rows.set(`${nik}|${tanggal}`, { scan1: '07:00:00', scan2: '16:00:00' })
    for (const jam of ['00:00:00', null, undefined, '']) {
        for (const keluar of [false, true]) await simpanScanStaging(db, { nik, tanggal, jam, keluar })
    }
    assert.deepEqual(db.rows.get(`${nik}|${tanggal}`), { scan1: '07:00:00', scan2: '16:00:00' })
})

test('Staging: row kosong dapat diisi, scan kosong pertama tidak menjadi MIN', async () => {
    const db = mockStaging()
    for (const [jam, keluar] of [['00:00:00', false], ['00:00:00', true], ['07:00:00', false], ['16:00:00', true]]) {
        await simpanScanStaging(db, { nik, tanggal, jam, keluar })
    }
    assert.deepEqual(db.rows.get(`${nik}|${tanggal}`), { scan1: '07:00:00', scan2: '16:00:00' })
})

test('Staging: NIK dan tanggal berbeda tidak digabung; scan lintas malam tetap terpisah', async () => {
    const db = mockStaging()
    await simpanScanStaging(db, { nik, tanggal, jam: '15:30:00', keluar: false })
    await simpanScanStaging(db, { nik, tanggal: '2026-08-02', jam: '00:04:00', keluar: true })
    await simpanScanStaging(db, { nik: '3201010101010002', tanggal, jam: '08:00:00', keluar: false })
    assert.equal(db.rows.size, 3)
    assert.deepEqual(db.rows.get(`${nik}|${tanggal}`), { scan1: '15:30:00', scan2: '00:00:00' })
    assert.deepEqual(db.rows.get(`${nik}|2026-08-02`), { scan1: '00:00:00', scan2: '00:04:00' })
    assert.deepEqual(db.rows.get(`3201010101010002|${tanggal}`), { scan1: '08:00:00', scan2: '00:00:00' })
})
