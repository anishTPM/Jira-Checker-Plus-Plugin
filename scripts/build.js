import { rollup } from 'rollup';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import terser from '@rollup/plugin-terser';
import JavaScriptObfuscator from 'javascript-obfuscator';
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const BUILD = path.join(ROOT, 'build');

// Load org config (gitignored) or fall back to default
let ORG_CONFIG = { locked: false, confluenceBaseUrl: '', pages: [] };
const orgConfigPath = path.join(ROOT, 'config.org.js');
const defaultConfigPath = path.join(ROOT, 'config.default.js');
try {
  if (fs.existsSync(orgConfigPath)) {
    const mod = await import(pathToFileURL(orgConfigPath).href);
    ORG_CONFIG = mod.ORG_CONFIG;
    console.log('Using org config (config.org.js)');
  } else if (fs.existsSync(defaultConfigPath)) {
    const mod = await import(pathToFileURL(defaultConfigPath).href);
    ORG_CONFIG = mod.ORG_CONFIG;
  }
} catch (e) {
  console.warn('Could not load org config:', e.message);
}

// Clean & create build dir
if (fs.existsSync(BUILD)) fs.rmSync(BUILD, { recursive: true });
fs.mkdirSync(BUILD);

console.log('Building Jira Checker Plus v2.0.0...\n');

// 1. Build content scripts via Rollup (IIFE, self-contained)
const contentEntries = [
  { input: path.join(ROOT, 'src/content/main-router.js'), output: 'content.js' },
  { input: path.join(ROOT, 'src/content/release.js'), output: 'release.js' },
];

for (const { input, output } of contentEntries) {
  console.log(`Bundling ${output}...`);
  const bundle = await rollup({ input, plugins: [nodeResolve()] });
  await bundle.write({ file: path.join(BUILD, output), format: 'es', inlineDynamicImports: true, plugins: [terser()] });
  await bundle.close();
  console.log(`✓ ${output} bundled`);
}

// 2. Obfuscate page scripts (vanilla JS)
const obfuscationOptions = {
  compact: true,
  controlFlowFlattening: false,
  deadCodeInjection: false,
  debugProtection: false,
  disableConsoleOutput: false,
  identifierNamesGenerator: 'hexadecimal',
  log: false,
  simplify: true,
  stringArray: true,
  stringArrayCallsTransform: true,
  stringArrayEncoding: ['base64'],
  stringArrayThreshold: 0.5,
};

const pageScripts = ['options.js', 'analytics.js'];
for (const file of pageScripts) {
  console.log(`Obfuscating ${file}...`);
  const code = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const result = JavaScriptObfuscator.obfuscate(code, obfuscationOptions);
  fs.writeFileSync(path.join(BUILD, file), result.getObfuscatedCode());
  console.log(`✓ ${file} obfuscated`);
}

// 3. Copy static files
const staticFiles = ['manifest.json', 'options.html', 'options.css', 'styles.css', 'analytics.html', 'popup.html', 'README.md'];
for (const file of staticFiles) {
  const src = path.join(ROOT, file);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, path.join(BUILD, file));
    console.log(`✓ ${file} copied`);
  }
}

// 3b. Write org config as a JS file into build
const orgConfigJs = `window.JCP_ORG_CONFIG = ${JSON.stringify(ORG_CONFIG)};`;
fs.writeFileSync(path.join(BUILD, 'org-config.js'), orgConfigJs);
console.log('✓ org-config.js written');

// 4. Copy icons
const iconsDir = path.join(ROOT, 'icons');
const buildIcons = path.join(BUILD, 'icons');
if (fs.existsSync(iconsDir)) {
  fs.mkdirSync(buildIcons);
  fs.readdirSync(iconsDir).forEach(f => fs.copyFileSync(path.join(iconsDir, f), path.join(buildIcons, f)));
  console.log('✓ Icons copied');
}

console.log('\n✅ Build completed successfully!');
console.log(`📦 Build output: ${BUILD}`);
