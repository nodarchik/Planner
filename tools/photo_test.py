"""Functional test of Photo render: locked camera on current screen view -> realistic finished image.
Usage: python3 tools/photo_test.py <url>  (exit 1 on failure). PHOTO_TEST_SIZE=720x432 shrinks the window (default 1200x720) for software GL."""
import asyncio, base64, io, os, re, sys
import numpy as np
from PIL import Image
from playwright.async_api import async_playwright

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from launch import launch

async def main():
    fails = []
    def check(name, ok, extra=''):
        print(('ok   ' if ok else 'FAIL ') + name + (' — ' + str(extra) if extra != '' else ''), flush=True)
        if not ok:
            fails.append(name)

    async with async_playwright() as p:
        b = await launch(p)
        errs = []
        W, H = map(int, os.environ.get('PHOTO_TEST_SIZE', '1200x720').split('x'))
        ctx = await b.new_context(viewport={'width': W, 'height': H})
        pg = await ctx.new_page()
        pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' and '404' not in m.text else None)
        pg.on('pageerror', lambda e: errs.append('PAGE: ' + str(e)))
        await pg.route('**/api/plan', lambda r: r.fulfill(json={'rev': 0, 'patch': None, 'base': None}))
        await pg.goto(sys.argv[1])
        await pg.wait_for_selector('#loader[hidden]', state='attached', timeout=240000)
        await pg.wait_for_function('window.__assetsReady !== false', timeout=240000)
        ev = pg.evaluate
        # per-frame recorder of the percentage: [percent, stage, #photoText, <progress> value, <progress> max, #status]
        await ev("""() => { const $ = id => document.getElementById(id); window.__trace = []; let last = '';
          (function rec() { const r = [__photo.percent, __photo.stage, $('photoText').textContent, $('photoProg').value, $('photoProg').max, $('status').textContent], k = r.join('|');
            if (k !== last) { last = k; window.__trace.push(r); } requestAnimationFrame(rec); })(); }""")
        async def trace():
            t = await ev('window.__trace.splice(0)'); return t
        rising = lambda t: all(a[0] <= b[0] for a, b in zip(t, t[1:]))
        RX = re.compile(r'^Rendering photo · (\d+) % · (\d+) / (\d+) samples$')
        def lines_ok(t, target):  # every sampling line: integer percent = __photo.percent = <progress>, below 100, right target
            rows = [(r, RX.match(r[2])) for r in t if r[1] == 'Rendering photo']
            return bool(rows) and all(m and int(m[1]) == r[0] == r[3] and r[4] == 100 and r[0] < 100 and int(m[3]) == target for r, m in rows)

        check('Save 2K still button removed', await ev("document.getElementById('still') === null"))
        await pg.select_option('#view', 'living')
        f0 = await ev('window.__frames || 0')
        await pg.wait_for_function(f'(window.__frames || 0) > {f0} + 4 && window.__settled', timeout=60000)

        # Enter Walk mode, advance, then start Photo render right from current screen
        await pg.click('#walk')
        await ev('__walk.step(0.4)')
        f1 = await ev('window.__frames || 0')
        await pg.wait_for_function(f'(window.__frames || 0) > {f1} + 2')
        cam0 = await ev('({ c: __bindings.cam, t: __bindings.target })')

        await trace()
        await pg.click('#photo')
        await pg.wait_for_function("window.__photo && window.__photo.on && window.__photo.samples >= 2", timeout=480000, polling=200)
        t1 = await trace(); stages = [r[1] for r in t1]
        check('percentage shown for loading, preparing and sampling (integer, in step with <progress>)',
              'Loading renderer' in stages and 'Preparing scene' in stages and lines_ok(t1, 32) and
              all(re.match(r'^(Loading renderer|Preparing scene|Compiling shaders) · \d+ %$', r[2]) and r[3] == r[0] for r in t1 if r[1] in ('Loading renderer', 'Preparing scene', 'Compiling shaders')) and
              all(re.match(r'^Photo · \d+ % · ', r[5]) for r in t1 if r[1]), t1[:3] + t1[-3:])
        check('percentage rises without going back, below 100 while rendering', rising(t1) and 0 < t1[-1][0] < 100, [r[0] for r in t1])
        cam_photo = await ev('({ c: __bindings.cam, t: __bindings.target })')
        cam_kept = all(abs(a - b) < 1e-4 for a, b in zip(cam0['c'] + cam0['t'], cam_photo['c'] + cam_photo['t']))
        check('Photo exits Walk keeping current screen view', not await ev('__walk.on') and cam_kept, (cam0, cam_photo))
        check('photobar, progress and locked controls active',
              await pg.is_visible('#photobar') and await pg.is_visible('#photoProg') and
              await ev("document.getElementById('view').disabled && document.getElementById('walk').disabled && document.getElementById('stage').inert") and
              not await pg.is_visible('#hint'))

        # Try moving the camera by drag, wheel, WASD and view change while Photo render runs
        s0 = await ev('window.__photo.samples')
        await pg.mouse.move(W / 2, H / 2)
        await pg.mouse.down()
        await pg.mouse.move(W * .68, H * .64, steps=8)
        await pg.mouse.up()
        await pg.mouse.wheel(0, -300)
        await pg.keyboard.press('KeyW')
        await ev("(() => { const s = document.getElementById('view'); s.value = 'bath'; s.dispatchEvent(new Event('change')); })()")
        await pg.wait_for_timeout(300)
        cam_after = await ev('({ c: __bindings.cam, t: __bindings.target })')
        s1 = await ev('window.__photo.samples')
        check('camera stays locked under drag, wheel, WASD and view change', cam_after == cam_photo and s1 >= s0, (s0, s1, cam_photo, cam_after))

        # Stop early with Finish now and verify non-blank rendered image appears
        if not await ev('window.__photo.done'):
            await pg.click('#photoStop', timeout=240000)  # a software-GL frame can take many seconds
        await pg.wait_for_function('window.__photo.done === true', timeout=240000, polling=100)
        t2 = await trace()
        check('denoising stage shown, 100 % only when the image is ready',
              rising(t1[-1:] + t2) and any(r[1] == 'Denoising' and r[0] == 97 for r in t2) and [r[0] for r in t2].count(100) == len([r for r in t2 if r[2].startswith('Photo ready')]) >= 1 and
              t2[-1][0] == 100 and t2[-1][3] == 100 and await ev('window.__photo.percent') == 100, t2[-4:])
        img_stats = await ev("""() => {
          const img = document.getElementById('photoImg');
          const c = document.createElement('canvas'); c.width = 64; c.height = 36;
          const g = c.getContext('2d'); g.drawImage(img, 0, 0, 64, 36);
          const d = g.getImageData(0, 0, 64, 36).data;
          let sum = 0, sq = 0, n = d.length / 4;
          for (let i = 0; i < d.length; i += 4) { const l = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]; sum += l; sq += l * l; }
          const mean = sum / n;
          return { vis: !img.hidden, ok: img.complete && img.naturalWidth > 0, w: img.naturalWidth, h: img.naturalHeight, mean, std: Math.sqrt(Math.max(0, sq / n - mean * mean)) };
        }""")
        check('finished realistic image displayed on screen (non-blank)',
              img_stats['vis'] and img_stats['ok'] and img_stats['mean'] > 5 and img_stats['std'] > 5 and
              await pg.is_visible('#photoSave') and await pg.is_visible('#photoMore') and not await ev('window.__photo.rendering'),
              img_stats)

        # Resume +32 samples
        prev_target = await ev('window.__photo.target')
        await pg.click('#photoMore', timeout=240000)
        check('+32 samples hides image and resumes rendering',
              await ev('window.__photo.rendering') and not await pg.is_visible('#photoImg') and await ev('window.__photo.target') == prev_target + 32)
        await pg.wait_for_function(f'window.__photo.samples >= {await ev("window.__photo.samples")} + 1', timeout=240000, polling=100)
        t3 = await trace()
        check('+32 samples starts a new pass: percentage from 0, rising, new target in the text', t3[0][0] < 10 and rising(t3) and lines_ok(t3, prev_target + 32) and t3[-1][0] < 100, [r[0] for r in t3])

        # Change lens in Photo mode (stays locked and keeps rendering)
        await pg.select_option('#focal', '35', timeout=240000)
        await pg.wait_for_function('window.__photo.samples >= 1', timeout=240000, polling=100)
        check('lens change stays in locked Photo mode', await ev('__photo.on') and (await ev('__bindings.cam')) == cam_photo['c'])

        # Escape exits Photo render cleanly and unlocks controls
        await pg.keyboard.press('Escape')
        check('Esc exits Photo render and unlocks UI',
              not await ev('__photo.on') and not await pg.is_visible('#photobar') and not await pg.is_visible('#photoImg') and
              not await ev("document.getElementById('view').disabled || document.getElementById('stage').inert"))

        # Orbit works again
        await pg.mouse.move(W / 2, H / 2)
        await pg.mouse.down()
        await pg.mouse.move(W * .63, H * .58, steps=6)
        await pg.mouse.up()
        f2 = await ev('window.__frames || 0')
        await pg.wait_for_function(f'(window.__frames || 0) > {f2} + 4')
        cam_unlocked = await ev('__bindings.cam')
        check('camera orbits again after exiting Photo render', max(abs(a - b) for a, b in zip(cam_unlocked, cam_photo['c'])) > 0.05, (cam_photo['c'], cam_unlocked))

        # Scripted still hook
        await trace()
        url = await ev('window.__still({ samples: 2, w: 320, h: 180 })')
        t4 = [r for r in await trace() if r[5].startswith('Still')]
        check('scripted still reports its percentage in the status line', bool(t4) and all(re.match(r'^Still · \d+ % · ', r[5]) and int(r[5].split(' ')[2]) == r[0] for r in t4) and rising(t4) and t4[-1][0] >= 97 and
              any(re.match(r'^Still · \d+ % · \d+ / 2 samples$', r[5]) for r in t4), [r[5] for r in t4][-4:])
        arr = np.asarray(Image.open(io.BytesIO(base64.b64decode(url.split(',', 1)[1]))).convert('L'), dtype=float)
        check('__still resolves valid PNG and leaves Photo off', arr.shape == (180, 320) and arr.mean() > 5 and arr.std() > 5 and not await ev('__photo.on'), (arr.shape, round(float(arr.mean()), 1), round(float(arr.std()), 1)))

        check('no console errors', not errs, errs[:5])
        await ctx.close()
        await b.close()

    print(f'{len(fails)} failed' if fails else 'all passed', flush=True)
    sys.exit(1 if fails else 0)

asyncio.run(main())
