const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '../src');
function files(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(directory, entry.name);
    return entry.isDirectory() ? files(full) : full.endsWith('.vue') ? [full] : [];
  });
}

test('Every titled Edit/Ubah action button uses the pencil icon, preserving action handlers', () => {
  let count = 0;
  for (const file of files(root)) {
    const source = fs.readFileSync(file, 'utf8');
    for (const match of source.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)) {
      if (!/title="(?:Edit|Ubah)(?:\s[^"]*)?"/.test(match[1])) continue;
      count++;
      assert.match(match[2], /(?:<MsIcon name="edit"|>edit<\/span>)/, path.relative(root, file));
      assert.match(match[1], /@click="[^"]+"/, path.relative(root, file));
    }
  }
  assert.ok(count >= 11);
});

test('Dashboard how_to_reg is a status icon, not an Edit action, and remains unchanged', () => {
  const source = fs.readFileSync(path.join(root, 'views/dashboard/DashboardView.vue'), 'utf8');
  assert.match(source, /<MsIcon name="how_to_reg" :size="20"/);
});
