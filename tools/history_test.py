"""Test of the assistant's saved history with mocked /api/chat (strict conversation checks) and /api/history (in-memory {rev, data}). Usage: python3 tools/history_test.py <url>  (exit 1 on failure)"""
import asyncio, sys, os, json
from playwright.async_api import async_playwright
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from launch import launch
HK = 'palace1-chat-history-v1'
LOG = "document.getElementById('chatlog').innerText"

def strict(ms):   # what the Claude API and api/chat.js would accept; returns an error text or None
    if not ms or len(ms) > 200 or len(json.dumps(ms)) > 1_500_000: return 'size'
    if ms[0]['role'] != 'user' or not isinstance(ms[0]['content'], str): return 'first message'
    for i, m in enumerate(ms):
        if i and m['role'] == ms[i - 1]['role']: return f'roles repeat at {i}'
        c = m['content']; uses = [b['id'] for b in c if b.get('type') == 'tool_use'] if isinstance(c, list) and m['role'] == 'assistant' else []
        got = [b['tool_use_id'] for b in c if b.get('type') == 'tool_result'] if isinstance(c, list) and m['role'] == 'user' else []
        prev_uses = [b['id'] for b in ms[i - 1]['content'] if b.get('type') == 'tool_use'] if i and isinstance(ms[i - 1]['content'], list) and ms[i - 1]['role'] == 'assistant' else []
        if sorted(got) != sorted(prev_uses): return f'tool results at {i}'
        if uses and (i + 1 >= len(ms)): return 'unanswered tool_use at the end'
    return None

def turn_msgs(n, pad=0):   # n finished plain turns, optionally with a tool turn every 5th and padded replies
    out = []
    for i in range(n):
        out.append({'role': 'user', 'content': f'old request {i}'})
        if i % 5 == 2:
            out += [{'role': 'assistant', 'content': [{'type': 'tool_use', 'id': f'o{i}', 'name': 'apply_changes', 'input': {'summary': 'x', 'changes': []}}]},
                    {'role': 'user', 'content': [{'type': 'tool_result', 'tool_use_id': f'o{i}', 'content': '{}'}]}]
        out.append({'role': 'assistant', 'content': [{'type': 'text', 'text': f'old reply {i} ' + 'x' * pad}]})
    return out

