"""Path-traced stills. Usage: python3 tools/stills.py <url> [outdir=renders] [--samples N] [--views a,b] [--night] [--size WxH] [--timeout S]  -> <outdir>/<view>.png
Uses window.__still (src/pathtracer.js). SHOT_GPU=1 uses the real GPU (see launch.py). Default views = the 12 day views of `npm run shots`."""
import asyncio, sys, os, time, base64, argparse
from playwright.async_api import async_playwright
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from launch import launch
VIEWS = 'top,hall,bed1,bed2,bath,wc,corridor,closet,kitchen,living,office,loggiaE'
async def main():
    ap = argparse.ArgumentParser(); ap.add_argument('url'); ap.add_argument('outdir', nargs='?', default='renders')
    ap.add_argument('--samples', type=int, default=96); ap.add_argument('--views', default=VIEWS); ap.add_argument('--night', action='store_true'); ap.add_argument('--focal', type=float, default=0, help='lens mm (0 = auto)'); ap.add_argument('--fstop', type=float, default=0, help='aperture f-number (0 = no DOF)')
    ap.add_argument('--size', default='2560x1440'); ap.add_argument('--timeout', type=int, default=3600, help='seconds per view')
    a = ap.parse_args(); w, h = map(int, a.size.split('x')); os.makedirs(a.outdir, exist_ok=True)
    async with async_playwright() as p:
        b = await launch(p); pg = await b.new_page(viewport={'width': 1200, 'height': 720}); errs = []
        pg.on('console', lambda m: errs.append(m.type + ': ' + m.text) if m.type == 'error' else None); pg.on('pageerror', lambda e: errs.append('PAGE: ' + str(e)))
        await pg.goto(a.url); await pg.wait_for_selector('#loader[hidden]', state='attached', timeout=240000)
        await pg.wait_for_function('window.__assetsReady !== false', timeout=240000)
        for v in a.views.split(','):
            t0 = time.time(); await pg.evaluate('window.__stillSamples = 0')
            task = asyncio.ensure_future(pg.evaluate('o => window.__still(o)', {'view': v, 'samples': a.samples, 'w': w, 'h': h, 'night': a.night, 'focal': a.focal, 'fstop': a.fstop}))
            while not task.done():
                await asyncio.wait([task], timeout=10)
                if task.done(): break
                n = await pg.evaluate('window.__stillSamples || 0'); print(f'{v}: {n}/{a.samples} samples, {time.time() - t0:.0f}s', flush=True)
                if time.time() - t0 > a.timeout: task.cancel(); print(f'{v}: timeout after {a.timeout}s', flush=True); break
            if task.cancelled(): continue
            url = task.result(); path = f'{a.outdir}/{v}.png' if not (a.focal or a.fstop) else f'{a.outdir}/{v}_{a.focal:g}mm_f{a.fstop:g}.png'; open(path, 'wb').write(base64.b64decode(url.split(',', 1)[1]))
            print(f'{v}: saved {path} in {time.time() - t0:.0f}s', flush=True)
        print('\n'.join(errs[:15])); await b.close()
asyncio.run(main())
