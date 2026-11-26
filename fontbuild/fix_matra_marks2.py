import sys
sys.path.insert(0,'/tmp/tk/fontbuild')
from match_marks import pair_table
from fontTools.ttLib import TTFont
from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.pointInsidePen import PointInsidePen
from fontTools.feaLib.builder import addOpenTypeFeaturesFromString
SRC='/tmp/base84/Tankan-%s-Regular.ttf'
def ld(n):
    f=TTFont(SRC%n);gs=f.getGlyphSet();cm=f.getBestCmap()
    def B(g):
        bp=BoundsPen(gs);gs[g].draw(bp);return bp.bounds
    return f,gs,cm,B,pair_table(f)
E=ld('Eczar');
MARKS={'b':'a','c':'\u00a1'}
n=sys.argv[1]
f,gs,cm,B,P=ld(n);hm=f['hmtx']
ef,egs,ecm,eB,eP=E
T=B('Ka.dv')[3];eT=eB('Ka.dv')[3]
def ink(g,x,y):
    pen=PointInsidePen(gs,(x,y));gs[g].draw(pen);return pen.getResult()
def hit(g,x0,x1,y0,y1,pad=16):
    for y in range(int(y0-pad),int(y1+pad)+1,8):
        for x in range(int(x0-pad),int(x1+pad)+1,8):
            if ink(g,x,y):return True
    return False
new=dict(P);ctx=[];log=[]
for k,c in MARKS.items():
    mg=cm[ord(c)];m=B(mg);emg=ecm[ord(c)];em=eB(emg)
    def eoff(g): # Eczar bottom relative to its shirorekha top
        dx,dy=eP.get((g,emg),(0,0));return em[1]+dy-eT
    for g in ('matraAi.dv','matraE.dv','matraIi.dv'):
        b=B(g);adv=hm[g][0];eb=eB(g);eadv=ef['hmtx'][g][0]
        edx,edy=eP.get((g,emg),(0,0));off=em[1]+edy-eT
        ndy=round(T+off-m[1])
        if g=='matraIi.dv':
            ecx=eadv+(em[0]+em[2])/2+edx;frac=(ecx-eb[0])/(eb[2]-eb[0])
            ndx=round(b[0]+frac*(b[2]-b[0])-(adv+(m[0]+m[2])/2))
        else:
            egap=(eadv+em[0]+edx)-eb[2]
            ndx=round(b[2]+egap-(adv+m[0]))
        # clearance: never touch the matra or sit on the shirorekha
        for _ in range(60):
            x0=adv+m[0]+ndx;x1=adv+m[2]+ndx;y0=m[1]+ndy;y1=m[3]+ndy
            if y0<T+20: ndy+=6;continue
            if hit(g,x0,x1,y0,y1): ndx+=8;continue
            break
        old=P.get((g,mg),(0,0));new[(g,mg)]=(ndx,ndy);log.append((g,k,old,(ndx,ndy)))
# choti i: consonant + bindu after ि
mI='matraI.dv';bI=B(mI);
cons=[g for (g,s) in P if s==cm[ord('a')] and not g.startswith(('matra','vowel')) and g.endswith('.dv')]
Ma='Ma.dv'
for k,c in MARKS.items():
    mg=cm[ord(c)];m=B(mg)
    dxm,dym=P.get((Ma,mg),(0,0));cxm=hm[mI][0]+hm[Ma][0]+(m[0]+m[2])/2+dxm
    kk=cxm-bI[2]
    for g in cons:
        dx,dy=P.get((g,mg),(0,0));cx=hm[mI][0]+hm[g][0]+(m[0]+m[2])/2+dx
        want=bI[2]+kk
        if abs(cx-want)>10:
            ctx.append((g,mg,round(want-cx),k))
print(n,len(log),'ctx',len(ctx),'kk',round(kk),log[:3])
lines=[f'pos {g} <0 0 0 0> {s} <{dx} {dy} 0 0>;' for (g,s),(dx,dy) in new.items()]
fea='languagesystem DFLT dflt;\nlanguagesystem latn dflt;\nfeature kern {\n'+'\n'.join(lines)+'\n} kern;\n'
fea+='feature kern {\n'+'\n'.join(f'pos {mI} {g} {mg}\' <{d} 0 0 0>;' for g,mg,d,k in ctx)+'\n} kern;\n'
del f['GPOS']
addOpenTypeFeaturesFromString(f,fea,tables=['GPOS'])
import os;os.makedirs('/tmp/new9',exist_ok=True);f.save(f'/tmp/new9/Tankan-{n}-Regular.ttf')
