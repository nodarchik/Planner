"""Test of the shared plan storage with a mocked /api/plan (in-memory {rev, patch, base}; no Blob store). Usage: python3 tools/sync_test.py <url>  (exit 1 on failure)"""
import asyncio, sys, os, json
from playwright.async_api import async_playwright
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from launch import launch
PK = 'palace1-plan-patch-v1'
async def main():
    fails = []; store = {'rev': 0, 'patch': None, 'base': None}; puts = []; mode = {'v': 'ok'}; gate = {'ev': None}; pwreq = {'v': False}
    def check(name, ok, extra=''):
        print(('ok   ' if ok else 'FAIL ') + name + (' — ' + str(extra) if extra != '' else ''))
        if not ok: fails.append(name)
    async def mock(route):
        r = route.request
        if mode['v'] != 'ok': await route.fulfill(status=int(mode['v']), json={'error': 'x'}); return
        if r.method == 'GET': await route.fulfill(json=store); return
        if pwreq['v'] and r.headers.get('x-chat-password') != 'pw': await route.fulfill(status=401, json={'error': 'password required'}); return
        body = json.loads(r.post_data); puts.append(body)
        if gate['ev']: await gate['ev'].wait()
        if body['rev'] != store['rev']: await route.fulfill(status=409, json=store); return
        store.update(rev=store['rev'] + 1, patch=body['patch'], base=body['base']); await route.fulfill(json=store)
    async with async_playwright() as p:
        b = await launch(p); errs = []
        async def page(route=mock, seed=None):
            ctx = await b.new_context(viewport={'width': 1200, 'height': 720}); pg = await ctx.new_page()
            pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' and not any(s in m.text for s in ('404', '503', 'Failed to load resource')) else None); pg.on('pageerror', lambda e: errs.append('PAGE: ' + str(e)))
            if seed: await pg.add_init_script("if (!localStorage.getItem('%s')) localStorage.setItem('%s', %s)" % (PK, PK, json.dumps(json.dumps(seed))))
            if route: await pg.route('**/api/plan', route)
            await pg.goto(sys.argv[1]); await pg.wait_for_selector('#loader[hidden]', state='attached', timeout=240000); return pg
        wd = "__editor.plan.items.find(i => i.id === 'wardrobe-b2').to"
        setw = lambda v: "__editor.edit(() => { __editor.plan.items.find(i => i.id === 'wardrobe-b2').to = %s; }, { item: 'wardrobe-b2' })" % v
        focus = "document.dispatchEvent(new Event('visibilitychange'))"
        noted = "document.body.textContent.includes('Updated from another session')"
        a = await page(); check('empty server: plan is the published one', await a.evaluate(wd) == 5.06 and store['rev'] == 0 and not puts)
        for v in (4.5, 4.55, 4.6): await a.evaluate(setw(v))
        await a.wait_for_timeout(3000)
        check('quick edits give one PUT', len(puts) == 1 and puts[0]['rev'] == 0 and store['rev'] == 1, len(puts))
        check('PUT carries the whole patch and a base', 'wardrobe-b2' in json.dumps(puts[0]['patch']) and bool(puts[0]['base']))
        patch1 = json.loads(await a.evaluate(f"localStorage.getItem('{PK}')"))
        bb = await page(); check('GET fills the plan in a fresh browser', await bb.evaluate(wd) == 4.6 and await bb.evaluate(f"!!localStorage.getItem('{PK}')"))
        check('no badge when the server answers', await bb.evaluate("!document.getElementById('localbadge') || document.getElementById('localbadge').hidden"))
        await bb.evaluate(setw(4.4)); await bb.wait_for_timeout(3000)
        check('second session saves on top (rev 2)', store['rev'] == 2 and puts[-1]['rev'] == 1)
        await a.evaluate(focus); await a.wait_for_timeout(1500)
        check('focus refresh adopts the other edit with a note', await a.evaluate(wd) == 4.4 and await a.evaluate(noted))
        n = len(puts); await a.evaluate(focus); await a.wait_for_timeout(800)
        check('refresh without a change does nothing', len(puts) == n and await a.evaluate(wd) == 4.4)
        await bb.context.close()
        store.update(rev=5, patch=json.loads(json.dumps(patch1).replace('4.6', '4.3')))   # another session saved meanwhile; a still has rev 2
        await a.evaluate("document.querySelectorAll('div').forEach(d => { if (d.textContent.startsWith('Updated from')) d.remove(); })")
        await a.evaluate(setw(4.1)); await a.wait_for_timeout(3000)
        check('note says the local edit was replaced', await a.evaluate("document.body.textContent.includes('your last edit was replaced')"))
        check('409 adopts the server patch with a note', await a.evaluate(wd) == 4.3 and await a.evaluate(noted), await a.evaluate(wd))
        check('the unsaved local edit is kept as backup', await a.evaluate(f"localStorage.getItem('{PK}-backup').includes('4.1')"))
        check('local copy follows the server', await a.evaluate(f"localStorage.getItem('{PK}').includes('4.3')"))
        await a.evaluate(setw(4.2)); await a.wait_for_timeout(3000)
        check('next edit saves with the new rev', puts[-1]['rev'] == 5 and store['rev'] == 6, puts[-1]['rev'])
        await a.evaluate("__editor.undo()"); await a.wait_for_timeout(3000)
        check('undo is saved', store['rev'] == 7 and '4.3' in json.dumps(store['patch']))
        n = len(puts); await a.evaluate("__editor.undo()"); await a.wait_for_timeout(500)
        dlg = []; a.on('dialog', lambda d: (dlg.append(d.message), asyncio.ensure_future(d.accept())))
        await a.evaluate("document.getElementById('resetPlan').click()"); await a.wait_for_timeout(3000)
        check('discard asks about all devices', len(dlg) == 1 and 'all devices' in dlg[0], dlg)
        check('discard sends patch null', puts[-1]['patch'] is None and store['patch'] is None and await a.evaluate(wd) == 5.06)
        await a.context.close()
        store.update(rev=0, patch=None, base=None); puts.clear()
        c = await page(seed=patch1); await c.wait_for_timeout(3000)
        check('first run uploads the local patch', len(puts) == 1 and puts[0]['rev'] == 0 and puts[0]['patch'] == patch1 and await c.evaluate(wd) == 4.6, len(puts))
        await c.context.close()
        store.update(rev=7, patch=patch1); puts.clear()
        d = await page(seed=json.loads(json.dumps(patch1).replace('4.6', '4.7')))
        check('server wins over a differing local patch', await d.evaluate(wd) == 4.6 and await d.evaluate(f"localStorage.getItem('{PK}-backup').includes('4.7')"))
        await d.context.close()
        store.update(rev=8, patch=patch1, base='old'); puts.clear()
        e = await page(); await e.wait_for_timeout(3000)
        check('a changed published base keeps the patch', await e.evaluate(wd) == 4.6 and not puts and not await e.evaluate("document.body.textContent.includes('discarded')"))
        await e.context.close()
        for label, route, code in (('503', mock, '503'), ('404', mock, '404'), ('no API', None, 'ok')):
            mode['v'] = code; store.update(rev=0, patch=None, base=None)
            f = await page(route=route); check(f'{label}: badge shown', await f.evaluate("!!document.getElementById('localbadge') && !document.getElementById('localbadge').hidden"))
            await f.evaluate(setw(4.9)); await f.wait_for_timeout(2600)
            await f.reload(); await f.wait_for_selector('#loader[hidden]', state='attached', timeout=240000)
            check(f'{label}: edit persists over reload', await f.evaluate(wd) == 4.9)
            await f.context.close()
        mode['v'] = '503'; g = await page(); await g.evaluate(setw(4.8)); await g.wait_for_timeout(2600)
        mode['v'] = 'ok'; puts.clear(); store.update(rev=0, patch=None, base=None)
        await g.evaluate(setw(4.75)); await g.wait_for_timeout(3000)
        check('retry on the next edit clears the badge', len(puts) == 1 and await g.evaluate("document.getElementById('localbadge').hidden"))
        await g.context.close()
        # hide / pagehide flush before the 2 s debounce
        store.update(rev=20, patch=None, base=None); puts.clear()
        h = await page(); await h.evaluate(setw(4.45))
        await h.evaluate("(() => { Object.defineProperty(document, 'hidden', { get: () => true, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); delete document.hidden; })()"); await h.wait_for_timeout(600)
        check('hidden tab flushes the pending edit at once', len(puts) == 1 and store['rev'] == 21 and '4.45' in json.dumps(store['patch']), len(puts))
        await h.evaluate(setw(4.35)); await h.evaluate("dispatchEvent(new Event('pagehide'))"); await h.wait_for_timeout(600)
        check('pagehide flushes the pending edit at once', len(puts) == 2 and store['rev'] == 22 and '4.35' in json.dumps(store['patch']), len(puts))
        check('unsent marker cleared after a 200', await h.evaluate("localStorage.getItem('palace1-plan-unsent') === null"))
        # an edit made offline is pushed at the next load instead of being replaced by the server copy
        mode['v'] = '503'; await h.evaluate(setw(4.2)); await h.wait_for_timeout(2600); mode['v'] = 'ok'; puts.clear()
        check('local-only edit sets the unsent marker', await h.evaluate("localStorage.getItem('palace1-plan-unsent') === '1'"))
        await h.reload(); await h.wait_for_selector('#loader[hidden]', state='attached', timeout=240000); await h.wait_for_timeout(2000)
        check('reload with the unsent marker pushes local, not the server copy', await h.evaluate(wd) == 4.2 and len(puts) == 1 and puts[0]['rev'] == 22 and '4.2' in json.dumps(store['patch']), len(puts))
        # same, but the server moved on meanwhile: the conflict path adopts it and says so
        mode['v'] = '503'; await h.evaluate(setw(4.15)); await h.wait_for_timeout(2600); mode['v'] = 'ok'; puts.clear()
        store.update(rev=30, patch=json.loads(json.dumps(patch1).replace('4.6', '4.05')))
        await h.reload(); await h.wait_for_selector('#loader[hidden]', state='attached', timeout=240000); await h.wait_for_timeout(2000)
        check('unsent edit against a newer server copy: server wins with a note', await h.evaluate(wd) == 4.05 and await h.evaluate("document.body.textContent.includes('your last edit was replaced')") and await h.evaluate("localStorage.getItem('palace1-plan-patch-v1-backup').includes('4.15')"))
        await h.context.close()
        # an edit made while a PUT is in flight and answered 409 is not sent afterwards, undo does nothing stale
        store.update(rev=40, patch=patch1); puts.clear()
        k = await page(); gate['ev'] = asyncio.Event(); await k.evaluate(setw(4.1)); await k.wait_for_timeout(2600)
        await k.evaluate(setw(4.0)); store.update(rev=43, patch=json.loads(json.dumps(patch1).replace('4.6', '4.3'))); gate['ev'].set(); gate['ev'] = None
        await k.wait_for_timeout(3500)
        check('edit during an in-flight PUT that gets 409: no stale second PUT', len(puts) == 1 and await k.evaluate(wd) == 4.3 and store['rev'] == 43 and '4.3' in json.dumps(store['patch']), len(puts))
        await k.evaluate("__editor.undo()"); await k.wait_for_timeout(3000)
        check('undo after adopt does nothing stale', len(puts) == 1 and await k.evaluate(wd) == 4.3 and store['rev'] == 43)
        await k.context.close()
        # 401: ask for the password, retry once; cancel falls back to the badge
        pwreq['v'] = True; store.update(rev=50, patch=None); puts.clear(); seen = []
        m = await page(); m.on('dialog', lambda d: (seen.append(d.type), asyncio.ensure_future(d.accept('pw'))))
        await m.evaluate(setw(4.5)); await m.wait_for_timeout(3000)
        check('401 prompts for the password and retries', seen == ['prompt'] and len(puts) == 1 and store['rev'] == 51 and await m.evaluate("localStorage.getItem('palace1-chat-password') === 'pw'"), seen)
        await m.context.close()
        m2 = await page(); m2.on('dialog', lambda d: asyncio.ensure_future(d.dismiss()))
        await m2.evaluate("localStorage.removeItem('palace1-chat-password')"); await m2.evaluate(setw(4.5)); await m2.wait_for_timeout(3000)
        check('cancelled password prompt: badge, edit stays local', await m2.evaluate("!document.getElementById('localbadge').hidden") and store['rev'] == 51)
        await m2.context.close(); pwreq['v'] = False
        check('no page errors', not errs, errs[:5])
        await b.close()
    sys.exit(1 if fails else 0)
asyncio.run(main())
