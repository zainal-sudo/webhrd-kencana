import test from 'node:test'
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { applyAllColumnFilters, applyColumnFilterSets } from '../src/helpers/browse.js'

// Execute helper-generated SQL against an in-memory SQL fixture, never HRD/MySQL.
// Only SQL-standard NULL/IN/OR/equality are used in these tests.
const columns = { Bank: 'p.bank', Norek: 'p.norek' }
const fixture = () => {
    const db = new DatabaseSync(':memory:')
    db.exec('CREATE TABLE loans (id INTEGER PRIMARY KEY, bank TEXT, norek TEXT)')
    const insert = db.prepare('INSERT INTO loans VALUES (?, ?, ?)')
    insert.run(1, null, null)
    insert.run(2, '', '')
    insert.run(3, 'BSI', '001234')
    insert.run(4, 'CIMB', '008765')
    insert.run(5, 'null', 'null')
    return db
}
for (const [label, query, expected] of [
    ['NULL bank', { filterNull_Bank: '1' }, [1]],
    ['empty bank', { filterEmpty_Bank: '1' }, [2]],
    ['BSI', { filterSet_Bank: ['BSI'] }, [3]],
    ['NULL + BSI', { filterNull_Bank: '1', filterSet_Bank: ['BSI'] }, [1, 3]],
    ['literal null', { filterSet_Bank: ['null'] }, [5]],
    ['NULL + empty + BSI', { filterNull_Bank: '1', filterEmpty_Bank: '1', filterSet_Bank: ['BSI'] }, [1, 2, 3]],
    ['NULL account', { filterNull_Norek: '1' }, [1]],
    ['empty account', { filterEmpty_Norek: '1' }, [2]],
    ['leading-zero account', { filterSet_Norek: ['001234'] }, [3]],
    ['literal null + SQL NULL', { filterNull_Bank: '1', filterSet_Bank: ['null'] }, [1, 5]],
]) test(`Shared filter returns correct SQL rows: ${label}`, () => {
    const db = fixture()
    try {
        const { clause, params } = applyAllColumnFilters(' WHERE 1=1', [], query, columns)
        const rows = db.prepare(`SELECT p.id FROM loans p${clause} ORDER BY p.id`).all(...params)
        assert.deepEqual(rows.map(row => row.id), expected)
    } finally { db.close() }
})
test('Old normal-only filters keep exact SQL/params, whitespace rules, bracket array and except behavior', () => {
    const result = applyColumnFilterSets(' WHERE p.id > ?', [0], { 'filterSet_Bank[]': [' BSI ', '', 'CIMB'] }, columns)
    assert.deepEqual(result, { clause: ' WHERE p.id > ? AND p.bank IN (?,?)', params: [0, 'BSI', 'CIMB'] })
    assert.deepEqual(applyColumnFilterSets(' WHERE 1=1', [], { filterSet_Bank: ['BSI'], filterNull_Bank: '1', filterEmpty_Bank: '1' }, columns, 'Bank'),
        { clause: ' WHERE 1=1', params: [] })
    assert.deepEqual(applyColumnFilterSets(' WHERE 1=1', [], { filterSet_Bank: [''] }, columns), { clause: ' WHERE 1=1', params: [] })
})
test('Mixed OR stays grouped under existing predicates and values stay bound', () => {
    const result = applyAllColumnFilters(' WHERE p.id > ?', [2], { filterNull_Bank: '1', filterSet_Bank: ["BSI' OR 1=1 --"] }, columns)
    assert.equal(result.clause, ' WHERE p.id > ? AND (p.bank IN (?) OR p.bank IS NULL)')
    assert.deepEqual(result.params, [2, "BSI' OR 1=1 --"])
    assert.ok(!result.clause.includes('1=1 --'))
    const db = fixture()
    try { assert.deepEqual(db.prepare(`SELECT p.id FROM loans p${result.clause}`).all(...result.params), []) }
    finally { db.close() }
})
