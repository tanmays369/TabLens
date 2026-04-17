from PIL import Image, ImageDraw
import os
import math

OUT_DIR = os.path.dirname(os.path.abspath(__file__))
SIZES = [16, 32, 48, 128]


def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(len(a)))


def make_icon(size):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    radius = int(size * 0.22)
    c1 = (124, 156, 255, 255)
    c2 = (179, 136, 255, 255)

    bg = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    for y in range(size):
        t = y / max(1, size - 1)
        color = lerp(c1, c2, t)
        ImageDraw.Draw(bg).line([(0, y), (size, y)], fill=color)

    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        [0, 0, size - 1, size - 1], radius=radius, fill=255
    )
    img.paste(bg, (0, 0), mask)

    draw = ImageDraw.Draw(img)
    cx = size * 0.44
    cy = size * 0.44
    r_outer = size * 0.28
    stroke = max(2, int(size * 0.09))

    draw.ellipse(
        [cx - r_outer, cy - r_outer, cx + r_outer, cy + r_outer],
        outline=(255, 255, 255, 255),
        width=stroke,
    )

    r_inner = size * 0.09
    draw.ellipse(
        [cx - r_inner, cy - r_inner, cx + r_inner, cy + r_inner],
        fill=(255, 255, 255, 255),
    )

    angle = math.radians(45)
    x1 = cx + r_outer * math.cos(angle)
    y1 = cy + r_outer * math.sin(angle)
    x2 = cx + (r_outer + size * 0.22) * math.cos(angle)
    y2 = cy + (r_outer + size * 0.22) * math.sin(angle)
    draw.line(
        [(x1, y1), (x2, y2)],
        fill=(255, 255, 255, 255),
        width=stroke,
    )

    return img


for s in SIZES:
    icon = make_icon(s)
    icon.save(os.path.join(OUT_DIR, f"icon-{s}.png"))
    print(f"wrote icon-{s}.png")
