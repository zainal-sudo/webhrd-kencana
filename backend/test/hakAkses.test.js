import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { DatabaseSync } from 'node:sqlite'
import ExcelJS from 'exceljs'
import { success, error, paginated } from '../src/helpers/response.js'
import { applyAllColumnFilters, buildOrderBy } from '../src/helpers/browse.js'
import { sendExcel } from '../src/helpers/excel.js'
const read = name => readFileSync(new URL(name, import.meta.url), 'utf8')
const response = () => ({ statusCode: 200, headers: {}, status(code) { this.statusCode = code; return this }, json(body) { this.body = body; return this }, setHeader(key, value) { this.headers[key] = value }, send(body) { this.buffer = body; return this } })
function fixture({ lock = 1, failWrite = 0, databaseError = false } = {}) {
    const db = new DatabaseSync(':memory:')
    db.exec(`CREATE TABLE tuser (user_kode TEXT PRIMARY KEY COLLATE NOCASE,user_nama TEXT,USER_PASSWORD TEXT,user_akses TEXT,user_edit INTEGER DEFAULT 0,date_create TEXT DEFAULT CURRENT_TIMESTAMP);
        CREATE TABLE tmenu (men_id INTEGER PRIMARY KEY,men_nama TEXT,men_keterangan TEXT,men_modul INTEGER);
        CREATE TABLE thakuser (hak_user_kode TEXT,hak_men_id INTEGER,hak_men_insert TEXT,hak_men_edit TEXT,hak_men_delete TEXT);
        CREATE TABLE tpabrik (pab_kode TEXT PRIMARY KEY);
        INSERT INTO tpabrik VALUES ('P1'),('P2');
        INSERT INTO tuser VALUES ('ADMIN','Admin','Fictional','','1','2026-01-01'),('U1','User One','OldSecret','P1',0,'2026-01-02'),('OTHER','Other','OtherSecret',NULL,0,'2026-01-03');
        INSERT INTO tmenu VALUES (1,'frmAbsensi','Absensi',1),(2,'frmIjin','Ijin',1),(3,'frmUser','User',2);
        INSERT INTO thakuser VALUES ('ADMIN',3,'Y','Y','Y'),('U1',1,'N','N','N'),('OTHER',2,'Y','N','N');`)
    db.function('NOW', () => '2026-10-20 12:00:00')
    db.function('OCTET_LENGTH', value => value == null ? null : Buffer.byteLength(String(value)))
    const calls = [], cleared = []
    let writes = 0
    const query = async (sql, params = []) => {
        calls.push({ sql, params: Array.from(params) })
        if (sql.includes('GET_LOCK')) return [[{ acquired: lock }]]
        if (sql.includes('RELEASE_LOCK')) return [[{ released: 1 }]]
        if (databaseError) throw new Error('Fake SQL containing FictionalSecret')
        if (/^(INSERT|UPDATE|DELETE)/.test(sql) && ++writes === failWrite) throw new Error('Fixture write failure')
        const statement = db.prepare(sql)
        if (sql.startsWith('SELECT')) return [statement.all(...params)]
        const result = statement.run(...params)
        return [{ affectedRows: Number(result.changes), insertId: Number(result.lastInsertRowid) }]
    }
    const pool = { query, getConnection: async () => ({ query, release() { calls.push({ sql: 'CONNECTION RELEASE' }) } }) }
    const permissionScope = { pool, Date, Map }
    vm.createContext(permissionScope)
    vm.runInContext(read('../src/middleware/permission.js').replace(/^import .*\r?\n/gm, '').replace(/^export /gm, '') + '\nglobalThis.permission = { cekHak, wajibHak, clearHakAksesCache };', permissionScope)
    const clearHakAksesCache = kode => { cleared.push(kode); permissionScope.permission.clearHakAksesCache(kode) }
    const scope = { pool, success, error, paginated, applyAllColumnFilters, buildOrderBy, sendExcel: (res, title, columns, rows) => sendExcel(res, title, Array.from(columns), Array.from(rows)), clearHakAksesCache }
    vm.createContext(scope)
    vm.runInContext(read('../src/controllers/master/userController.js').replace(/^import .*\r?\n/gm, '').replace(/^export /gm, '') + '\nglobalThis.handlers = { getUserList, getUser, saveUser, resetPassword, deleteUser, getHakAkses, saveHakAkses };', scope)
    return { db, calls, cleared, permission: permissionScope.permission,
        async call(name, { body = {}, id = 'U1', kode = id, method = 'GET', query = {} } = {}) {
            const res = response()
            await scope.handlers[name]({ body, params: { id, kode }, method, query, user: { user: 'ADMIN' } }, res, err => { throw err })
            return res
        },
    }
}
const rights = (men_id, view = 'Y', insert = 'N', edit = 'N', del = 'N') => ({ men_id, view, insert, edit, delete: del })
const writeCalls = f => f.calls.filter(c => /^(INSERT|UPDATE|DELETE)/.test(c.sql))
const account = (user_kode = 'NEW') => ({ user_kode, user_nama: 'New User', user_akses: '', user_password: ' NewPass ' })

