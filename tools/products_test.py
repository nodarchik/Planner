"""Builds every comforter.ge product in the page, checks the built box against w x d x h and saves one contact sheet per kind.
Usage: python3 tools/products_test.py <url> [shots-dir]  (default shots/products; exit 1 on failure; SHOT_GPU=1 for speed)"""
import asyncio, sys, os, collections
from playwright.async_api import async_playwright
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from launch import launch
TOL = .02
async def main():
    out = sys.argv[2] if len(sys.argv) > 2 else 'shots/products'; os.makedirs(out, exist_ok=True); fails = []
    def check(name, ok, extra=''):
        print(('ok   ' if ok else 'FAIL ') + name + (' — ' + str(extra) if extra != '' else ''), flush=True)
        if not ok: fails.append(name)
    async with async_playwright() as p:
        b = await launch(p); errs = []
        pg = await (await b.new_context(viewport={'width': 2400, 'height': 520})).new_page()
        pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' and '404' not in m.text else None); pg.on('pageerror', lambda e: errs.append('PAGE: ' + str(e)))
        await pg.goto(sys.argv[1]); await pg.wait_for_selector('#loader[hidden]', state='attached', timeout=240000); await pg.wait_for_function('window.__assetsReady !== false', timeout=240000)
        await pg.add_style_tag(content='body *{visibility:hidden} #stage,#stage *{visibility:visible}')
        prods = await pg.evaluate('__products.list()'); check('catalog loaded', len(prods) > 500, len(prods))
        short = [x['id'] for x in prods if x['kind'] in ('bed', 'kidsBed', 'mattress') and x['d'] < 1.5]; check('beds and mattresses are at least 1.5 m long', not short, short[:5])
        ST = ('bookcase', 'shelf', 'console', 'tvStand', 'cabinet', 'showcase', 'wardrobe', 'chest', 'nightstand', 'shoeStand'); sw = [x['id'] for x in prods if x['kind'] in ST and x['d'] > x['w'] and x['d'] > .8]; check('storage pieces are not turned sideways', not sw, sw[:5])
        fit = (0, None); worst = (0, None); bad = []; thrown = []
        for pr in prods:
            try: r = await pg.evaluate('id => __products.build(id)', pr['id'])
            except Exception as e: thrown.append((pr['id'], str(e)[:120])); continue
            f = max(abs(v - 1) for v in r['fit'])
            if f > fit[0]: fit = (f, pr)
            exp = [pr['w'], pr['d'], pr['h']]; err = max(abs(a - e) for a, e in zip(r['size'], exp))
            if err > worst[0]: worst = (err, pr)
            if err > TOL or abs(r['min'][2]) > TOL: bad.append((pr['id'], pr['kind'], pr['title'], [round(v, 3) for v in r['size']], exp))
        check('no builder throws', not thrown, thrown[:3]); check(f'all {len(prods)} boxes within {TOL * 100:.0f} cm', not bad, bad[:5])
        print(f'worst box error {worst[0] * 100:.2f} cm ({worst[1] and worst[1]["id"]} {worst[1] and worst[1]["kind"]})')
        print(f'largest auto-fit stretch {fit[0] * 100:.1f} % ({fit[1] and fit[1]["id"]} {fit[1] and fit[1]["kind"]})')
        r = await pg.evaluate("__products.build(%d, { extended: true })" % next(p['id'] for p in prods if p['kind'] == 'table')); check('extended build works', r['size'][0] > 0)
        by = collections.defaultdict(list)
        for pr in prods: by[pr['kind']].append(pr)
        for kind, lst in sorted(by.items()):
            pick = lst[::max(1, len(lst) // 12)][:12]
            await pg.evaluate('ids => __products.sheet(ids)', [x['id'] for x in pick])
            f0 = await pg.evaluate('window.__frames||0'); await pg.wait_for_function(f'(window.__frames||0)>{f0}+8 && window.__settled', timeout=120000, polling=300)
            await pg.screenshot(path=f'{out}/{kind}.png', timeout=120000); await pg.evaluate('__products.clear()')
        check('no console errors', not errs, errs[:3]); await b.close()
    print('FAILED: ' + ', '.join(fails) if fails else 'all passed'); sys.exit(1 if fails else 0)
asyncio.run(main())
