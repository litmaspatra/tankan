from fontTools.ttLib import TTFont
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.areaPen import AreaPen
from fontTools.pens.cu2quPen import Cu2QuPen
from fontTools.misc.transform import Transform
import pathops, json

SRC='/downloads/tankan/fonts/Tankan-Remington-Regular.ttf'
BASE='Mukta-Bold.ttf'; REG='Mukta-Regular.ttf'
OUT='Tankan-Clean-v4-BoldWide.ttf'
WIDEN=1.08; SPACE=340
KEEP_EXTRA={'Bindu.dv','Visarga.dv','Vattu.dv'}  # his hand corrections
missing=set(json.load(open('tankan-glyphs-missing-in-mukta.json')))
KEEP = missing | KEEP_EXTRA

tank=TTFont(SRC); base=TTFont(BASE); reg=TTFont(REG)
tglyf=tank['glyf']; thmtx=tank['hmtx'].metrics; torder=tank.getGlyphOrder()
bglyf=base['glyf']; bhmtx=base['hmtx'].metrics; bset=set(base.getGlyphOrder())

def to_path(g, glyf):
    p=pathops.Path(); p.fillType=pathops.FillType.WINDING
    g.draw(p.getPen(), glyf); return p
def area(p):
    ap=AreaPen(); p.draw(ap); return abs(ap.value)
def embolden(g, glyf, w):
    p=to_path(g,glyf)
    stroked=p.stroke(w, pathops.LineCap.ROUND_CAP, pathops.LineJoin.ROUND_JOIN, 4.0)
    u=pathops.op(p, stroked, pathops.PathOp.UNION) if not isinstance(stroked, type(None)) else None
    return u
# check stroke returns new path vs in-place
_test=to_path(reg['glyf']['Ka.dv'], reg['glyf'])
_r=_test.stroke(40, pathops.LineCap.ROUND_CAP, pathops.LineJoin.ROUND_JOIN, 4.0)
print('stroke returns new path:', _r is not None)

# calibrate w: match Mukta Bold dvKA ink area
def embolden_glyph(g, glyf, w):
    p=to_path(g,glyf)
    s=to_path(g,glyf)
    s.stroke(w, pathops.LineCap.ROUND_CAP, pathops.LineJoin.ROUND_JOIN, 4.0)
    p.convertConicsToQuads(); s.convertConicsToQuads()
    p.fillType=pathops.FillType.WINDING; s.fillType=pathops.FillType.WINDING
    u=pathops.op(p, s, pathops.PathOp.UNION)
    u=u.transform(1,0,0,1,w/2.0,0)
    return u
target=area(to_path(bglyf['Ka.dv'], bglyf))
best=None
for w in [24,32,40,48,56]:
    u=embolden_glyph(reg['glyf']['Ka.dv'], reg['glyf'], w)
    a=area(u); 
    print('w',w,'area',round(a),'target',round(target))
    if best is None or abs(a-target)<abs(best[1]-target): best=(w,a)
W=best[0]; print('chosen w',W)

# 1. replace non-kept with Mukta Bold
replaced=kept=0
for gname in torder:
    if gname in bset and gname not in KEEP:
        pen=TTGlyphPen(tglyf); bglyf[gname].draw(pen, bglyf); tglyf[gname]=pen.glyph()
        thmtx[gname]=bhmtx[gname]; replaced+=1
    else:
        kept+=1
print('replaced',replaced,'kept',kept)

# 2. embolden kept customs+corrections
emb=0
for gname in torder:
    if gname in KEEP:
        g=tglyf[gname]
        if g.numberOfContours==0 and not g.isComposite(): continue
        u=embolden_glyph(g, tglyf, W)
        pen=TTGlyphPen(tglyf); c=Cu2QuPen(pen, 1.0); u.draw(c)
        tglyf[gname]=pen.glyph()
        adv,lsb=thmtx[gname]; thmtx[gname]=(adv, lsb)  # lsb preserved by +w/2 shift
        emb+=1
print('emboldened kept glyphs:',emb)

# 3. widen all
for gname in torder:
    g=tglyf[gname]
    pen=TTGlyphPen(tglyf); tp=TransformPen(pen, Transform(WIDEN,0,0,1,0,0))
    g.draw(tp, tglyf); tglyf[gname]=pen.glyph()
    adv,lsb=thmtx[gname]; thmtx[gname]=(int(round(adv*WIDEN)), int(round(lsb*WIDEN)))
if 'space' in thmtx: thmtx['space']=(SPACE, thmtx['space'][1])

tank['name'].setName('Version 0.4; Tankan Clean (Mukta Bold base, widened, bold-matched customs)',5,3,1,0x409)
tank['name'].setName('Version 0.4; Tankan Clean (Mukta Bold base, widened, bold-matched customs)',5,1,0,0)
tank.save(OUT); print('saved',OUT)
