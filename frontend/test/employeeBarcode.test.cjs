const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { BitArray, Code128Reader } = require('@zxing/library');
const source = fs.readFileSync(path.join(__dirname, '../src/utils/employeeBarcode.ts'), 'utf8');
const context = { window: {} };
const moduleValue = { exports: {} };
vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText,
  { module: moduleValue, exports: moduleValue.exports, require, ...context });
const barcode = moduleValue.exports;

// Minimal SVG DOM only; encoding is performed by the actual JsBarcode library.
function svgDocument() {
  class Node {
    constructor(name) { this.nodeName = name; this.attributes = {}; this.children = []; }
    setAttribute(key, value) { this.attributes[key] = String(value); }
    getAttribute(key) { return this.attributes[key] ?? null; }
    hasAttribute(key) { return key in this.attributes; }
    appendChild(child) { this.children.push(child); }
    removeChild(child) { this.children.splice(this.children.indexOf(child), 1); }
    get firstChild() { return this.children[0]; }
    get outerHTML() { return `<${this.nodeName} ${Object.entries(this.attributes).map(([key, value]) => `${key}="${value.replaceAll('&', '&amp;').replaceAll('"', '&quot;')}"`).join(' ')}>${this.children.map(child => child.outerHTML).join('')}</${this.nodeName}>`; }
  }
  let svg;
  const doc = { createElementNS(_ns, name) { const node = new Node(name); if (name === 'svg') svg = node; return node; } };
  return { doc, get svg() { return svg; } };
}

test('Actual Code128A SVG bars decode with independent ZXing to the exact NIK', () => {
  for (const nik of ['001251415', '0409261699', '000000001', 'AB00123']) {
    const dom = svgDocument();
    const result = barcode.createEmployeeBarcode(nik, 'KARYAWAN', dom.doc);
    const row = new BitArray(parseInt(dom.svg.getAttribute('width')));
    for (const group of dom.svg.children.filter(node => node.nodeName === 'g')) {
      const offset = Number(group.getAttribute('transform').match(/translate\(([^,]+)/)[1]);
      for (const rect of group.children.filter(node => node.nodeName === 'rect')) {
        const start = offset + Number(rect.getAttribute('x'));
        for (let x = start; x < start + Number(rect.getAttribute('width')); x++) row.set(x);
      }
    }
    assert.equal(new Code128Reader().decodeRow(0, row, null).getText(), nik);
    assert.equal(result.nik, nik);
    assert.equal(dom.svg.getAttribute('height'), '90px');
    assert.doesNotMatch(result.svg, /<text\b/);
  }
});

test('Invalid NIK is rejected; print HTML escapes names and uses Delphi paper/layout', () => {
  for (const nik of ['', null, undefined, 123, '   ', 'nik-lowercase', '人']) {
    assert.throws(() => barcode.createEmployeeBarcode(nik, '', svgDocument().doc), /NIK/);
  }
  const result = barcode.createEmployeeBarcode('001251415', 'NAMA <script>alert(1)</script> & "TEST"', svgDocument().doc);
  const html = barcode.employeeBarcodePrintHtml(result);
  assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;TEST&quot;'));
  assert.doesNotMatch(html, /<script|https?:\/\/[^w]/);
  assert.ok(html.includes('@page { size: A4 portrait; margin: 1mm; }'));
  assert.ok(html.includes('width: 32.54375mm; height: 12.17918mm'));
  assert.ok(html.includes('white-space: nowrap; overflow: hidden'));
  assert.equal((html.match(/class="employee-name"/g) || []).length, 1);
  assert.ok(barcode.barcodeImageUrl(result).startsWith('data:image/svg+xml;'));
});

test('Printing reports blocked popups and waits for image/font readiness before each print', async () => {
  const result = barcode.createEmployeeBarcode('001251415', 'PUJI YANTO', svgDocument().doc);
  context.window.open = () => null;
  await assert.rejects(barcode.printEmployeeBarcode(result), /Popup diblokir/);
  let printCount = 0;
  for (let i = 0; i < 2; i++) {
    const events = [];
    let ready;
    const decoded = new Promise(resolve => { ready = resolve; });
    const popup = { closed: false, document: { open() {}, write(html) { assert.ok(html.includes('PUJI YANTO')); }, close() {},
      images: [{ decode: () => decoded }], fonts: { ready: Promise.resolve() } },
      addEventListener(name, handler) { assert.equal(name, 'afterprint'); this.afterprint = handler; },
      focus() { events.push('focus'); }, print() { printCount++; events.push('print'); }, close() { this.closed = true; } };
    context.window.open = () => popup;
    const pending = barcode.printEmployeeBarcode(result);
    assert.equal(events.length, 0);
    ready(); await pending;
    assert.deepEqual(events, ['focus', 'print']);
    popup.afterprint(); assert.equal(popup.closed, true);
  }
  assert.equal(printCount, 2);
});
