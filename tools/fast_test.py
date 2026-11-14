"""Functional test of Fast mode. Usage: python3 tools/fast_test.py <url>  (exit 1 on failure)"""
import asyncio, sys, os, io, json
from playwright.async_api import async_playwright
from PIL import Image
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from launch import launch
BAD = """() => { const s = __fast.snapshot(), bad = []; for (const [id, m] of Object.entries(s.mats)) {
  if (m.clearcoat > 0 || m.sheen > 0 || m.transmission > 0 || m.envMapIntensity > 0 || m.metalness > 0 || m.normalMap || m.roughnessMap) bad.push(m); }
  const lights = s.lights.filter(l => l[1] && l[2] > 0).map(l => l[3] + (l[4] ? ':shadow' : '')); return { bad: bad.length, n: Object.keys(s.mats).length, lights }; }"""
async def main():
    fails = []
    def check(name, ok, extra=''):
        print(('ok   ' if ok else 'FAIL ') + name + (' — ' + str(extra) if extra != '' else ''), flush=True)
        if not ok: fails.append(name)
    async with async_playwright() as p:
        b = await launch(p); errs = []
        async def page(**kw):
            ctx = await b.new_context(**kw); pg = await ctx.new_page()
            pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' and '404' not in m.text else None); pg.on('pageerror', lambda e: errs.append('PAGE: ' + str(e)))
            await pg.goto(sys.argv[1]); await pg.wait_for_selector('#loader[hidden]', state='attached', timeout=240000); await pg.wait_for_function('window.__assetsReady !== false', timeout=240000)
            return ctx, pg
        async def settle(pg, n=4):
            f0 = await pg.evaluate('window.__frames||0'); await pg.wait_for_function(f'(window.__frames||0)>{f0}+{n} && window.__settled', timeout=600000, polling=300)
        ctx, pg = await page(viewport={'width': 1200, 'height': 720}); ev = pg.evaluate
        multiset = lambda s: sorted(json.dumps({k: v for k, v in m.items()}, sort_keys=True) for m in s['mats'].values())
        check('off by default', not await ev('__fast.on') and await pg.get_attribute('#fast', 'aria-pressed') == 'false')
        await settle(pg); s0 = await ev('__fast.snapshot()'); set0 = await ev('__fast.settings()')
        check('default: shadows, env, AO, bloom on', set0['shadows'] and set0['env'] and set0['ao'] and set0['bloom'], set0)
        await pg.click('#fast'); await settle(pg)
        check('button on', await pg.get_attribute('#fast', 'aria-pressed') == 'true' and await ev('__fast.on'))
        st = await ev('__fast.settings()'); check('shadows, environment, AO, bloom off, pixel ratio unchanged', not st['shadows'] and not st['env'] and not st['ao'] and not st['bloom'] and st['pr'] == await ev('Math.min(devicePixelRatio, 1.75)'), st)
        r = await ev(BAD); check('no clearcoat, sheen, transmission, env, metal or maps on any material', r['bad'] == 0 and r['n'] > 50, r)
        check('only the flat lights are on', sorted(r['lights']) == ['DirectionalLight', 'HemisphereLight'], r['lights'])
        await pg.click('#mnight'); await settle(pg); r = await ev(BAD)
        check('night: still no lamps, no env', sorted(r['lights']) == ['HemisphereLight'] and not (await ev('__fast.settings()'))['env'] and r['bad'] == 0, r['lights'])
        await pg.select_option('#view', 'living'); await settle(pg, 8)
        img = np.asarray(Image.open(io.BytesIO(await pg.screenshot())).convert('L'), dtype=float)[100:, :]
        check('night + Fast is not black or blown out', 25 < img.mean() < 200, round(img.mean(), 1))
        await pg.click('#mday'); await settle(pg)
        # rebuild by an edit, then a model swap-in
        await ev("__editor.edit(() => { __editor.plan.items.find(i => i.id === 'dining').pos[1] -= 0.2; }, { item: 'dining' })"); await settle(pg)
        r = await ev(BAD); check('after a rebuild (edit) still flat', r['bad'] == 0 and sorted(r['lights']) == ['DirectionalLight', 'HemisphereLight'], r)
        await ev("__editor.edit(() => { __editor.plan.items.find(i => i.id === 'bowl-coffee').pos[0] += 0.1; }, { item: 'bowl-coffee' })")
        await pg.wait_for_function('window.__assetsReady !== false', timeout=60000); await settle(pg, 8)
        r = await ev(BAD); check('after a model swap-in still flat', r['bad'] == 0, r)
        await ev('__editor.undo()'); await ev('__editor.undo()'); await settle(pg, 8)
        await ev("document.getElementById('wcut').click()"); await settle(pg); await ev("document.getElementById('wfull').click()")
        await pg.click('#fast'); await settle(pg)
        await settle(pg); check('off again: shadows, env, AO, bloom back', (lambda t: all(t[k] for k in ['shadows', 'env', 'ao', 'bloom']))(await ev('__fast.settings()')))
        s1 = await ev('__fast.snapshot()')
        check('after edit + undo + off: every material value equals the original (same set)', multiset(s0) == multiset(s1), [x for x in multiset(s0) if x not in multiset(s1)][:2] + [x for x in multiset(s1) if x not in multiset(s0)][:2])
        check('lights: all visible lights match the original', sorted([l[3] for l in s0['lights'] if l[1]]) == sorted([l[3] for l in s1['lights'] if l[1]]), [l[3] for l in s1['lights'] if l[1]])
        await ctx.close()
        # plain toggle on a fresh page: exact snapshot equality, also at night
        ctx, pg = await page(viewport={'width': 1200, 'height': 720}); ev = pg.evaluate
        for night in (False, True):
            await pg.click('#mnight' if night else '#mday'); await settle(pg); a = await ev('__fast.snapshot()')
            await pg.click('#fast'); await settle(pg); await pg.click('#fast'); await settle(pg); c = await ev('__fast.snapshot()')
            check(f'toggle on and off restores every material and light exactly ({"night" if night else "day"})', a['mats'] == c['mats'] and a['lights'] == c['lights'])
        # persistence (fresh page: texture ids differ between loads)
        ctx, pg = await page(viewport={'width': 1200, 'height': 720}); ev = pg.evaluate; await pg.click('#fast'); await settle(pg)
        await pg.reload(); await pg.wait_for_selector('#loader[hidden]', state='attached', timeout=240000); await pg.wait_for_function('window.__assetsReady !== false', timeout=240000); await settle(pg)
        check('Fast persists over reload', await ev('__fast.on') and await pg.get_attribute('#fast', 'aria-pressed') == 'true')
        r = await ev(BAD); check('after reload: all materials flat, flat lights only', r['bad'] == 0 and sorted(r['lights']) == ['DirectionalLight', 'HemisphereLight'], r)
        await pg.click('#fast'); await ctx.close()
        # a finish changed while Fast is on stays flat and restores to the NEW finish
        ctx, pg = await page(viewport={'width': 1200, 'height': 720}); ev = pg.evaluate; await pg.click('#fast'); await settle(pg)
        await ev("__editor.select({kind:'item', id:'wardrobe-b2'})")
        pick = "(n) => { const b = [...document.querySelectorAll('#selparts .chips button')].find(x => x.textContent === n); if (b) b.click(); return !!b; }"
        for fin in ('Chrome', 'Gloss'):
            if not await ev(pick, fin): continue
            await settle(pg); r = await ev(BAD); check(f'finish {fin} picked in Fast stays flat', r['bad'] == 0, r)
            await ev("(c) => { const i = document.querySelector('#selparts input[type=color]'); i.value = c; i.dispatchEvent(new Event('input')); }", '#336699'); await settle(pg)
            r = await ev(BAD); check('colour picker input in Fast stays flat', r['bad'] == 0, r); break
        else: check('a part with a Chrome or Gloss finish exists', False)
        await pg.click('#fast'); await settle(pg); s = await ev('__fast.snapshot()')
        check('Fast off: the new finish is restored (metal chrome or clearcoat gloss, not the old one)', any(m['roughness'] == .07 and m['metalness'] == 1 for m in s['mats'].values()) or any(m['clearcoat'] == 1 and m['color'] == 0x336699 for m in s['mats'].values()))
        # Cut and walk work in Fast
        await pg.click('#fast'); await settle(pg); await pg.click('#wcut'); await settle(pg); r = await ev(BAD)
        check('Cut in Fast', await pg.get_attribute('#wcut', 'aria-pressed') == 'true' and r['bad'] == 0, r); await pg.click('#wfull')
        await pg.click('#walk'); await ev('__walk.step(1/60)'); await settle(pg); r = await ev(BAD); check('walk in Fast', await ev('__walk.on') and r['bad'] == 0 and await ev('__fast.on'), r)
        await pg.keyboard.press('Escape'); await pg.click('#fast'); await ctx.close()
        # Fast switched off while the scanned maps still load keeps them
        maps0 = sum(1 for m in s0['mats'].values() if m.get('normalMap'))
        ctx = await b.new_context(viewport={'width': 1200, 'height': 720}); await ctx.add_init_script("try { localStorage.setItem('palace1-fast-v1', '1'); } catch (e) {}")
        async def slow(route): await asyncio.sleep(4); await route.continue_()
        await ctx.route('**/textures/*.webp', slow); pg = await ctx.new_page(); ev = pg.evaluate
        pg.on('pageerror', lambda e: errs.append('PAGE: ' + str(e)))
        await pg.goto(sys.argv[1]); await pg.wait_for_selector('#loader[hidden]', state='attached', timeout=240000)
        check('loaded with Fast on and scans pending', await ev('__fast.on') and await ev('window.__assetsReady') is False)
        await pg.click('#fast'); await pg.wait_for_function('window.__assetsReady !== false', timeout=240000); await settle(pg)
        s2 = await ev('__fast.snapshot()'); maps2 = sum(1 for m in s2['mats'].values() if m.get('normalMap'))
        check('Fast off during the scan load keeps the scanned maps', maps2 == maps0 and not (await ev('__fast.on')), (maps0, maps2)); await ctx.close()
        # Photo and Fast exclude each other
        ctx, pg = await page(viewport={'width': 1200, 'height': 720}); ev = pg.evaluate; await pg.click('#fast'); await settle(pg); await pg.click('#photo')
        await pg.wait_for_function("document.getElementById('status').textContent.includes('samples') || document.getElementById('status').textContent.includes('unavailable')", timeout=240000)
        check('Photo on enables Save still and the path tracer renders samples', not await ev("document.getElementById('still').disabled") and 'samples' in await ev("document.getElementById('status').textContent"))
        check('Photo on turns Fast off', not await ev('__fast.on') and await pg.get_attribute('#fast', 'aria-pressed') == 'false')
        await pg.click('#fast'); await settle(pg)
        check('Fast on turns Photo off', await ev('__fast.on') and await pg.get_attribute('#photo', 'aria-pressed') == 'false')
        r = await ev(BAD); check('Fast after Photo: materials flat', r['bad'] == 0, r)
        await pg.click('#fast'); await ctx.close()
        check('no console errors', not errs, errs[:3])
        await b.close()
    print(f'{len(fails)} failed' if fails else 'all passed'); sys.exit(1 if fails else 0)
asyncio.run(main())
