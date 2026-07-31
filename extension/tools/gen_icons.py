#!/usr/bin/env python3
"""Generate simple PNG icons (16/32/48/128) for the Chrome extension without PIL.
Draws a minimal "fish" glyph on a rounded blue-green gradient tile.
Pure stdlib (struct + zlib) PNG encoder, RGBA.
"""
import struct
import zlib
import os

OUT = os.path.join(os.path.dirname(__file__), os.pardir, 'icons')
os.makedirs(OUT, exist_ok=True)


def write_png(path, size, get_pixel):
    """get_pixel(x, y) -> (r,g,b,a) for x,y in [0,size)."""
    # supersample 2x2 for smoother edges
    ss = 2
    rows = b''
    for y in range(size):
        row = b'\x00'  # filter: none
        for x in range(size):
            r = g = b = a = 0
            n = 0
            for yy in range(ss):
                for xx in range(ss):
                    fx = min(x * ss + xx, size * ss - 1)
                    fy = min(y * ss + yy, size * ss - 1)
                    # rr -> 0..1
                    px = fx / (size * ss)
                    py = fy / (size * ss)
                    pr, pg, pb, pa = get_pixel(px, py)
                    r += pr
                    g += pg
                    b += pb
                    a += pa
                    n += 1
            row += struct.pack('4B', round(r / n), round(g / n), round(b / n), round(a / n))
        rows += row

    def chunk(typ, data):
        c = struct.pack('>I', len(data)) + typ + data
        return c + struct.pack('>I', zlib.crc32(typ + data) & 0xffffffff)

    sig = b'\x89PNG\r\n\x1a\n'
    ihdr = chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 6, 0, 0, 0))
    idat = chunk(b'IDAT', zlib.compress(rows, 9))
    iend = chunk(b'IEND', b'')
    with open(path, 'wb') as f:
        f.write(sig + ihdr + idat + iend)


def rounded_bg(px, py, size01):
    """Blue-green gradient rounded-square tile. size01 in [0,1] of tile width."""
    # normalise to tile square, rounded rect radius about 0.22 of size
    r = 0.22
    def inside(px_, py_):
        # center the rounded rect to fill near full tile
        x0, x1 = r * 0.3, 1.0 - r * 0.3
        y0, y1 = r * 0.3, 1.0 - r * 0.3
        if x0 + r <= px_ <= x1 - r or y0 + r <= py_ <= y1 - r:
            return (x0 <= px_ <= x1 and y0 <= py_ <= y1)
        # corners
        cx = x1 - r if px_ > x1 - r else x0 + r
        cy = y1 - r if py_ > y1 - r else y0 + r
        return (px_ - cx) ** 2 + (py_ - cy) ** 2 <= r * r

    if not inside(px, py):
        return (0, 0, 0, 0)
    # gradient from teal top-left to blue bottom-right
    t = (px + py) / 2.0
    br = int(26 + 40 * t)
    bg = int(120 + 80 * (1 - t))
    bb = int(190 + 40 * (1 - t))
    return (br, bg, bb, 255)


def make_icon(px, py):
    base = rounded_bg(px, py, 1.0)
    if base[3] == 0:
        return base
    # Draw a simple fish glyph relative to tile coordinates (0..1)
    # body is an ellipse-ish blob
    cx, cy, rx, ry = 0.42, 0.5, 0.17, 0.11
    dx, dy = (px - cx) / rx, (py - cy) / ry
    if dx * dx + dy * dy <= 1.0:
        return (255, 255, 255, 255)
    # tail triangle on the right
    # apex at tail point (0.78,0.5), base near body
    tail_px = px - 0.60
    t = (0.60 - 0.30)
    tail_y = 0.5 + (py - 0.5)
    # approximate tail as a triangle: (0.6,0.36) (0.6,0.64) (0.82,0.5)
    # barycentric
    p0 = (0.60, 0.36)
    p1 = (0.60, 0.64)
    p2 = (0.82, 0.50)
    denom = (p1[1] - p2[1]) * (p0[0] - p2[0]) + (p2[0] - p1[0]) * (p0[1] - p2[1])
    a = ((p1[1] - p2[1]) * (px - p2[0]) + (p2[0] - p1[0]) * (py - p2[1])) / denom
    b = ((p2[1] - p0[1]) * (px - p2[0]) + (p0[0] - p2[0]) * (py - p2[1])) / denom
    c = 1 - a - b
    if a >= 0 and b >= 0 and c >= 0:
        return (255, 255, 255, 255)
    # eye
    ex, ey, er = 0.36, 0.45, 0.030
    if (px - ex) ** 2 + (py - ey) ** 2 <= er * er:
        return (44, 62, 80, 255)
    return base


for size in (16, 32, 48, 128):
    write_png(os.path.join(OUT, 'icon%d.png' % size), size, make_icon)
    print('wrote icon%d.png' % size)
