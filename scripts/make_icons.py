"""Generate the KexGo app icon set from a tiny vector-ish composition."""
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
ICONS = ROOT / 'src-tauri' / 'icons'
ICONS.mkdir(parents=True, exist_ok=True)

BG = (200, 245, 106, 255)
INK = (14, 18, 11, 255)


def icon_at(size: int) -> Image.Image:
    scale = 8
    canvas = size * scale
    image = Image.new('RGBA', (canvas, canvas), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    radius = int(canvas * 0.23)
    draw.rounded_rectangle((0, 0, canvas - 1, canvas - 1), radius=radius, fill=BG)

    # Hand-tuned K mark, matching the in-app logo.
    stroke = int(canvas * 0.115)
    left = int(canvas * 0.28)
    top = int(canvas * 0.22)
    bottom = int(canvas * 0.78)
    draw.line((left, top, left, bottom), fill=INK, width=stroke)
    center_y = int(canvas * 0.51)
    elbow = int(canvas * 0.53)
    right = int(canvas * 0.75)
    draw.line((left + stroke // 2, center_y, elbow, int(canvas * 0.29)), fill=INK, width=stroke)
    draw.line((left + stroke // 2, center_y, right, int(canvas * 0.77)), fill=INK, width=stroke)
    return image.resize((size, size), Image.Resampling.LANCZOS)


sizes = [16, 32, 48, 64, 128, 256, 512]
images = {size: icon_at(size) for size in sizes}
for size in [32, 128, 256, 512]:
    images[size].save(ICONS / f'{size}x{size}.png')
images[256].save(ICONS / '128x128@2x.png')
images[128].save(ICONS / '128x128.png')
images[32].save(ICONS / '32x32.png')
images[512].save(ICONS / 'icon.png')
# ICO supports multi-resolution; Pillow takes a list of sizes.
images[512].save(ICONS / 'icon.ico', format='ICO', sizes=[(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
print('icons written to', ICONS)
