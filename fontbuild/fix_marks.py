"""Re-centre nukta, bindu and chandrabindu in the Tankan Kruti-encoded fonts.

The legacy encoding draws these marks as zero-advance glyphs placed for one
fixed base width, so they drift on wide or narrow letters. This adds a GPOS
'kern' pair for every base glyph: nukta goes under the middle of the base, and
bindu / chandrabindu go over the base's right-hand stem when they are more
than TOL units off it. Cmap and glyph order are not touched.
Usage: python3 fontbuild/fix_marks.py fonts/Tankan-X-Regular.ttf
"""
import sys
from fontTools.ttLib import TTFont
from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.pointInsidePen import PointInsidePen
from fontTools.feaLib.builder import addOpenTypeFeaturesFromString

TOL = 25
def run(path):
    f = TTFont(path)
    gs = f.getGlyphSet(); hm = f['hmtx']
    def bounds(g):
        bp = BoundsPen(gs); gs[g].draw(bp); return bp.bounds
    def stem_centre(g, b):
        # right-hand stem at mid height: contiguous ink run touching the rightmost ink
        for y in (300, 400, 200, 500):
            pen = PointInsidePen(gs, (0, 0), evenOdd=False)
            xs = []
            x = int(b[0]); 
            ink = []
            while x <= b[2]:
                pen = PointInsidePen(gs, (x, y)); gs[g].draw(pen)
                ink.append(pen.getResult()); x += 4
            if any(ink):
                last = max(i for i, v in enumerate(ink) if v)
                first = last
                while first > 0 and ink[first - 1]: first -= 1
                return b[0] + 4 * (first + last) / 2
        return None
    cm = f.getBestCmap()
    def overlap(g, x0, y0, x1, y1):
        x = x0
        while x <= x1:
            y = y0
            while y <= y1:
                pen = PointInsidePen(gs, (x, y)); gs[g].draw(pen)
                if pen.getResult(): return True
                y += 10
            x += 10
        return False
    name = {c: cm[ord(c)] for c in '+a\u00a1W'}   # nukta, bindu, chandrabindu, chandra
    marks = {'nukta': name['+'], 'bindu': name['a'], 'cb': name['\u00a1']}
    mb = {k: bounds(v) for k, v in marks.items()}
    mc = {k: (mb[k][0] + mb[k][2]) / 2 for k in mb}
    fe = []
    skip = set(marks.values()) | {name['W']}
    lines = []
    for g in f.getGlyphOrder():
        if g in skip or g.startswith('matra') and g not in ('matraA.dv', 'matraIi.dv'):
            continue
        adv = hm[g][0]
        if adv <= 0: continue
        b = bounds(g)
        if not b or b[2] - b[0] < 80: continue
        # nukta: under the middle of the base
        dx = round((b[0] + b[2]) / 2 - (adv + mc['nukta']))
        # keep the dot clear of any foot or spur that hangs below the baseline
        nx0 = adv + mc['nukta'] + dx + mb['nukta'][0] - mc['nukta']
        nx1 = nx0 + (mb['nukta'][2] - mb['nukta'][0])
        low = None
        for y in range(-400, int(mb['nukta'][3]) + 30, 8):
            hit = False
            x = nx0
            while x <= nx1:
                pen = PointInsidePen(gs, (x, y)); gs[g].draw(pen)
                if pen.getResult(): hit = True; break
                x += 12
            if hit: low = y; break
        dy = 0
        if low is not None and low < mb['nukta'][3] + 30:
            dy = round(low - 35 - mb['nukta'][3])
        if dx or dy: lines.append(f'pos {g} <0 0 0 0> {marks["nukta"]} <{dx} {dy} 0 0>;')
        sc = stem_centre(g, b)
        if sc is None: continue
        for k in ('bindu', 'cb'):
            dx = round(sc - (adv + mc[k]))
            dy = 0
            if g == 'matraIi.dv':
                # the ii curl can swallow the mark: lift it clear of the ink above the stem
                cx, cy = sc, (mb[k][1] + mb[k][3]) / 2 + 0
                px = adv + mc[k] + dx
                top = None
                for y in range(1100, 0, -8):
                    pen = PointInsidePen(gs, (sc, y)); gs[g].draw(pen)
                    if pen.getResult(): top = y; break
                pen = PointInsidePen(gs, (px, cy)); gs[g].draw(pen)
                if top is not None and (pen.getResult() or abs(dx) > TOL):
                    want = top + 45
                    if mb[k][1] < want: dy = round(want - mb[k][1])
            if abs(dx) > TOL or dy:
                lines.append(f'pos {g} <0 0 0 0> {marks[k]} <{dx} {dy} 0 0>;')
    # bindu / chandrabindu after the top vowel signs (e, ai): lift clear if they would merge
    for g in ('matraE.dv', 'matraAi.dv'):
        if g not in f.getGlyphOrder(): continue
        b = bounds(g)
        for k in ('bindu', 'cb'):
            m = mb[k]
            if overlap(g, m[0], m[1], m[2], m[3]):
                dx = round((b[0] + b[2]) / 2 - mc[k]); dy = round(b[3] + 40 - m[1])
                lines.append(f'pos {g} <0 0 0 0> {marks[k]} <{dx} {dy} 0 0>;')
    fea = 'languagesystem DFLT dflt;\nlanguagesystem latn dflt;\nfeature kern {\n' + '\n'.join(lines) + '\n} kern;\n'
    addOpenTypeFeaturesFromString(f, fea, tables=['GPOS'])
    f.save(path)
    print(path, len(lines), 'pairs')
if __name__ == '__main__':
    for p in sys.argv[1:]: run(p)
