import test from 'node:test'
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ExcelJS from 'exceljs'
import { AKHIR_TAHUN_COLUMNS, AKHIR_TAHUN_METRICS, akhirTahunSql, periodeAkhirTahun } from '../src/helpers/akhirTahun.js'
import { applyAllColumnFilters, buildOrderBy } from '../src/helpers/browse.js'
import { sendAkhirTahunExcel } from '../src/helpers/akhirTahunExcel.js'

function fixture() {
    const db = new DatabaseSync(':memory:')
    db.function('MONTH', value => value == null ? null : Number(String(value).slice(5, 7)))
    db.function('DATE_FORMAT', (value, _format) => value == null ? null : String(value).slice(0, 10))
    db.function('DATEDIFF', (a, b) => a == null || b == null ? null : Math.round((Date.parse(String(a).slice(0, 10)) - Date.parse(String(b).slice(0, 10))) / 86400000))
    db.function('IF', (condition, yes, no) => condition ? yes : no)
    db.function('OCTET_LENGTH', value => value == null ? null : Buffer.byteLength(String(value)))
    db.exec(`CREATE TABLE tkaryawan (
        kar_Nik TEXT PRIMARY KEY, kar_nama TEXT, kar_bagian TEXT, kar_jab_kode TEXT,
        kar_tgl_masuk TEXT, kar_sistem_gaji TEXT, kar_jenkel INTEGER, kar_pab_kode TEXT,
        kar_kode_absensi TEXT, kar_status_aktif INTEGER);
        CREATE TABLE tjabatan (jab_kode TEXT PRIMARY KEY, jab_nama TEXT);
        CREATE TABLE tijin (ij_nik TEXT, ij_tanggal TEXT, ij_ji_id INTEGER, ij_keterangan INTEGER);
        CREATE TABLE tabsensi (nik TEXT, tanggal TEXT, status INTEGER);
        INSERT INTO tjabatan VALUES ('J1', 'Staff');
        INSERT INTO tkaryawan VALUES
        ('00001','Ani','HO','J1','2025-12-31','Harian',2,'P01','ABS001',1),
        ('00002','Budi','Produksi','J1','2025-12-30','Bulanan',1,'P02','ABS002',1),
        ('00003','Inactive','HO','J1','2020-01-01','Harian',1,'P01','ABS003',0),
        ('00004','Missing job','HO','MISSING','2020-01-01','Harian',1,'P01','ABS004',1),
        ('00005','No records',NULL,'J1',NULL,'Harian',2,'P03','ABS005',1),
        ('00006','Shared code','HO','J1','2020-01-01','Harian',1,'P01','ABS001',1);
        INSERT INTO tijin VALUES
        ('00001','2026-10-05',5,3), ('00001','2026-10-06',5,3),
        ('00001','2026-10-07',4,3),
        ('00001','2026-10-08',3,3), ('00001','2026-10-08',3,3),
        ('00001','2026-01-02',3,0), ('00001','2026-01-02',3,0),
        ('00001','2026-02-02',3,1), ('00001','2026-03-02',3,2),
        ('00001','2026-10-10',2,0), ('00001','2026-10-11',2,3),
        ('00001','2026-10-12',1,3), ('00001','2026-10-13',3,NULL),
        ('00001','2025-12-31',3,3), ('00001','2027-01-01',3,3),
        ('00002','2026-12-31 23:59:59',3,0),
        ('00003','2026-10-08',3,3);
        INSERT INTO tabsensi VALUES
        ('ABS001','2026-10-02',2), ('ABS001','2026-10-03',2),
        ('ABS001','2026-10-04',0), ('ABS001','2026-10-05',1),
        ('ABS001','2027-01-01',2), ('ABS001','2025-12-31',2),
        ('00001','2026-10-06',2);`)
    const insert = db.prepare('INSERT INTO tijin VALUES (?, ?, ?, ?)')
    // The verified legacy total 36: October 2 + January 34, including duplicates.
    for (let index = 0; index < 34; index++) insert.run('00001', '2026-01-10', 3, 3)
    const calls = []
    const scope = {
        pool: { async query(sql, params = []) { calls.push({ sql, params }); return [db.prepare(sql).all(...params)] } },
        AKHIR_TAHUN_COLUMNS, akhirTahunSql, periodeAkhirTahun, applyAllColumnFilters, buildOrderBy, sendAkhirTahunExcel,
        error: (res, message, status) => { res.error = { message, status } },
        success: (res, data) => { res.data = data },
        paginated: (res, data, pagination) => { res.data = data; res.pagination = pagination },
    }
    vm.createContext(scope)
    const source = readFileSync(new URL('../src/controllers/laporan/akhirTahunController.js', import.meta.url), 'utf8')
    vm.runInContext(source.replace(/^import .*\r?\n/gm, '').replace(/^export /gm, '') + '\nglobalThis.handler = getAkhirTahun;', scope)
    return { db, calls, async request(query = {}) {
        const res = { headers: {}, setHeader(key, value) { this.headers[key] = value }, status(code) { this.code = code; return this }, send(body) { this.body = body; return this } }
        await scope.handler({ query: { tahun: '2026', ...query } }, res, error => { throw error })
        return res
    } }
}

