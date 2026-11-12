"""Functional test of the in-page editor. Usage: python3 tools/editor_test.py <url> [screenshot-dir]  (exit 1 on failure)"""
import asyncio, sys, os, json
from playwright.async_api import async_playwright
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from launch import launch
async def main():
    fails = []
    def check(name, ok, extra=''):
        print(('ok   ' if ok else 'FAIL ') + name + (' — ' + str(extra) if extra != '' else ''));
        if not ok: fails.append(name)
    async with async_playwright() as p:
        b = await launch(p)
        ctx = await b.new_context(viewport={'width': 1200, 'height': 720}); pg = await ctx.new_page(); errs = []
        pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' and '404' not in m.text else None); pg.on('pageerror', lambda e: errs.append('PAGE: ' + str(e)))
        async def load():
            await pg.goto(sys.argv[1]); await pg.wait_for_selector('#loader[hidden]', state='attached', timeout=240000)
        ev = pg.evaluate
        await load(); await pg.click('#move')
        check('edit bar shown', await ev("!document.getElementById('editbar').hidden"))
        n0 = await ev("__editor.plan.items.length")
        # field edit through the panel
        await ev("__editor.select({kind:'item', id:'wardrobe-b2'})")
        check('panel lists fields', await ev("document.querySelectorAll('#selfields .fld').length") >= 6)
        await ev("""(() => { const row = [...document.querySelectorAll('#selfields .fld')].find(r => r.firstChild.textContent === 'to'); const i = row.querySelector('input'); i.value = '4.60'; i.dispatchEvent(new Event('change')); })()""")
        check('typing a value changes the plan', await ev("__editor.plan.items.find(i => i.id === 'wardrobe-b2').to") == 4.6)
        check('change summary', await ev("__editor.describe()") == ['wardrobe-b2: to 5.06 → 4.60'], await ev("__editor.describe()"))
        # the five one-value edits from PLAN.md Phase 3
        await ev("__editor.edit(() => { __editor.plan.items.find(i => i.id === 'closet-b1').unitDepth = 0.35; }, { item: 'closet-b1' })")
        await ev("__editor.edit(() => { __editor.plan.items.find(i => i.id === 'wardrobe-corridor').to = 4.2; }, { item: 'wardrobe-corridor' })")
        await ev("__editor.edit(() => { const a = __editor.plan.items.find(i => i.id === 'bed-b1').anchor; a.wall = 'w-north'; a.side = 'S'; a.offset = 1.5; }, { item: 'bed-b1' })")
        await ev("__editor.edit(() => { __editor.plan.items.find(i => i.id === 'shower-wc').along = 'S'; }, { item: 'shower-wc' })")
        await ev("__editor.edit(() => { __editor.plan.items.find(i => i.id === 'vanity-bath').basins = 1; }, { item: 'vanity-bath' })")
        check('five one-value edits rebuild', len(await ev("__editor.describe()")) == 6, await ev("__editor.describe()"))
        check('closet depth error reported', await ev("[...document.querySelectorAll('#planNotes tr.chk.error')].some(r => r.textContent.includes('Closet unit depth'))"))
        if len(sys.argv) > 2:  # screenshots of the edited rooms
            os.makedirs(sys.argv[2], exist_ok=True); await pg.click('#move')
            for v in ['closet', 'corridor', 'bed1', 'wc', 'bath']:
                await pg.select_option('#view', v); f0 = await ev('window.__frames||0')
                await pg.wait_for_function(f'(window.__frames||0)>{f0}+3 && window.__settled', timeout=600000, polling=500)
                f1 = await ev('window.__frames'); await pg.wait_for_function(f'window.__frames>{f1}+2 && window.__settled', timeout=600000, polling=500)
                await pg.screenshot(timeout=300000, path=f'{sys.argv[2]}/{v}.png')
            await pg.click('#move')
        # undo / redo
        for _ in range(5): await ev("__editor.undo()")
        check('undo', await ev("__editor.describe()") == ['wardrobe-b2: to 5.06 → 4.60'], await ev("__editor.describe()"))
        await ev("__editor.redo()"); check('redo', len(await ev("__editor.describe()")) == 2)
        await ev("__editor.undo()")
        # add, duplicate, delete
        await pg.select_option('#addType', 'catalog:armchair'); await pg.click('#addBtn')
        check('add from catalog', await ev("__editor.plan.items.length") == n0 + 1)
        await pg.click('#dupBtn'); check('duplicate', await ev("__editor.plan.items.length") == n0 + 2)
        await pg.click('#delBtn'); check('delete', await ev("__editor.plan.items.length") == n0 + 1)
        # rotate
        await ev("__editor.select({kind:'item', id:'sofa'})"); await pg.click('#rotR')
        check('rotate 90', await ev("__editor.plan.items.find(i => i.id === 'sofa').rot") == 270)
        # wall move: bedroom 2 east wall 0.20 east; attached junctions and room outline follow
        await ev("__editor.edit(() => __editor.moveWall(__editor.plan.walls.find(w => w.id === 'w-b2-east'), 0.2))")
        check('wall moved', await ev("__editor.plan.walls.find(w => w.id === 'w-b2-east').from[0]") == 5.26)
        check('room outline follows', await ev("Math.max(...__editor.plan.rooms.find(r => r.id === 'bed2').poly.map(p => p[0]))") == 5.26)
        await ev("__editor.select({kind:'wall', id:'w-b2-east'})"); check('wall panel', await ev("document.querySelectorAll('#selfields .fld').length") >= 5)
        # copy changes
        await pg.click('#copyChanges'); await pg.wait_for_function("!document.getElementById('changeText').hidden", timeout=10000); txt = await ev("document.getElementById('changeText').value"); check('copy change summary', 'w-b2-east' in txt and 'wardrobe-b2' in txt, txt.replace('\n', ' | ')[:200])
        # persistence
        await load(); check('edits persist per device', await ev("__editor.plan.items.find(i => i.id === 'wardrobe-b2').to") == 4.6 and await ev("__editor.plan.walls.find(w => w.id === 'w-b2-east').from[0]") == 5.26)
        await pg.click('#move'); await pg.click('#resetPlan'); check('reset to published', await ev("__editor.describe().length") == 0)
        await load(); check('reset persists', await ev("__editor.describe().length") == 0)
        check('no page errors', not errs, errs[:5])
        await b.close()
    sys.exit(1 if fails else 0)
asyncio.run(main())
