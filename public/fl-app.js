'use strict';
// fl-app.js — FocusLens core (auth handled by Clerk, injected via window.FL_USER)

// ── Constants ──────────────────────────────────────────────────────────────────
const DETECT_MS  = 80;
const EAR_DEF    = 0.30, EAR_RATIO = 0.70, EAR_LEN = 5;
const CAL_N      = 35, CC = 3, CB_MAX = 6;
const BL_MIN     = 50, BL_MAX = 450;
const GH = 0.20, GV = 0.28, BRIGHT_THR = 12;
const MIC_THR    = 15, MIC_HOLD = 600;
const MODEL_CDNS = [
  'https://cdn.jsdelivr.net/npm/face-api.js@0.22.2/weights',
  'https://unpkg.com/face-api.js@0.22.2/weights',
  'https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights',
];

// ── State ──────────────────────────────────────────────────────────────────────
let st = {
  trk:false, mdlOk:false,
  foc:true, micLoud:false, reason:'',
  tot:0, fSec:0, dSec:0, bCnt:0, lCnt:0,
  start:null, lastTick:null,
  ecSince:null, blkStart:0, ccnt:0, inBlink:false,
  cal:false, calS:[], earBase:EAR_DEF, earThr:EAR_DEF*EAR_RATIO, earH:[],
  micS:null, camBlk:false, darkBl:null,
};
let user=null, vs=null, ac=null, an=null, ms=null, tt=null, dt=null;
const bCv=Object.assign(document.createElement('canvas'),{width:64,height:48});
const pCv=Object.assign(document.createElement('canvas'),{width:32,height:16});

// ── DOM ────────────────────────────────────────────────────────────────────────
const $=id=>document.getElementById(id);
const loadScreen=$('loadScreen'), loadBar=$('loadBar'), loadMsg=$('loadMsg');
const appScreen=$('appScreen');
const statusChip=$('statusChip'), statusLbl=$('statusLbl');
const appAlert=$('appAlert');
const userChip=$('userChip'), uAvatar=$('uAvatar'), uName=$('uName'), btnOut=$('btnOut');
const scoreBig=$('scoreBig'), scorePct=$('scorePct'), scoreMsg=$('scoreMsg');
const ringFg=$('ringFg');
const segF=$('segF'), segD=$('segD');
const rT=$('rT'), rF=$('rF'), rD=$('rD');
const liveDot=$('liveDot'), liveLbl=$('liveLbl'), timerTxt=$('timerTxt');
const tdF=$('tdF'), tdD=$('tdD'), tdT=$('tdT');
const tdFp=$('tdFp'), tdDp=$('tdDp'), tdTp=$('tdTp');
const videoEl=$('videoEl'), camCanvas=$('camCanvas');
const camPh=$('camPlaceholder');
const eyeBadge=$('eyeBadge'), modelBadge=$('modelBadge');
const blinkN=$('blinkN'), lookN=$('lookN'), micBar=$('micBar');
const btnStart=$('btnStart'), btnStop=$('btnStop');
const histGrid=$('histGrid'), btnClear=$('btnClear');
const toastEl=$('toast');

// ── Helpers ────────────────────────────────────────────────────────────────────
const fmt = s => { s=Math.max(0,Math.round(s)); return `${Math.floor(s/60)}:${(s%60).toString().padStart(2,'0')}`; };
const pq  = p => p>=70?'g':p>=40?'m':'b';

let toastTmr;
function toast(m){ toastEl.textContent=m; toastEl.classList.add('show'); clearTimeout(toastTmr); toastTmr=setTimeout(()=>toastEl.classList.remove('show'),3000); }
function setLoad(p,m){ if(p!=null)loadBar.style.width=p+'%'; if(m)loadMsg.textContent=m; }

function storKey(){ return 'fl_s_'+(user?user.uid:'guest'); }
function loadS(){ try{return JSON.parse(localStorage.getItem(storKey())||'[]')}catch{return[]} }
function saveS(a){ try{localStorage.setItem(storKey(),JSON.stringify(a.slice(0,50)))}catch{} }

