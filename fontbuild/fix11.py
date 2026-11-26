import sys
sys.path.insert(0,'/tmp/tk/fontbuild')
from match_marks import pair_table
from fontTools.ttLib import TTFont
from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.pointInsidePen import PointInsidePen
from fontTools.feaLib.builder import addOpenTypeFeaturesFromString
f=TTFont('/tmp/base84/Tankan-Eczar-Regular.ttf');gs=f.getGlyphSet();cm=f.getBestCmap();hm=f['hmtx'];P=pair_table(f)
def B(g):
    bp=BoundsPen(gs);gs[g].draw(bp);return bp.bounds
def ink(g,x,y):
    pen=PointInsidePen(gs,(x,y));gs[g].draw(pen);return pen.getResult()
def hit(x0,x1,y0,y1,pad):
    for y in range(int(y0-pad),int(y1+pad)+1,6):
        for x in range(int(x0-pad),int(x1+pad)+1,6):
            if ink('matraI.dv',x,y):return True
    return False
rules=[];PAD=24
C33='Ka Kha Ga Gha Nga Ca Cha Ja Jha Nya Tta Ttha Dda Ddha Nna Ta Tha Da Dha Na Pa Pha Ba Bha Ma Ya Ra La Va Sha Ssa Sa Ha'.split()
OK={c+'.dv' for c in C33}
for k,c in (('b','a'),('c','\u00a1')):
    mg=cm[ord(c)];m=B(mg)
    cons=[g for (g,s) in P if s==mg and g.endswith('.dv') and g in OK]
    for g in cons:
        dx,dy=P[(g,mg)];off=hm['matraI.dv'][0]+hm[g][0]+dx
        d=0
        while hit(off+m[0]+d,off+m[2]+d,m[1]+dy,m[3]+dy,PAD) and d<200: d+=6
        if 0<d: rules.append((g,mg,d))
print(len(rules),[(g,d) for g,_,d in rules][:40])
fea='languagesystem DFLT dflt;\nlanguagesystem latn dflt;\nfeature kern {\n'+'\n'.join(f'pos {g} <0 0 0 0> {s} <{dx} {dy} 0 0>;' for (g,s),(dx,dy) in P.items())+'\n} kern;\n'
fea+='feature kern {\n'+'\n'.join(f"pos matraI.dv {g} {mg}' <{d} 0 0 0>;" for g,mg,d in rules)+'\n} kern;\n'
del f['GPOS'];addOpenTypeFeaturesFromString(f,fea,tables=['GPOS'])
import os;os.makedirs('/tmp/new11',exist_ok=True);f.save('/tmp/new11/Tankan-Eczar-Regular.ttf')
