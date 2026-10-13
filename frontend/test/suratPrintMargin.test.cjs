const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

for (const [view, right] of [['SPView.vue', '1cm'], ['KeluarView.vue', '1.2cm'], ['MutasiView.vue', '1cm']]) {
  test(`${view}: printed A4 letter has 1-inch left margin and preserves other margins`, () => {
    const source = fs.readFileSync(path.join(__dirname, '../src/views/transaksi', view), 'utf8');
    const printDocument = source.match(/w\.document\.write\(`([\s\S]*?)`\)/)?.[1];
    assert.ok(printDocument, 'Independent print document must exist');
    const page = printDocument.match(/@page\s*\{([^}]+)\}/)?.[1];
    assert.ok(page);
    assert.match(page, /size:\s*A4 portrait;/);
    assert.equal(page.match(/margin:\s*([^;]+);/)?.[1], `1cm ${right} 1cm 1in`);
    assert.match(printDocument, /html, body\s*\{\s*margin: 0; padding: 0;/);
  });
}