test('Hak GET maps record presence to view Y, all-N remains read-only, absent modules are all N', async t => {
    const f = fixture(); t.after(() => f.db.close())
    const res = await f.call('getHakAkses')
    assert.equal(res.statusCode, 200)
    const first = res.body.data.find(row => row.men_id === 1), absent = res.body.data.find(row => row.men_id === 2)
    assert.equal(first.view, 'Y')
    for (const key of ['insert','edit','delete','hak_men_insert','hak_men_edit','hak_men_delete']) assert.equal(first[key], 'N')
    for (const key of ['view','insert','edit','delete']) assert.equal(absent[key], 'N')
    assert.equal(await f.permission.cekHak('U1','frmAbsensi','view'), true)
    assert.equal(await f.permission.cekHak('U1','frmAbsensi','edit'), false)
})
test('Save unchanged read-only record performs no writes and preserves view permission', async t => {
    const f = fixture(); t.after(() => f.db.close())
    const res = await f.call('saveHakAkses', { body: { user_kode: 'U1', items: [rights(1), rights(2,'N')] }, method: 'PUT' })
    assert.equal(res.statusCode, 200); assert.equal(writeCalls(f).length, 0)
    assert.equal(await f.permission.cekHak('U1','frmAbsensi','view'), true)
    assert.ok(f.calls.some(c => c.sql.includes('RELEASE_LOCK')))
})
test('Insert read-only, update actions, then revoke only selected module; unspecified/other users stay intact', async t => {
    const f = fixture(); t.after(() => f.db.close())
    assert.equal(await f.permission.cekHak('U1','frmIjin','view'), false)
    assert.equal((await f.call('saveHakAkses', { body: { items: [rights(2)] }, method: 'PUT' })).statusCode, 200)
    assert.equal(await f.permission.cekHak('U1','frmIjin','view'), true)
    assert.equal(await f.permission.cekHak('U1','frmIjin','edit'), false)
    assert.equal((await f.call('saveHakAkses', { body: { items: [rights(2,'Y','Y','Y','N')] }, method: 'PUT' })).statusCode, 200)
    assert.equal(await f.permission.cekHak('U1','frmIjin','edit'), true)
    assert.equal((await f.call('saveHakAkses', { body: { items: [rights(2,'N')] }, method: 'PUT' })).statusCode, 200)
    assert.equal(await f.permission.cekHak('U1','frmIjin','view'), false)
    assert.equal(await f.permission.cekHak('U1','frmAbsensi','view'), true)
    assert.equal(await f.permission.cekHak('OTHER','frmIjin','insert'), true)
    assert.ok(writeCalls(f).filter(c => c.sql.startsWith('DELETE')).every(c => /hak_user_kode = \? AND hak_men_id = \?/.test(c.sql)))
    assert.deepEqual(f.db.prepare("SELECT DISTINCT hak_men_edit FROM thakuser WHERE hak_user_kode='U1'").all().map(row => row.hak_men_edit), ['N'])
})
test('All malformed rights payloads fail before any write; strict Y/N at every boundary', async t => {
    const f = fixture(); t.after(() => f.db.close())
    const bad = [{ user_kode:'OTHER',items:[rights(1)] }, {}, { items: [rights(1),rights('1')] }, { items: [rights(999)] }, { items: [rights('1 OR 1')] }, { items: [rights(1,'N','Y')] }, { items:[null] }]
    for (const flag of ['view','insert','edit','delete']) for (const value of [0,1,'0','1',false,true,null,undefined,'y','']) bad.push({ items: [{ ...rights(1), [flag]: value }] })
    for (const body of bad) {
        const res = await f.call('saveHakAkses', { body, method:'PUT' })
        assert.equal(res.statusCode, 400, JSON.stringify(body))
    }
    assert.equal(writeCalls(f).length,0)
    assert.equal((await f.call('saveHakAkses',{id:'MISSING',body:{items:[rights(1)]},method:'PUT'})).statusCode,404)
})
test('Lock failure stops writes; locks release after validation failure and duplicate DB rows are not cleaned', async t => {
    const f=fixture({lock:0}), g=fixture();t.after(()=>{f.db.close();g.db.close()})
    assert.equal((await f.call('saveHakAkses',{body:{items:[rights(2)]}})).statusCode,503)
    assert.equal(writeCalls(f).length,0);assert.ok(!f.calls.some(c=>c.sql.includes('RELEASE_LOCK')))
    g.db.exec("INSERT INTO thakuser VALUES ('U1',1,'N','N','N')")
    assert.equal((await g.call('saveHakAkses',{body:{items:[rights(2)]}})).statusCode,409)
    assert.equal((await g.call('getHakAkses')).statusCode,409)
    assert.equal(writeCalls(g).length,0);assert.ok(g.calls.some(c=>c.sql.includes('RELEASE_LOCK')))
})
test('MyISAM-style partial failure reports reload_required, retains actual changes and clears cached permissions', async t => {
    const f=fixture({failWrite:2});t.after(()=>f.db.close())
    assert.equal(await f.permission.cekHak('U1','frmIjin','view'),false)
    const res=await f.call('saveHakAkses',{body:{items:[rights(2),rights(3)]}})
    assert.equal(res.statusCode,500);assert.equal(res.body.reload_required,true)
    assert.match(res.body.message,/Sebagian perubahan/)
    assert.equal(await f.permission.cekHak('U1','frmIjin','view'),true)
    assert.equal(await f.permission.cekHak('U1','frmUser','view'),false)
    assert.ok(f.cleared.includes('U1'));assert.ok(f.calls.some(c=>c.sql.includes('RELEASE_LOCK')))
    const reload=await f.call('getHakAkses');assert.equal(reload.body.data.find(row=>row.men_id===2).view,'Y')
})
test('Master User POST/PUT and password reset respect identity, lengths, all-branch access and no password leaks', async t => {
    const f=fixture();t.after(()=>f.db.close())
    assert.equal((await f.call('saveUser',{method:'POST',body:account()})).statusCode,201)
    assert.equal(f.db.prepare("SELECT user_akses FROM tuser WHERE user_kode='NEW'").get().user_akses,'')
    assert.equal((await f.call('saveUser',{method:'POST',body:account()})).statusCode,409)
    const detail=await f.call('getUser',{id:'NEW'});assert.deepEqual(Object.keys(detail.body.data).sort(),['Cabang','Dibuat','Edit','Kode','Nama'])
    const update=await f.call('saveUser',{id:'NEW',method:'PUT',body:{...account(),user_nama:'Renamed',user_akses:'P2',user_password:'DoNotApply'}})
    assert.equal(update.statusCode,200)
    const stored=f.db.prepare("SELECT USER_PASSWORD,user_akses FROM tuser WHERE user_kode='NEW'").get()
    assert.equal(stored.USER_PASSWORD,' NewPass ');assert.equal(stored.user_akses,'P2')
    assert.equal((await f.call('saveUser',{id:'NEW',method:'PUT',body:{...account('OTHER')}})).statusCode,400)
    assert.equal((await f.call('saveUser',{id:'MISSING',method:'PUT',body:account('MISSING')})).statusCode,404)
    assert.equal((await f.call('resetPassword',{id:'NEW',body:{password:' Reset '}})).statusCode,200)
    assert.equal(f.db.prepare("SELECT USER_PASSWORD FROM tuser WHERE user_kode='NEW'").get().USER_PASSWORD,' Reset ')
    assert.ok(!JSON.stringify(detail.body).includes('NewPass'))
    for(const body of [{...account('BAD'),user_kode:'x'.repeat(11)},{...account('BAD'),user_nama:'x'.repeat(31)},{...account('BAD'),user_password:'x'.repeat(16)},{...account('BAD'),user_password:''},{...account('BAD'),user_akses:'x'.repeat(6)},{...account('BAD'),user_akses:'BAD'}]) assert.equal((await f.call('saveUser',{method:'POST',body})).statusCode,400)
    for(const password of ['',null,'x'.repeat(16)]) assert.equal((await f.call('resetPassword',{body:{password}})).statusCode,400)
})
test('Browse/search/filter/count/export share predicates, preserve NULL/empty branch and retain dropdown array contract', async t => {
    const f=fixture();t.after(()=>f.db.close())
    assert.equal(Array.isArray((await f.call('getUserList')).body.data),true)
    const query={page:1,per_page:1,sort_by:'Nama',sort_dir:'desc',filterNull_Cabang:'1',filterEmpty_Cabang:'1'}
    const first=await f.call('getUserList',{query}), second=await f.call('getUserList',{query:{...query,page:2}})
    assert.equal(first.body.pagination.total,2);assert.equal(second.body.pagination.total,2)
    const ids=[first,second].flatMap(res=>res.body.data.map(row=>row.Kode))
    const exported=await f.call('getUserList',{query:{...query,export:'xlsx'}})
    const wb=new ExcelJS.Workbook();await wb.xlsx.load(exported.buffer)
    assert.deepEqual(wb.worksheets[0].getColumn(1).values.slice(2),ids)
    assert.deepEqual(wb.worksheets[0].getRow(1).values.slice(1),['Kode','Nama','Cabang'])
    assert.equal(wb.worksheets[0].columnCount,3)
    assert.ok('Edit' in first.body.data[0] && 'Dibuat' in first.body.data[0])
    assert.equal((await f.call('getUserList',{query:{search:'User One',page:1}})).body.pagination.total,1)
    const distinct=await f.call('getUserList',{query:{distinct:'Cabang',filterSet_Cabang:['P1'],filterSet_Nama:['Other']}})
    assert.deepEqual(Array.from(distinct.body.data),[null])
    assert.equal((await f.call('getUserList',{query:{distinct:'USER_PASSWORD'}})).statusCode,400)
    const listed=await f.call('getUserList',{query:{page:1,sort_by:'USER_PASSWORD',filterSet_USER_PASSWORD:['secret']}})
    assert.ok(!JSON.stringify(listed.body).includes('OldSecret'))
    assert.ok(!f.calls.filter(c=>c.sql.startsWith('SELECT')).some(c=>c.sql.includes('USER_PASSWORD')))
    assert.match(f.calls.find(c=>c.sql.includes('LIMIT 50000')).sql,/LIMIT 50000/)
})
test('Delete targets only selected user; missing/reset failures and DB errors are sanitized', async t => {
    const f=fixture(), broken=fixture({databaseError:true});t.after(()=>{f.db.close();broken.db.close()})
    assert.equal((await f.call('deleteUser')).statusCode,200)
    assert.equal((await f.call('getUser')).statusCode,404)
    assert.equal((await f.call('deleteUser')).statusCode,404)
    assert.equal((await f.call('resetPassword',{body:{password:'New'}})).statusCode,404)
    assert.equal(await f.permission.cekHak('OTHER','frmIjin','insert'),true)
    const res=await broken.call('saveUser',{method:'POST',body:account()})
    assert.equal(res.statusCode,500);assert.ok(!JSON.stringify(res.body).includes('FictionalSecret'))
})
test('Routes/middleware deny unauthorized mutations and all-N view access does not grant editing', async t => {
    const f=fixture();t.after(()=>f.db.close())
    const routes=read('../src/routes/masterRoutes.js')
    for(const [method,url,action]of [['post','/user','insert'],['put','/user/:id','edit'],['put','/user/:id/password','edit'],['put','/user/:kode/hak','edit'],['delete','/user/:id','delete']]) assert.ok(routes.includes(`r.${method}('${url}', wajibHak('frmUser', '${action}')`))
    for(const [user,expected]of [['U1',false],['ADMIN',true]]) {
        const res=response();let passed=false
        await f.permission.wajibHak('frmUser','edit')({user:{user}},res,()=>{passed=true})
        assert.equal(passed,expected)
        if(!expected)assert.equal(res.statusCode,403)
    }
    assert.equal(await f.permission.cekHak('U1','frmAbsensi','view'),true)
    for(const action of ['insert','edit','delete'])assert.equal(await f.permission.cekHak('U1','frmAbsensi',action),false)
})


test('Legacy non-Y action values never grant permission or escape the Y/N response boundary', async t => {
    const f = fixture(); t.after(() => f.db.close())
    f.db.exec("UPDATE thakuser SET hak_men_insert='0', hak_men_edit='1', hak_men_delete='y' WHERE hak_user_kode='U1'")
    const res = await f.call('getHakAkses')
    const item = res.body.data.find(row => row.men_id === 1)
    assert.equal(item.view, 'Y')
    for (const action of ['insert', 'edit', 'delete']) {
        assert.equal(item[action], 'N')
        assert.equal(await f.permission.cekHak('U1', 'frmAbsensi', action), false)
    }
    assert.equal(writeCalls(f).length, 0)
})
