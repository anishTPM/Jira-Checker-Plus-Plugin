import { rollup } from 'rollup';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import terser from '@rollup/plugin-terser';
import JavaScriptObfuscator from 'javascript-obfuscator';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const BUILD = path.join(ROOT, 'build');

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
  const bundle = await rollup({ input, plugins: [nodeResolve(), terser()] });
  await bundle.write({ file: path.join(BUILD, output), format: 'iife' });
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
