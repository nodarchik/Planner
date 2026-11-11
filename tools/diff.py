"""Compare two screenshot folders. Usage: python3 tools/diff.py baseline shots [tolerance=0.5]
Prints per image: % of pixels differing by more than 8/255 and the mean abs difference. Exit 1 if any image exceeds tolerance (%)."""
import sys, os
import numpy as np
from PIL import Image
a, b = sys.argv[1], sys.argv[2]; tol = float(sys.argv[3]) if len(sys.argv) > 3 else 0.5; bad = 0
for f in sorted(os.listdir(a)):
    if not f.endswith('.png'): continue
    if not os.path.exists(os.path.join(b, f)): print(f'{f:20s} MISSING'); bad += 1; continue
    x = np.asarray(Image.open(os.path.join(a, f)).convert('RGB'), dtype=np.int16); y = np.asarray(Image.open(os.path.join(b, f)).convert('RGB'), dtype=np.int16)
    if x.shape != y.shape: print(f'{f:20s} SIZE {x.shape} vs {y.shape}'); bad += 1; continue
    d = np.abs(x - y).max(axis=2); pct = (d > 8).mean() * 100
    print(f'{f:20s} {pct:6.2f}% px differ   mean {d.mean():.3f}' + ('   FAIL' if pct > tol else '')); bad += pct > tol
    if pct > tol: os.makedirs('shots/diff', exist_ok=True); Image.fromarray((np.clip(d * 6, 0, 255)).astype(np.uint8)).save(os.path.join('shots/diff', f))
sys.exit(1 if bad else 0)
