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
    queue = []   # scripted responses for the second half of the test (after the first 6 calls)
    async def mock(route):
        body = json.loads(route.request.post_data); calls.append(body)
        if len(calls) > 6 and queue: await route.fulfill(json=queue.pop(0)); return
        if len(calls) == 3: await asyncio.sleep(.5)   # keeps the turn in flight long enough to look at the model select
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
        check('default request names Haiku 5.5', calls[0].get('model') == 'claude-haiku-5-5' and await pg.evaluate("document.getElementById('chatmodel').value") == 'claude-haiku-5-5')
        check('select offers the four labelled models', await pg.evaluate("[...document.getElementById('chatmodel').options].map(o => o.textContent).join('|')") == 'Haiku 5.5 (fast)|Sonnet 5.5|Opus 5.5|Fable 5.2 (most capable)')
        check('answer carries the model label as display data, not in the text', await pg.evaluate("[...document.querySelectorAll('#chatlog .msg.bot')].every(m => m.dataset.model === 'Haiku 5.5 (fast)' && !m.textContent.includes('Haiku'))"))
        check('no label inside the API messages', 'Haiku 5.5 (fast)' not in json.dumps(calls[1]['messages']))
        last = calls[1]['messages'][-1]; res = last['content']
        check('both tool results in one user message', last['role'] == 'user' and [r['tool_use_id'] for r in res] == ['t1', 't2'])
        check('valid batch reported with checks', 'wardrobe-b2: to 5.06' in res[0]['content'] and 'checks_not_passing' in res[0]['content'], res[0]['content'][:120])
        check('invalid batch rejected, plan unchanged', res[1].get('is_error') is True and 'no-such-item' in res[1]['content'])
        check('assistant content echoed unchanged', calls[1]['messages'][1]['content'][1]['id'] == 't1')
        check('one undo step restores', await pg.evaluate("(__editor.undo(), __editor.describe().length)") == 0)
        await pg.select_option('#chatmodel', 'claude-opus-5-5')
        await pg.fill('#chatinput', 'shrink the floor and add a note'); await pg.click('#chatsend')
        check('model select is disabled while a turn runs', await pg.evaluate("document.getElementById('chatmodel').disabled"))
        await pg.wait_for_function("[...document.querySelectorAll('#chatlog .msg.bot')].some(m => m.textContent.includes('Floor and note'))", timeout=120000)
        check('floor edited by index', await pg.evaluate("__editor.plan.floors[0].rect[2]") == 4.5)
        check('meta key added', await pg.evaluate("__editor.plan.meta.chatTest.a") == 1)
        r2 = calls[3]['messages'][-1]['content']; check('both tools reported ok', [r['tool_use_id'] for r in r2] == ['u1', 'u2'] and not any(r.get('is_error') for r in r2), r2)
        check('night on', await pg.evaluate("document.getElementById('mnight').getAttribute('aria-pressed')") == 'true')
        check('hour set', await pg.evaluate("document.getElementById('sunTime').value") == '9.5')
        check('model select is enabled again after the turn', await pg.evaluate("!document.getElementById('chatmodel').disabled"))
        check('changing the model mid-conversation: next request uses it', calls[2].get('model') == 'claude-opus-5-5' and calls[3].get('model') == 'claude-opus-5-5')
        await pg.select_option('#chatmodel', 'claude-fable-5-2')
        await pg.fill('#chatinput', 'third'); await pg.click('#chatsend')
        await pg.wait_for_function("[...document.querySelectorAll('#chatlog .msg.bot')].some(m => m.textContent.includes('Third done'))", timeout=120000)
        r3 = {r['tool_use_id']: r for r in calls[5]['messages'][-1]['content']}
        check('model-made view reachable', not r3['v2'].get('is_error') and await pg.evaluate("document.getElementById('view').value") in ('extra', ''), r3['v2'])
        check('bad hour rejected', r3['v3'].get('is_error') is True and 'sun_hour' in r3['v3']['content'])
        check('unknown view rejected', r3['v4'].get('is_error') is True)
        check('proto path rejected', r3['v5'].get('is_error') is True)
        await pg.reload(); await pg.wait_for_selector('#loader[hidden]', state='attached', timeout=240000)
        check('model choice survives a reload', await pg.evaluate("document.getElementById('chatmodel').value") == 'claude-fable-5-2')
        check('restored answers keep their model labels', await pg.evaluate("[...document.querySelectorAll('#chatlog .msg.bot')].map(m => m.dataset.model).join()") == 'Haiku 5.5 (fast),Opus 5.5,Fable 5.2 (most capable)')
        await pg.evaluate("localStorage.setItem('palace1-chat-model', 'bogus')"); await pg.reload(); await pg.wait_for_selector('#loader[hidden]', state='attached', timeout=240000)
        check('unknown stored model falls back to the default', await pg.evaluate("document.getElementById('chatmodel').value") == 'claude-haiku-5-5')
        check('meta removal survives reload', await pg.evaluate("'lights' in __editor.plan.meta") is False)
        check('floor edit survives reload', await pg.evaluate("__editor.plan.floors[0].rect[2]") == 4.5)
        await pg.evaluate("document.getElementById('resetPlan').click()")
        check('reset restores published floor', await pg.evaluate("__editor.plan.floors[0].rect[2]") == 4.59)
        check('no page errors before recovery step', not errs, errs[:5])
        errs.clear()
        # ---- parts item, view extras, history, style preset, ceiling and cut (scripted turns) ----
        n_turn = [0]
        async def turn(*blocks):
            n_turn[0] += 1; n = n_turn[0]; tag = f'turn-end-{n}'; start = len(calls)
            queue.append({"content": [{"type": "tool_use", "id": f'x{n}_{i}', "name": b[0], "input": b[1]} for i, b in enumerate(blocks)], "stop_reason": "tool_use"})
            queue.append({"content": [{"type": "text", "text": tag}], "stop_reason": "end_turn"})
            if await pg.evaluate("document.getElementById('chatpanel').hidden"): await pg.click('#chatBtn')
            await pg.fill('#chatinput', 'scripted ' + tag); await pg.click('#chatsend')
            await pg.wait_for_function(f"[...document.querySelectorAll('#chatlog .msg.bot')].some(m => m.textContent.includes('{tag}'))", timeout=120000)
            return calls[start + 1]['messages'][-1]['content']
        ac = lambda *ch: ('apply_changes', {"summary": "t", "changes": list(ch)})
        vs = lambda **kw: ('set_view_state', kw)
        add = lambda o: {"op": "add", "list": "items", "id": o["id"], "path": "", "value_json": json.dumps(o)}
        setp = lambda i, path, v: {"op": "set", "list": "items", "id": i, "path": path, "value_json": json.dumps(v)}
        pos0 = "__editor.plan.items.find(i => i.id === 'tp1').pos[0]"
        first = calls[0]['messages'][0]['content']
        check('context lists parts shapes, materials, look keys, presets, opts', all(t in first for t in ['Shapes of a "parts" item', 'rbox (3)', 'oakFurn', 'item.look', 'fin Bouclé', 'Style presets', 'opts W', 'Part keys found on the built items']))
        pf = lambda x, y: pg.evaluate(f"__walk.free({x}, {y})")
        check('test spot is free', await pf(10.3, 2.6))
        top = {"id": "tp1", "type": "parts", "pos": [10.3, 2.6], "rot": 30, "label": "Test table", "parts": [
            {"shape": "rbox", "pos": [0, 0, .72], "size": [.9, .5, .04], "material": "oakFurn", "radius": .01}, {"shape": "cyl", "pos": [-.35, -.18, 0], "size": [.03, .72], "material": "brass"},
            {"shape": "sphere", "pos": [0, 0, .76], "size": [.1], "material": "ceramic", "color": "#c0504d"}, {"shape": "box", "pos": [.25, 0, .76], "size": [.1, .1, .2], "material": "walnut", "rot": [0, 0, 45]}]}
        r = await turn(ac(add(top)), ac(add({**top, "id": "tp2", "parts": [{**top["parts"][0], "shape": "cone"}]})), ac(add({**top, "id": "tp3", "parts": [{**top["parts"][0], "material": "nope"}]})))
        check('parts item built', not r[0].get('is_error') and await pg.evaluate("__editor.plan.items.some(i => i.id === 'tp1')"), r[0]['content'][:150])
        check('unknown shape lists the valid ones', r[1].get('is_error') is True and 'cone' in r[1]['content'] and 'rbox' in r[1]['content'], r[1]['content'][:200])
        check('unknown material lists the valid ones', r[2].get('is_error') is True and 'nope' in r[2]['content'] and 'oakFurn' in r[2]['content'])
        check('rejected parts items leave no trace', await pg.evaluate("__editor.plan.items.filter(i => i.id === 'tp2' || i.id === 'tp3').length") == 0)
        check('parts item blocks walking', not await pf(10.3, 2.6) and await pf(11.6, 2.6))
        r = await turn(ac(setp('tp1', 'solid', False)), ac(setp('tp1', 'look', {"oakFurn": {"fin": "Walnut", "color": "#7a5236"}})))
        check('solid false and look accepted, no footprint', not any(x.get('is_error') for x in r) and await pf(10.3, 2.6), [x['content'][:100] for x in r])
        # view extras
        r = await turn(vs(focal=35, fstop=2.8, dims=True, furniture=True, labels=False), vs(focal=30), vs(dims="yes"), vs(camera={"cam": [1, 2], "target": [0, 0, 0]}))
        check('focal, fstop and overlays set', not r[0].get('is_error') and await pg.evaluate("[focal.value, fstop.value, tdim.getAttribute('aria-pressed'), tfur.getAttribute('aria-pressed'), tlab.getAttribute('aria-pressed')].join()") == '35,2.8,true,true,false', r[0]['content'])
        check('bad focal, bool and camera rejected', all(r[k].get('is_error') for k in [1, 2, 3]), [r[k]['content'] for k in [1, 2, 3]])
        r = await turn(vs(dims=True, labels=False))
        check('overlays are set to the asked state, not toggled', not r[0].get('is_error') and await pg.evaluate("[tdim.getAttribute('aria-pressed'), tlab.getAttribute('aria-pressed')].join()") == 'true,false')
        await turn(vs(focal=0, fstop=0, dims=False, furniture=False, labels=True))
        r = await turn(vs(walk_to={"x": 100, "y": 100, "yaw": 0}), vs(walk_to={"x": 11.6, "y": 2.6, "yaw": 90}), vs(camera={"cam": [3, 8, 12], "target": [3, 0, 3]}))
        check('walk_to outside every room rejected', r[0].get('is_error') is True and 'inside a wall' in r[0]['content'], r[0]['content'])
        check('walk_to a free point turns walk on, yaw 90 faces east', not r[1].get('is_error') and await pg.evaluate("__walk.on") and await pg.evaluate("__walk.pos.map(v => v.toFixed(1)).join()") == '11.6,2.6' and abs(await pg.evaluate("Math.sin(-__walk.yaw)") - 1) < 1e-6, r[1]['content'])
        check('camera refused while walking', r[2].get('is_error') is True and 'walk' in r[2]['content'], r[2]['content'])
        r = await turn(vs(walk=False, camera={"cam": [3, 8, 12], "target": [3, 0, 3]}))
        check('walk off, then camera set', not r[0].get('is_error') and not await pg.evaluate("__walk.on") and await pg.evaluate("__walk.cam.map(v => Math.round(v)).join()") == '3,8,12', r[0]['content'])
        await turn(ac(setp('tp1', 'solid', True)))
        r = await turn(vs(walk_to={"x": 10.3, "y": 2.6, "yaw": 0}))
        check('walk_to into a solid is rejected', r[0].get('is_error') is True and 'inside' in r[0]['content'], r[0]['content'])
        await turn(vs(walk=False))
        # history
        await turn(ac(setp('tp1', 'pos', [10.5, 2.6])), ac(setp('tp1', 'pos', [10.7, 2.6])))
        check('two edits made', await pg.evaluate(pos0) == 10.7)
        r = await turn(('history', {"action": "undo", "steps": 2}), ('history', {"action": "undo", "steps": 0}), ('history', {"action": "wipe"}))
        check('undo 2 steps', await pg.evaluate(pos0) == 10.3 and json.loads(r[0]['content'])['steps_done'] == 2, r[0]['content'][:200])
        check('bad history input rejected', r[1].get('is_error') is True and r[2].get('is_error') is True)
        r = await turn(('history', {"action": "redo"}), ('history', {"action": "redo", "steps": 50}))
        check('redo, then redo again finds one step left', await pg.evaluate(pos0) == 10.7 and json.loads(r[1]['content'])['steps_done'] == 1 and not r[1].get('is_error'), r[1]['content'][:200])
        r = await turn(('history', {"action": "redo"}))
        check('empty redo is a note, not an error', not r[0].get('is_error') and 'Nothing to redo' in r[0]['content'], r[0]['content'])
        r = await turn(('history', {"action": "reset"}))
        check('reset restores the published plan without a dialog', await pg.evaluate("__editor.describe().length") == 0 and json.loads(r[0]['content'])['steps_done'] == 1, r[0]['content'][:160])
        await turn(('history', {"action": "undo"}))
        check('reset is undoable', await pg.evaluate("__editor.plan.items.some(i => i.id === 'tp1')"))
        await turn(('history', {"action": "reset"}))
        # style preset
        await turn(vs(style="nordic"))
        check('preset written to meta.style.preset and shown', await pg.evaluate("[__editor.plan.meta.style.preset, document.getElementById('style').value].join()") == 'nordic,nordic' and any(l.startswith('meta changed: style') for l in await pg.evaluate("__editor.describe()")))
        await pg.reload(); await pg.wait_for_selector('#loader[hidden]', state='attached', timeout=240000)
        check('preset survives reload', await pg.evaluate("[__editor.plan.meta.style.preset, document.getElementById('style').value].join()") == 'nordic,nordic')
        await pg.evaluate("document.getElementById('resetPlan').click()")
        check('reset brings the published preset back', await pg.evaluate("[__editor.plan.meta.style.preset, document.getElementById('style').value].join()") == 'soft,soft')
        await turn(vs(style="nordic")); await turn(('history', {"action": "undo"}))
        check('undo restores the preset', await pg.evaluate("[__editor.plan.meta.style.preset, document.getElementById('style').value].join()") == 'soft,soft')
        r = await turn(vs(style="neon"))
        check('unknown style rejected', r[0].get('is_error') is True)
        await pg.evaluate("document.getElementById('style').value = 'luxe'; document.getElementById('style').dispatchEvent(new Event('change'))")
        check('the editor select still leaves the plan alone', await pg.evaluate("__editor.plan.meta.style.preset") == 'soft')
        # ceiling, cut, notes
        w0 = await pg.evaluate("__wallTop()")
        r = await turn(ac({"op": "set", "list": "meta", "id": "", "path": "ceiling", "value_json": "3.2"}))
        w1 = await pg.evaluate("__wallTop()")
        check('ceiling 3.2 rebuilds taller walls', not r[0].get('is_error') and abs((w1 - w0) - .4) < .06, (w0, w1))
        r = await turn(ac({"op": "set", "list": "meta", "id": "", "path": "cut", "value_json": "0.9"}), vs(cut=True))
        await pg.wait_for_timeout(500); w2 = await pg.evaluate("__wallTop()")
        check('cut 0.9 cuts the walls at 0.9', abs(w2 - .9) < .05, w2)
        r = await turn(ac({"op": "unset", "list": "meta", "id": "", "path": "notes", "value_json": ""}), vs(cut=False))
        check('removing meta.notes is kept', not r[0].get('is_error') and await pg.evaluate("'notes' in __editor.plan.meta") is False, r[0]['content'][:160])
        # ---- layout: walls, rooms, openings, rollback; surface colours ----
        planjs = lambda: pg.evaluate("JSON.stringify(__editor.plan)")
        addl = lambda lst, o, i=None: {"op": "add", "list": lst, "id": i or o["id"], "path": "", "value_json": json.dumps(o)}
        wall = {"id": "tw1", "from": [1.0, 5.0], "to": [3.0, 5.0], "t": 0.1, "grow": "S", "openings": [{"id": "td1", "type": "door", "at": 1.2, "w": 0.8, "leaf": {"hinge": "start", "swing": "N", "open": 80}}]}
        room = {"id": "trm", "name": "Test room", "poly": [[1.0, 5.1], [3.0, 5.1], [3.0, 6.1], [1.0, 6.1]], "skirting": True}
        r = await turn(ac(addl('walls', wall), addl('rooms', room)))
        check('wall and room added', not r[0].get('is_error') and await pg.evaluate("__editor.plan.walls.some(w => w.id === 'tw1') && __editor.plan.rooms.some(x => x.id === 'trm')"), r[0]['content'][:200])
        r = await turn(ac({"op": "set", "list": "walls", "id": "tw1", "path": "to", "value_json": "[3.5, 5.0]"}, {"op": "set", "list": "rooms", "id": "trm", "path": "poly", "value_json": "[[1.0, 5.1], [3.5, 5.1], [3.5, 6.1], [1.0, 6.1]]"}))
        check('wall moved together with its room polygon', not r[0].get('is_error') and await pg.evaluate("__editor.plan.walls.find(w => w.id === 'tw1').to[0] === 3.5 && __editor.plan.rooms.find(x => x.id === 'trm').poly[1][0] === 3.5"))
        r = await turn(ac({"op": "set", "list": "walls", "id": "tw1", "path": "openings.1", "value_json": json.dumps({"id": "tw-win", "type": "window", "at": 2.4, "w": 0.8})}))
        check('window opening added', not r[0].get('is_error') and await pg.evaluate("__editor.plan.walls.find(w => w.id === 'tw1').openings.length") == 2, r[0]['content'][:200])
        r = await turn(ac({"op": "unset", "list": "walls", "id": "tw1", "path": "openings.0", "value_json": ""}))
        check('opening removed (array shrinks, no hole)', not r[0].get('is_error') and await pg.evaluate("JSON.stringify(__editor.plan.walls.find(w => w.id === 'tw1').openings.map(o => o.id))") == '["tw-win"]')
        arch = {"id": "tw2", "from": [4.0, 5.0], "to": [5.0, 5.0], "t": 0.1, "grow": "S", "openings": [{"id": "ta", "type": "arch", "at": 4.2, "w": 0.6, "top": 2.2, "radius": 0.3}]}
        r = await turn(ac(addl('walls', arch)))
        check('arch opening in its own wall', not r[0].get('is_error') and await pg.evaluate("__editor.plan.walls.some(w => w.id === 'tw2')"), r[0]['content'][:200])
        before = await planjs()
        r = await turn(ac(addl('walls', {**wall, "id": "tw3"}), addl('walls', {**arch, "id": "tw4", "openings": [arch["openings"][0], {"type": "door", "at": 4.7, "w": 0.2}]})))
        check('failed batch rolls back cleanly (nothing half-applied)', r[0].get('is_error') is True and await planjs() == before, r[0]['content'][:200])
        r = await turn(ac({"op": "remove", "list": "walls", "id": "tw1", "path": "", "value_json": ""}, {"op": "remove", "list": "walls", "id": "tw2", "path": "", "value_json": ""}, {"op": "remove", "list": "rooms", "id": "trm", "path": "", "value_json": ""}))
        check('walls and room removed', not r[0].get('is_error') and await pg.evaluate("__editor.plan.walls.every(w => !w.id.startsWith('tw')) && __editor.plan.rooms.every(x => x.id !== 'trm')"))
        # colours
        r = await turn(ac(
                          {"op": "set", "list": "floors", "id": "0", "path": "color", "value_json": '"#8a8a8a"'}, {"op": "set", "list": "meta", "id": "", "path": "style.floorTint", "value_json": '"#c8c8c8"'},
                          {"op": "set", "list": "meta", "id": "", "path": "style.frameTint", "value_json": '"#aa4444"'}, {"op": "set", "list": "meta", "id": "", "path": "style.wallTint", "value_json": '"#cfd8dc"'},
                          {"op": "set", "list": "meta", "id": "", "path": "style.ceilingTint", "value_json": '"#fff0f0"'}, {"op": "set", "list": "meta", "id": "", "path": "style.trimTint", "value_json": '"#334455"'},
                          {"op": "set", "list": "rooms", "id": "bed1", "path": "wallColor", "value_json": '"#a0c0a0"'}, {"op": "set", "list": "rooms", "id": "bed1", "path": "trimColor", "value_json": '"#202020"'},
                          {"op": "set", "list": "walls", "id": "w-north", "path": "color", "value_json": '"#bbaa99"'}, {"op": "set", "list": "ceilings", "id": "0", "path": "color", "value_json": '"#eeeeff"'},
                          {"op": "set", "list": "walls", "id": "w-south", "path": "openings.0.leaf.color", "value_json": '"#445566"'}))
        check('every surface colour field accepted and built', not r[0].get('is_error'), r[0]['content'][:250])
        r = await turn(ac({"op": "set", "list": "floors", "id": "0", "path": "color", "value_json": '"red"'}), ac({"op": "set", "list": "floors", "id": "0", "path": "material", "value_json": '"nopeFloor"'}))
        check('bad colour and unknown floor material rejected with a clear message', r[0].get('is_error') is True and '#e9ddcc' in r[0]['content'] and r[1].get('is_error') is True and 'oakFloor' in r[1]['content'], (r[0]['content'][:120], r[1]['content'][:120]))
        await pg.evaluate("document.getElementById('resetPlan').click()")
        # ---- review fixes ----
        w5 = {"id": "tw5", "from": [1.0, 5.0], "to": [4.0, 5.0], "t": 0.1, "grow": "S", "openings": [{"id": "a", "type": "window", "at": 1.1, "w": 0.5}, {"id": "b", "type": "window", "at": 2.0, "w": 0.5}, {"id": "c", "type": "window", "at": 3.0, "w": 0.5}]}
        await turn(ac(addl('walls', w5)))
        r = await turn(ac({"op": "unset", "list": "walls", "id": "tw5", "path": "openings.0", "value_json": ""}, {"op": "unset", "list": "walls", "id": "tw5", "path": "openings.1", "value_json": ""}))
        check('two array unsets in one batch refer to the list before the batch', not r[0].get('is_error') and await pg.evaluate("JSON.stringify(__editor.plan.walls.find(w => w.id === 'tw5').openings.map(o => o.id))") == '["c"]', r[0]['content'][:160])
        bad = lambda i, **kw: add({**top, "id": i, "parts": [{**top["parts"][0], **kw}]})
        before = await planjs()
        r = await turn(ac(bad('b1', material='constructor')), ac(bad('b2', material='toString')), ac(bad('b3', size=[.5, 0, .04])), ac(bad('b4', radius=-1)), ac(bad('b5', color='red')),
                       ac(add({**top, "id": "b6", "parts": [top["parts"][0]] * 201})), ac({"op": "set", "list": "floors", "id": "0", "path": "material", "value_json": '"constructor"'}))
        check('prototype keys, zero sizes, bad radius, bad colour and 201 parts are clean errors that roll back', all(x.get('is_error') for x in r) and 'valid:' in r[0]['content'] and await planjs() == before, [x['content'][:90] for x in r])
        r = await turn(vs(focal=18, walk_to={"x": 100, "y": 100}), vs(focal=24, style="neon"), vs(focal=24, view="nope"))
        check('set_view_state validates everything before applying anything', all(x.get('is_error') for x in r) and await pg.evaluate("document.getElementById('focal').value") == '0', [x['content'][:80] for x in r])
        await turn(ac({"op": "remove", "list": "walls", "id": "tw5", "path": "", "value_json": ""}))
        await turn(ac(add(top)))
        for i in range(3): await turn(ac(setp('tp1', 'pos', [10.3 + .1 * (i + 1), 2.6])))
        r = await turn(('history', {"action": "undo", "steps": 100}))
        res = json.loads(r[0]['content'])
        check('undo with steps 100 stops at the start of the stack, one rebuild', res['steps_done'] > 3 and res['undo_left'] == 0 and not r[0].get('is_error'), r[0]['content'][:200])
        r = await turn(('history', {"action": "redo", "steps": None}))
        check('null steps means one step', json.loads(r[0]['content'])['steps_done'] == 1)
        await pg.evaluate("document.getElementById('resetPlan').click()")
        check('no page errors in scripted turns', not errs, errs[:5])
        await pg.evaluate("document.getElementById('resetPlan').click()")
        await pg.evaluate("""(() => { const v = structuredClone(__editor.plan.views); delete v.overview;
            localStorage.setItem('palace1-plan-patch-v1', JSON.stringify({ views: v, meta: { ...__editor.plan.meta, site: null } })); })()""")
        await pg.reload(); await pg.wait_for_selector('#loader[hidden]', state='attached', timeout=240000)
        check('bad saved edits discarded with notice', await pg.evaluate("!!document.getElementById('discardnote') && !!__editor.plan.views.overview && !!__editor.plan.meta.site && localStorage.getItem('palace1-plan-patch-v1') === null"))
        await pg.evaluate("""(() => { const id = __editor.plan.rooms[0].id; localStorage.setItem('palace1-plan-patch-v1', JSON.stringify({ rooms: { set: { [id]: { poly: 5 } }, unset: {}, add: [], remove: [] } })); })()""")
        await pg.reload(); await pg.wait_for_selector('#loader[hidden]', state='attached', timeout=240000)
        check('patch that breaks geometry discarded with notice', await pg.evaluate("!!document.getElementById('discardnote') && Array.isArray(__editor.plan.rooms[0].poly) && localStorage.getItem('palace1-plan-patch-v1') === null"))
        errs.clear()
        check('no page errors', not errs, errs[:5])
        await b.close()
    sys.exit(1 if fails else 0)
asyncio.run(main())
