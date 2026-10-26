const m = require('mysql2/promise');
(async () => {
  const c = await m.createConnection({ host: '127.0.0.1', port: 3306, user: 'kencana', password: 'Kencana#123', database: 'hrd2' });
  const nik = '106050011';
  const [k] = await c.query('SELECT kar_Nik, kar_kode_absensi, kar_nama, kar_status_aktif FROM tkaryawan WHERE kar_Nik LIKE ?', ['%' + nik + '%']);
  console.log('tkaryawan match:', JSON.stringify(k, null, 1));
  const [s] = await c.query('SELECT nik, tanggal, scan1, scan2 FROM tabsensi2 WHERE nik LIKE ? ORDER BY tanggal DESC LIMIT 10', ['%' + nik + '%']);
  console.log('tabsensi2 match:', JSON.stringify(s, null, 1));
  const [a] = await c.query('SELECT a.nik, a.tanggal, a.scan1, a.scan2 FROM tabsensi a JOIN tkaryawan k ON k.kar_kode_absensi = a.nik WHERE k.kar_Nik LIKE ? ORDER BY a.tanggal DESC LIMIT 10', ['%' + nik + '%']);
  console.log('tabsensi (via kode_absensi) match:', JSON.stringify(a, null, 1));
  await c.end();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
