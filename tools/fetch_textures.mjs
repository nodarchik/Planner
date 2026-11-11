// Downloads scanned PBR detail maps (normal + roughness, 1k) from Poly Haven into public/assets/textures/ as WebP.
// Usage: node tools/fetch_textures.mjs   (sets listed in assets/textures.json; the procedural sets stay as colour maps and as fallback)
import fs from 'fs'; import { execFileSync } from 'child_process'; import sharp from 'sharp';
const list = JSON.parse(fs.readFileSync('assets/textures.json', 'utf8')), OUT = 'public/assets/textures';
const get = url => execFileSync('curl', ['-sSfL', '-m', '120', '-A', 'asset-fetch/1.0', url], { maxBuffer: 1 << 28 });
for (const [set, cfg] of Object.entries(list)) {
  const files = JSON.parse(get(`https://api.polyhaven.com/files/${cfg.id}`));
  for (const [key, name] of [['nor_gl', 'nor'], ['Rough', 'rough']]) { const f = files[key] && files[key]['1k'] && (files[key]['1k'].jpg || files[key]['1k'].png); if (!f) { console.error(set, 'has no', key); continue; }
    const out = `${OUT}/${set}_${name}.webp`; await sharp(get(f.url)).resize(1024, 1024).webp({ quality: name === 'nor' ? 88 : 80 }).toFile(out);
    console.log(out.padEnd(48), (fs.statSync(out).size / 1024).toFixed(0).padStart(5), 'kB'); }
}
