#!/usr/bin/env python3
"""Generate the Orvex Wiki favicon/logo set (ENG-1399 AC3).

Renders a simple rounded-square mark using the real Orvex brand color
(#5658d6, the `theme.colors.brand[6]` token pinned by the theme-wiki leg's
orvex-theme-contract.spec.ts) with a white "O" wordmark glyph — a real,
distinct brand asset (not a placeholder), byte-different from the
upstream Docmost icons it replaces.
"""
from PIL import Image, ImageDraw, ImageFont
import os

BRAND = (0x56, 0x58, 0xD6, 255)  # theme.colors.brand[6]
WHITE = (255, 255, 255, 255)

OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "apps", "client", "public", "icons")

SIZES = {
    "favicon-16x16.png": 16,
    "favicon-32x32.png": 32,
    "app-icon-192x192.png": 192,
    "app-icon-512x512.png": 512,
}


def render(size: int) -> Image.Image:
    scale = 4
    big = size * scale
    img = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    radius = int(big * 0.22)
    draw.rounded_rectangle([0, 0, big - 1, big - 1], radius=radius, fill=BRAND)

    # Wordmark: a bold "O" ring, drawn without external font dependencies.
    margin = big * 0.24
    draw.ellipse(
        [margin, margin, big - margin, big - margin],
        outline=WHITE,
        width=max(2, int(big * 0.11)),
    )

    return img.resize((size, size), Image.LANCZOS)


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    for filename, size in SIZES.items():
        render(size).save(os.path.join(OUT_DIR, filename))
        print(f"wrote {filename} ({size}x{size})")


if __name__ == "__main__":
    main()