function showAppAlert(msg,type='show'){ appAlert.textContent=msg; appAlert.className='app-alert '+type; }
function hideAppAlert(){ appAlert.className='app-alert'; }

// ── Enter app (called after boot, using Clerk user from window.FL_USER) ────────
function enterApp(u){
  user = u;
  appScreen.classList.remove('hidden');
  hideAppAlert();
  // Update user chip
  if(u){
    userChip.classList.remove('hidden');
    uName.textContent = u.displayName || u.email || 'User';
    if(u.photoURL){ uAvatar.src=u.photoURL; uAvatar.style.display='block'; }
    else uAvatar.style.display='none';
  } else {
    userChip.classList.add('hidden');
  }
  renderHist();
  if(u) toast(`Welcome, ${u.displayName || u.email}!`);
}

// Sign out button — delegates to Clerk via window.FL_USER.signOut()
btnOut.addEventListener('click', async () => {
  if(window.FL_USER && typeof window.FL_USER.signOut === 'function'){
    await window.FL_USER.signOut();
  }
});

// ── BOOT ───────────────────────────────────────────────────────────────────────
async function boot(){
  setLoad(5,'Loading face-api.js…');
  const ready = await new Promise(res=>{
    let w=0; const t=setInterval(()=>{ w+=150;
      if(window.faceapi){clearInterval(t);res(true);return;}
      if(w>=10000||window._faceApiErr){clearInterval(t);res(false);}
    },150);
  });
  if(!ready){ bootErr('face-api.js failed — check internet connection.'); return; }

  setLoad(20,'Loading face detector…');
  let ok=false;
  for(const cdn of MODEL_CDNS){
    try{
      setLoad(null,`Trying ${cdn.split('/')[2]}…`);
      await faceapi.nets.tinyFaceDetector.loadFromUri(cdn);
      setLoad(65,'Loading landmark model…');
      await faceapi.nets.faceLandmark68TinyNet.loadFromUri(cdn);
      ok=true; break;
    }catch(e){ console.warn('[FL] model fail',cdn,e.message); }
  }
  if(!ok){ bootErr('Models failed to load. Open via https:// (not file://)'); return; }

  setLoad(100,'✓ Ready'); st.mdlOk=true;
  await new Promise(r=>setTimeout(r,350));
  loadScreen.classList.add('out');
  setTimeout(()=>loadScreen.style.display='none', 600);

  // Use Clerk user injected by React (window.FL_USER)
  const clerkUser = window.FL_USER || null;
  enterApp(clerkUser);
}

function bootErr(msg){
  setLoad(100, msg);
  loadScreen.classList.add('out');
  setTimeout(()=>loadScreen.style.display='none', 600);
  appScreen.classList.remove('hidden');
  showAppAlert(msg, 'show');
  btnStart.disabled=true; btnStart.textContent='⚠ Unavailable';
}

