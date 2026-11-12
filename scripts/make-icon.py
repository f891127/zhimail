"""生成知邮 ZhiMail 应用图标：蓝色渐变圆角方块 + 信封 + 折角星芒（AI 提示）。"""

from PIL import Image, ImageDraw
import os

SIZE = 1024
OUT_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "build")
os.makedirs(OUT_DIR, exist_ok=True)


def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


TOP = (74, 136, 220)      # #4A88DC
BOTTOM = (22, 74, 141)    # #164A8D


def make_gradient(size):
    img = Image.new("RGB", (size, size))
    draw = ImageDraw.Draw(img)
    for y in range(size):
        color = lerp(TOP, BOTTOM, y / max(1, size - 1))
        draw.line([(0, y), (size, y)], fill=color)
    return img


def rounded_mask(size, radius):
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, size - 1, size - 1], radius=radius, fill=255)
    return mask


canvas = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
gradient = make_gradient(SIZE).convert("RGBA")
mask = rounded_mask(SIZE, int(SIZE * 0.22))
canvas.paste(gradient, (0, 0), mask)

draw = ImageDraw.Draw(canvas)

# 信封主体
left, right = SIZE * 0.19, SIZE * 0.81
top, bottom = SIZE * 0.29, SIZE * 0.71
radius = SIZE * 0.045
line_width = int(SIZE * 0.048)
white = (255, 255, 255, 255)

draw.rounded_rectangle(
    [left, top, right, bottom],
    radius=radius,
    outline=white,
    width=line_width,
)

# 信封折线（V 形）
draw.line([(left + line_width * 0.6, top + line_width * 0.6), (SIZE * 0.5, SIZE * 0.545)], fill=white, width=line_width)
draw.line([(right - line_width * 0.6, top + line_width * 0.6), (SIZE * 0.5, SIZE * 0.545)], fill=white, width=line_width)

# 折角星芒（右上角）
cx, cy = SIZE * 0.735, SIZE * 0.295
outer, inner = SIZE * 0.085, SIZE * 0.026
points = []
import math
for i in range(8):
    angle = math.pi / 4 * i - math.pi / 2
    r = outer if i % 2 == 0 else inner
    points.append((cx + r * math.cos(angle), cy + r * math.sin(angle)))
draw.polygon(points, fill=(255, 255, 255, 255))

# 底部小圆点装饰（三个），呼应「摘要要点」
for idx, x in enumerate([SIZE * 0.40, SIZE * 0.50, SIZE * 0.60]):
    r = SIZE * 0.016
    draw.ellipse([x - r, SIZE * 0.775 - r, x + r, SIZE * 0.775 + r], fill=(255, 255, 255, 205))

canvas.save(os.path.join(OUT_DIR, "icon.png"))
canvas.resize((256, 256), Image.LANCZOS).save(os.path.join(OUT_DIR, "icon-256.png"))

sizes = [(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
canvas.save(os.path.join(OUT_DIR, "icon.ico"), sizes=sizes)
print("icon written to", OUT_DIR)
