'use client'

import { useUser, useClerk } from '@clerk/nextjs'
import { useEffect, useRef } from 'react'
import Script from 'next/script'

export default function FocusApp() {
  const { user } = useUser()
  const { signOut } = useClerk()
  const injected = useRef(false)

  // Inject Clerk user data into window so fl-app.js can access it
  useEffect(() => {
    if (!user || injected.current) return
    injected.current = true
    ;(window as any).FL_USER = {
      email:       user.emailAddresses[0]?.emailAddress ?? '',
      displayName: user.fullName || user.firstName || user.emailAddresses[0]?.emailAddress ?? 'User',
      uid:         user.id,
      photoURL:    user.imageUrl ?? null,
      signOut:     () => signOut({ redirectUrl: '/' }),
    }
  }, [user, signOut])

  return (
    <>
      {/* face-api.js — loaded with fallbacks */}
      <script
        dangerouslySetInnerHTML={{
          __html: `
(function(){
  var s=['https://cdn.jsdelivr.net/npm/face-api.js@0.22.2/dist/face-api.min.js',
         'https://unpkg.com/face-api.js@0.22.2/dist/face-api.min.js',
         'https://cdnjs.cloudflare.com/ajax/libs/face-api.js/0.22.2/face-api.min.js'];
  var i=0;
  function next(){
    if(i>=s.length){window._faceApiErr=true;return;}
    var el=document.createElement('script');
    el.src=s[i++];el.crossOrigin='anonymous';
    el.onload=function(){window._faceApiReady=true;};
    el.onerror=next;
    document.head.appendChild(el);
  }
  next();
})();
`,
        }}
      />

      {/* ── LOADING SCREEN ──────────────────────────────────── */}
      <div id="loadScreen">
        <div className="load-box">
          <div className="load-logo">Focus<span>Lens</span></div>
          <div className="load-track">
            <div className="load-bar" id="loadBar"></div>
          </div>
          <div className="load-msg" id="loadMsg">Starting up…</div>
        </div>
      </div>

      {/* ── MAIN APP ─────────────────────────────────────────── */}
      <div id="appScreen" className="hidden">

        {/* Topbar */}
        <div className="topbar">
          <div className="brand">
            <div className="brand-blob">👁</div>
            <div className="brand-name">Focus<em>Lens</em></div>
          </div>
          <div className="topbar-r">
            {/* User chip */}
            <div id="userChip" className="uchip hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img id="uAvatar" className="uavatar" src="" alt="" style={{ display: 'none' }} />
              <span id="uName"></span>
              <button id="btnOut" title="Sign out">↩</button>
            </div>
            {/* Status chip */}
            <div id="statusChip" className="schip">
              <div className="sdot"></div>
              <span id="statusLbl">IDLE</span>
            </div>
          </div>
        </div>

        {/* App alert banner */}
        <div id="appAlert" className="app-alert"></div>

        {/* Main grid */}
        <div className="app-grid">

          {/* ── Left column ── */}
          <div className="left-col">

            {/* Focus Score */}
            <div className="card">
              <div className="card-tag">Focus Score</div>
              <div className="score-row">
                <div id="scoreBig" className="score-big">—</div>
                <div className="score-side">
                  <div id="scorePct" className="score-pct"></div>
                  <div id="scoreMsg" className="score-msg">Start a session to begin tracking</div>
                </div>
                <div className="ring-box">
                  <svg width="70" height="70" viewBox="0 0 70 70">
                    <circle className="ring-bg" cx="35" cy="35" r="32" />
                    <circle id="ringFg" className="ring-fg" cx="35" cy="35" r="32" />
                  </svg>
                </div>
              </div>

              {/* Progress bar */}
              <div className="seg-bar">
                <div id="segF" style={{ width: '0%' }}></div>
                <div id="segD" style={{ width: '0%' }}></div>
              </div>

              {/* Readouts */}
              <div className="reads">
                <div className="read"><div id="rT" className="rval">0:00</div><div className="rlbl">Total</div></div>
                <div className="read"><div id="rF" className="rval" style={{ color: 'var(--g)' }}>0:00</div><div className="rlbl">Focused</div></div>
                <div className="read"><div id="rD" className="rval" style={{ color: 'var(--r)' }}>0:00</div><div className="rlbl">Distracted</div></div>
              </div>

              {/* Live indicator */}
              <div className="live-row">
                <div className="live-ind">
                  <div id="liveDot" className="ldot"></div>
                  <span id="liveLbl">Standby</span>
                </div>
                <span id="timerTxt"></span>
              </div>
            </div>

            {/* Time Breakdown */}
            <div className="card">
              <div className="card-tag">Time Breakdown</div>
              <div className="trows">
                <div className="trow">
                  <div className="tbar" style={{ background: 'var(--g)' }}></div>
                  <div><div className="tlbl">Focused</div><div id="tdF" className="tval">0:00</div></div>
                  <div id="tdFp" className="tpct">—</div>
                </div>
                <div className="trow">
                  <div className="tbar" style={{ background: 'var(--r)' }}></div>
                  <div><div className="tlbl">Distracted</div><div id="tdD" className="tval">0:00</div></div>
                  <div id="tdDp" className="tpct">—</div>
                </div>
                <div className="trow">
                  <div className="tbar" style={{ background: 'var(--mu)' }}></div>
                  <div><div className="tlbl">Session Duration</div><div id="tdT" className="tval">0:00</div></div>
                  <div id="tdTp" className="tpct">—</div>
                </div>
              </div>
            </div>

          </div>{/* end left-col */}

          {/* ── Right column — Camera ── */}
          <div className="right-col">
            <div className="card cam-card">
              <div className="card-tag">Eye Tracking Feed</div>

              {/* Camera viewport */}
              <div className="cam-box">
                <video id="videoEl" autoPlay muted playsInline></video>
                <canvas id="camCanvas"></canvas>
                <div id="camPlaceholder" className="cam-ph">
                  <div className="cam-icon">⬡</div>
                  <div className="cam-hint">Camera appears here<br />after you start tracking</div>
                </div>
                <div id="eyeBadge"    className="eye-badge hidden"></div>
                <div id="modelBadge" className="mdl-badge hidden"></div>
              </div>

              {/* Blink / look-away counters */}
              <div className="micro-row">
                <div className="micro"><div id="blinkN" className="mv">0</div><div className="ml">Blinks</div></div>
                <div className="micro"><div id="lookN"  className="mv">0</div><div className="ml">Look Aways</div></div>
              </div>

              {/* Mic bar */}
              <div className="mic-strip">
                <span className="mic-lbl">MIC</span>
                <div className="mic-track"><div id="micBar" className="mic-bar"></div></div>
              </div>

              {/* Controls */}
              <button id="btnStart" className="btn-primary">▶ Start Tracking</button>
              <button id="btnStop"  className="btn-stop hidden">■ Stop &amp; Save</button>
            </div>
          </div>

        </div>{/* end app-grid */}

        {/* Session History */}
        <section className="history">
          <div className="hist-head">
            <div className="hist-title">Session History</div>
            <button id="btnClear" className="btn-ghost-sm">Clear All</button>
          </div>
          <div id="histGrid" className="hist-grid"></div>
        </section>

      </div>{/* end appScreen */}

      {/* Toast */}
      <div id="toast" className="toast"></div>

      {/* FocusLens core logic — loaded after page is interactive */}
      <Script src="/fl-app.js" strategy="afterInteractive" />
    </>
  )
}
