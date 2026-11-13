"""Functional test of walk mode. Usage: python3 tools/walk_test.py <url> [screenshot-dir]  (exit 1 on failure)"""
import asyncio, sys, os
from playwright.async_api import async_playwright
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from launch import launch
GO = """async ([x, y]) => { for (let i = 0; i < 600; i++) { const [px, py] = __walk.pos; if (Math.hypot(x - px, y - py) < .08) break;
  __walk.look(Math.atan2(-(x - px), -(y - py))); __walk.key('KeyW'); __walk.step(1 / 30); } __walk.key('KeyW', false); return __walk.pos; }"""
async def main():
    fails = []
    def check(name, ok, extra=''):
        print(('ok   ' if ok else 'FAIL ') + name + (' — ' + str(extra) if extra != '' else ''), flush=True)
        if not ok: fails.append(name)
    shots = sys.argv[2] if len(sys.argv) > 2 else None
    if shots: os.makedirs(shots, exist_ok=True)
    async with async_playwright() as p:
        b = await launch(p); errs = []
        async def page(**kw):
            ctx = await b.new_context(**kw); pg = await ctx.new_page()
            pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' and '404' not in m.text else None); pg.on('pageerror', lambda e: errs.append('PAGE: ' + str(e)))
            await pg.goto(sys.argv[1]); await pg.wait_for_selector('#loader[hidden]', state='attached', timeout=240000); await pg.wait_for_function('window.__assetsReady !== false', timeout=240000)
            return ctx, pg
        async def settle(pg):
            f0 = await pg.evaluate('window.__frames||0'); await pg.wait_for_function(f'(window.__frames||0)>{f0}+3 && window.__settled', timeout=600000, polling=500)
        async def shot(pg, name):
            if shots: await settle(pg); await pg.screenshot(timeout=300000, path=f'{shots}/{name}.png')
        ctx, pg = await page(viewport={'width': 1200, 'height': 720}); ev = pg.evaluate
        async def go(x, y): return await ev(GO, [x, y])
        await pg.select_option('#view', 'bed1'); await settle(pg); orbit = await ev('__walk.cam')
        check('off by default', not await ev('__walk.on'))
        await pg.click('#walk'); check('walk on', await ev('__walk.on') and await pg.get_attribute('#walk', 'aria-pressed') == 'true')
        await ev('__walk.step(1/60)'); check('eye height 1.60', abs((await ev('__walk.cam'))[1] - 1.6) < 1e-6)
        check('start is free floor', await ev('__walk.free(...__walk.pos)'), await ev('__walk.pos'))
        # walls and windows stop the body at its radius
        await ev('__walk.setPos(1.2, 2.2)'); x, y = await go(-1.0, 2.2); check('window stops at radius', abs(x - 0.25) < .03, (x, y))
        await ev('__walk.setPos(7.5, 6.2)'); x, y = await go(7.5, 8.0); check('wall stops at radius', abs(y - (7.13 - .25)) < .03, (x, y))
        # hall -> corridor -> bedroom 1 through the doors
        await ev('__walk.setPos(5.7, 6.4)')
        for w in [(5.4, 4.9), (5.4, 3.45), (4.9, 3.45), (3.9, 3.45), (2.0, 3.45)]: x, y = await go(*w)
        check('hall to bedroom 1 through the corridor and its door', abs(x - 2.0) < .1 and abs(y - 3.45) < .2, (x, y)); await ev('__walk.look(Math.PI / 2, 0)'); await shot(pg, 'walk_bed1')
        # east balcony: through the balcony door, then stop at its edge
        await ev('__walk.setPos(12.5, 2.085)')
        for w in [(13.3, 2.085), (14.4, 2.085)]: x, y = await go(*w)
        check('studio to east balcony through the door', abs(x - 14.4) < .1 and abs(y - 2.085) < .1, (x, y))
        await ev('__walk.setPos(14.3, 5.1)'); x, y = await go(20, 5.1); check('balcony edge stops at radius', 15.5 < x < 15.7, (x, y)); await ev('__walk.look(-Math.PI / 2, 0)'); await shot(pg, 'walk_balcony')
        # furniture blocks; a plan edit rebuilds the collision data
        await ev('__walk.setPos(9.9, 2.5)'); x, y = await go(9.9, 4.1); check('dining table blocks', y < 3.8, (x, y)); await ev('__walk.look(Math.PI, 0)'); await shot(pg, 'walk_studio')
        await ev("__editor.edit(() => { __editor.plan.items.find(i => i.id === 'dining').pos[1] -= 2.0; }, { item: 'dining' })")
        await ev('__walk.setPos(9.9, 2.5)'); x, y = await go(9.9, 4.1); check('plan edit updates collisions', y > 4.0, (x, y))
        await ev('__editor.undo()')
        # view change teleports
        await pg.select_option('#view', 'office'); await ev('__walk.step(1/60)'); x, y = await ev('__walk.pos')
        check('view change teleports to the view position', abs(x - 9.3) < .5 and abs(y - 4.75) < .5 and await ev('__walk.on'), (x, y))
        await pg.select_option('#view', 'top'); await ev('__walk.step(1/60)'); check('top view stays on free floor', await ev('__walk.free(...__walk.pos)'), await ev('__walk.pos'))
        # Esc restores the orbit camera
        await pg.keyboard.press('Escape'); check('Esc leaves', not await ev('__walk.on')); await pg.wait_for_timeout(1500); await settle(pg); cam = await ev('__walk.cam')
        check('orbit camera restored', max(abs(a - c) for a, c in zip(cam, orbit)) < .05, (cam, orbit))
        # other modes switch walk off
        for sel, name in [('#move', 'Edit plan'), ('#wcut', 'Cut'), ('#photo', 'Photo')]:
            await pg.click('#walk'); await ev('__walk.step(1/60)'); await pg.click(sel); check(name + ' switches walk off', not await ev('__walk.on'))
            if sel == '#move': await pg.click('#move')
            if sel == '#wcut': await pg.click('#wfull')
            if sel == '#photo': await pg.wait_for_function("document.getElementById('status').textContent.includes('samples') || document.getElementById('status').textContent.includes('unavailable')", timeout=180000); await pg.click('#photo')
        await pg.click('#walk'); await ev('__walk.step(1/60)'); check('Cut stays off in walk', await pg.get_attribute('#wcut', 'aria-pressed') == 'false'); await pg.click('#walk')
        await ctx.close()
        # phone: stick and touch look
        ctx, pg = await page(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True); ev = pg.evaluate
        await pg.select_option('#view', 'hall'); await settle(pg)
        check('stick hidden outside walk', not await pg.is_visible('#joy')); await pg.tap('#walk'); await ev('__walk.step(1/60)')
        check('stick shown in walk', await pg.is_visible('#joy')); bb = await pg.eval_on_selector('#joy', 'e => { const r = e.getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; }')
        check('Dimensions and Plan notes hidden', not await pg.is_visible('#spec') and not await pg.is_visible('#layouts'))
        cdp = await ctx.new_cdp_session(pg); cx, cy = bb[0] + bb[2] / 2, bb[1] + bb[3] / 2
        await ev('__walk.setPos(7.0, 6.0)'); await ev('__walk.look(0, 0)'); p0 = await ev('__walk.pos')
        await cdp.send('Input.dispatchTouchEvent', {'type': 'touchStart', 'touchPoints': [{'x': cx, 'y': cy}]})
        await cdp.send('Input.dispatchTouchEvent', {'type': 'touchMove', 'touchPoints': [{'x': cx, 'y': cy - 40}]}); await pg.wait_for_timeout(800)
        j = await ev('__walk.joy'); p1 = await ev('__walk.pos'); check('stick forward moves north', j[1] < -.9 and p1[1] < p0[1] - .2, (j, p0, p1))
        await cdp.send('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': []}); await pg.wait_for_timeout(200); check('stick released stops', (await ev('__walk.joy')) == [0, 0])
        y0 = await ev('__walk.yaw'); await cdp.send('Input.dispatchTouchEvent', {'type': 'touchStart', 'touchPoints': [{'x': 250, 'y': 300}]})
        await cdp.send('Input.dispatchTouchEvent', {'type': 'touchMove', 'touchPoints': [{'x': 150, 'y': 300}]}); await cdp.send('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': []})
        check('drag turns the view', abs(await ev('__walk.yaw') - y0) > .1, (y0, await ev('__walk.yaw')))
        await ev('__walk.setPos(7.0, 5.9)'); await ev('__walk.look(0.3, 0)'); await shot(pg, 'walk_phone')
        await ctx.close()
        check('no page errors', not errs, errs[:5]); await b.close()
    sys.exit(1 if fails else 0)
asyncio.run(main())
