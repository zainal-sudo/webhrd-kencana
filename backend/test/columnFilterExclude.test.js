import test from 'node:test'
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { applyAllColumnFilters, applyColumnExcludes } from '../src/helpers/browse.js'

const columns = { Status: 'p.status', MasaKerja: 'p.masa' }
const options = {
    stringColumns: new Set(['Status']),
    numberColumns: new Set(['MasaKerja']),
}
const fixture = () => {
    const db = new DatabaseSync(':memory:')
    db.function('OCTET_LENGTH', value => value == null ? null : Buffer.byteLength(String(value)))
    db.exec('CREATE TABLE karyawan (id INTEGER PRIMARY KEY, status TEXT, masa NUMERIC)')
    const insert = db.prepare('INSERT INTO karyawan VALUES (?, ?, ?)')
    insert.run(1, null, null)
    insert.run(2, '', 0)
    insert.run(3, 'Aktif', 2)
    insert.run(4, 'Non Aktif', 5)
    insert.run(5, '-', 7)
    return db
}
const rows = (query, except = null) => {
    const db = fixture()
    try {
        const { clause, params } = applyAllColumnFilters(' WHERE 1=1', [], query, columns, except, options)
        return db.prepare(`SELECT p.id FROM karyawan p${clause} ORDER BY p.id`).all(...params).map(row => row.id)
    } finally { db.close() }
}

test('Hiding literal "-" excludes it but keeps NULL and other values', () => {
    assert.deepEqual(rows({ filterNotSet_Status: ['-'] }), [1, 2, 3, 4])
    assert.deepEqual(rows({ 'filterNotSet_Status[]': ['Non Aktif', '-'] }), [1, 2, 3])
})

test('Hiding Blank removes both SQL NULL and empty string, and combines with dash', () => {
    assert.deepEqual(rows({ filterNotNull_Status: '1', filterNotEmpty_Status: '1' }), [3, 4, 5])
    assert.deepEqual(rows({
        filterNotSet_Status: ['-'], filterNotNull_Status: '1', filterNotEmpty_Status: '1',
    }), [3, 4])
})

test('Numeric hide Blank removes NULL only and keeps zero; bracket arrays work', () => {
    assert.deepEqual(rows({ filterNotNull_MasaKerja: '1' }), [2, 3, 4, 5])
    assert.deepEqual(rows({ filterNotNull_MasaKerja: '1', filterNotEmpty_MasaKerja: '1' }), [2, 3, 4, 5])
    assert.deepEqual(rows({ 'filterNotSet_MasaKerja[]': ['5', '7'] }), [1, 2, 3])
})

test('Exclusions are skipped for the requested distinct column and values stay bound', () => {
    assert.deepEqual(rows({ distinct: 'Status', filterNotSet_Status: ['-'] }, 'Status'), [1, 2, 3, 4, 5])
    const result = applyColumnExcludes(' WHERE p.id > ?', [0], { filterNotSet_Status: ["' OR 1=1 --"] }, columns)
    assert.equal(result.clause, " WHERE p.id > ? AND (p.status IS NULL OR p.status NOT IN (?))")
    assert.deepEqual(result.params, [0, "' OR 1=1 --"])
})

test('Inclusion and exclusion can coexist on different columns', () => {
    assert.deepEqual(rows({ filterSet_Status: ['Aktif'], filterNotSet_MasaKerja: ['5'] }), [3])
})
