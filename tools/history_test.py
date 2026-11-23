"""Test of the assistant's saved chats and chat list with mocked /api/chat (strict conversation checks) and /api/history (in-memory {rev, data} per chat id and for the list). Usage: python3 tools/history_test.py <url>  (exit 1 on failure)"""
import asyncio, sys, os, json, re
from urllib.parse import urlparse, parse_qs
from playwright.async_api import async_playwright
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from launch import launch
HK = 'palace1-chat-history-v1'
LOG = "document.getElementById('chatlog').innerText"

def strict(ms):   # what the Claude API and api/chat.js would accept; returns an error text or None
    if not ms or len(ms) > 200 or len(json.dumps(ms)) > 3_500_000: return 'size'
    if ms[0]['role'] != 'user' or not isinstance(ms[0]['content'], str): return 'first message'
    think = lambda m: isinstance(m['content'], list) and any(b.get('type') in ('thinking', 'redacted_thinking') for b in m['content'])
    turn0 = max(i for i, m in enumerate(ms) if m['role'] == 'user' and (isinstance(m['content'], str) or any(b.get('type') == 'text' for b in m['content'])))
    if any(think(m) for m in ms[:turn0]): return 'thinking block outside the current turn'
    if any(m['role'] == 'assistant' and any(b.get('type') == 'tool_use' for b in m['content']) and not think(m) for m in ms[turn0 + 1:]): return 'thinking block dropped inside the running turn'
    if any(m['role'] == 'user' and isinstance(m['content'], list) and any(b.get('type') == 'tool_result' for b in m['content']) and any(b.get('type') == 'text' for b in m['content']) for m in ms): return 'text merged into a tool_result message'
    if any((not m['content']) or (isinstance(m['content'], list) and any(b.get('type') == 'text' and not b['text'].strip() for b in m['content'])) for m in ms): return 'empty content'
    for i, m in enumerate(ms):
        if i and m['role'] == ms[i - 1]['role']: return f'roles repeat at {i}'
        c = m['content']; uses = [b['id'] for b in c if b.get('type') == 'tool_use'] if isinstance(c, list) and m['role'] == 'assistant' else []
        got = [b['tool_use_id'] for b in c if b.get('type') == 'tool_result'] if isinstance(c, list) and m['role'] == 'user' else []
        prev_uses = [b['id'] for b in ms[i - 1]['content'] if b.get('type') == 'tool_use'] if i and isinstance(ms[i - 1]['content'], list) and ms[i - 1]['role'] == 'assistant' else []
        if sorted(got) != sorted(prev_uses): return f'tool results at {i}'
        if uses and (i + 1 >= len(ms)): return 'unanswered tool_use at the end'
    return None

THINK = {'type': 'thinking', 'thinking': 'secret', 'signature': 'sig'}
def turn_msgs(n, pad=0):   # n finished plain turns, optionally with a tool turn every 5th and padded replies
    out = []
    for i in range(n):
        out.append({'role': 'user', 'content': f'old request {i}'})
        if i % 5 == 2:
            out += [{'role': 'assistant', 'content': [THINK, {'type': 'tool_use', 'id': f'o{i}', 'name': 'apply_changes', 'input': {'summary': 'x', 'changes': []}}]},
                    {'role': 'user', 'content': [{'type': 'tool_result', 'tool_use_id': f'o{i}', 'content': '{}'}]}]
        out.append({'role': 'assistant', 'content': [THINK, {'type': 'text', 'text': f'old reply {i} ' + 'x' * pad}]})
    return out

async def until(cond, limit=15):
    for _ in range(int(limit / .2)):
        r = cond(); r = await r if asyncio.iscoroutine(r) else r
        if r: return True
        await asyncio.sleep(.2)
    return False