// ── DETECTION ──────────────────────────────────────────────────────────────────
function camBlocked(){
  if(videoEl.readyState<2) return false;
  const ctx=bCv.getContext('2d'); ctx.drawImage(videoEl,0,0,64,48);
  const d=ctx.getImageData(0,0,64,48).data; let s=0;
  for(let i=0;i<d.length;i+=4) s+=(d[i]+d[i+1]+d[i+2])/3;
  return(s/(64*48))<BRIGHT_THR;
}
function calcEAR(p){ const f=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y),h=f(p[0],p[3]); return h<1e-6?.3:(f(p[1],p[5])+f(p[2],p[4]))/(2*h); }
function smEAR(r){ st.earH.push(r); if(st.earH.length>EAR_LEN)st.earH.shift(); return st.earH.reduce((a,b)=>a+b,0)/st.earH.length; }
function tryCal(r){
  if(r>.22) st.calS.push(r);
  if(st.calS.length>=CAL_N&&!st.cal){
    const s=[...st.calS].sort((a,b)=>a-b),m=s[Math.floor(s.length*.5)];
    st.earBase=m; st.earThr=m*EAR_RATIO; st.cal=true;
    modelBadge.textContent='CALIBRATED'; modelBadge.style.color='var(--g)';
    toast(`✓ Calibrated — EAR thr ${st.earThr.toFixed(3)}`);
  }
}
function getPupil(pts){
  let cx=0,cy=0; pts.forEach(p=>{cx+=p.x;cy+=p.y;}); cx/=pts.length; cy/=pts.length;
  const ew=Math.hypot(pts[3].x-pts[0].x,pts[3].y-pts[0].y);
  const eh=Math.hypot(pts[1].x-pts[4].x,pts[1].y-pts[4].y)+1;
  const pw=Math.max(8,ew*.4),ph=Math.max(4,eh*.8);
  const ctx=pCv.getContext('2d'); ctx.drawImage(videoEl,cx-pw/2,cy-ph/2,pw,ph,0,0,32,16);
  const px=ctx.getImageData(0,0,32,16).data; let dk=0,n=0;
  for(let i=0;i<px.length;i+=4){dk+=255-(px[i]*.299+px[i+1]*.587+px[i+2]*.114);n++;}
  return{cx,cy,dk:n>0?dk/n:0};
}
function drawEye(ctx,pts,cl,pcx,pcy,sx,sy){
  const col=cl?'rgba(255,60,60,1)':'rgba(78,255,145,1)';
  ctx.beginPath(); ctx.moveTo(pts[0].x*sx,pts[0].y*sy);
  for(let i=1;i<pts.length;i++) ctx.lineTo(pts[i].x*sx,pts[i].y*sy);
  ctx.closePath(); ctx.strokeStyle=col; ctx.lineWidth=1.8; ctx.stroke();
  ctx.fillStyle=cl?'rgba(255,60,60,.1)':'rgba(78,255,145,.07)'; ctx.fill();
  ctx.fillStyle=col; pts.forEach(p=>{ctx.beginPath();ctx.arc(p.x*sx,p.y*sy,2,0,Math.PI*2);ctx.fill();});
  const px=pcx*sx,py=pcy*sy,r=cl?2.5:4;
  ctx.strokeStyle=cl?'rgba(255,60,60,.8)':'rgba(255,255,255,.8)'; ctx.lineWidth=1;
  ctx.beginPath();ctx.moveTo(px-r,py);ctx.lineTo(px+r,py);ctx.stroke();
  ctx.beginPath();ctx.moveTo(px,py-r);ctx.lineTo(px,py+r);ctx.stroke();
  ctx.beginPath();ctx.arc(px,py,r*1.5,0,Math.PI*2);
  ctx.strokeStyle=cl?'rgba(255,60,60,.5)':'rgba(78,255,145,.4)'; ctx.stroke();
}
function isClosed(e,thr,lD,rD){
  const ec=e<thr,avg=(lD+rD)/2;
  if(!ec&&e>thr*1.15) st.darkBl=st.darkBl===null?avg:st.darkBl*.95+avg*.05;
  return ec||(st.darkBl!==null&&avg<st.darkBl*.65);
}

