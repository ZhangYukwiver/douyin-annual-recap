# 程序化生成 02 章羊皮纸 assets/evidence-paper.png（不裁设计稿）：
# 5x4 色场为 PIL 实测自 assets/reference/pages/page-02-hi.png 纸面（196,124)-(1464,912），
# 多尺度噪声振幅按"截图 vs 原稿同区 std"校准（清洁区 overall/fine ≈ 3.2/2.2，显示端有衰减故略超）。
# 用法：python3 scripts/gen-evidence-paper.py && cp evidence-paper.png src/components/workspace/assets/
from PIL import Image, ImageFilter
import random, math, statistics

W, H = 1268, 788
GRID = [
    [(213, 194, 170), (224, 207, 185), (225, 209, 187), (223, 206, 185), (216, 199, 177)],
    [(212, 193, 169), (229, 213, 192), (229, 213, 193), (224, 207, 187), (214, 196, 176)],
    [(216, 198, 175), (227, 211, 191), (228, 212, 191), (222, 205, 185), (215, 198, 177)],
    [(211, 191, 167), (222, 204, 183), (222, 205, 184), (218, 200, 179), (212, 194, 173)],
]

# 色场：5x4 -> 双三次放大
field = Image.new("RGB", (5, 4))
for y, line in enumerate(GRID):
    for x, c in enumerate(line):
        field.putpixel((x, y), c)
field = field.resize((W, H), Image.BICUBIC)

rng = random.Random(7)

def noise_layer(nw, nh, blur):
    img = Image.frombytes("L", (nw, nh), bytes(rng.randrange(256) for _ in range(nw * nh)))
    if blur:
        img = img.filter(ImageFilter.GaussianBlur(blur))
    return img.resize((W, H), Image.BILINEAR)

# 振幅参数（迭代校准用）
COARSE_A = 11.0   # 大斑块
MED_A = 7.0      # 中斑块
FINE_A = 8.5     # 细颗粒
FIBER_A = 3.0    # 横向纤维

coarse = noise_layer(46, 29, 1.4).load()
med = noise_layer(120, 75, 1.1).load()
fine = noise_layer(W, H, 0.5).load()
fiber = noise_layer(210, H // 2, 0.8).load()

base = field.load()
out = Image.new("RGB", (W, H))
op = out.load()
for y in range(H):
    for x in range(W):
        r, g, b = base[x, y]
        d = (coarse[x, y] - 128) / 128 * COARSE_A + (med[x, y] - 128) / 128 * MED_A \
            + (fine[x, y] - 128) / 128 * FINE_A + (fiber[x, y] - 128) / 128 * FIBER_A
        # 噪声偏暖：暗斑更褐
        op[x, y] = (int(max(0, min(255, r + d * 1.06))), int(max(0, min(255, g + d))), int(max(0, min(255, b + d * 0.88))))

out.save("evidence-paper.png", optimize=True)
print("saved evidence-paper.png")

import os, sys
if not os.path.exists("mock02.png"):
    sys.exit(0)  # 自检需要裁好的原稿纸面快照，缺席时跳过

# 自检：与原稿同法测 std
def zone_stats(img, x0, x1, y0, y1):
    px = img.load()
    lum = [(px[x, y][0] + px[x, y][1] + px[x, y][2]) / 3 for x in range(x0, x1, 2) for y in range(y0, y1, 2)]
    crop = img.crop((x0, y0, x1, y1)).convert("L")
    blur = crop.filter(ImageFilter.GaussianBlur(4))
    c = list(crop.getdata()); bl = list(blur.getdata())
    fine_std = statistics.pstdev([ci - bi for ci, bi in zip(c, bl)])
    return round(statistics.pstdev(lum), 1), round(fine_std, 1), round(sum(lum) / len(lum))

# 对应原稿 bottom 区（相对纸面 204..704 x 682..720）
print("gen bottom  std/fine/mean:", zone_stats(out, 204, 704, 682, 720))
print("gen center  std/fine/mean:", zone_stats(out, 500, 800, 300, 360))
mo = Image.open("mock02.png").convert("RGB")
mo_paper = mo.crop((196, 124, 1464, 912))
print("mock bottom std/fine/mean:", zone_stats(mo_paper, 204, 704, 682, 720))
print("mock center std/fine/mean:", zone_stats(mo_paper, 500, 800, 300, 360))
