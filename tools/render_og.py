#!/usr/bin/env python3
"""Render tools/og.html -> assets/img/og.png (1200x630, DPR 1) and the PNG favicons
(assets/img/favicon-32.png, assets/img/apple-touch-icon.png) from assets/img/favicon.svg.

Usage:  python3 tools/render_og.py [og|icons|all]
Needs:  pip install playwright pillow && python3 -m playwright install chromium
        (fonts are the site's self-hosted files in assets/fonts, so no network access is needed)
"""
import asyncio
import io
import os
import sys

from PIL import Image
from playwright.async_api import async_playwright

SITE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OG_HTML = "file://" + SITE + "/tools/og.html"
OG_PNG = SITE + "/assets/img/og.png"
FAV_SVG = SITE + "/assets/img/favicon.svg"
FAV32 = SITE + "/assets/img/favicon-32.png"
APPLE = SITE + "/assets/img/apple-touch-icon.png"


async def render_og(p):
    browser = await p.chromium.launch()
    ctx = await browser.new_context(viewport={"width": 1200, "height": 630}, device_scale_factor=1,
                                    color_scheme="light")
    page = await ctx.new_page()
    msgs = []
    page.on("console", lambda m: msgs.append(f"[console.{m.type}] {m.text}"))
    page.on("pageerror", lambda e: msgs.append(f"[pageerror] {e}"))
    await page.goto(OG_HTML, wait_until="networkidle", timeout=60000)
    await page.wait_for_selector("body[data-ready]", timeout=20000)
    fonts = await page.evaluate("[...document.fonts].filter(f=>f.status==='loaded').map(f=>f.family+' '+f.weight)")
    print("fonts loaded:", fonts)
    png = await page.screenshot(clip={"x": 0, "y": 0, "width": 1200, "height": 630})
    await browser.close()
    for m in msgs:
        print(m)
    im = Image.open(io.BytesIO(png)).convert("RGB")
    assert im.size == (1200, 630), im.size
    # Try lossless first; fall back to a 256-colour palette if it is too heavy.
    buf = io.BytesIO()
    im.save(buf, "PNG", optimize=True)
    data = buf.getvalue()
    if len(data) > 300_000:
        buf = io.BytesIO()
        im.quantize(colors=256, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.FLOYDSTEINBERG).save(buf, "PNG", optimize=True)
        data = buf.getvalue()
    with open(OG_PNG, "wb") as f:
        f.write(data)
    print(f"og.png {im.size} {len(data)/1024:.1f} KB")


async def render_svg(p, size, transparent=True):
    """Rasterise favicon.svg (light variant) at `size` px, transparent background."""
    svg = open(FAV_SVG).read()
    html = ("<!doctype html><html><head><style>html,body{margin:0;background:transparent}"
            f"svg{{display:block;width:{size}px;height:{size}px}}</style></head><body>{svg}</body></html>")
    browser = await p.chromium.launch()
    ctx = await browser.new_context(viewport={"width": size, "height": size}, device_scale_factor=1,
                                    color_scheme="light")
    page = await ctx.new_page()
    await page.set_content(html)
    png = await page.screenshot(clip={"x": 0, "y": 0, "width": size, "height": size}, omit_background=transparent)
    await browser.close()
    return Image.open(io.BytesIO(png)).convert("RGBA")


async def render_icons(p):
    big = await render_svg(p, 512)
    # favicon-32: transparent, downsampled from 512 for clean anti-aliasing
    fav = big.resize((32, 32), Image.LANCZOS)
    fav.save(FAV32, "PNG", optimize=True)
    # apple-touch-icon: 180x180 white, mark at ~66% with comfortable padding
    canvas = Image.new("RGBA", (180, 180), (255, 255, 255, 255))
    mark = big.resize((120, 120), Image.LANCZOS)
    canvas.alpha_composite(mark, (30, 30))
    canvas.convert("RGB").save(APPLE, "PNG", optimize=True)
    for path in (FAV32, APPLE):
        im = Image.open(path)
        print(os.path.basename(path), im.size, im.mode, f"{os.path.getsize(path)/1024:.1f} KB")


async def main(what):
    async with async_playwright() as p:
        if what in ("og", "all"):
            await render_og(p)
        if what in ("icons", "all"):
            await render_icons(p)


if __name__ == "__main__":
    asyncio.run(main(sys.argv[1] if len(sys.argv) > 1 else "all"))