test('Annual columns are 9 identity + 12 x 6 metrics + 6 totals, with consistent Lain-lain labels', () => {
    assert.equal(AKHIR_TAHUN_COLUMNS.length, 87)
    for (let month = 1; month <= 12; month++) {
        assert.equal(AKHIR_TAHUN_COLUMNS.find(column => column.key === `Lain_Lain_${month}`).label, `Lain-lain ${month}`)
    }
    assert.equal(AKHIR_TAHUN_COLUMNS.find(column => column.key === 'Total_Lain_Lain').label, 'Total Lain-lain')
    assert.doesNotMatch(JSON.stringify(AKHIR_TAHUN_COLUMNS), /cuti/i)
})

test('Year validation is strict and creates inclusive-start/exclusive-end calendar bounds', () => {
    assert.deepEqual(periodeAkhirTahun('2026'), { year: 2026, start: '2026-01-01', end: '2027-01-01', reference: '2026-12-31' })
    for (const value of ['', '26', '2026junk', '2026.5', ' 2026', '1899', '9999', [], ['2026'], {}, "2026' OR 1=1"]) {
        assert.throws(() => periodeAkhirTahun(value), /Tahun/)
    }
})

test('Verified October: 2 Dinas Luar + 2 Tidak Masuk/Ket3 give Lain-lain 2, annual total 36; types 4/5/1 are excluded', async () => {
    const f = fixture()
    try {
        const res = await f.request()
        const row = res.data.find(row => row.Nik === '00001')
        assert.equal(row.Lain_Lain_10, 2)
        assert.equal(row.Lain_Lain_1, 34)
        assert.equal(row.Total_Lain_Lain, 36)
        assert.equal(row.Sakit_1, 2) // No DISTINCT date: two documents count twice.
        assert.equal(row.Ijin_2, 1)
        assert.equal(row.Alpha_3, 1)
        assert.equal(row.ST_Hari_10, 2) // Count occurrences, do not multiply by 0.5.
        assert.equal(row.Terlambat_10, 2) // Code ABS001, not the literal employee NIK.
        for (const metric of AKHIR_TAHUN_METRICS) {
            const sum = Array.from({ length: 12 }, (_, index) => row[`${metric.key}_${index + 1}`]).reduce((a, b) => a + b, 0)
            assert.equal(row[`Total_${metric.key}`], sum)
        }
        assert.equal(f.db.prepare('SELECT COUNT(*) AS c FROM tijin').get().c, 51)
        assert.ok(f.calls.every(call => /^SELECT\b/.test(call.sql)))
    } finally { f.db.close() }
})

test('Legacy active employee/inner job scope, zero rows, shared attendance codes and year-end tenure are preserved', async () => {
    const f = fixture()
    try {
        const res = await f.request()
        assert.deepEqual(Array.from(res.data, row => row.Nik), ['00001', '00002', '00005', '00006'])
        assert.equal(res.data[0].umur_1th, 'Belum') // Exactly 365, legacy uses >365.
        assert.equal(res.data[1].umur_1th, 'Sudah')
        assert.equal(res.data[1].Sakit_12, 1) // December 31 timestamp is included.
        assert.equal(res.data[2].Total_Lain_Lain, 0)
        assert.equal(res.data[2].Tgl_Masuk, null)
        assert.equal(res.data[3].Terlambat_10, 2)
        assert.equal(res.data[3].Lain_Lain_10, 0) // No cross-employee Ijin attribution.
        const nextYear = await f.request({ tahun: '2027', search: 'Ani' })
        assert.equal(nextYear.data[0].Lain_Lain_1, 1)
        assert.equal(nextYear.data[0].Total_Lain_Lain, 1)
    } finally { f.db.close() }
})

test('Every month 1 through 12 has independent category counts; types 4/5 never contribute to Lain-lain', async () => {
    const f = fixture()
    try {
        const insert = f.db.prepare('INSERT INTO tijin VALUES (?, ?, ?, ?)')
        const attendance = f.db.prepare('INSERT INTO tabsensi VALUES (?, ?, ?)')
        for (let month = 1; month <= 12; month++) {
            const date = `2026-${String(month).padStart(2, '0')}-15`
            for (const detail of [[3, 0], [3, 1], [3, 2], [3, 3], [2, 3], [4, 3], [5, 3]]) {
                insert.run('00002', date, ...detail)
            }
            attendance.run('ABS002', date, 2)
        }
        const res = await f.request({ search: 'Budi' })
        const row = res.data[0]
        for (let month = 1; month <= 12; month++) {
            for (const metric of AKHIR_TAHUN_METRICS) {
                assert.equal(row[`${metric.key}_${month}`], metric.key === 'Sakit' && month === 12 ? 2 : 1)
            }
        }
        for (const metric of AKHIR_TAHUN_METRICS) assert.equal(row[`Total_${metric.key}`], metric.key === 'Sakit' ? 13 : 12)
    } finally { f.db.close() }
})