async function detect(){
  if(!st.trk) return;
  const t0=performance.now();
  if(camBlocked()){st.camBlk=true;st.earH=[];st.ccnt=0;st.ecSince=null;setDis('CAMERA BLOCKED');nxt(t0);return;}
  if(st.camBlk){st.camBlk=false;toast('Camera unblocked');}
  if(videoEl.readyState<3){nxt(t0);return;}
  const ctx=camCanvas.getContext('2d'); ctx.clearRect(0,0,camCanvas.width,camCanvas.height);
  let det;
  try{det=await faceapi.detectSingleFace(videoEl,new faceapi.TinyFaceDetectorOptions({inputSize:320,scoreThreshold:.28})).withFaceLandmarks(true);}
  catch{nxt(t0);return;}
  if(!det){st.earH=[];st.ccnt=0;st.ecSince=null;setDis('OUT OF FRAME');nxt(t0);return;}
  const lm=det.landmarks,le=lm.getLeftEye(),re=lm.getRightEye();
  const rE=(calcEAR(le)+calcEAR(re))/2,e=smEAR(rE);
  if(!st.cal){tryCal(rE);modelBadge.textContent=`CAL ${st.calS.length}/${CAL_N}`;modelBadge.style.color='var(--a)';modelBadge.classList.remove('hidden');}
  const lP=getPupil(le),rP=getPupil(re),thr=st.earThr,cl=isClosed(e,thr,lP.dk,rP.dk);
  const sx=camCanvas.width/(videoEl.videoWidth||640),sy=camCanvas.height/(videoEl.videoHeight||480);
  drawEye(ctx,le,cl,lP.cx,lP.cy,sx,sy); drawEye(ctx,re,cl,rP.cx,rP.cy,sx,sy);
  const dp=st.darkBl?Math.round(((lP.dk+rP.dk)/2)/st.darkBl*100):100;
  ctx.font='9px monospace'; ctx.fillStyle=cl?'rgba(255,80,80,.8)':'rgba(78,255,145,.5)';
  ctx.fillText(`EAR ${e.toFixed(3)} THR ${thr.toFixed(3)} PUPIL ${dp}%`,4,camCanvas.height-4);
  const now=Date.now();
  if(cl){
    st.ccnt++;
    if(st.ccnt>=CC){
      if(!st.ecSince){st.ecSince=now;st.blkStart=now;}
      if(st.ccnt>CB_MAX) setDis(`EYES CLOSED ${((now-st.ecSince)/1000).toFixed(1)}s`);
      else{if(!st.inBlink)st.inBlink=true;setFoc('BLINKING…');}
    }
  } else {
    if(st.ccnt>=CC&&st.inBlink){const d=now-st.blkStart;if(d>=BL_MIN&&d<=BL_MAX){st.bCnt++;blinkN.textContent=st.bCnt;}}
    st.ccnt=0;st.ecSince=null;st.inBlink=false;
    const box=det.detection.box;
    const fcx=box.x+box.width/2,fcy=box.y+box.height/2,nose=lm.getNose()[3];
    const hd=Math.abs(nose.x-fcx)/box.width,vd=Math.abs(nose.y-fcy)/box.height;
    const apx=(lP.cx+rP.cx)/2,apy=(lP.cy+rP.cy)/2;
    ctx.strokeStyle=(hd>GH||vd>GV)?'rgba(255,184,48,.7)':'rgba(78,255,145,.2)'; ctx.lineWidth=1;
    ctx.beginPath();ctx.moveTo(apx*sx,apy*sy);ctx.lineTo(fcx*sx,fcy*sy);ctx.stroke();
    if(hd>GH){st.lCnt++;lookN.textContent=st.lCnt;setDis('LOOKING AWAY');}
    else if(vd>GV){st.lCnt++;lookN.textContent=st.lCnt;setDis('LOOKING UP/DOWN');}
    else setFoc('FOCUSED ✓');
  }
  nxt(t0);
}
function nxt(t0){ if(!st.trk)return; dt=setTimeout(detect,Math.max(0,DETECT_MS-(performance.now()-t0))); }

function setFoc(r){
  if(st.micLoud){setDis('LOUD NOISE');return;}
  st.foc=true;st.reason='';
  eyeBadge.textContent=r; eyeBadge.className='eye-badge foc'; eyeBadge.classList.remove('hidden');
  chip();
}
function setDis(r){
  st.foc=false;st.reason=r;
  eyeBadge.textContent=st.micLoud?r+' + MIC':r;
  eyeBadge.className='eye-badge dis'; eyeBadge.classList.remove('hidden');
  chip();
}
function chip(){
  if(!st.trk){statusChip.className='schip';statusLbl.textContent='IDLE';}
  else if(st.foc){statusChip.className='schip on';statusLbl.textContent='FOCUSED';}
  else{statusChip.className='schip dis';statusLbl.textContent='DISTRACTED';}
}

