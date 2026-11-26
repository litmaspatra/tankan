"""Make every Tankan font place nukta, bindu and chandrabindu like the reference font
(Tankan Clean, already positioned by fix_marks.py), glyph by glyph.

For each base glyph the reference gives where the mark sits as a fraction of the
base's ink width and as a gap from the base's top (bindu) or bottom (nukta). The same
fractions and gaps are applied in the target font, so the marks follow one rule in all
six fonts. Usage: python3 fontbuild/match_marks.py REF_FINAL.ttf ORIGINAL_TARGET.ttf OUT.ttf
"""
import sys
from fontTools.ttLib import TTFont
from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.pointInsidePen import PointInsidePen
from fontTools.feaLib.builder import addOpenTypeFeaturesFromString

def pair_table(f):
    out = {}
    if 'GPOS' not in f: return out
    for lk in f['GPOS'].table.LookupList.Lookup:
        for sub in lk.SubTable:
            if sub.Format == 1:
                for g, ps in zip(sub.Coverage.glyphs, sub.PairSet):
                    for pv in ps.PairValueRecord:
                        v = pv.Value2
                        out[(g, pv.SecondGlyph)] = (getattr(v, 'XPlacement', 0) or 0, getattr(v, 'YPlacement', 0) or 0)
    return out

def run(ref_path, src_path, out_path):
    R = TTFont(ref_path); F = TTFont(src_path)
    rg, fg = R.getGlyphSet(), F.getGlyphSet()
    def B(gs, g):
        bp = BoundsPen(gs); gs[g].draw(bp); return bp.bounds
    rc, fc = R.getBestCmap(), F.getBestCmap()
    P = pair_table(R)
    marks = {'nukta': '+', 'bindu': 'a', 'cb': '\u00a1'}
    rm = {k: rc[ord(c)] for k, c in marks.items()}
    fm = {k: fc[ord(c)] for k, c in marks.items()}
    rmb = {k: B(rg, v) for k, v in rm.items()}
    fmb = {k: B(fg, v) for k, v in fm.items()}
    ford = set(F.getGlyphOrder())
    lines = []
    for g in R.getGlyphOrder():
        if g not in ford or g in rm.values() or g in fm.values(): continue
        radv, fadv = R['hmtx'][g][0], F['hmtx'][g][0]
        rb, fb = B(rg, g), B(fg, g)
        if not rb or not fb or rb[2] - rb[0] < 60 or fb[2] - fb[0] < 60: continue
        if radv <= 0 and not g.startswith('matra'): continue
        rw, fw = rb[2] - rb[0], fb[2] - fb[0]
        for k in ('nukta', 'bindu', 'cb'):
            if k == 'nukta' and g.startswith('matra'): continue
            dx, dy = P.get((g, rm[k]), (0, 0))
            mb = rmb[k]
            cx = radv + (mb[0] + mb[2]) / 2 + dx            # reference mark centre
            frac = (cx - rb[0]) / rw
            if k == 'nukta':
                gap = (mb[3] + dy) - rb[1]                    # mark top vs base bottom
            else:
                gap = (mb[1] + dy) - rb[3]                    # mark bottom vs base top
            nb = fmb[k]
            ndx = round(fb[0] + frac * fw - (fadv + (nb[0] + nb[2]) / 2))
            if k == 'nukta': ndy = round(fb[1] + gap - nb[3])
            else: ndy = round(fb[3] + gap - nb[1])
            if k != 'nukta':
                # never let the mark merge into the base or its vowel sign: lift it clear
                x0 = fadv + nb[0] + ndx; x1 = fadv + nb[2] + ndx
                y0 = nb[1] + ndy; y1 = nb[3] + ndy
                def inside(x, y):
                    pen = PointInsidePen(fg, (x, y)); fg[g].draw(pen); return pen.getResult()
                hit = any(inside(x, y) for x in range(int(x0), int(x1) + 1, 10) for y in range(int(y0), int(y1) + 1, 10))
                if hit:
                    top = None
                    for y in range(1300, 0, -8):
                        if any(inside(x, y) for x in range(int(x0), int(x1) + 1, 10)): top = y; break
                    if top is not None: ndy = round(top + 40 - nb[1])
            if abs(ndx) > 2 or abs(ndy) > 2:
                lines.append(f'pos {g} <0 0 0 0> {fm[k]} <{ndx} {ndy} 0 0>;')
    fea = 'languagesystem DFLT dflt;\nlanguagesystem latn dflt;\nfeature kern {\n' + '\n'.join(lines) + '\n} kern;\n'
    addOpenTypeFeaturesFromString(F, fea, tables=['GPOS'])
    F.save(out_path)
    print(out_path, len(lines), 'pairs')

if __name__ == '__main__':
    run(*sys.argv[1:4])
