"""Shared Chromium launcher. SHOT_GPU=1 uses the real GPU; CHROME_PATH or /opt/pw-browsers/chromium if present, else Playwright's own Chromium."""
import os
async def launch(p):
    exe = os.environ.get('CHROME_PATH') or ('/opt/pw-browsers/chromium' if os.path.exists('/opt/pw-browsers/chromium') else None)
    if os.environ.get('SHOT_GPU') == '1':
        args = ["--ignore-gpu-blocklist", "--enable-gpu-rasterization"] + (["--use-angle=metal"] if os.uname().sysname == 'Darwin' else [])
    else:
        args = ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
    return await p.chromium.launch(executable_path=exe, args=args)