// ── Mic ────────────────────────────────────────────────────────────────────────
async function startMic(){
  try{
    ms=await navigator.mediaDevices.getUserMedia({audio:true,video:false});
    ac=new(window.AudioContext||window.webkitAudioContext)();
    an=ac.createAnalyser(); an.fftSize=512; an.smoothingTimeConstant=.5;
    ac.createMediaStreamSource(ms).connect(an);
    const data=new Uint8Array(an.frequencyBinCount);
    function poll(){
      if(!ms) return;
      an.getByteFrequencyData(data); let s=0; for(let i=0;i<data.length;i++)s+=data[i];
      const avg=s/data.length,loud=avg>MIC_THR,now=Date.now();
      if(loud){
        if(!st.micS)st.micS=now;
        st.micLoud=(now-st.micS)>=MIC_HOLD;
        if(st.micLoud&&st.trk&&st.foc)setDis('LOUD NOISE');
      } else {
        const was=st.micLoud; st.micS=null; st.micLoud=false;
        if(was&&st.trk&&!st.foc&&st.reason==='LOUD NOISE')setFoc('FOCUSED ✓');
      }
      const p=Math.min(100,(avg/40)*100);
      micBar.style.width=p+'%';
      micBar.className='mic-bar'+(st.micLoud?' l':(loud?' w':''));
      setTimeout(poll,80);
    }
    poll(); toast('🎤 Mic active');
  }catch{ showAppAlert('Mic denied — noise detection disabled.','warn'); }
}

// ── Tick / render ──────────────────────────────────────────────────────────────
function tick(){
  const now=Date.now();
  if(st.lastTick){const d=(now-st.lastTick)/1000;st.tot+=d;if(st.foc)st.fSec+=d;else st.dSec+=d;}
  st.lastTick=now; renderLive();
}
function renderLive(){
  const T=st.tot,F=st.fSec,D=st.dSec;
  const p=T>0?Math.round((F/T)*100):100,fp=T>0?(F/T)*100:0,dp=T>0?(D/T)*100:0;
  const q=pq(p),el=st.start?Math.floor((Date.now()-st.start)/1000):0;
  scoreBig.textContent=p; scoreBig.className='score-big '+q;
  scorePct.textContent='%'; scoreMsg.textContent=p>=70?'Excellent focus!':p>=40?'Keep going':'You keep getting distracted';
  ringFg.style.strokeDashoffset=201-(p/100)*201;
  ringFg.style.stroke=p>=70?'var(--g)':p>=40?'var(--a)':'var(--r)';
  segF.style.width=fp+'%'; segD.style.width=dp+'%';
  rT.textContent=fmt(T); rF.textContent=fmt(F); rD.textContent=fmt(D);
  tdF.textContent=fmt(F); tdD.textContent=fmt(D); tdT.textContent=fmt(T);
  tdFp.textContent=T>0?`${Math.round(fp)}% of session`:'—';
  tdDp.textContent=T>0?`${Math.round(dp)}% of session`:'—';
  tdTp.textContent=st.start?new Date(st.start).toLocaleTimeString():'—';
  liveDot.className='ldot'+(st.trk?' on':'');
  liveLbl.textContent=st.trk?'LIVE':'ENDED';
  timerTxt.textContent=st.trk?fmt(el)+' elapsed':'';
}

// ── Start / Stop ───────────────────────────────────────────────────────────────
async function startTracking(){
  hideAppAlert(); btnStart.disabled=true; btnStart.textContent='⏳ Requesting…';
  try{
    vs=await navigator.mediaDevices.getUserMedia({video:{width:640,height:480,facingMode:'user'}});
    videoEl.srcObject=vs;
    await new Promise((res,rej)=>{ videoEl.onloadedmetadata=res; videoEl.onerror=rej; setTimeout(rej,8000); });
    videoEl.play(); videoEl.style.display='block'; camPh.style.display='none';
    camCanvas.width=videoEl.videoWidth||640; camCanvas.height=videoEl.videoHeight||480;
    modelBadge.textContent='FACE-API'; modelBadge.classList.remove('hidden'); modelBadge.style.color='var(--g)';
  }catch{
    showAppAlert('Camera permission denied. Eye tracking needs camera access.','show');
    btnStart.disabled=false; btnStart.textContent='▶ Start Tracking'; return;
  }
  await startMic();
  Object.assign(st,{trk:true,foc:true,micLoud:false,reason:'',tot:0,fSec:0,dSec:0,bCnt:0,lCnt:0,start:Date.now(),lastTick:null,ecSince:null,blkStart:0,inBlink:false,ccnt:0,cal:false,calS:[],earBase:EAR_DEF,earThr:EAR_DEF*EAR_RATIO,earH:[],micS:null,camBlk:false,darkBl:null});
  blinkN.textContent='0'; lookN.textContent='0'; micBar.style.width='0%';
  tt=setInterval(tick,1000); detect(); chip();
  btnStart.classList.add('hidden'); btnStop.classList.remove('hidden');
  toast('Tracking started — good luck!');
}

