"""Headless screenshots. Usage: python3 tools/shot.py <url-or-file> view1,view2[:night] [outdir=shots]  -> <outdir>/<view>.png
Set CHROME_PATH to use a specific Chromium binary (defaults to /opt/pw-browsers/chromium if present).
Needs: pip install playwright; a Chromium Playwright can launch. Software GL is slow (~40 s per view)."""
import asyncio, sys, os
from playwright.async_api import async_playwright
async def main():
    target, views = sys.argv[1], sys.argv[2].split(',')
    if not target.startswith('http'): target = 'file://' + os.path.abspath(target)
    out = sys.argv[3] if len(sys.argv) > 3 else 'shots'; os.makedirs(out, exist_ok=True)
    exe = os.environ.get('CHROME_PATH') or ('/opt/pw-browsers/chromium' if os.path.exists('/opt/pw-browsers/chromium') else None)
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=exe, args=["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"])
        pg = await b.new_page(viewport={'width': 1200, 'height': 720}); errs = []
        pg.on('console', lambda m: errs.append(m.type + ': ' + m.text) if m.type == 'error' else None); pg.on('pageerror', lambda e: errs.append('PAGE: ' + str(e)))
        await pg.goto(target); await pg.wait_for_selector('#loader[hidden]', state='attached', timeout=240000)
        for v in views:
            mode = None
            if ':' in v: v, mode = v.split(':')
            if mode == 'night': await pg.click('#mnight')
            await pg.select_option('#view', v); f0 = await pg.evaluate('window.__frames||0')
            await pg.wait_for_function(f'(window.__frames||0)>{f0}+3', timeout=600000, polling=1000)
            await pg.screenshot(timeout=300000, path=f'{out}/{v}{"_" + mode if mode else ""}.png')
        print('\n'.join(errs[:15])); await b.close()
asyncio.run(main())
