const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const vue = require("vue");
const { parse, compileScript } = require("@vue/compiler-sfc");
const ts = require("typescript");

// Run the actual SFC setup without a browser; keep Vue's reactive computations.
const setupSfc = (relativePath, props, overrides = {}) => {
  const filename = path.resolve(__dirname, "..", relativePath);
  const { descriptor } = parse(fs.readFileSync(filename, "utf8"));
  const script = compileScript(descriptor, { id: "salary-export-test" });
  const compiled = ts.transpileModule(script.content, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const module = { exports: {} };
  vm.runInNewContext(compiled.outputText, {
    module, exports: module.exports, console, Intl,
    sessionStorage: { getItem: () => null },
    require: (name) => {
      if (name === "vue") return { ...vue, onMounted: () => {}, onActivated: () => {}, watch: () => {} };
      if (Object.hasOwn(overrides, name)) return overrides[name];
      if (name.startsWith("@tabler/") || name.endsWith(".vue")) return {};
      throw new Error(`Unexpected import: ${name}`);
    },
  }, { filename });
  return module.exports.default.setup(props, { expose: () => {}, emit: () => {} });
};

module.exports = { setupSfc };