async def main():
    fails = []; calls = []; store = {'rev': 0, 'data': None}; puts = []; mode = {'v': 'ok'}; bad = []
    def check(name, ok, extra=''):
        print(('ok   ' if ok else 'FAIL ') + name + (' — ' + str(extra) if extra != '' else ''))
        if not ok: fails.append(name)
    async def hist(route):
        r = route.request
        if mode['v'] != 'ok': await route.fulfill(status=int(mode['v']), json={'error': 'x'}); return
        if r.method == 'GET': await route.fulfill(json=store); return
        body = json.loads(r.post_data); puts.append(body)
        if body['rev'] != store['rev']: await route.fulfill(status=409, json=store); return
        store.update(rev=store['rev'] + 1, data=body['data']); await route.fulfill(json=store)
    async def chat(route):
        ms = json.loads(route.request.post_data)['messages']; calls.append(ms); e = strict(ms)
        if e: bad.append(e); await route.fulfill(status=400, json={'error': e}); return
        last = ms[-1]['content']; text = last if isinstance(last, str) else ' '.join(b.get('text', '') for b in last if b.get('type') == 'text'); res = isinstance(last, list) and last[0].get('type') == 'tool_result'
        edit = {'type': 'tool_use', 'id': f'u{len(calls)}', 'name': 'apply_changes', 'input': {'summary': 'x', 'changes': [{'op': 'add', 'list': 'meta', 'id': '', 'path': 'histTest', 'value_json': '{"a": 1}'}]}}
        if not res and 'FAILMID' in text: await route.fulfill(json={'content': [edit], 'stop_reason': 'tool_use'}); return
        if res and any('FAILMID' in str(m['content']) for m in ms[-3:-2]): await route.fulfill(status=500, json={'error': 'boom'}); return
        if not res and 'EDIT' in text: await route.fulfill(json={'content': [{'type': 'text', 'text': 'Editing.'}, edit], 'stop_reason': 'tool_use'}); return
        await route.fulfill(json={'content': [{'type': 'text', 'text': 'Done: ' + text.split('Request: ')[-1][:40]}], 'stop_reason': 'end_turn'})
    async with async_playwright() as p:
        b = await launch(p); errs = []; keep = {}
        async def page(hroute=hist, seed=None):
            for c in b.contexts:   # idle pages leave the 3D scene so the GPU stays free
                for q in c.pages:
                    if c is not keep.get('a') and q.url != 'about:blank': await q.goto('about:blank')
            ctx = await b.new_context(viewport={'width': 1200, 'height': 720}); pg = await ctx.new_page()
            pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' and not any(s in m.text for s in ('404', '503', 'Failed to load resource')) else None); pg.on('pageerror', lambda e: errs.append('PAGE: ' + str(e)))
            pg.on('dialog', lambda d: asyncio.ensure_future(d.accept()))
            await pg.route('**/api/chat', chat)
            if hroute: await pg.route('**/api/history', hroute)
            await pg.goto(sys.argv[1]); await pg.wait_for_selector('#loader[hidden]', state='attached', timeout=240000); await pg.click('#chatBtn'); return pg
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
        check('409: this device copy is kept and written with the new rev', len(puts) == k + 2 and puts[-1]['rev'] == store['rev'] - 1 and 'stale writer' in json.dumps(store['data']))

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
        check('conversation ending in tool results: next request merges and alternates', not bad and strict(calls[n]) is None and calls[n][-1]['role'] == 'user' and calls[n][-1]['content'][-1]['type'] == 'text')
        # a stored conversation that ends with an unanswered tool_use is repaired on load
        store.update(rev=store['rev'] + 1, data={'messages': turn_msgs(2) + [{'role': 'user', 'content': 'q'}, {'role': 'assistant', 'content': [{'type': 'tool_use', 'id': 'dead', 'name': 'apply_changes', 'input': {}}]}], 'log': []})
        c2 = await page(); n = len(calls); await ask(c2, 'repair me', 'Done: repair me'); check('unanswered tool_use in stored data is dropped before sending', not bad and strict(calls[n]) is None and 'dead' not in json.dumps(calls[n]))

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

        # inert rendering of stored text
        evil = '<img src=x onerror="window.__xss=1"><script>window.__xss=1</script>'
        store.update(rev=store['rev'] + 1, data={'messages': [], 'log': [['bot', evil], ['bot" onclick="window.__xss=1', 'bad class'], ['note', evil], ['user', 5]]})
        x = await page(); await x.wait_for_timeout(500)
        check('stored HTML is shown as text, not run', await x.evaluate("document.querySelectorAll('#chatlog img, #chatlog script').length") == 0 and await x.evaluate("window.__xss") is None and evil in await x.evaluate(LOG))
        check('entries with an unknown class or a bad shape are dropped', await x.evaluate("document.querySelectorAll('#chatlog .msg').length") == 2)

        # New chat
        n = len(puts); await a.evaluate("document.getElementById('chatnew').click()"); await a.wait_for_timeout(1000)
        check('New chat clears the transcript', await a.evaluate(LOG) == '')
        check('New chat clears the server copy', store['data'] is None and puts[-1]['data'] is None)
        check('New chat clears the local copy', await a.evaluate(f"localStorage.getItem('{HK}')") is None)
        await reload(a); check('a reload after New chat stays empty', await a.evaluate(LOG) == '')
        n = len(calls); await ask(a, 'fresh start', 'Done: fresh start'); check('first request of a new chat is a first message again', len(calls[n]) == 1 and plan_in(calls[n][0]))
        d = await page(); check('another device sees the cleared chat only after a new turn exists', 'fresh start' in await d.evaluate(LOG))
        await d.evaluate("document.getElementById('chatnew').click()"); await d.wait_for_timeout(800)
        await a.evaluate("document.dispatchEvent(new Event('visibilitychange'))"); await a.wait_for_timeout(1500)
        check('New chat on one device clears the other on focus', await a.evaluate(LOG) == '')

        # no server: 503 and 404 fall back to the local copy
        for code in ('503', '404'):
            mode['v'] = code; e = await page(); await ask(e, 'offline ' + code, 'Done: offline ' + code); await reload(e)
            check(f'{code}: history is kept locally and survives a reload', 'offline ' + code in await e.evaluate(LOG))
            await e.evaluate("document.getElementById('chatnew').click()"); await e.wait_for_timeout(500); mode['v'] = 'ok'
        mode['v'] = 'ok'; g = await page(None); await ask(g, 'no route', 'Done: no route'); await reload(g); check('no history route at all (dev server): history kept locally', 'no route' in await g.evaluate(LOG))
        check('no strict-mock rejections, no page errors', not bad and not errs, (bad, errs[:5]))
        await b.close()
    sys.exit(1 if fails else 0)
asyncio.run(main())
