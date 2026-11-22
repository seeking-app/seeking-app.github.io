"""QUAERENS 尋道 logo generator. The road (道) sets out from the foot of the Cross, runs anticlockwise
(chevrons mark the direction) and returns to it, stopping just short: Christ is the Way, start and end
(Jn 14:6; exitus-reditus); quaerens = still seeking, so the gap must stay visible at every size.
Geometry rebuilt from Fr. Gervais's concept (22 Nov 2026). Units: 1000 x 1000 viewBox."""
import math, os, subprocess

# Marian palette of the app and site (2026-11-19)
NAVY = "#26457E"   # Marian blue
CREAM = "#F3F2EE"  # paper
GOLD = "#A8842F"
CX = CY = 500.0

def pt(r, deg):
    t = math.radians(deg)
    return CX + r * math.cos(t), CY - r * math.sin(t)

def f(p):
    return f"{p[0]:.2f},{p[1]:.2f}"

def mark(fg, w=45, chevrons=True, cut=15):   # line weight 4.5% (decided 22 Nov 2026)
    """Return SVG elements (no wrapper) for the mark in colour fg."""
    rc = 425.0
    ro, ri = rc + w / 2, rc - w / 2
    # The arrow stops short of the stem by a gap proportional to the stroke: the seeker has not yet arrived.
    tip_x = 500 - w / 2 - 0.8 * w
    tip = 360 - math.degrees(math.acos((tip_x - 500) / rc))   # arrow point on the centreline
    end = tip - 2.7 * (w / 30) ** 0.5                        # where the band's edges stop
    p = (f"M{f(pt(ro,270))} A{ro},{ro} 0 1 0 {f(pt(ro,end))} "
         f"L{f(pt(rc,tip))} L{f(pt(ri,end))} A{ri},{ri} 0 1 1 {f(pt(ri,270))} Z")
    hw = w / 2
    stem = f'<rect x="{500-hw}" y="{211}" width="{w}" height="{CY+math.sqrt(ro**2-hw**2)-211:.2f}"/>'
    bar = f'<rect x="347" y="{378-hw}" width="306" height="{w}"/>'
    body = f'<path d="{p}"/>{stem}{bar}'
    if not chevrons:
        return f'<g fill="{fg}">{body}</g>'
    # chevron cuts, apex pointing in the direction of travel (anticlockwise)
    cuts = []
    d = 2.4 * w / 30
    for a in (0, 90, 180):
        o, c, i = pt(ro + 12, a - d * 0.4), pt(rc, a + d), pt(ri - 12, a - d * 0.4)
        cuts.append(f'<polyline points="{f(o)} {f(c)} {f(i)}"/>')
    m = ('<mask id="q-cuts" maskUnits="userSpaceOnUse" x="0" y="0" width="1000" height="1000">'
         '<rect width="1000" height="1000" fill="#fff"/>'
         f'<g fill="none" stroke="#000" stroke-width="{cut}" stroke-linejoin="miter">{"".join(cuts)}</g></mask>')
    return f'<defs>{m}</defs><g fill="{fg}" mask="url(#q-cuts)">{body}</g>'

def svg(inner, bg=None, scale=1.0, rx=0):
    s = scale
    g = f'<g transform="translate({500-500*s:.2f} {500-500*s:.2f}) scale({s})">{inner}</g>' if s != 1 else inner
    b = f'<rect width="1000" height="1000" rx="{rx}" fill="{bg}"/>' if bg else ""
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000">{b}{g}</svg>\n'

def out(name, text):
    with open(name, "w") as fh:
        fh.write(text)

def png(src, dst, size):
    subprocess.run(["rsvg-convert", "-w", str(size), "-h", str(size), src, "-o", dst], check=True)

os.makedirs("dist/svg", exist_ok=True); os.makedirs("dist/png", exist_ok=True); os.makedirs("dist/icons", exist_ok=True)

# Masters
out("dist/svg/quaerens-logo.svg", svg(mark(CREAM), NAVY))                  # as the concept
out("dist/svg/quaerens-mark-navy.svg", svg(mark(NAVY)))                    # transparent, on light grounds
out("dist/svg/quaerens-mark-cream.svg", svg(mark(CREAM)))                  # transparent, on dark grounds
out("dist/svg/quaerens-mark-black.svg", svg(mark("#000")))                 # print / stamps
out("dist/svg/quaerens-mark-gold.svg", svg(mark(GOLD)))                    # accents, print on paper
# Small-size cut: heavier strokes, no chevrons (they vanish below ~64 px)
small = mark(CREAM, w=84, chevrons=False)
out("dist/svg/quaerens-small.svg", svg(small, NAVY, 0.92))

# App icons
out("tmp-any.svg", svg(mark(CREAM), NAVY, 0.84))
out("tmp-maskable.svg", svg(mark(CREAM, w=51, cut=17), NAVY, 0.74))        # inside the 80% safe circle
out("tmp-mid.svg", svg(mark(CREAM), NAVY, 0.84))
for s in (192, 512): png("tmp-any.svg", f"dist/icons/icon-{s}.png", s)
for s in (192, 512): png("tmp-maskable.svg", f"dist/icons/icon-maskable-{s}.png", s)
png("tmp-mid.svg", "dist/icons/apple-touch-icon.png", 180)
png("dist/svg/quaerens-small.svg", "dist/icons/favicon-32.png", 32)
png("dist/svg/quaerens-small.svg", "dist/icons/favicon-16.png", 16)
png("dist/svg/quaerens-small.svg", "fav-48.png", 48)
out("dist/icons/favicon.svg", svg(small, NAVY, 0.92).replace('<rect width="1000" height="1000" rx="0"', '<rect width="1000" height="1000" rx="180"'))
from PIL import Image
Image.open("fav-48.png").save("dist/icons/favicon.ico", sizes=[(16, 16), (32, 32), (48, 48)])
for n in ("quaerens-logo", "quaerens-mark-navy", "quaerens-mark-cream", "quaerens-mark-gold"):
    png(f"dist/svg/{n}.svg", f"dist/png/{n}-1024.png", 1024)
print("done")
