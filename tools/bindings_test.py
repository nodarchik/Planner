"""Test of input bindings (meta.bindings). Usage: python3 tools/bindings_test.py <url>  (exit 1 on failure)"""
import asyncio, sys, os, json, math
from playwright.async_api import async_playwright
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from launch import launch
SET = "(b) => __editor.edit(() => { __editor.plan.meta.bindings = b; })"
TRY = "(b) => __editor.tryEdit(() => { __editor.plan.meta.bindings = b; })"
WHEEL = "([dx, dy, mods]) => document.querySelector('#stage canvas').dispatchEvent(new WheelEvent('wheel', { deltaX: dx, deltaY: dy, bubbles: true, cancelable: true, ...mods }))"
async def main():
    fails = []
    def check(name, ok, extra=''):
        print(('ok   ' if ok else 'FAIL ') + name + (' — ' + str(extra) if extra != '' else ''), flush=True)
        if not ok: fails.append(name)
    async with async_playwright() as p:
        b = await launch(p); errs = []
        async def page(url, **kw):
            ctx = await b.new_context(**kw); pg = await ctx.new_page()
            pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' and '404' not in m.text else None); pg.on('pageerror', lambda e: errs.append('PAGE: ' + str(e)))
            await pg.goto(url); await pg.wait_for_selector('#loader[hidden]', state='attached', timeout=240000); await pg.wait_for_function('window.__assetsReady !== false', timeout=240000)
            await pg.wait_for_function('window.__settled', timeout=240000, polling=500)
            return ctx, pg
        ctx, pg = await page(sys.argv[1], viewport={'width': 1200, 'height': 720}, has_touch=True); ev = pg.evaluate
        cdp = await ctx.new_cdp_session(pg)
        async def settle(): f0 = await ev('window.__frames||0'); await pg.wait_for_function(f'(window.__frames||0)>{f0}+30', timeout=60000, polling=100)
        async def view(name): await ev(f"document.getElementById('view').value = '{name}'; document.getElementById('view').dispatchEvent(new Event('change'))"); await pg.wait_for_timeout(1300); await settle()
        async def st(): return await ev('({ c: __bindings.cam, t: __bindings.target })')
        dist = lambda s: sum((a - c) ** 2 for a, c in zip(s['c'], s['t'])) ** .5
        move = lambda a, c: sum((x - y) ** 2 for x, y in zip(a, c)) ** .5
        off = lambda s: [a - c for a, c in zip(s['c'], s['t'])]
        async def touches(pts0, pts1):
            await cdp.send('Input.dispatchTouchEvent', {'type': 'touchStart', 'touchPoints': [{'x': x, 'y': y, 'id': i} for i, (x, y) in enumerate(pts0)]})
            for k in range(1, 6): await cdp.send('Input.dispatchTouchEvent', {'type': 'touchMove', 'touchPoints': [{'x': x + (x1 - x) * k / 5, 'y': y + (y1 - y) * k / 5, 'id': i} for i, ((x, y), (x1, y1)) in enumerate(zip(pts0, pts1))]})
            await cdp.send('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': []}); await settle()
        THREE = ([(500, 300), (560, 300), (620, 300)], [(380, 300), (440, 300), (500, 300)])
        await view('bed1')
        check('default table: touch3-drag pan', await ev('__bindings.table.map(e => [e.input, e.action, e.speed])') == [['touch3-drag', 'pan', 1]], await ev('__bindings.table'))
        check('native mapping unchanged by default', await ev('__bindings.native') == {'mouse': {'LEFT': 0, 'MIDDLE': 1, 'RIGHT': 2}, 'touch': {'ONE': 0, 'TWO': 2}, 'zoom': True}, await ev('__bindings.native'))
        s0 = await st(); await touches(*THREE); s1 = await st()
        check('three-touch drag pans the target', move(s0['t'], s1['t']) > .1, move(s0['t'], s1['t']))
        check('three-touch drag does not rotate or zoom', move(off(s0), off(s1)) < 1e-3, move(off(s0), off(s1)))
        await view('bed1'); s0 = await st(); p0, p1 = THREE
        for k in (1, 2, 3): await cdp.send('Input.dispatchTouchEvent', {'type': 'touchStart', 'touchPoints': [{'x': x, 'y': y, 'id': i} for i, (x, y) in enumerate(p0[:k])]})
        for k in range(1, 6): await cdp.send('Input.dispatchTouchEvent', {'type': 'touchMove', 'touchPoints': [{'x': x + (x1 - x) * k / 5, 'y': y + (y1 - y) * k / 5, 'id': i} for i, ((x, y), (x1, y1)) in enumerate(zip(p0, p1))]})
        await cdp.send('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': []}); await settle(); s1 = await st()
        check('fingers landing one after another (1, 2, 3) pan too', move(s0['t'], s1['t']) > .1 and move(off(s0), off(s1)) < 1e-3, (move(s0['t'], s1['t']), move(off(s0), off(s1))))
        n0 = await ev('__bindings.listeners')
        for i in range(10): await ev("__editor.edit(() => {})")
        check('10 rebuilds leave exactly one set of listeners', n0 > 0 and await ev('__bindings.listeners') == n0, (n0, await ev('__bindings.listeners')))
        await view('bed1'); s0 = await st(); await ev(WHEEL, [0, -300, {}]); await settle(); s1 = await st()
        check('default wheel zooms and does not pan', dist(s1) < dist(s0) - .05 and move(s0['t'], s1['t']) < 1e-6, (dist(s0), dist(s1)))
        await ev(SET, [{'input': 'wheel', 'action': 'pan'}, {'input': 'ctrl+wheel', 'action': 'zoom'}])
        check('table follows the edit', [e['input'] for e in await ev('__bindings.table')] == ['wheel', 'ctrl+wheel'])
        await view('bed1'); s0 = await st(); await ev(WHEEL, [0, 200, {}]); await settle(); s1 = await st()
        check('wheel pans and does not zoom', move(s0['t'], s1['t']) > .1 and abs(dist(s1) - dist(s0)) < 1e-3, (move(s0['t'], s1['t']), dist(s0), dist(s1)))
        check('wheel pan keeps the view direction', move(off(s0), off(s1)) < 1e-3)
        s0 = await st(); await ev(WHEEL, [0, -300, {'ctrlKey': True}]); await settle(); s1 = await st()
        check('ctrl+wheel zooms (pinch)', dist(s1) < dist(s0) - .05 and move(s0['t'], s1['t']) < 1e-6, (dist(s0), dist(s1)))
        s0 = await st(); await ev(WHEEL, [0, -300, {'shiftKey': True}]); await settle(); s1 = await st()
        check('unbound shift+wheel keeps the default (zoom)', dist(s1) < dist(s0) - .05, (dist(s0), dist(s1)))
        await ev(SET, [{'input': 'wheel', 'action': 'orbit'}, {'input': 'alt+wheel', 'action': 'none'}])
        await view('bed1'); s0 = await st(); await ev(WHEEL, [0, 100, {}]); await settle(); s1 = await st()
        o0, o1 = off(s0), off(s1); ang = math.degrees(math.acos(max(-1, min(1, sum(x * y for x, y in zip(o0, o1)) / (dist(s0) * dist(s1))))))
        check('wheel orbit: one notch (100 px) is about 10 degrees', 6 < ang < 14, ang)
        await view('bed1'); s0 = await st(); await ev(WHEEL, [150, 0, {}]); await settle(); s1 = await st()
        check('wheel orbit rotates around the target', move(s0['t'], s1['t']) < 1e-6 and abs(dist(s1) - dist(s0)) < 1e-3 and move(s0['c'], s1['c']) > .1, move(s0['c'], s1['c']))
        s0 = await st(); await ev(WHEEL, [0, -300, {'altKey': True}]); await settle(); s1 = await st()
        check('alt+wheel none blocks the zoom', abs(dist(s1) - dist(s0)) < 1e-3 and move(s0['c'], s1['c']) < 1e-6)
        await ev(SET, [{'input': 'mouse-left', 'action': 'pan'}, {'input': 'touch1-drag', 'action': 'pan'}, {'input': 'touch2-drag', 'action': 'orbit'}, {'input': 'mouse-right', 'action': 'none'}])
        n = await ev('__bindings.native'); check('native OrbitControls mapping', n['mouse'] == {'LEFT': 2, 'MIDDLE': 1, 'RIGHT': -1} and n['touch'] == {'ONE': 1, 'TWO': 3}, n)
        await ev(SET, [{'input': 'pinch', 'action': 'none'}]); check('pinch none turns zoom off', (await ev('__bindings.native'))['zoom'] is False)
        await ev(SET, [{'input': 'shift+mouse-left', 'action': 'pan'}]); await view('bed1'); s0 = await st()
        await pg.keyboard.down('Shift'); await pg.mouse.move(600, 360); await pg.mouse.down(); await pg.mouse.move(500, 360, steps=6); await pg.mouse.up(); await pg.keyboard.up('Shift'); await settle(); s1 = await st()
        check('shift + left drag pans', move(s0['t'], s1['t']) > .1 and move(off(s0), off(s1)) < 1e-3, move(s0['t'], s1['t']))
        # keys
        await ev(SET, [{'input': 'key:KeyN', 'action': 'toggle:night'}, {'input': 'key:shift+KeyV', 'action': 'view:top'}, {'input': 'key:ArrowRight', 'action': 'pan:right'}]); await view('bed1')
        await pg.keyboard.press('n'); check('key toggles night', await pg.get_attribute('#mnight', 'aria-pressed') == 'true')
        await pg.keyboard.press('n'); check('key toggles night back', await pg.get_attribute('#mnight', 'aria-pressed') == 'false')
        await pg.keyboard.press('Shift+V'); check('key switches view', await ev("document.getElementById('view').value") == 'top')
        await view('bed1'); s0 = await st(); await pg.keyboard.press('ArrowRight'); await settle(); s1 = await st(); check('key pans the camera', move(s0['t'], s1['t']) > .05, move(s0['t'], s1['t']))
        await pg.click('#chatBtn'); await pg.focus('#chatinput'); await pg.keyboard.type('n')
        check('key ignored while typing in an input', await pg.get_attribute('#mnight', 'aria-pressed') == 'false' and await ev("document.getElementById('chatinput').value") == 'n')
        await pg.click('#chatBtn'); await ev('document.activeElement.blur()')
        # walk mode: off
        await ev(SET, [{'input': 'key:KeyN', 'action': 'toggle:night'}, {'input': 'wheel', 'action': 'pan'}]); await pg.click('#walk'); await ev('__walk.step(1/60)'); c0 = await ev('__walk.cam')
        await pg.keyboard.press('n'); await ev(WHEEL, [0, 300, {}]); await ev('__walk.step(1/60)'); c1 = await ev('__walk.cam')
        check('bindings inactive in walk mode', await pg.get_attribute('#mnight', 'aria-pressed') == 'false' and move(c0, c1) < 1e-6, (c0, c1))
        await pg.keyboard.press('Escape'); await pg.wait_for_timeout(1500)
        # validation and rollback
        good = await ev('__editor.plan.meta.bindings'); tab = await ev('__bindings.table')
        bad = {'unknown input': [{'input': 'four-finger-drag', 'action': 'pan'}], 'unknown action': [{'input': 'wheel', 'action': 'fly'}], 'zoom on touch': [{'input': 'touch3-drag', 'action': 'zoom'}],
               'duplicate': [{'input': 'wheel', 'action': 'pan'}, {'input': 'wheel', 'action': 'zoom'}], 'unknown view': [{'input': 'key:KeyV', 'action': 'view:nowhere'}], 'bad key action': [{'input': 'key:KeyV', 'action': 'wheel'}],
               'bad speed': [{'input': 'touch3-drag', 'action': 'pan', 'speed': -1}], 'speed on native': [{'input': 'mouse-left', 'action': 'pan', 'speed': 2}], 'extra field': [{'input': 'wheel', 'action': 'pan', 'code': 'x'}], 'not a list': {'input': 'wheel'},
               'same key twice (KeyN and n)': [{'input': 'key:KeyN', 'action': 'toggle:night'}, {'input': 'key:n', 'action': 'toggle:cut'}]}
        for name, v in bad.items():
            msg = await ev(TRY, v); check('rejected and rolled back: ' + name, isinstance(msg, str) and await ev('__editor.plan.meta.bindings') == good and await ev('__bindings.table') == tab, (msg or '')[:130])
        msg = await ev(TRY, [{'input': 'four-finger-drag', 'action': 'pan'}]); check('error lists the valid inputs', 'touch3-drag' in msg and 'key:' in msg, msg[:80])
        await ev(SET, [{'input': 'wheel', 'action': 'zoom'}]); check('edit changes the table', [e['input'] for e in await ev('__bindings.table')] == ['wheel'])
        await ev('__editor.undo()'); check('undo restores the previous table', [e['input'] for e in await ev('__bindings.table')] == ['key:KeyN', 'wheel'] and await ev('__bindings.table[1].action') == 'pan', await ev('__bindings.table'))
        await ctx.close()
        # a bad stored/shared binding must not wipe the plan
        reqs = []
        patch = {'meta': {'bindings': [{'input': 'four-finger-drag', 'action': 'pan'}, {'input': 'wheel', 'action': 'pan'}]}, 'items': {'set': {'wardrobe-b2': {'to': 4.6}}, 'unset': {}, 'add': [], 'remove': []}}
        async def api(route):
            m = route.request.method
            if m == 'GET': await route.fulfill(json={'rev': 3, 'patch': patch, 'base': None})
            else: reqs.append((m, route.request.post_data)); await route.fulfill(json={'rev': 4})
        ctx = await b.new_context(viewport={'width': 1200, 'height': 720}); pg = await ctx.new_page(); ev = pg.evaluate; await pg.route('**/api/plan', api)
        pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' and '404' not in m.text else None); pg.on('pageerror', lambda e: errs.append('PAGE: ' + str(e)))
        warns = []; pg.on('console', lambda m: warns.append(m.text) if m.type == 'warning' else None)
        await pg.goto(sys.argv[1]); await pg.wait_for_selector('#loader[hidden]', state='attached', timeout=240000); await pg.wait_for_timeout(3500)
        check('bad shared binding: rest of the plan loads, no discard note', await ev("__editor.plan.items.find(i => i.id === 'wardrobe-b2').to") == 4.6 and await ev("!document.getElementById('discardnote')"))
        check('bad shared binding: valid entries used, one warning', await ev('__bindings.table.map(e => e.input)') == ['wheel'] and len([w for w in warns if 'meta.bindings' in w]) == 1, warns)
        check('bad shared binding: server copy not wiped', not any(r[0] != 'GET' and json.loads(r[1] or '{}').get('patch') is None for r in reqs), reqs)
        await ev("__editor.edit(() => { __editor.plan.items.find(i => i.id === 'wardrobe-b2').to = 4.5; })")
        check('other edits still work while a stored binding is bad', await ev("__editor.plan.items.find(i => i.id === 'wardrobe-b2').to") == 4.5); await ctx.close()
        # moving quality and Photo (no touch emulation: desktop pointer)
        ctx, pg = await page(sys.argv[1], viewport={'width': 1200, 'height': 720}); ev = pg.evaluate
        raf = 'new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))'; smp = "+((document.getElementById('status').textContent.match(/(\\d+) samples/) || [0, 0])[1])"
        await ev(SET, [{'input': 'wheel', 'action': 'pan'}]); await view('bed1'); await ev(WHEEL, [0, 200, {}]); await ev(raf)
        check('a bound pan counts as moving (quality drop, like an orbit)', await ev('window.__settled') is False)
        await settle(); await pg.click('#photo'); await pg.wait_for_function('(() => ' + smp + ')() >= 6', timeout=240000, polling=200)
        n0 = await ev(smp); await ev(WHEEL, [0, 200, {}]); await ev(raf); n1 = await ev(smp)
        check('Photo: a bound pan restarts the accumulation', n1 < n0, (n0, n1)); await ctx.close()
        # ?safe=1
        ctx, pg = await page(sys.argv[1] + '?safe=1', viewport={'width': 1200, 'height': 720}, has_touch=True); ev = pg.evaluate; cdp = await ctx.new_cdp_session(pg)
        await view('bed1'); check('safe: table empty and flag set', await ev('__bindings.table') == [] and await ev('__bindings.safe'))
        s0 = await st(); await touches(*THREE); s1 = await st()
        check('safe: three-touch drag does nothing', move(s0['t'], s1['t']) < 1e-3, move(s0['t'], s1['t']))
        await ev(SET, [{'input': 'wheel', 'action': 'pan'}]); s0 = await st(); await ev(WHEEL, [0, -300, {}]); await settle(); s1 = await st()
        check('safe: wheel keeps zooming', dist(s1) < dist(s0) - .05 and move(s0['t'], s1['t']) < 1e-6)
        await ctx.close()
        check('no page errors', not errs, errs[:5]); await b.close()
    sys.exit(1 if fails else 0)
asyncio.run(main())
