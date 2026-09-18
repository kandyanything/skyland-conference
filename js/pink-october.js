// Pink October — inline canvas intro, replaces iframe approach
// Runs once per session during October. Set window.poConf.force=true to preview.
(function () {
'use strict';

var cfg = window.poConf || {};
var d0 = new Date();
if (!cfg.force && d0.getMonth() !== 9) return;
try { if (sessionStorage.getItem('po_oct_2026')) return; } catch (_) {}

// ── canvas ────────────────────────────────────────────────────────────────
var cv = document.createElement('canvas');
cv.style.cssText = 'position:fixed;inset:0;z-index:2147483647;width:100%;height:100%;cursor:pointer;display:block;';
document.documentElement.appendChild(cv);
var ctx = cv.getContext('2d');
var W, H, CX, CY, R;
function resize() {
    W = cv.width  = cv.offsetWidth  || window.innerWidth;
    H = cv.height = cv.offsetHeight || window.innerHeight;
    CX = W/2; CY = H*0.37; R = Math.min(W,H)*0.195;
    DRIP_DATA = null;
}
resize();
window.addEventListener('resize', resize);

// Kill the regular intro's veil — our dark canvas covers the site during the ball phase,
// and we need the site visible (not blocked by the intro's veil) when we go transparent.
setTimeout(function(){
    var ids = (cfg.introId ? [cfg.introId] : [])
        .concat(['bnc-intro','njac-intro','sec-intro','UCIAC-intro','skyland-intro']);
    ids.forEach(function(id){
        var el = document.getElementById(id);
        if(el && el !== cv){ el.style.transition='none'; el.style.opacity='0';
            setTimeout(function(){ if(el.parentNode) el.parentNode.removeChild(el); }, 80); }
    });
}, 0);

// ── constants ─────────────────────────────────────────────────────────────
var PI = Math.PI;
var PINK = '#e0006a', PINK2 = '#ff4099', NAVY = '#07080e';

// ── math ──────────────────────────────────────────────────────────────────
function rn(v,lo,hi){ return Math.max(0,Math.min(1,(v-lo)/(hi-lo))); }
function eo2(t){ return t>=1?1:1-(1-t)*(1-t); }
function eo3(t){ return t>=1?1:1-(1-t)*(1-t)*(1-t); }
function eo4(t){ return t>=1?1:1-Math.pow(1-t,4); }
function eio(t){ return t<0.5?2*t*t:1-Math.pow(-2*t+2,2)/2; }
function srnd(s){ var x=(s^0x9e3779b9)>>>0; x=Math.imul(x^(x>>>16),0x45d9f3b)>>>0; x=Math.imul(x^(x>>>16),0x45d9f3b)>>>0; return((x^(x>>>16))>>>0)/0xffffffff; }

// ── images ────────────────────────────────────────────────────────────────
var LOGO_SRC = cfg.logo || 'images/bnc-logo-footer.png';
function li(src){ var i=new Image(); i.src=src; return i; }
var IMGS = [li('images/balls/basketball.png'), li('images/balls/soccer.png'), li(LOGO_SRC)];
function loaded(){ return IMGS.every(function(b){ return b.complete&&b.naturalWidth>0; }); }

// ── ball / logo drawing ───────────────────────────────────────────────────
function drawBall(idx, sx) {
    var im=IMGS[idx]; if(!im||!im.naturalWidth) return;
    var s=2.18*R;
    ctx.save(); ctx.translate(CX,CY); ctx.scale(sx||1,1);
    ctx.drawImage(im,-s/2,-s/2,s,s); ctx.restore();
}
function drawLogoAt(sx, lx, ly, lr) {
    var im=IMGS[2]; if(!im||!im.naturalWidth) return;
    var iw=im.naturalWidth, ih=im.naturalHeight;
    var fit=1.42*lr/Math.max(iw,ih);
    var dw=iw*fit, dh=ih*fit;
    ctx.save(); ctx.translate(lx,ly); ctx.scale(sx||1,1);
    ctx.drawImage(im,-dw/2,-dh/2,dw,dh); ctx.restore();
}

// ── drip drawing ──────────────────────────────────────────────────────────
function drawDrip(ax,ay,len,hw,alpha){
    if(alpha<=0||len<1) return;
    var cp=0.55,bx=hw*1.35,by=len*0.35,neck=hw*0.55,tipR=hw*0.80;
    ctx.save(); ctx.globalAlpha=alpha;
    ctx.beginPath();
    ctx.moveTo(ax-bx,ay);
    ctx.bezierCurveTo(ax-bx-cp*bx,ay+by,ax-neck,ay+len-tipR*2.2,ax-neck,ay+len-tipR);
    ctx.arc(ax,ay+len,tipR,PI,0,true);
    ctx.bezierCurveTo(ax+neck,ay+len-tipR,ax+bx+cp*bx,ay+by,ax+bx,ay);
    ctx.closePath();
    var g=ctx.createLinearGradient(ax,ay,ax,ay+len);
    g.addColorStop(0,'rgba(220,0,100,0.92)'); g.addColorStop(0.65,'rgba(200,0,82,0.97)'); g.addColorStop(1,'rgba(255,80,160,0.86)');
    ctx.fillStyle=g; ctx.fill();
    ctx.save(); ctx.globalCompositeOperation='screen';
    var sg=ctx.createLinearGradient(ax-bx*0.7,ay,ax,ay+len*0.5);
    sg.addColorStop(0,'rgba(255,180,220,0.30)'); sg.addColorStop(1,'rgba(255,180,220,0)');
    ctx.fillStyle=sg; ctx.fill(); ctx.restore(); ctx.restore();
}
function drawAnchorPool(ax,ay,hw,alpha){
    if(alpha<=0) return;
    var g=ctx.createRadialGradient(ax,ay,0,ax,ay,hw*2.2);
    g.addColorStop(0,'rgba(232,0,106,'+(alpha*0.75)+')'); g.addColorStop(1,'rgba(224,0,106,0)');
    ctx.fillStyle=g; ctx.beginPath(); ctx.arc(ax,ay,hw*2.2,0,PI*2); ctx.fill();
}
function drawCoating(alpha){
    if(alpha<=0) return;
    ctx.save(); ctx.beginPath(); ctx.arc(CX,CY,R*1.02,0,PI*2); ctx.clip();
    var g=ctx.createLinearGradient(CX,CY-R,CX,CY+R);
    g.addColorStop(0,'rgba(255,100,175,'+(alpha*0.82)+')');
    g.addColorStop(0.30,'rgba(232,0,106,'+(alpha*0.68)+')');
    g.addColorStop(0.70,'rgba(190,0,75,'+(alpha*0.28)+')');
    g.addColorStop(1,'rgba(130,0,48,'+(alpha*0.06)+')');
    ctx.fillStyle=g; ctx.fillRect(CX-R*1.1,CY-R*1.1,R*2.2,R*2.2); ctx.restore();
}

// ── drip data (lazy — needs R) ────────────────────────────────────────────
var DRIP_DATA = null;
function initDripData(){
    var angs=[-0.50,-0.38,-0.28,-0.62,-0.45,-0.55,-0.33];
    DRIP_DATA=angs.map(function(a,i){
        var ang=a*PI;
        return {
            ax:Math.cos(ang), ay:Math.sin(ang),
            halfW:R*(0.085+srnd(i+0x100)*0.065),
            maxLen:R*(3.4+srnd(i+0x200)*1.3),
            growMs:1800+srnd(i+0x300)*1400,
            startMs:1750+i*180,
            dropsAt:0.72+srnd(i+0x400)*0.15
        };
    });
}

// ── dock ──────────────────────────────────────────────────────────────────
var dockHX, dockHY, dockHR, dockReady=false;
function computeDock(){
    var el=document.querySelector('.masthead-logo'), rc=el&&el.getBoundingClientRect();
    if(rc&&rc.width>4){ dockHX=rc.left+rc.width/2; dockHY=rc.top+rc.height/2; dockHR=Math.min(rc.width,rc.height)/2; }
    else { dockHX=CX; dockHY=H*0.08; dockHR=R*0.32; }
    dockReady=true;
}

// ── paint wave ────────────────────────────────────────────────────────────
var NCOLS=64, paintCols=null;
function initPaint(){
    paintCols=[];
    for(var i=0;i<NCOLS;i++){
        var j=Math.sin(i*2.618)*0.10+Math.sin(i*1.414)*0.07;
        paintCols.push({
            startY:-30+Math.sin(i*1.1)*20,
            speed:1.0+j,
            revSpeed:1.15+Math.abs(j)*0.9,
            dripLen:16+Math.abs(Math.sin(i*2.3))*58
        });
    }
}

function drawPaint(progress, revealT){
    if(!paintCols) return;
    var colW=W/NCOLS, baseH=H+120;
    var xs=new Array(NCOLS), fronts=new Array(NCOLS), ceils=new Array(NCOLS);
    for(var i=0;i<NCOLS;i++){
        xs[i]=(i+0.5)*colW;
        fronts[i]=paintCols[i].startY+progress*baseH*paintCols[i].speed;
        ceils[i]=revealT>0 ? revealT*(H+120)*paintCols[i].revSpeed : 0;
    }

    ctx.save();

    // ── body ─────────────────────────────────────────────────────────────
    ctx.beginPath();
    // ceiling: left→right smooth bezier
    ctx.moveTo(0, ceils[0]);
    for(var i=1;i<NCOLS;i++){
        var px=xs[i-1],py=ceils[i-1],cx2=xs[i],cy2=ceils[i];
        ctx.quadraticCurveTo(px,py,(px+cx2)/2,(py+cy2)/2);
    }
    ctx.lineTo(W,ceils[NCOLS-1]);
    ctx.lineTo(W,Math.min(baseH,fronts[NCOLS-1]));
    // front: right→left smooth bezier
    for(var i=NCOLS-2;i>=0;i--){
        var px=xs[i+1],py=Math.min(baseH,fronts[i+1]),cx2=xs[i],cy2=Math.min(baseH,fronts[i]);
        ctx.quadraticCurveTo(px,py,(px+cx2)/2,(py+cy2)/2);
    }
    ctx.lineTo(0,Math.min(baseH,fronts[0]));
    ctx.closePath();

    var minC=Math.max(0,Math.min.apply(null,ceils));
    var maxF=Math.min(H+120,Math.max.apply(null,fronts));
    var bg=ctx.createLinearGradient(0,minC,0,maxF);
    bg.addColorStop(0,    '#6a002c');
    bg.addColorStop(0.10, '#98003e');
    bg.addColorStop(0.32, '#be005c');
    bg.addColorStop(0.58, '#da0068');
    bg.addColorStop(0.78, '#e8006e');
    bg.addColorStop(0.92, '#f21878');
    bg.addColorStop(1,    '#ff52aa');
    ctx.fillStyle=bg; ctx.fill();

    // ── gloss band along wave front ───────────────────────────────────────
    if(revealT<=0){
        var GB=Math.min(R*0.30,38);
        ctx.save(); ctx.globalCompositeOperation='screen';
        ctx.beginPath();
        ctx.moveTo(0,Math.min(baseH,fronts[0])-GB);
        for(var i=1;i<NCOLS;i++){
            var px=xs[i-1],py=Math.min(baseH,fronts[i-1])-GB,cx2=xs[i],cy2=Math.min(baseH,fronts[i])-GB;
            ctx.quadraticCurveTo(px,py,(px+cx2)/2,(py+cy2)/2);
        }
        ctx.lineTo(W,Math.min(baseH,fronts[NCOLS-1]));
        for(var i=NCOLS-2;i>=0;i--){
            var px=xs[i+1],py=Math.min(baseH,fronts[i+1]),cx2=xs[i],cy2=Math.min(baseH,fronts[i]);
            ctx.quadraticCurveTo(px,py,(px+cx2)/2,(py+cy2)/2);
        }
        ctx.lineTo(0,Math.min(baseH,fronts[0]));
        ctx.closePath();
        var gg=ctx.createLinearGradient(0,minC,0,maxF);
        gg.addColorStop(0,'rgba(255,150,200,0)'); gg.addColorStop(0.72,'rgba(255,160,210,0.17)');
        gg.addColorStop(0.91,'rgba(255,220,245,0.38)'); gg.addColorStop(1,'rgba(255,240,255,0.06)');
        ctx.fillStyle=gg; ctx.fill(); ctx.restore();
    }

    // ── pendant drips below front ─────────────────────────────────────────
    if(revealT<=0.05){
        var dAlpha=(1-revealT/0.05)*0.88;
        for(var i=0;i<NCOLS;i+=2){
            var fx=xs[i], fy=fronts[i];
            if(fy<-10||fy>H+30) continue;
            var dl=paintCols[i].dripLen*Math.min(1,progress*2.5);
            if(dl<5) continue;
            var dw=colW*0.28;
            ctx.save(); ctx.globalAlpha=dAlpha;
            ctx.beginPath();
            ctx.moveTo(fx-dw,fy);
            ctx.bezierCurveTo(fx-dw,fy+dl*0.38, fx-dw*0.30,fy+dl*0.88, fx,fy+dl);
            ctx.bezierCurveTo(fx+dw*0.30,fy+dl*0.88, fx+dw,fy+dl*0.38, fx+dw,fy);
            ctx.closePath();
            var dg=ctx.createLinearGradient(fx,fy,fx,fy+dl);
            dg.addColorStop(0,'#e0006a'); dg.addColorStop(0.55,'#cc0058'); dg.addColorStop(1,'rgba(190,0,78,0)');
            ctx.fillStyle=dg; ctx.fill(); ctx.restore();
        }
    }

    // ── specular scatter dots ahead of wave ───────────────────────────────
    if(revealT<=0 && progress<0.85){
        ctx.save(); ctx.globalAlpha=0.55;
        for(var i=1;i<NCOLS;i+=5){
            var fy=fronts[i]+8+Math.sin(i*3.14)*12;
            if(fy<0||fy>H) continue;
            var sr=1.5+Math.abs(Math.sin(i*2.7))*3.5;
            ctx.beginPath(); ctx.arc(xs[i],fy,sr,0,PI*2);
            ctx.fillStyle='rgba(255,120,190,0.6)'; ctx.fill();
        }
        ctx.restore();
    }

    ctx.restore();
}

// ── timeline ──────────────────────────────────────────────────────────────
var B0=560, B2=1120;
var DRIP_AMBIENT=B2+500, DRIP_0_START=B2+630;
var DRIP_HOLD=B2+3200, SCENE_OUT=B2+4200;
var DOCK_START=B2+4400, DOCK_END=B2+5100;
var PAINT_START=B2+5300, PAINT_FULL=B2+7900; // 450ms visible site gap + 2600ms linear fall
var HOLD_END=B2+9900, REVEAL_END=B2+10700, DONE=B2+10950;

// ── frame loop ────────────────────────────────────────────────────────────
var t0=null, rafId=null;

function frame(ts){
    if(!t0) t0=ts;
    var now=ts-t0;
    if(!loaded()&&now<3000){ rafId=requestAnimationFrame(frame); return; }
    if(!DRIP_DATA) initDripData();
    if(!paintCols) initPaintCols();

    ctx.clearRect(0,0,W,H);

    // ── vignette background (ball phases) ────────────────────────────────
    if(now < SCENE_OUT){
        var bg=ctx.createRadialGradient(CX,CY*0.75,0,CX,CY*0.75,Math.max(W,H)*0.82);
        bg.addColorStop(0,'#10121a'); bg.addColorStop(1,NAVY);
        ctx.fillStyle=bg; ctx.fillRect(0,0,W,H);
    }

    // ── ambient pink glow ─────────────────────────────────────────────────
    if(now>DRIP_AMBIENT && now<SCENE_OUT){
        var at=eo2(rn(now,DRIP_AMBIENT,DRIP_AMBIENT+2400));
        var ag=ctx.createRadialGradient(CX,CY+R*0.5,0,CX,CY+R*0.5,W*0.72);
        ag.addColorStop(0,'rgba(224,0,106,'+(0.09*at).toFixed(3)+')'); ag.addColorStop(1,'rgba(224,0,106,0)');
        ctx.fillStyle=ag; ctx.fillRect(0,0,W,H);
    }

    // ── ball cycle ────────────────────────────────────────────────────────
    if(now < B2){
        var into,q,sx,face;
        if(now < B0){
            into=now;
            if(into<380){ var st=into<200?(1-into/200):0; drawBall(0,1+0.13*st*st); }
            else { q=(into-380)/180; sx=Math.abs(Math.cos(q*PI)); face=q<0.5?0:1; drawBall(face,sx); }
        } else {
            into=now-B0;
            if(into<380){ var st=into<200?(1-into/200):0; drawBall(1,1+0.13*st*st); }
            else {
                q=(into-380)/180; sx=Math.abs(Math.cos(q*PI)); face=q<0.5?1:2;
                if(face<2) drawBall(face,sx); else drawLogoAt(sx,CX,CY,R);
            }
        }
    }

    // ── logo holds + paint drips ──────────────────────────────────────────
    if(now>=B2 && now<SCENE_OUT){
        var settleT=rn(now,B2,B2+220), sq=settleT<1?Math.pow(1-settleT,2):0;
        drawLogoAt(1+0.12*sq,CX,CY,R);
        var coatT=rn(now,DRIP_AMBIENT,DRIP_AMBIENT+2000);
        drawCoating(eo2(coatT)*0.52);
        if(coatT>0.02){
            var px2=CX,py2=CY-R*0.90,pr=R*0.28*eo2(coatT);
            var pg=ctx.createRadialGradient(px2,py2,0,px2,py2,pr*1.6);
            pg.addColorStop(0,'rgba(255,115,185,'+eo2(coatT)+')');
            pg.addColorStop(0.5,'rgba(232,0,106,'+(eo2(coatT)*0.70)+')');
            pg.addColorStop(1,'rgba(224,0,106,0)');
            ctx.save(); ctx.fillStyle=pg; ctx.beginPath(); ctx.arc(px2,py2,pr*1.6,0,PI*2); ctx.fill(); ctx.restore();
        }
        DRIP_DATA.forEach(function(d){
            var ds=DRIP_0_START+(d.startMs-1750);
            var gt=rn(now,ds,ds+d.growMs); if(gt<=0) return;
            var ax=CX+d.ax*R, ay=CY+d.ay*R;
            drawAnchorPool(ax,ay,d.halfW,eo2(gt)*0.85);
            drawDrip(ax,ay,d.maxLen*eo3(gt),d.halfW,eo2(rn(now,ds,ds+250)));
            var dp=rn(now,ds+d.growMs*d.dropsAt,ds+d.growMs*d.dropsAt+600);
            if(dp>0&&dp<1){
                var dy=ay+d.maxLen*eo3(gt)+dp*R*0.65, dr=d.halfW*0.60*(1-dp*0.3);
                ctx.beginPath(); ctx.arc(ax,dy,dr,0,PI*2);
                var dg2=ctx.createRadialGradient(ax-dr*0.25,dy-dr*0.25,0,ax,dy,dr);
                dg2.addColorStop(0,PINK2); dg2.addColorStop(1,'rgba(200,0,80,0.75)');
                ctx.save(); ctx.globalAlpha=eo2(1-dp); ctx.fillStyle=dg2; ctx.fill(); ctx.restore();
            }
        });
    }

    // ── scene fade to black ───────────────────────────────────────────────
    if(now>DRIP_HOLD && now<DOCK_START){
        var fo=eo2(rn(now,DRIP_HOLD,SCENE_OUT));
        ctx.fillStyle='rgba(7,8,14,'+fo.toFixed(3)+')'; ctx.fillRect(0,0,W,H);
    }

    // ── dock: dark fade + logo flies home ─────────────────────────────────
    if(now>=DOCK_START && now<PAINT_START){
        if(!dockReady) computeDock();
        var darkFade=1-eo2(rn(now,DOCK_START,PAINT_START));
        if(darkFade>0.005){ ctx.fillStyle='rgba(7,8,14,'+darkFade.toFixed(3)+')'; ctx.fillRect(0,0,W,H); }
        var dT=eio(rn(now,DOCK_START,DOCK_END));
        var lx=CX+(dockHX-CX)*dT, ly=CY+(dockHY-CY)*dT, lr=R+(dockHR-R)*dT;
        var la=1-eo2(rn(now,DOCK_END-250,DOCK_END));
        ctx.save(); ctx.globalAlpha=la; drawLogoAt(1,lx,ly,lr); ctx.restore();
    }

    // ── paint wave ────────────────────────────────────────────────────────
    if(now>=PAINT_START && now<DONE){
        var paintT=rn(now,PAINT_START,PAINT_FULL); // linear — keep the fall visibly slow
        var revealT=now>HOLD_END ? eo4(rn(now,HOLD_END,REVEAL_END)) : 0;
        drawPaint(paintT,revealT);
    }

    // ── awareness text (during full-pink hold) ────────────────────────────
    if(now>=PAINT_FULL && now<HOLD_END+600){
        var tIn  = eo2(rn(now, PAINT_FULL+350, PAINT_FULL+1100));
        var tOut = 1 - eo3(rn(now, HOLD_END, HOLD_END+600));
        var tA   = Math.min(tIn, tOut);
        if(tA > 0.004){
            ctx.save();
            ctx.globalAlpha = tA;
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            var mid = H * 0.50;
            // decorative rule above
            ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(W/2-W*0.13,mid-R*0.75); ctx.lineTo(W/2+W*0.13,mid-R*0.75); ctx.stroke();
            // main headline
            var fs = Math.min(W*0.048, 52);
            ctx.font = '300 '+fs+'px Georgia,"Times New Roman",serif';
            ctx.fillStyle = '#ffffff';
            ctx.shadowColor = 'rgba(100,0,40,0.55)'; ctx.shadowBlur = 24;
            ctx.fillText('Breast Cancer Awareness Month', W/2, mid);
            // decorative rule below
            ctx.shadowBlur = 0;
            ctx.beginPath(); ctx.moveTo(W/2-W*0.13,mid+R*0.75); ctx.lineTo(W/2+W*0.13,mid+R*0.75); ctx.stroke();
            ctx.restore();
        }
    }

    if(now<DONE){ rafId=requestAnimationFrame(frame); } else { finish(); }
}

function initPaintCols(){ initPaint(); } // alias

function finish(){
    if(rafId) cancelAnimationFrame(rafId);
    try{ sessionStorage.setItem('po_oct_2026','1'); }catch(_){}
    cv.style.transition='opacity 0.5s ease';
    cv.style.opacity='0';
    setTimeout(function(){ if(cv.parentNode) cv.parentNode.removeChild(cv); },550);
}

cv.addEventListener('click',finish);
setTimeout(finish,14000); // DONE = ~12s; 14s safety net
rafId=requestAnimationFrame(frame);
})();
