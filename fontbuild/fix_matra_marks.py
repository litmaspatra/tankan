import sys
sys.path.insert(0,'/tmp/tk/fontbuild')
from match_marks import pair_table
from fontTools.ttLib import TTFont
from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.pointInsidePen import PointInsidePen
from fontTools.feaLib.builder import addOpenTypeFeaturesFromString
def load(n):
    f=TTFont(f'/tmp/tk/fonts/Tankan-{n}-Regular.ttf');return f
def info(f):
    gs=f.getGlyphSet();cm=f.getBestCmap()
    def B(g):
        bp=BoundsPen(gs);gs[g].draw(bp);return bp.bounds
    return gs,cm,B,pair_table(f)
E=load('Eczar');egs,ecm,eB,eP=info(E)
eT=eB('Ka.dv')[3]
n=sys.argv[1];f=load(n);gs,cm,B,P=info(f);T=B('Ka.dv')[3]
new=dict(P);cnt=[]
for k,c in (('b','a'),('c','\u00a1')):
    em=ecm[ord(c)];emb=eB(em);fm=cm[ord(c)];fmb=B(fm)
    for g in f.getGlyphOrder():
        if not (g.startswith('matra') or g.startswith('vowel')) or g not in egs.keys(): continue
        eb=eB(g);b=B(g)
        if not eb or not b: continue
        egap=emb[1]+eP.get((g,em),(0,0))[1]-eb[3]
        if egap>=0: continue
        dx,dy=P.get((g,fm),(0,0))
        gap=fmb[1]+dy-b[3]
        if gap<=egap+45: continue
        want=T+(emb[1]+eP.get((g,em),(0,0))[1]-eT)   # same offset from shirorekha as reference
        ndy=round(want-fmb[1])
        adv=f['hmtx'][g][0];x0=adv+fmb[0]+dx;x1=adv+fmb[2]+dx;top=None
        for y in range(int(b[3])+2,int(b[1])-2,-6):
            hit=False
            for x in range(int(x0),int(x1)+1,8):
                pen=PointInsidePen(gs,(x,y));gs[g].draw(pen)
                if pen.getResult():hit=True;break
            if hit: top=y;break
        if top is not None and top+25-fmb[1]>ndy: ndy=round(top+25-fmb[1])
        if ndy>=dy: continue
        new[(g,fm)]=(dx,ndy);cnt.append((g,k,round(gap),round(want-fmb[1]+fmb[1]-b[3])))
print(n,len(cnt),cnt[:12])
lines=[f'pos {g} <0 0 0 0> {s} <{dx} {dy} 0 0>;' for (g,s),(dx,dy) in new.items()]
del f['GPOS']
addOpenTypeFeaturesFromString(f,'languagesystem DFLT dflt;\nlanguagesystem latn dflt;\nfeature kern {\n'+'\n'.join(lines)+'\n} kern;\n',tables=['GPOS'])
import os;os.makedirs('/tmp/new2',exist_ok=True);f.save(f'/tmp/new2/Tankan-{n}-Regular.ttf')