function stopTracking(){
  st.trk=false; clearInterval(tt); clearTimeout(dt);
  if(vs){vs.getTracks().forEach(t=>t.stop());vs=null;}
  if(ms){ms.getTracks().forEach(t=>t.stop());ms=null;}
  if(ac){ac.close();ac=null;an=null;}
  camCanvas.getContext('2d').clearRect(0,0,camCanvas.width,camCanvas.height);
  videoEl.style.display='none'; videoEl.srcObject=null; camPh.style.display='flex';
  eyeBadge.classList.add('hidden'); modelBadge.classList.add('hidden'); micBar.style.width='0%';
  const T=Math.round(st.tot),F=Math.round(st.fSec),D=Math.round(st.dSec),p=T>0?Math.round((F/T)*100):0;
  const s={id:Date.now(),date:new Date().toLocaleDateString(undefined,{day:'numeric',month:'short',year:'numeric'}),time:new Date().toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit'}),totalSecs:T,focusedSecs:F,distractedSecs:D,focusPercent:p,blinkCount:st.bCnt,lookAwayCount:st.lCnt};
  const arr=loadS(); arr.unshift(s); saveS(arr); renderHist();
  liveDot.className='ldot'; liveLbl.textContent='ENDED'; timerTxt.textContent=`${fmt(T)} · ${p}% focus`; chip();
  btnStop.classList.add('hidden'); btnStart.classList.remove('hidden'); btnStart.disabled=false; btnStart.textContent='▶ Start Tracking';
  toast(`Session saved — ${p}% focus`);
}

// ── History ────────────────────────────────────────────────────────────────────
function renderHist(){
  const arr=loadS();
  if(!arr.length){histGrid.innerHTML='<div class="hempty">No sessions yet.<br/>Start tracking to build your history.</div>';return;}
  histGrid.innerHTML=arr.map(s=>{
    const p=s.focusPercent||0,q=pq(p);
    return`<div class="hcard"><div class="htop"><div class="hdate">${s.date}<br/>${s.time}</div><div class="hpct ${q}">${p}%</div></div><div class="hbar"><div class="hfill ${q}" style="width:${p}%"></div></div><div class="hmeta"><div class="hmi"><strong>${fmt(s.totalSecs||0)}</strong>Duration</div><div class="hmi"><strong>${fmt(s.focusedSecs||0)}</strong>Focused</div><div class="hmi"><strong>${s.blinkCount||0}</strong>Blinks</div><div class="hmi"><strong>${s.lookAwayCount||0}</strong>Glances</div></div></div>`;
  }).join('');
}

// ── Events ─────────────────────────────────────────────────────────────────────
btnStart.addEventListener('click', startTracking);
btnStop.addEventListener('click', stopTracking);
btnClear.addEventListener('click',()=>{ if(!confirm('Delete all history?'))return; saveS([]); renderHist(); toast('History cleared'); });
document.addEventListener('visibilitychange',()=>{
  if(!st.trk)return;
  if(document.hidden){clearInterval(tt);st.lastTick=null;}
  else{st.lastTick=Date.now();tt=setInterval(tick,1000);toast('Tab back — resuming');}
});

// ── Go ──────────────────────────────────────────────────────────────────────────
boot();
