const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');
const root = path.join(__dirname, '../src');
const browser = [process.env.CHROME_BIN, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(p => p && fs.existsSync(p));

test('Shared dialog style is imported after theme, targets modal families and excludes blanket overlay blur', () => {
  const main = fs.readFileSync(path.join(root, 'main.ts'), 'utf8');
  assert.ok(main.indexOf('assets/dialogs.css') > main.indexOf('assets/theme.css'));
  const source = fs.readFileSync(path.join(root, 'assets/dialogs.css'), 'utf8');
  assert.match(source, /\.v-dialog > \.v-overlay__scrim/);
  assert.match(source, /\.loan-overlay/);
  assert.match(source, /prefers-reduced-transparency/);
  assert.doesNotMatch(source, /\.v-overlay\s*\{/);
  assert.doesNotMatch(fs.readFileSync(path.join(root, 'assets/main.css'), 'utf8'), /\.v-overlay\s*\{[^}]*backdrop-filter/);
});

test('Browser modal styles: both families, nested modal, light/dark, mobile, opaque content and unblurred menus', { skip: !browser }, () => {
  const dir = fs.mkdtempSync(path.join(process.env.LOCALAPPDATA, 'Temp/opencode/dialog-style-'));
  try {
    const css = ['design-system.css', 'main.css', 'theme.css', 'dialogs.css'].map(file => fs.readFileSync(path.join(root, 'assets', file), 'utf8')).join('\n');
    for (const theme of ['light', 'dark']) {
      const file = path.join(dir, theme + '.html');
      fs.writeFileSync(file, `<!doctype html><html data-theme="${theme}"><head><style>
        * { box-sizing: border-box; } body { margin: 0; } .v-overlay { position: fixed; inset: 0; } .v-overlay__scrim { position:absolute; inset:0; } .v-overlay__content { position:relative; width:760px; margin:16px; } .v-card { overflow:auto; } .loan-overlay { position:fixed; inset:0; display:grid; place-items:center; } .loan-dialog { width:min(720px,100%); padding:24px; } .cari-bar input { width:600px; } ${css}
        </style></head><body>
        <div class="v-overlay v-dialog"><div class="v-overlay__scrim"></div><div class="v-overlay__content"><div class="v-card"><div class="v-card-title dlg-head"><span>Cari Karyawan</span><button class="v-btn">X</button></div><div class="v-card-text dlg-body"><div class="cari-bar"><input placeholder="Cari"><button>Cari</button></div><p>Data karyawan</p></div></div></div></div>
        <div class="loan-overlay"><section class="loan-dialog"><header><h2>Detail Pinjaman</h2><button>X</button></header>Data</section></div>
        <div id="confirmation" class="v-overlay v-dialog"><div class="v-overlay__scrim"></div><div class="v-overlay__content" style="max-width:400px"><div class="v-card"><div class="v-card-title">Konfirmasi</div><div class="v-card-text">Lanjut?</div><div class="v-card-actions"><button>Batal</button><button>Lanjut</button></div></div></div></div>
        <div id="menu" class="v-overlay v-menu"></div><pre id="result"></pre>
        <script>
        const style = selector => getComputedStyle(document.querySelector(selector));
        const card = document.querySelector('.v-card');
        const small = innerWidth <= 600;
        const results = {
          vuetifyBlur: style('.v-dialog > .v-overlay__scrim').backdropFilter === 'blur(4px)',
          loanBlur: style('.loan-overlay').backdropFilter === 'blur(4px)',
          menuUnchanged: style('#menu').backdropFilter === 'none',
          contentSharp: style('.v-card').backdropFilter === 'none',
          sameSurface: style('.v-card').backgroundColor === style('.loan-dialog').backgroundColor,
          opaque: !style('.v-card').backgroundColor.startsWith('rgba'),
          rounded: style('.v-card').borderRadius === (small ? '12px' : '16px'),
          sameRadius: style('.v-card').borderRadius === style('.loan-dialog').borderRadius,
          headerClean: style('.dlg-head').backgroundColor === 'rgba(0, 0, 0, 0)',
          searchFits: card.scrollWidth <= card.clientWidth + 1,
          confirmationWidth: document.querySelector('#confirmation .v-overlay__content').getBoundingClientRect().width <= 400,
          actionsRetained: document.querySelectorAll('#confirmation button').length === 2,
          noContentFilter: style('.v-overlay.v-dialog').filter === 'none'
        }; document.querySelector('#result').textContent = JSON.stringify(results);
        </script></body></html>`);
      for (const width of [1200, 390]) {
        const output = spawnSync(browser, ['--headless=new', '--disable-gpu', '--no-first-run', `--user-data-dir=${path.join(dir, 'profile')}`, `--window-size=${width},900`, '--dump-dom', pathToFileURL(file).href], { encoding: 'utf8', timeout: 20000, maxBuffer: 4e6 });
        assert.equal(output.status, 0, output.stderr);
        const results = JSON.parse(output.stdout.match(/<pre id="result">([^<]+)<\/pre>/)[1]);
        for (const [name, ok] of Object.entries(results)) assert.equal(ok, true, `${theme}/${width}: ${name}`);
      }
    }
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
