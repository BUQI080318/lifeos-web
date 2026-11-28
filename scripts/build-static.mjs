import fs from 'node:fs';
import path from 'node:path';

const REPO = path.resolve(import.meta.dirname, '..');
const SRC = path.join(REPO, 'site');
const OUT = path.join(REPO, 'dist');
const TEXT_EXTS = new Set(['.html', '.js', '.mjs', '.css', '.json']);
const DEFAULT_PUB_KEY = 'sb_publishable_pgW3uFgIZE7YFmq_wGmpkA_NmwOJ21e';

function loadEnvKey(name) {
  if (process.env[name]) return String(process.env[name]).trim();
  const envFile = path.join(REPO, '.env');
  if (!fs.existsSync(envFile)) return '';
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq > 0 && trimmed.slice(0, eq).trim() === name) {
      return trimmed.slice(eq + 1).trim().replace(/^['"]|['"]$/g, '');
    }
  }
  return '';
}

const pubKey = loadEnvKey('SUPABASE_PUBLISHABLE_KEY') || DEFAULT_PUB_KEY;
if (!/^sb_publishable_[A-Za-z0-9_-]{20,200}$/.test(pubKey)) {
  throw Error('Invalid SUPABASE_PUBLISHABLE_KEY format.');
}

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

let filesCopied = 0;
function copyTree(srcDir, dstDir) {
  fs.mkdirSync(dstDir, { recursive: true });
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const s = path.join(srcDir, entry.name);
    const d = path.join(dstDir, entry.name);
    if (entry.isDirectory()) {
      copyTree(s, d);
      continue;
    }
    const ext = path.extname(entry.name).toLowerCase();
    if (TEXT_EXTS.has(ext)) {
      let content = fs.readFileSync(s, 'utf8');
      // 剥离 /lifeos-web/ 仓库子路径前缀，适配 Cloudflare Pages 等独立域名根目录访问
      content = content.replace(/\/lifeos-web\//g, '/').replace(/\/lifeos-web(?=['"`])/g, '');
      if (s === path.join(SRC, 'config.js')) {
        content = content.replace('__LIFEOS_BROWSER_KEY__', pubKey);
      }
      fs.writeFileSync(d, content, 'utf8');
    } else {
      fs.copyFileSync(s, d);
    }
    filesCopied++;
  }
}

copyTree(SRC, OUT);
console.log(`Built static Cloudflare Pages bundle in dist/ (${filesCopied} files, root='/')`);