async def main():
    fails = []; calls = []; store = {'rev': 0, 'data': None}; stores = {'main': store}; idx = {'rev': 0, 'data': None}; iputs = []; dialogs = []; puts = []; mode = {'v': 'ok', 'put': 'ok'}; bad = []; pwreq = {'v': False}
    def check(name, ok, extra=''):
        print(('ok   ' if ok else 'FAIL ') + name + (' — ' + str(extra) if extra != '' else ''))
        if not ok: fails.append(name)
    async def hist(route):
        r = route.request; q = parse_qs(urlparse(r.url).query)   # no query or id=main = the single-chat store, id=<id> = that chat, index=1 = the list
        st = idx if q.get('index') else store if not q.get('id') or q['id'][0] == 'main' else stores.setdefault(q['id'][0], {'rev': 0, 'data': None})
        if mode['v'] != 'ok': await route.fulfill(status=int(mode['v']), json={'error': 'x'}); return
        if pwreq['v'] and r.headers.get('x-chat-password') != 'pw': await route.fulfill(status=401, json={'error': 'password required'}); return
        if r.method == 'GET': await route.fulfill(json=st); return
        body = json.loads(r.post_data); (iputs if st is idx else puts if st is store else []).append(body)
        if mode['put'] != 'ok': await route.fulfill(status=int(mode['put']), json={'error': 'x'}); return
        if body['rev'] != st['rev']: await route.fulfill(status=409, json=st); return
        st.update(rev=st['rev'] + 1, data=body['data']); await route.fulfill(json=st)
    async def chat(route):
        ms = json.loads(route.request.post_data)['messages']; calls.append(ms); e = strict(ms)
        if e: bad.append(e); await route.fulfill(status=400, json={'error': e}); return
        if 'BUMP' in json.dumps(ms[-1]['content']): store['rev'] += 5   # another device saves while this turn runs
        if 'SLOW' in json.dumps(ms[-1]['content']): await asyncio.sleep(1.5)   # keeps the turn running
        last = ms[-1]['content']; text = last if isinstance(last, str) else ' '.join(b.get('text', '') for b in last if b.get('type') == 'text'); res = isinstance(last, list) and last[0].get('type') == 'tool_result'
        edit = {'type': 'tool_use', 'id': f'u{len(calls)}', 'name': 'apply_changes', 'input': {'summary': 'x', 'changes': [{'op': 'add', 'list': 'meta', 'id': '', 'path': 'histTest', 'value_json': '{"a": 1}'}]}}
        if not res and 'FAILMID' in text: await route.fulfill(json={'content': [THINK, edit], 'stop_reason': 'tool_use'}); return
        if res and any('FAILMID' in str(m['content']) for m in ms[-3:-2]): await route.fulfill(status=500, json={'error': 'boom'}); return
        bnd = [{'input': 'wheel', 'action': 'pan'}]
        combo = [{'type': 'tool_use', 'id': f'v{len(calls)}', 'name': 'set_view_state', 'input': {'fast': True}}, {'type': 'tool_use', 'id': f'b{len(calls)}', 'name': 'apply_changes', 'input': {'summary': 'x', 'changes': [{'op': 'set', 'list': 'meta', 'id': '', 'path': 'bindings', 'value_json': json.dumps(bnd)}]}}]
        turn_text = next((json.dumps(m['content']) for m in reversed(ms) if m['role'] == 'user' and (isinstance(m['content'], str) or any(b.get('type') == 'text' for b in m['content']))), '')
        if 'LOOP go' in turn_text: await route.fulfill(json={'content': [THINK, edit], 'stop_reason': 'tool_use'}); return
        if not res and 'COMBO' in text: await route.fulfill(json={'content': [THINK, {'type': 'text', 'text': 'Combo.'}] + combo, 'stop_reason': 'tool_use'}); return
        if not res and 'EDIT' in text: await route.fulfill(json={'content': [THINK, {'type': 'text', 'text': 'Editing.'}, edit], 'stop_reason': 'tool_use'}); return
        await route.fulfill(json={'content': [{'type': 'text', 'text': 'Done: ' + text.split('Request: ')[-1][:40]}], 'stop_reason': 'end_turn'})
    async with async_playwright() as p:
        b = await launch(p); errs = []; keep = {}
        async def page(hroute=hist, pw=None):
            for c in b.contexts:   # idle pages leave the 3D scene so the GPU stays free
                for q in c.pages:
                    if c is not keep.get('a') and q.url != 'about:blank': await q.goto('about:blank')
            ctx = await b.new_context(viewport={'width': 1200, 'height': 720}); pg = await ctx.new_page()
            pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' and not any(s in m.text for s in ('404', '503', 'Failed to load resource')) else None); pg.on('pageerror', lambda e: errs.append('PAGE: ' + str(e)))
            pg.on('dialog', lambda d: (dialogs.append(d.message), asyncio.ensure_future(d.accept())))
            await pg.route('**/api/chat', chat)
            if pw: await pg.add_init_script("try { localStorage.setItem('palace1-chat-password', '%s') } catch (e) {}" % pw)
            if hroute: await pg.route(re.compile(r'/api/history(\?.*)?$'), hroute)
            await pg.goto(sys.argv[1], timeout=120000); await pg.wait_for_selector('#loader[hidden]', state='attached', timeout=240000); await pg.click('#chatBtn'); return pg
        async def ask(pg, text, expect):
            await pg.fill('#chatinput', text); await pg.click('#chatsend')
            await pg.wait_for_function("t => [...document.querySelectorAll('#chatlog .msg')].some(m => m.textContent.includes(t)) && !document.getElementById('chatsend').disabled", arg=expect, timeout=60000)
            await pg.wait_for_timeout(300)
        async def reload(pg):
            await pg.reload(); await pg.wait_for_selector('#loader[hidden]', state='attached', timeout=240000); await pg.click('#chatBtn'); await pg.wait_for_timeout(500)
        plan_in = lambda m: '"wardrobe-b2"' in m['content'] and 'Furniture catalog' in m['content']

        a = await page(); keep['a'] = a.context; check('fresh start: empty transcript, no history stored', await a.evaluate(LOG) == '' and store['rev'] == 0)
        await ask(a, 'EDIT the floor', 'Editing.')
        await a.wait_for_function("document.querySelectorAll('#chatlog .msg.note').length >= 1", timeout=20000)
        await ask(a, 'plain hello', 'Done: plain hello'); await a.wait_for_timeout(800)
        check('server copy written after each finished turn, not per step', store['rev'] == 2 and len(puts) == 2, len(puts))
        check('stored data is {messages, log} only', sorted(store['data']) == ['log', 'messages'])
        check('no password or header stored', 'password' not in json.dumps(store).lower())
        before = await a.evaluate(LOG)
        await reload(a)
        check('transcript includes the change notes of the turn', 'histTest' in before, before[:160])
        check('restored transcript equals the live one', await a.evaluate(LOG) == before)
        n = len(calls); await ask(a, 'after reload', 'Done: after reload')
        m = calls[n][-1]; check('first request after a reload carries the full current plan', plan_in(m) and 'outdated' in m['content'] and m['content'].rstrip().endswith('after reload'))
        check('older turns are still sent', len(calls[n]) > 3 and calls[n][0]['content'].startswith('Furniture catalog'))
        n = len(calls); await ask(a, 'next', 'Done: next')
        check('the following request is a normal one (no full plan again)', not plan_in(calls[n][-1]))

        b2 = await page(); check('second browser context sees the first one conversation', 'after reload' in await b2.evaluate(LOG) and 'plain hello' in await b2.evaluate(LOG))
        n = len(calls); await ask(b2, 'from device two', 'Done: from device two'); check('second device first request carries the full plan', plan_in(calls[n][-1]))
        await a.evaluate("document.dispatchEvent(new Event('visibilitychange'))"); await a.wait_for_timeout(1500)
        check('focus refresh adopts the other device turn', 'from device two' in await a.evaluate(LOG))
        n = len(calls); await ask(a, 'back on one', 'Done: back on one'); check('after adopting, the next request has the full plan again', plan_in(calls[n][-1]))

        # stale rev: another writer bumped the server copy; this copy wins and is written with the new rev
        store['rev'] += 3; k = len(puts); await ask(a, 'stale writer', 'Done: stale writer'); await a.wait_for_timeout(800)
        check('a newer server rev is picked up before the send: one PUT with the current rev', len(puts) == k + 1 and puts[-1]['rev'] == store['rev'] - 1 and 'stale writer' in json.dumps(store['data']))

        # a turn that fails in the middle of the tool loop
        await ask(a, 'FAILMID go', 'boom'); await a.wait_for_timeout(800)
        check('failed turn: stored conversation is valid and ends with the answered turn', strict(store['data']['messages'] + [{'role': 'user', 'content': 'x'}]) is None and not any('FAILMID' in json.dumps(m) for m in store['data']['messages']))
        check('failed turn is explained in the transcript', 'left out of the conversation' in await a.evaluate(LOG))
        await reload(a); n = len(calls); await ask(a, 'after the failure', 'Done: after the failure')
        check('request after a failed turn and a reload is accepted by the strict mock', not bad and strict(calls[n]) is None, bad)

        # a 30-step stop leaves a user message last: the next request must still alternate
        seed = turn_msgs(2) + [{'role': 'user', 'content': 'long job'}, {'role': 'assistant', 'content': [{'type': 'tool_use', 'id': 'z', 'name': 'apply_changes', 'input': {'summary': 'x', 'changes': []}}]}, {'role': 'user', 'content': [{'type': 'tool_result', 'tool_use_id': 'z', 'content': '{}'}]}]
        store.update(rev=store['rev'] + 1, data={'messages': seed, 'log': [['user', 'long job'], ['note', 'Stopped after 30 steps; tell it to continue.']]})
        c = await page(); n = len(calls); await ask(c, 'continue', 'Done: continue')
        check('stored conversation ending in tool results is closed with an assistant message', not bad and strict(calls[n]) is None and calls[n][-1]['role'] == 'user' and isinstance(calls[n][-1]['content'], str) and calls[n][-2]['role'] == 'assistant' and 'Stopped after 30 steps' in json.dumps(calls[n][-2]))
        # a real 30-step stop: the turn is closed with an assistant message, stored, and the next request is valid
        lp = await page(); n = len(calls); await ask(lp, 'LOOP go', 'Stopped after 30 steps'); await lp.wait_for_timeout(800)
        sm = store['data']['messages']; check('30-step stop: stored conversation ends with an assistant text message', sm[-1]['role'] == 'assistant' and 'Stopped after 30 steps' in json.dumps(sm[-1]) and strict(sm + [{'role': 'user', 'content': 'x'}]) is None and not bad, bad)
        n = len(calls); await ask(lp, 'after loop', 'Done: after loop'); check('request after a 30-step stop is a normal new turn (strict mock)', not bad and strict(calls[n]) is None and isinstance(calls[n][-1]['content'], str), bad)
        # a stored conversation that ends with an unanswered tool_use is repaired on load
        store.update(rev=store['rev'] + 1, data={'messages': turn_msgs(2) + [{'role': 'user', 'content': 'q'}, {'role': 'assistant', 'content': [{'type': 'tool_use', 'id': 'dead', 'name': 'apply_changes', 'input': {}}]}], 'log': []})
        c2 = await page(); n = len(calls); await ask(c2, 'repair me', 'Done: repair me'); check('unanswered tool_use in stored data is dropped before sending', not bad and strict(calls[n]) is None and 'dead' not in json.dumps(calls[n]))

        # thinking blocks: kept only while the tool loop of the current turn runs, never stored or resent
        thk = await page(); n = len(calls); await ask(thk, 'EDIT with thinking', 'Editing.'); await thk.wait_for_timeout(500)
        check('thinking block is echoed inside the running turn (strict mock accepts the loop)', not bad and any(THINK in m['content'] for m in calls[n + 1] if m['role'] == 'assistant' and isinstance(m['content'], list)), bad)
        check('stored conversation has no thinking blocks', '"thinking"' not in json.dumps(store['data']['messages']) and 'signature' not in json.dumps(store['data']['messages']))
        n = len(calls); await ask(thk, 'next after thinking', 'Done: next after thinking'); check('next turn resends no thinking (strict mock)', not bad and 'secret' not in json.dumps(calls[n]), bad)
        await reload(thk); n = len(calls); await ask(thk, 'after reload thinking', 'Done: after reload thinking'); check('after a reload no thinking either', not bad, bad)
        store.update(rev=store['rev'] + 1, data={'messages': turn_msgs(3), 'log': []})
        thk2 = await page(); n = len(calls); await ask(thk2, 'strip stored', 'Done: strip stored'); check('old stored thinking blocks (earlier versions) are stripped on load', not bad and 'secret' not in json.dumps(calls[n]), bad)
        mm = turn_msgs(3); mm[1]['content'] = []; mm[3]['content'] = [{'type': 'text', 'text': '  '}]
        store.update(rev=store['rev'] + 1, data={'messages': mm, 'log': []})
        em = await page(); n = len(calls); await ask(em, 'after empties', 'Done: after empties')
        check('empty assistant content is repaired, request accepted', not bad and strict(calls[n]) is None and '(no answer)' in json.dumps(calls[n]), bad)
        # a PUT that failed is retried at the next load instead of being overwritten by the older server copy
        un = await page(); mode['put'] = '500'; await ask(un, 'unsent turn', 'Done: unsent turn'); await un.wait_for_timeout(500)
        check('failed PUT leaves the unsent marker', await un.evaluate("localStorage.getItem('palace1-chat-unsent') === '1'") and 'unsent turn' not in json.dumps(store['data']))
        mode['put'] = 'ok'; await reload(un)
        check('next load pushes the local copy first', await until(lambda: 'unsent turn' in json.dumps(store['data'])) and 'unsent turn' in await un.evaluate(LOG))
        check('marker cleared after the 200', await until(lambda: un.evaluate("localStorage.getItem('palace1-chat-unsent') === null")))
        mode['put'] = '413'; await ask(un, 'too big turn', 'Done: too big turn'); await until(lambda: un.evaluate("!!document.getElementById('chatlocalbadge') && !document.getElementById('chatlocalbadge').hidden"))
        check('413 shows the device-only badge', await un.evaluate("!document.getElementById('chatlocalbadge').hidden")); mode['put'] = 'ok'
        # another device cleared the chat; this idle device (no focus event) still starts from the new state
        n = len(calls); store.update(rev=store['rev'] + 1, data=None)
        await ask(a, 'after remote clear', 'Done: after remote clear')
        check('a send first adopts a newer server copy (here: cleared)', len(calls[n]) == 1 and plan_in(calls[n][0]) and 'Chat updated from another device' in await a.evaluate(LOG), len(calls[n]))
        # 409 during a save: this device keeps its copy and says so
        await ask(a, 'BUMP now', 'Done: BUMP now')
        seen409 = await until(lambda: a.evaluate("document.body.textContent.includes(\"this device's version was kept\")"))
        check('409 on save: note shown and this copy kept', seen409 and 'BUMP now' in json.dumps(store['data']), (seen409, [p['rev'] for p in puts[-3:]], store['rev']))
        # GET needs the password when the server asks for it
        pwreq['v'] = True; store.update(rev=store['rev'] + 1, data={'messages': turn_msgs(1), 'log': [['bot', 'from the server']]})
        wp = await page(pw='pw'); check('stored password is sent with the history GET', 'from the server' in await wp.evaluate(LOG))
        np_ = await page(); check('no password: history falls back to the local copy', 'from the server' not in await np_.evaluate(LOG)); pwreq['v'] = False
        # trimming
        store.update(rev=store['rev'] + 1, data={'messages': turn_msgs(80), 'log': [['bot', f'r{i}'] for i in range(400)]})
        t = await page(); check('transcript keeps the last 300 entries', len(await t.evaluate("[...document.querySelectorAll('#chatlog .msg')].map(m => m.textContent)")) == 300)
        n = len(calls); await ask(t, 'trim by count', 'Done: trim by count'); sent = calls[n]
        check('over 120 messages: sent conversation is cut, valid and under the limits', not bad and strict(sent) is None and len(sent) <= 100 and sent[0]['content'].startswith('old request'), (len(sent), bad))
        check('after a cut the new message carries the full plan', plan_in(sent[-1]))
        await t.wait_for_timeout(800); check('stored copy is the trimmed one', len(store['data']['messages']) == len(sent) + 1 and strict(store['data']['messages'] + [{'role': 'user', 'content': 'x'}]) is None)
        store.update(rev=store['rev'] + 1, data={'messages': turn_msgs(45, 30000), 'log': []})
        t2 = await page(); n = len(calls); await ask(t2, 'trim by size', 'Done: trim by size'); sent = calls[n]
        check('over 1 MB: sent conversation is cut to under the server limit with valid pairing', not bad and strict(sent) is None and len(json.dumps(sent)) < 900_000 and len(sent) < 100, (len(sent), len(json.dumps(sent))))
        await t2.wait_for_timeout(800); check('stored copy stays under the 2 MB server cap', len(json.dumps(store['data'])) < 1_000_000, len(json.dumps(store['data'])))

        # Fast and a binding in one turn, saved with one PUT; the restored chat can still set a binding
        store.update(rev=store['rev'] + 1, data=None); cb = await page(); k = len(puts); n = len(calls); await ask(cb, 'COMBO go', 'Combo.'); await cb.wait_for_timeout(1000)
        check('combined turn: Fast on and binding set', await cb.evaluate("__fast.on") is True and await cb.evaluate("__editor.plan.meta.bindings[0].action") == 'pan' and not bad, bad)
        check('combined turn: one history PUT with both tool results', len(puts) == k + 1 and 'View: fast true' in json.dumps(puts[-1]) and json.dumps(puts[-1]).count('tool_result') == 2 and strict(store['data']['messages'] + [{'role': 'user', 'content': 'x'}]) is None, len(puts) - k)
        await cb.evaluate("__editor.edit(() => { delete __editor.plan.meta.bindings; })"); await reload(cb); n = len(calls); await ask(cb, 'COMBO again', 'Combo.'); await cb.wait_for_timeout(500)
        check('after a reload the restored chat still sets a binding (strict mock)', not bad and strict(calls[n]) is None and await cb.evaluate("__editor.plan.meta.bindings[0].input") == 'wheel', bad)

        # inert rendering of stored text
        evil = '<img src=x onerror="window.__xss=1"><script>window.__xss=1</script>'
        store.update(rev=store['rev'] + 1, data={'messages': [], 'log': [['bot', evil], ['bot" onclick="window.__xss=1', 'bad class'], ['note', evil], ['user', 5]]})
        x = await page(); await x.wait_for_timeout(500)
        check('stored HTML is shown as text, not run', await x.evaluate("document.querySelectorAll('#chatlog img, #chatlog script').length") == 0 and await x.evaluate("window.__xss") is None and evil in await x.evaluate(LOG))
        check('entries with an unknown class or a bad shape are dropped', await x.evaluate("document.querySelectorAll('#chatlog .msg').length") == 2)

        # chat list: New chat keeps the old chat; open, continue, delete; migration of a stored single chat; merge of the list
        seed = turn_msgs(2); store.update(rev=store['rev'] + 1, data={'messages': seed, 'log': [['user', 'old request 0'], ['bot', 'old reply 0'], ['user', 'old request 1'], ['bot', 'old reply 1']]}); idx.update(rev=0, data=None); stores.clear(); stores['main'] = store
        m = await page(); rows = "[...document.querySelectorAll('#chatlist .chatitem')].map(r => r.querySelector('.title').textContent + '|' + r.classList.contains('current'))"
        await m.click('#chatsbtn'); await m.wait_for_function("document.querySelectorAll('#chatlist .chatitem').length === 1", timeout=10000)
        check('a stored single chat (main) shows up in the list (migration), marked current', await m.evaluate(rows) == ['old request 0|true'] and not await m.evaluate("document.getElementById('chatlist').hidden") and await m.evaluate("document.getElementById('chatlog').hidden"))
        await until(lambda: idx['data'] and idx['data']['chats'][0]['id'] == 'main'); check('the list is saved to the server with the main entry', idx['data']['chats'][0]['id'] == 'main' and idx['data']['chats'][0]['count'] == 2, idx)
        await m.click('#chatsbtn'); check('the Chats button swaps back to the transcript', await m.evaluate("document.getElementById('chatlist').hidden") and 'old reply 1' in await m.evaluate(LOG))
        await ask(m, 'second turn', 'Done: second turn'); await m.wait_for_timeout(800)
        check('each saved turn updates its list entry (count, same title)', idx['data']['chats'][0]['count'] == 3 and idx['data']['chats'][0]['title'] == 'old request 0', idx['data'])
        n = len(puts); sv = json.dumps(store['data'])
        await m.fill('#chatinput', 'SLOW one'); await m.click('#chatsend'); await m.wait_for_timeout(400)
        check('New chat and Chats are locked while a turn runs', await m.evaluate("document.getElementById('chatnew').disabled && document.getElementById('chatsbtn').disabled"))
        await m.wait_for_function("[...document.querySelectorAll('#chatlog .msg')].some(x => x.textContent.includes('Done: SLOW one')) && !document.getElementById('chatsend').disabled", timeout=30000); await m.wait_for_timeout(500); sv = json.dumps(store['data'])
        dn = len(dialogs); await m.click('#chatnew'); await m.wait_for_timeout(500)
        check('New chat gives an empty transcript with no confirm', await m.evaluate(LOG) == '' and len(dialogs) == dn)
        check('New chat keeps the old chat on the server and locally', json.dumps(store['data']) == sv and 'SLOW one' in sv and await m.evaluate(f"localStorage.getItem('{HK}')") is not None and len(puts) == n + 1, (len(puts), n))
        n = len(calls); await ask(m, 'brand new chat', 'Done: brand new chat'); await m.wait_for_timeout(800)
        cur = await m.evaluate("localStorage.getItem('palace1-chat-current')")
        check('the first request of a new chat is a first message again', len(calls[n]) == 1 and plan_in(calls[n][0]))
        check('the new chat has its own id and blob, the old one is untouched', re.fullmatch(r'[a-z0-9-]{8,40}', cur or '') and cur in stores and 'brand new chat' in json.dumps(stores[cur]['data']) and 'brand new chat' not in json.dumps(store['data']), cur)
        check('the list has both chats, the new one first and current', [c['id'] for c in idx['data']['chats']] == [cur, 'main'] and idx['data']['chats'][0]['title'] == 'brand new chat', idx['data'])
        await reload(m); check('a reload stays on the new chat', 'brand new chat' in await m.evaluate(LOG) and 'old request' not in await m.evaluate(LOG))
        await m.click('#chatsbtn'); await m.wait_for_function("document.querySelectorAll('#chatlist .chatitem').length === 2", timeout=10000)
        check('list rows: newest first, current marked', await m.evaluate(rows) == ['brand new chat|true', 'old request 0|false'], await m.evaluate(rows))
        await m.click('#chatlist .chatitem:nth-child(2) .chatopen'); await m.wait_for_function("document.getElementById('chatlog').innerText.includes('second turn')", timeout=10000)
        check('opening an old chat shows its transcript and hides the list', 'brand new chat' not in await m.evaluate(LOG) and await m.evaluate("document.getElementById('chatlist').hidden"))
        n = len(calls); await ask(m, 'continue old', 'Done: continue old'); await m.wait_for_timeout(800)
        check('continuing: earlier turns are sent and the message carries the full plan again', not bad and strict(calls[n]) is None and len(calls[n]) > 3 and calls[n][0]['content'] == 'old request 0' and plan_in(calls[n][-1]) and 'outdated' in calls[n][-1]['content'], bad)
        check('the continued chat is saved in its own blob', 'continue old' in json.dumps(store['data']) and 'continue old' not in json.dumps(stores[cur]['data']))
        await reload(m); check('a reload stays on the opened chat', 'continue old' in await m.evaluate(LOG))
        # the list is merged when another device wrote it meanwhile
        idx.update(rev=idx['rev'] + 1, data={'chats': idx['data']['chats'] + [{'id': 'foreign-chat1', 'title': 'Other device', 'updated': 1, 'count': 1}]})
        await ask(m, 'merge the list', 'Done: merge the list'); await until(lambda: any(c['id'] == 'foreign-chat1' for c in idx['data']['chats']) and idx['data']['chats'][0]['count'] >= 5)
        check('409 on the list: merged by id, both entries kept', {'foreign-chat1', 'main', cur} <= {c['id'] for c in idx['data']['chats']} and not any(c['id'] == 'main' and c['count'] < 5 for c in idx['data']['chats']), idx['data'])
        idx.update(rev=idx['rev'] + 1, data={'chats': [c for c in idx['data']['chats'] if c['id'] != 'foreign-chat1']})
        # a second device sees the same list
        d2 = await page(); await d2.click('#chatsbtn'); await d2.wait_for_function("document.querySelectorAll('#chatlist .chatitem').length === 2", timeout=10000)
        check('another device shows the same chats', sorted(await d2.evaluate(rows)) == ['brand new chat|false', 'old request 0|true'], await d2.evaluate(rows))
        await m.goto(sys.argv[1], timeout=120000); await m.wait_for_selector('#loader[hidden]', state='attached', timeout=240000); await m.click('#chatBtn')   # page() parked this page
        # delete: another chat, then the current one
        await m.click('#chatsbtn'); await m.wait_for_function("document.querySelectorAll('#chatlist .chatitem').length === 2", timeout=10000)
        dn = len(dialogs); await m.click('#chatlist .chatitem:nth-child(2) .chatdel'); await m.wait_for_function("document.querySelectorAll('#chatlist .chatitem').length === 1", timeout=10000); await m.wait_for_timeout(500)
        check('delete asks for a confirm, empties the blob and removes the list entry', len(dialogs) == dn + 1 and stores[cur]['data'] is None and [c['id'] for c in idx['data']['chats']] == ['main'] and 'continue old' in await m.evaluate(LOG + " + document.getElementById('chatlog').innerText"), idx['data'])
        await m.click('#chatlist .chatitem .chatdel'); await m.wait_for_function("document.querySelector('#chatlist .chatitem') === null", timeout=10000); await m.wait_for_timeout(500)
        nxt = await m.evaluate("localStorage.getItem('palace1-chat-current')")
        check('deleting the current chat starts a new empty one', await m.evaluate("document.getElementById('chatlog').innerText") == '' and nxt not in (cur, 'main', None) and store['data'] is None and idx['data']['chats'] == [] and await m.evaluate(f"localStorage.getItem('{HK}')") is None, (nxt, idx['data']))
        n = len(calls); await m.click('#chatsbtn'); await m.click('#chatsbtn'); await ask(m, 'after deleting', 'Done: after deleting'); check('the first message after a delete is a first message', len(calls[n]) == 1 and plan_in(calls[n][0]))
        # New chat with an empty chat does nothing
        k = await m.evaluate("localStorage.getItem('palace1-chat-current')"); await m.evaluate("document.getElementById('chatnew').click()"); check('New chat on a chat that already has messages starts another', await m.evaluate("localStorage.getItem('palace1-chat-current')") != k)
        k = await m.evaluate("localStorage.getItem('palace1-chat-current')"); await m.evaluate("document.getElementById('chatnew').click()"); check('New chat on an empty chat keeps the id', await m.evaluate("localStorage.getItem('palace1-chat-current')") == k)

        # no server: 503 and 404 fall back to the local copy
        for code in ('503', '404'):
            mode['v'] = code; e = await page(); await ask(e, 'offline ' + code, 'Done: offline ' + code); await reload(e)
            check(f'{code}: history is kept locally and survives a reload', 'offline ' + code in await e.evaluate(LOG))
            await e.click('#chatsbtn'); await e.wait_for_function("document.querySelectorAll('#chatlist .chatitem').length >= 1", timeout=10000)
            check(f'{code}: the chat list works locally too', await e.evaluate("document.querySelector('#chatlist .title').textContent") == 'offline ' + code)
            await e.evaluate("document.getElementById('chatnew').click()"); await e.wait_for_timeout(500); mode['v'] = 'ok'
        mode['v'] = 'ok'; g = await page(None); await ask(g, 'no route', 'Done: no route'); await reload(g); check('no history route at all (dev server): history kept locally', 'no route' in await g.evaluate(LOG))
        check('no strict-mock rejections, no page errors', not bad and not errs, (bad, errs[:5]))
        await b.close()
    sys.exit(1 if fails else 0)
asyncio.run(main())
