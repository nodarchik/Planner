// Downloads CC0 models from Poly Haven and packs each into a compressed GLB in public/assets/models/.
// Usage: node tools/fetch_assets.mjs [id ...]   (no ids = everything in assets/models.json)
// Per model: glTF 1k → weld, simplify (if heavy), WebP textures ≤ 1024 px, Draco geometry.
import fs from 'fs'; import path from 'path'; import os from 'os'; import { execFileSync } from 'child_process';
const UA = 'asset-fetch/1.0', OUT = 'public/assets/models', list = JSON.parse(fs.readFileSync('assets/models.json', 'utf8'));
const ids = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(list);
const get = async url => execFileSync('curl', ['-sSfL', '-m', '120', '-A', UA, url], { maxBuffer: 1 << 28 }); // curl honours the proxy settings
for (const id of ids) {
  const cfg = list[id]; if (!cfg) { console.error('not in assets/models.json:', id); continue; }
  const files = JSON.parse(await get(`https://api.polyhaven.com/files/${id}`)), g = files.gltf['1k'].gltf, tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ph-'));
  fs.writeFileSync(path.join(tmp, 'm.gltf'), await get(g.url));
  for (const [rel, f] of Object.entries(g.include)) { const p = path.join(tmp, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, await get(f.url)); }
  const out = path.join(OUT, id + '.glb'), args = ['gltf-transform', 'optimize', path.join(tmp, 'm.gltf'), out, '--texture-compress', 'webp', '--texture-size', String(cfg.tex || 1024), '--compress', 'draco'];
  if (cfg.simplify) args.push('--simplify-ratio', String(cfg.simplify), '--simplify-error', '0.002'); else args.push('--simplify', 'false');
  execFileSync('npx', args, { stdio: 'pipe' }); fs.rmSync(tmp, { recursive: true, force: true });
  console.log(id.padEnd(28), (fs.statSync(out).size / 1024).toFixed(0).padStart(6), 'kB');
}
