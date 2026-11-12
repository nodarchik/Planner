"""Test of the in-app assistant with a mocked /api/chat (no Claude API call). Usage: python3 tools/chat_test.py <url>  (exit 1 on failure)"""
import asyncio, sys, os, json
from playwright.async_api import async_playwright
async def main():
    fails = []; calls = []
    def check(name, ok, extra=''):
        print(('ok   ' if ok else 'FAIL ') + name + (' — ' + str(extra) if extra != '' else ''))
        if not ok: fails.append(name)
    async def mock(route):
        body = json.loads(route.request.post_data); calls.append(body)
        if len(calls) == 1:   # a valid edit plus an invalid one in a second call → Claude would see one result and one error
            content = [{"type": "text", "text": "Narrowing the wardrobe."},
                       {"type": "tool_use", "id": "t1", "name": "apply_changes", "input": {"summary": "wardrobe to 4.60", "changes": [{"op": "set", "list": "items", "id": "wardrobe-b2", "path": "to", "value_json": "4.6"}]}},
                       {"type": "tool_use", "id": "t2", "name": "apply_changes", "input": {"summary": "bad", "changes": [{"op": "set", "list": "items", "id": "no-such-item", "path": "to", "value_json": "1"}]}}]
            await route.fulfill(json={"content": content, "stop_reason": "tool_use"})
        else:
            await route.fulfill(json={"content": [{"type": "text", "text": "Wardrobe (B2) is now 1.65 wide (x 2.95–4.60)."}], "stop_reason": "end_turn"})
    async with async_playwright() as p:
        exe = os.environ.get('CHROME_PATH') or ('/opt/pw-browsers/chromium' if os.path.exists('/opt/pw-browsers/chromium') else None)
        b = await p.chromium.launch(executable_path=exe, args=["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"])
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
        check('no page errors', not errs, errs[:5])
        await b.close()
    sys.exit(1 if fails else 0)
asyncio.run(main())
