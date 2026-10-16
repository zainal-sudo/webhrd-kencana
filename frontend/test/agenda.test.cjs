const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const vue = require('vue');
const read = file => fs.readFileSync(path.join(__dirname, '../src', file), 'utf8');
function evaluate(source, dependencies = {}, globals = {}) {
  const module = { exports: {} };
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
    { module, exports: module.exports, require: name => dependencies[name] || {}, ...globals });
  return module.exports;
}
const utils = evaluate(read('utils/agenda.ts'));
test('Month/week calendar uses Monday start, correct leap/year transitions and Jakarta dates', () => {
  const days = Array.from(utils.calendarDays('2026-10-16', 'month'));
  assert.equal(days[0], '2026-09-28'); assert.equal(days.at(-1), '2026-11-01');
  assert.equal(days.length, 35);
  for (const date of ['2027-02-16', '2026-10-16', '2026-11-16', '2024-02-29', '2026-12-31']) {
    const fixed = Array.from(utils.calendarDays(date, 'month', true));
    assert.equal(fixed.length, 42);
    assert.equal(new Date(`${fixed[0]}T00:00:00Z`).getUTCDay(), 1);
    for (let day = 1; day <= fixed.length - 1; day++) assert.equal(fixed[day], utils.addDays(fixed[day - 1], 1));
    for (const natural of utils.calendarDays(date, 'month')) assert.ok(fixed.includes(natural));
  }
  assert.equal(utils.calendarDays('2026-10-16', 'week', true).length, 7);
  assert.deepEqual(Array.from(utils.calendarDays('2026-10-16', 'week')), ['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17', '2026-10-18']);
  assert.equal(utils.moveMonth('2024-01-31', 1), '2024-02-29');
  assert.equal(utils.moveMonth('2026-01-31', 1), '2026-02-28');
  assert.equal(utils.addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(utils.jakartaToday(new Date('2026-10-15T17:00:00Z')), '2026-10-16');
  assert.equal(utils.agendaEditedAt('2026-10-16T06:45:00.000Z'), '16/10/2026 13:45 WIB');
  assert.equal(utils.agendaEditedAt('2026-10-15T17:01:00.000Z'), '16/10/2026 00:01 WIB');
  assert.equal(utils.agendaEditedAt(null), ''); assert.equal(utils.agendaEditedAt('invalid'), '');
  assert.equal(utils.agendaAudience({ visibility: 'private', recipients: [] }), 'diri sendiri');
  assert.equal(utils.agendaAudience({ visibility: 'shared', recipients: ['p1', 'p2', 'p4'] }), 'P1, P2, P4');
  assert.equal(utils.agendaTimeError('', ''), '');
  assert.equal(utils.agendaTimeError('08:00', '09:00'), '');
  for (const [start, end] of [['08:00', ''], ['', '09:00'], ['09:00', '09:00'], ['10:00', '09:00']]) assert.ok(utils.agendaTimeError(start, end));
});
function noticeFixture() {
  const mounted = [], unmounted = [], intervals = new Map(), events = new Map(), requests = [];
  let timer = 0;
  const identity = vue.ref('token:hrd');
  const doc = { hidden: false, addEventListener: (key, fn) => events.set(key, fn), removeEventListener: key => events.delete(key) };
  const scope = vue.effectScope();
  const { useAgendaNotice } = evaluate(read('composables/useAgendaNotice.ts'), {
    vue: { ...vue, onMounted: fn => mounted.push(fn), onUnmounted: fn => unmounted.push(fn) },
    '@/api/axios': { api: { get: url => new Promise((resolve, reject) => requests.push({ url, resolve, reject })) }, getErrorMessage: err => err.message },
    '@/utils/agenda': utils,
  }, { document: doc, window: doc, setInterval: (fn, ms) => { assert.equal(ms, 60000); intervals.set(++timer, fn); return timer; }, clearInterval: id => intervals.delete(id) });
  const state = scope.run(() => useAgendaNotice(() => identity.value));
  mounted.forEach(fn => fn());
  return { ...state, identity, doc, intervals, events, requests, dispose() { unmounted.forEach(fn => fn()); scope.stop(); } };
}
const flush = async () => { await Promise.resolve(); await vue.nextTick(); };
test('Notice refreshes on focus/60 seconds, keeps dot after open, stops network while hidden and clears on logout', async () => {
  const f = noticeFixture();
  try {
    assert.equal(f.requests[0].url, '/agenda/today');
    f.requests[0].resolve({ data: { data: { count: 2, date: utils.jakartaToday() } } }); await flush();
    assert.equal(f.count.value, 2);
    f.open.value = true; assert.equal(f.count.value, 2);
    f.doc.hidden = true; [...f.intervals.values()][0](); assert.equal(f.requests.length, 1);
    f.doc.hidden = false; f.events.get('focus')(); assert.equal(f.requests.length, 2);
    f.identity.value = ''; await flush();
    assert.equal(f.count.value, 0); assert.equal(f.open.value, false); assert.equal(f.intervals.size, 0);
    f.requests[1].resolve({ data: { data: { count: 99, date: utils.jakartaToday() } } }); await flush();
    assert.equal(f.count.value, 0);
  } finally { f.dispose(); }
  assert.equal(f.events.size, 0);
});
test('Notice cannot reuse previous-account responses and clears stale indicator on failure', async () => {
  const f = noticeFixture();
  try {
    f.identity.value = 'token2:p1'; await flush();
    f.requests[0].resolve({ data: { data: { count: 99, date: utils.jakartaToday() } } }); await flush();
    assert.equal(f.count.value, 0);
    f.requests[1].resolve({ data: { data: { count: 1, date: utils.jakartaToday() } } }); await flush();
    assert.equal(f.count.value, 1);
    const pending = f.refresh(); f.requests[2].reject(Error('offline')); await pending;
    assert.equal(f.count.value, 0); assert.equal(f.failure.value, 'offline');
  } finally { f.dispose(); }
});
function calendarFixture() {
  const source = read('components/AgendaCalendar.vue').match(/<script setup lang="ts">([\s\S]*?)<\/script>/)[1];
  const calls = [], unmounted = [], emitted = [];
  const row = { id: 1, creator: 'hrd', title: 'Rapat', notes: '', date: '2026-10-16', start_time: null, end_time: null, visibility: 'shared', status: 'OPEN', version: 2, recipients: ['p1'] };
  const props = vue.reactive({ username: 'p1', refreshKey: 0 });
  let responseError, usersResponse;
  const request = async (method, url, payload) => {
    calls.push({ method, url, payload });
    if (responseError && method === 'put') throw responseError;
    if (url === '/agenda/users' && usersResponse) return await usersResponse;
    return { data: { data: url === '/agenda/users' ? [{ code: 'p1', name: 'User P1' }] : url === '/agenda' ? [row] : structuredClone(row) } };
  };
  const scope = vue.effectScope();
  const state = scope.run(() => evaluate(source + '\nexport { draft, rows, daily, editor, owner, document, selected, mode, formError, save, remove, editAgenda, newAgenda, reload, search, users, userLoading, userError, recipientPanelReady, recipientOptions, toggleRecipient, recipientLabel, searchUsers, closeEditor, chooseStatus, statusOpen, toggleStatus, busy, focusRecipients, recipientPanel, recipientSearchInput };', {
    vue: { ...vue, onUnmounted: fn => unmounted.push(fn) }, '@/utils/agenda': utils,
    '@/api/axios': { api: { get: (url, config) => request('get', url, config?.params), post: (url, body) => request('post', url, body), put: (url, body) => request('put', url, body), delete: (url, body) => request('delete', url, body) }, getErrorMessage: err => err.message },
  }, { defineProps: () => props, defineEmits: () => (...args) => emitted.push(args), setTimeout, clearTimeout, window: { confirm: () => true, matchMedia: () => ({ matches: false }) } }));
  return { ...state, calls, props, emitted, row, fail(error) { responseError = error; }, deferUsers(promise) { usersResponse = promise; }, dispose() { unmounted.forEach(fn => fn()); scope.stop(); } };
}
test('Recipient edits preserve creator/recipients/version; conflict retains draft for explicit reload', async () => {
  const f = calendarFixture();
  try {
    await f.editAgenda(1);
    assert.equal(f.owner.value, false);
    f.draft.title = 'Perubahan penerima';
    f.fail(Object.assign(Error('Agenda telah berubah. Muat ulang.'), { response: { status: 409 } }));
    await f.save();
    const put = f.calls.find(call => call.method === 'put');
    assert.equal(put.payload.version, 2); assert.deepEqual(Array.from(put.payload.recipients), ['p1']);
    assert.equal(f.draft.title, 'Perubahan penerima'); assert.equal(f.editor.value, true); assert.match(f.formError.value, /Muat ulang/);
    f.fail(null); await f.editAgenda(1);
    assert.equal(f.draft.title, 'Rapat');
    await f.remove();
    assert.deepEqual(f.calls.find(call => call.method === 'delete').payload.data.version, 2);
    assert.equal(f.editor.value, false);
  } finally { f.dispose(); }
});
test('Invalid time never sends a mutation; new private agenda starts OPEN without recipients', async () => {
  const f = calendarFixture();
  try {
    f.newAgenda(); f.draft.title = 'Pribadi'; f.draft.start_time = '08:00';
    await f.save(); assert.ok(f.formError.value); assert.ok(!f.calls.some(call => call.method === 'post'));
    f.draft.start_time = ''; await f.save();
    const post = f.calls.find(call => call.method === 'post');
    assert.equal(post.payload.status, 'OPEN'); assert.equal(post.payload.visibility, 'private'); assert.equal(post.payload.recipients.length, 0);
  } finally { f.dispose(); }
});

test('Showing shared panel fetches choices; new/edit reset searches; recipients cannot change selection', async () => {
  const f = calendarFixture();
  try {
    f.newAgenda(); f.draft.visibility = 'shared'; f.search.value = 'old search';
    f.newAgenda(); await flush();
    assert.equal(f.search.value, ''); assert.equal(f.recipientPanelReady.value, false);
    f.draft.visibility = 'shared'; await flush();
    assert.equal(f.recipientPanelReady.value, true);
    assert.equal(f.calls.filter(call => call.url === '/agenda/users').at(-1).payload.search, '');
    f.search.value = 'old search'; await f.editAgenda(1);
    assert.equal(f.search.value, ''); assert.equal(f.recipientPanelReady.value, false);
    f.toggleRecipient('p4');
    assert.deepEqual(Array.from(f.draft.recipients), ['p1']);
  } finally { f.dispose(); }
});
test('Slow/stale recipient responses cannot overwrite a reopened form; errors clear on retry', async () => {
  const f = calendarFixture();
  try {
    let resolve;
    f.deferUsers(new Promise(done => { resolve = done; }));
    f.newAgenda(); f.draft.visibility = 'shared'; await flush(); assert.equal(f.userLoading.value, true);
    f.closeEditor(); await flush(); f.deferUsers(null); f.newAgenda(); f.draft.visibility = 'shared'; await flush();
    resolve({ data: { data: [{ code: 'stale', name: 'Old request' }] } }); await flush();
    assert.ok(!f.users.value.some(user => user.code === 'stale'));
    f.deferUsers(Promise.reject(Error('Gagal mengambil akun'))); await f.searchUsers();
    assert.equal(f.userError.value, 'Gagal mengambil akun'); assert.equal(f.userLoading.value, false);
    f.deferUsers(null); await f.searchUsers();
    assert.equal(f.userError.value, ''); assert.equal(f.users.value.length, 1);
  } finally { f.dispose(); }
});

test('Several selections survive searches, can be removed separately and are sent as distinct codes', async () => {
  const f = calendarFixture();
  try {
    f.props.username = 'hrd'; f.newAgenda(); f.draft.visibility = 'shared'; await flush();
    await f.searchUsers();
    for (const code of ['p1', 'p2', 'p4']) f.toggleRecipient(code);
    f.toggleRecipient('hrd');
    assert.deepEqual(Array.from(f.draft.recipients), ['p1', 'p2', 'p4']);
    assert.ok(!f.recipientOptions.value.some(user => user.code === 'hrd'));
    assert.match(f.recipientLabel('p1'), /User P1/);
    f.search.value = 'p2'; await f.searchUsers();
    assert.deepEqual(Array.from(f.draft.recipients), ['p1', 'p2', 'p4']);
    assert.match(f.recipientLabel('p1'), /User P1/);
    f.toggleRecipient('p2'); assert.deepEqual(Array.from(f.draft.recipients), ['p1', 'p4']);
    f.draft.title = 'Bersama'; await f.save();
    assert.deepEqual(Array.from(f.calls.find(call => call.method === 'post').payload.recipients), ['p1', 'p4']);
  } finally { f.dispose(); }
});

test('Status can be changed without owner rights; busy state blocks it; back closes status list', async () => {
  const f = calendarFixture();
  try {
    await f.editAgenda(1); assert.equal(f.owner.value, false);
    await f.toggleStatus(); assert.equal(f.statusOpen.value, true);
    f.chooseStatus('BATAL'); assert.equal(f.draft.status, 'BATAL'); assert.equal(f.statusOpen.value, false);
    f.busy.value = true; f.chooseStatus('OPEN'); assert.equal(f.draft.status, 'BATAL');
    f.busy.value = false; await f.toggleStatus(); f.closeEditor(); assert.equal(f.statusOpen.value, false);
  } finally { f.dispose(); }
});
test('Sharing focuses recipient search and scrolls its panel; recipients cannot change sharing', async () => {
  const f = calendarFixture(), calls = [];
  try {
    let finishUsers;
    f.deferUsers(new Promise(resolve => { finishUsers = resolve; }));
    f.props.username = 'hrd'; f.newAgenda(); f.draft.visibility = 'shared';
    f.recipientPanel.value = { scrollIntoView: options => calls.push(['scroll', options.block]) };
    f.recipientSearchInput.value = { focus: options => calls.push(['focus', options.preventScroll]) };
    await f.focusRecipients();
    assert.ok(calls.some(call => call[0] === 'focus' && call[1]));
    assert.ok(calls.some(call => call[0] === 'scroll' && call[1] === 'center'));
    finishUsers({ data: { data: [{ code: 'p1', name: 'User P1' }] } }); await flush(); await flush();
    assert.equal(calls.filter(call => call[0] === 'scroll').length, 1);
    calls.length = 0; f.props.username = 'p1'; await f.editAgenda(1); await f.focusRecipients(); assert.equal(calls.length, 0);
  } finally { f.dispose(); }
});

test('Daily cards prioritize OPEN/SELESAI/BATAL, all-day/time/id and react to status changes without mutating API order', async () => {
  const f = calendarFixture();
  try {
    await flush(); f.selected.value = '2026-10-16';
    const row = (id, status, start_time = null, date = '2026-10-16') => ({ ...f.row, id, status, start_time, date });
    f.rows.value = [row(8, 'BATAL'), row(7, 'SELESAI'), row(5, 'OPEN', '10:00'), row(4, 'OPEN', '08:00'), row(3, 'OPEN'), row(2, 'OPEN'), row(1, 'OPEN', '08:00'), row(9, 'OPEN', null, '2026-10-17')];
    const original = Array.from(f.rows.value, item => item.id);
    assert.deepEqual(Array.from(f.daily.value, item => item.id), [2, 3, 1, 4, 5, 7, 8]);
    assert.deepEqual(Array.from(f.rows.value, item => item.id), original);
    f.rows.value.find(item => item.id === 2).status = 'BATAL';
    assert.deepEqual(Array.from(f.daily.value, item => item.id), [3, 1, 4, 5, 7, 2, 8]);
    f.rows.value.find(item => item.id === 8).status = 'OPEN';
    assert.deepEqual(Array.from(f.daily.value, item => item.id), [3, 8, 1, 4, 5, 7, 2]);
  } finally { f.dispose(); }
});
