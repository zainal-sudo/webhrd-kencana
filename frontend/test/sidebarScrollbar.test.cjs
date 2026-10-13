const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../src/components/layout/AppSidebar.vue'), 'utf8');

test('Sidebar scrollbar is locally styled slim, with transparent track and faded navy thumb', () => {
  assert.match(source, /\.sidebar-nav\s*\{[^}]*min-height: 0;[^}]*overflow-y: auto;/);
  assert.match(source, /\.sidebar-nav::-webkit-scrollbar\s*\{[^}]*width: 5px;[^}]*background: transparent;/);
  assert.match(source, /\.sidebar-nav::-webkit-scrollbar-track\s*\{[^}]*background: transparent;[^}]*margin-block: 8px;/);
  assert.match(source, /\.sidebar-nav::-webkit-scrollbar-thumb\s*\{[^}]*background: rgba\(76, 101, 137, 0\.55\);/);
  assert.match(source, /\.sidebar-nav::-webkit-scrollbar-thumb:hover\s*\{[^}]*background: rgba\(76, 101, 137, 0\.8\);/);
  assert.match(source, /scrollbar-width: thin;/);
  assert.match(source, /scrollbar-color: rgba\(76, 101, 137, 0\.55\) var\(--ds-sidebar-bg/);
});
