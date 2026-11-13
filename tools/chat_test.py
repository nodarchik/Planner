"""Test of the in-app assistant with a mocked /api/chat (no Claude API call). Usage: python3 tools/chat_test.py <url>  (exit 1 on failure)"""
import asyncio, sys, os, json
from playwright.async_api import async_playwright
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from launch import launch
async def main():
    fails = []; calls = []
    def check(name, ok, extra=''):
        print(('ok   ' if ok else 'FAIL ') + name + (' — ' + str(extra) if extra != '' else ''))
        if not ok: fails.append(name)
    async def mock(route):
        body = json.loads(route.request.post_data); calls.append(body)
        if len(calls) == 3:   # second request: floor by index, meta add, view state
            content = [{"type": "tool_use", "id": "u1", "name": "apply_changes", "input": {"summary": "floor + meta", "changes": [
                           {"op": "set", "list": "floors", "id": "0", "path": "rect", "value_json": "[0, 0, 4.5, 7.13]"},
                           {"op": "add", "list": "meta", "id": "", "path": "chatTest", "value_json": "{\"a\": 1}"}]}},
                       {"type": "tool_use", "id": "u2", "name": "set_view_state", "input": {"night": True, "sun_hour": 9.5}}]
            await route.fulfill(json={"content": content, "stop_reason": "tool_use"}); return
        if len(calls) == 5:   # third request: model-made view, bad hour, unknown view, meta key removal, proto path
            content = [{"type": "tool_use", "id": "v1", "name": "apply_changes", "input": {"summary": "view + unset", "changes": [
                           {"op": "add", "list": "views", "id": "extra", "path": "", "value_json": "{\"cam\": [3, 5, 10], \"target\": [3, 0, 3]}"},
                           {"op": "unset", "list": "meta", "id": "", "path": "lights", "value_json": ""}]}},
                       {"type": "tool_use", "id": "v2", "name": "set_view_state", "input": {"view": "extra"}},
                       {"type": "tool_use", "id": "v3", "name": "set_view_state", "input": {"sun_hour": 30}},
                       {"type": "tool_use", "id": "v4", "name": "set_view_state", "input": {"view": "nope"}},
                       {"type": "tool_use", "id": "v5", "name": "apply_changes", "input": {"summary": "bad", "changes": [{"op": "set", "list": "meta", "id": "", "path": "__proto__.x", "value_json": "1"}]}}]
            await route.fulfill(json={"content": content, "stop_reason": "tool_use"}); return
        if len(calls) == 6:
            await route.fulfill(json={"content": [{"type": "text", "text": "Third done."}], "stop_reason": "end_turn"}); return
        if len(calls) == 4:
            await route.fulfill(json={"content": [{"type": "text", "text": "Floor and note done."}], "stop_reason": "end_turn"}); return
        if len(calls) == 1:   # a valid edit plus an invalid one in a second call → Claude would see one result and one error
            content = [{"type": "text", "text": "Narrowing the wardrobe."},
                       {"type": "tool_use", "id": "t1", "name": "apply_changes", "input": {"summary": "wardrobe to 4.60", "changes": [{"op": "set", "list": "items", "id": "wardrobe-b2", "path": "to", "value_json": "4.6"}]}},
                       {"type": "tool_use", "id": "t2", "name": "apply_changes", "input": {"summary": "bad", "changes": [{"op": "set", "list": "items", "id": "no-such-item", "path": "to", "value_json": "1"}]}}]
            await route.fulfill(json={"content": content, "stop_reason": "tool_use"})
        else:
            await route.fulfill(json={"content": [{"type": "text", "text": "Wardrobe (B2) is now 1.65 wide (x 2.95–4.60)."}], "stop_reason": "end_turn"})
    async with async_playwright() as p:
        b = await launch(p)
        pg = await b.new_page(viewport={'width': 1200, 'height': 720}); errs = []
        pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' and '404' not in m.text else None); pg.on('pageerror', lambda e: errs.append('PAGE: ' + str(e)))
        await pg.route('**/api/chat', mock)
        await pg.goto(sys.argv[1]); await pg.wait_for_selector('#loader[hidden]', state='attached', timeout=240000)
        await pg.click('#chatBtn'); check('panel opens', await pg.evaluate("!document.getElementById('chatpanel').hidden"))
        await pg.fill('#chatinput', 'make the B2 wardrobe 1.65 wide'); await pg.click('#chatsend')
        await pg.wait_for_function("[...document.querySelectorAll('#chatlog .msg.bot')].some(m => m.textContent.includes('1.65'))", timeout=120000)
        check('two requests', len(calls) == 2, len(calls))
        first = calls[0]['messages'][0]['content']; check('first message carries plan and catalog', '"wardrobe-b2"' in first and 'Furniture catalog' in first and first.rstrip().endswith('1.65 wide'))
        check('plan edited', await pg.evaluate("__editor.plan.items.find(i => i.id === 'wardrobe-b2').to") == 4.6)
        last = calls[1]['messages'][-1]; res = last['content']
        check('both tool results in one user message', last['role'] == 'user' and [r['tool_use_id'] for r in res] == ['t1', 't2'])
        check('valid batch reported with checks', 'wardrobe-b2: to 5.06' in res[0]['content'] and 'checks_not_passing' in res[0]['content'], res[0]['content'][:120])
        check('invalid batch rejected, plan unchanged', res[1].get('is_error') is True and 'no-such-item' in res[1]['content'])
        check('assistant content echoed unchanged', calls[1]['messages'][1]['content'][1]['id'] == 't1')
        check('one undo step restores', await pg.evaluate("(__editor.undo(), __editor.describe().length)") == 0)
        await pg.fill('#chatinput', 'shrink the floor and add a note'); await pg.click('#chatsend')
        await pg.wait_for_function("[...document.querySelectorAll('#chatlog .msg.bot')].some(m => m.textContent.includes('Floor and note'))", timeout=120000)
        check('floor edited by index', await pg.evaluate("__editor.plan.floors[0].rect[2]") == 4.5)
        check('meta key added', await pg.evaluate("__editor.plan.meta.chatTest.a") == 1)
        r2 = calls[3]['messages'][-1]['content']; check('both tools reported ok', [r['tool_use_id'] for r in r2] == ['u1', 'u2'] and not any(r.get('is_error') for r in r2), r2)
        check('night on', await pg.evaluate("document.getElementById('mnight').getAttribute('aria-pressed')") == 'true')
        check('hour set', await pg.evaluate("document.getElementById('sunTime').value") == '9.5')
        await pg.fill('#chatinput', 'third'); await pg.click('#chatsend')
        await pg.wait_for_function("[...document.querySelectorAll('#chatlog .msg.bot')].some(m => m.textContent.includes('Third done'))", timeout=120000)
        r3 = {r['tool_use_id']: r for r in calls[5]['messages'][-1]['content']}
        check('model-made view reachable', not r3['v2'].get('is_error') and await pg.evaluate("document.getElementById('view').value") in ('extra', ''), r3['v2'])
        check('bad hour rejected', r3['v3'].get('is_error') is True and 'sun_hour' in r3['v3']['content'])
        check('unknown view rejected', r3['v4'].get('is_error') is True)
        check('proto path rejected', r3['v5'].get('is_error') is True)
        await pg.reload(); await pg.wait_for_selector('#loader[hidden]', state='attached', timeout=240000)
        check('meta removal survives reload', await pg.evaluate("'lights' in __editor.plan.meta") is False)
        check('floor edit survives reload', await pg.evaluate("__editor.plan.floors[0].rect[2]") == 4.5)
        await pg.evaluate("document.getElementById('resetPlan').click()")
        check('reset restores published floor', await pg.evaluate("__editor.plan.floors[0].rect[2]") == 4.59)
        check('no page errors before recovery step', not errs, errs[:5])
        await pg.evaluate("""(() => { const v = structuredClone(__editor.plan.views); delete v.overview;
            localStorage.setItem('palace1-plan-patch-v1', JSON.stringify({ views: v, meta: { ...__editor.plan.meta, site: null } })); })()""")
        await pg.reload(); await pg.wait_for_selector('#loader[hidden]', state='attached', timeout=240000)
        check('bad saved edits discarded with notice', await pg.evaluate("!!document.getElementById('discardnote') && !!__editor.plan.views.overview && !!__editor.plan.meta.site && localStorage.getItem('palace1-plan-patch-v1') === null"))
        errs.clear()
        check('no page errors', not errs, errs[:5])
        await b.close()
    sys.exit(1 if fails else 0)
asyncio.run(main())
