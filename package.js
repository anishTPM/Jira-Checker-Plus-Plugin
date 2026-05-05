import fs from 'fs';
import path from 'path';
import archiver from 'archiver';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BUILD_DIR = path.join(__dirname, 'build');
const RELEASE_DIR = path.join(__dirname, 'releases');
const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, 'manifest.json'), 'utf8'));
const version = manifest.version;

if (!fs.existsSync(RELEASE_DIR)) fs.mkdirSync(RELEASE_DIR);

const outputPath = path.join(RELEASE_DIR, `jira-checker-plus-${version}.zip`);
const output = fs.createWriteStream(outputPath);
const archive = archiver('zip', { zlib: { level: 9 } });

console.log(`\nCreating release package v${version}...\n`);

output.on('close', () => {
  const sizeInMB = (archive.pointer() / 1024 / 1024).toFixed(2);
  console.log(`✅ Release package created!`);
  console.log(`📦 File: ${outputPath}`);
  console.log(`📊 Size: ${sizeInMB} MB`);
});

archive.on('error', (err) => { throw err; });
archive.pipe(output);
archive.directory(BUILD_DIR, false);
archive.finalize();
