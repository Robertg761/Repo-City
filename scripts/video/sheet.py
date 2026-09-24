import sys, os
from PIL import Image, ImageDraw
d, n = sys.argv[1], int(sys.argv[2]) if len(sys.argv) > 2 else 12
fs = sorted(os.listdir(d)); fs = [f for f in fs if f.endswith('.jpg')]
pick = [fs[int(i*(len(fs)-1)/(n-1))] for i in range(n)]
W, H = 480, 270; cols = 3; rows = (n + cols - 1)//cols
out = Image.new('RGB', (W*cols, H*rows))
for i, f in enumerate(pick):
    im = Image.open(os.path.join(d, f)).resize((W, H))
    ImageDraw.Draw(im).text((6, 6), f, fill=(255, 255, 0))
    out.paste(im, ((i % cols)*W, (i//cols)*H))
out.save(sys.argv[3] if len(sys.argv) > 3 else '/tmp/sheet.jpg', quality=85)