test('Browse search, numeric/blank filters, distinct, sorting and pagination share the annual scope', async () => {
    const f = fixture()
    try {
        const page = await f.request({ per_page: '1', page: '2' })
        assert.equal(page.data[0].Nik, '00002')
        assert.equal(page.pagination.total, 4)
        assert.equal(page.pagination.last_page, 4)
        const filtered = await f.request({ filterSet_Lain_Lain_10: ['2'] })
        assert.equal(filtered.data.length, 1)
        assert.equal(filtered.data[0].Nik, '00001')
        const zero = await f.request({ filterSet_Lain_Lain_10: ['0'] })
        assert.equal(zero.data.length, 3)
        const blank = await f.request({ filterNull_Bagian: '1' })
        assert.equal(blank.data[0].Nik, '00005')
        const options = await f.request({ distinct: 'Lain_Lain_10', filterSet_Lain_Lain_10: ['2'], filterSet_Pabrik: ['P01'] })
        assert.deepEqual(Array.from(options.data), [0, 2]) // Exclude own filter, retain Pabrik.
        const sorted = await f.request({ sort_by: 'Total_Lain_Lain', sort_dir: 'desc', search: 'HO' })
        assert.deepEqual(Array.from(sorted.data, row => row.Nik), ['00001', '00006'])
        const injection = await f.request({ search: "' OR 1=1 --", sort_by: '__proto__', sort_dir: 'DROP TABLE tijin' })
        assert.equal(injection.data.length, 0)
        const invalid = await f.request({ distinct: '__proto__' })
        assert.equal(invalid.error.status, 400)
    } finally { f.db.close() }
})

test('Annual header filter returns all distinct values beyond 500 employees', async () => {
    const f = fixture()
    try {
        const insert = f.db.prepare(`INSERT INTO tkaryawan VALUES (?, ?, 'HO', 'J1', '2020-01-01', 'Harian', 1, 'P01', ?, 1)`)
        for (let index = 0; index < 501; index++) {
            const nik = `EXTRA${index}`
            insert.run(nik, `Employee ${index}`, nik)
        }
        const res = await f.request({ distinct: 'Nik' })
        assert.equal(res.data.length, 505)
        assert.doesNotMatch(f.calls.at(-1).sql, /LIMIT/)
    } finally { f.db.close() }
})

test('Invalid years fail before any database read; report is never a write path', async () => {
    const f = fixture()
    try {
        const res = await f.request({ tahun: '2026;DROP TABLE tijin' })
        assert.equal(res.error.status, 400)
        assert.equal(f.calls.length, 0)
    } finally { f.db.close() }
})

test('Excel exports every matching page with all 87 headers, text NIK, numeric counts, same filters/year and no Cuti label', async () => {
    const f = fixture()
    try {
        const res = await f.request({ export: 'xlsx', per_page: '1', page: '3', filterSet_Pabrik: ['P01'] })
        const wb = new ExcelJS.Workbook()
        await wb.xlsx.load(res.body)
        const sheet = wb.worksheets[0]
        assert.equal(sheet.columnCount, 87)
        assert.equal(sheet.rowCount, 3)
        assert.deepEqual(sheet.getRow(1).values.slice(1), AKHIR_TAHUN_COLUMNS.map(column => column.label))
        assert.equal(sheet.getCell('A2').value, '00001')
        assert.equal(sheet.getCell('A2').numFmt, '@')
        assert.equal(sheet.getCell('E2').value, '31/12/2025')
        const monthlyIndex = AKHIR_TAHUN_COLUMNS.findIndex(column => column.key === 'Lain_Lain_10') + 1
        const totalIndex = AKHIR_TAHUN_COLUMNS.findIndex(column => column.key === 'Total_Lain_Lain') + 1
        assert.equal(sheet.getRow(2).getCell(monthlyIndex).value, 2)
        assert.equal(sheet.getRow(2).getCell(totalIndex).value, 36)
        assert.equal(sheet.getRow(2).getCell(totalIndex).numFmt, '#,##0')
        assert.equal(sheet.views[0].xSplit, 2)
        assert.equal(sheet.views[0].ySplit, 1)
        assert.match(res.headers['Content-Disposition'], /Laporan-Akhir-Tahun-2026/)
        assert.doesNotMatch(f.calls.at(-1).sql, /LIMIT|OFFSET/)
        const empty = await f.request({ export: 'xlsx', search: 'No matching employee' })
        await wb.xlsx.load(empty.body)
        assert.equal(wb.worksheets[0].rowCount, 1)
        assert.equal(wb.worksheets[0].columnCount, 87)
    } finally { f.db.close() }
})

test('Annual API route uses its existing browse permission and adds no write endpoints', () => {
    const routes = readFileSync(new URL('../src/routes/laporanRoutes.js', import.meta.url), 'utf8')
    assert.match(routes, /r\.get\('\/akhir-tahun', wajibHak\('frmLapAkhirTahun'\), getAkhirTahun\)/)
    assert.doesNotMatch(routes, /r\.(post|put|delete|patch)\('\/akhir-tahun/)
})
