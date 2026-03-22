import { SignedIn, SignedOut, SignInButton, SignUpButton } from '@clerk/nextjs'
import { redirect } from 'next/navigation'
import { auth } from '@clerk/nextjs/server'

export default async function Home() {
  // Redirect already signed-in users straight to the app
  const { userId } = await auth()
  if (userId) redirect('/dashboard')

  return (
    <div className="landing">
      <div className="landing-logo">
        Focus<span>Lens</span>
      </div>
      <p className="landing-sub">
        Real-time eye tracking that knows when you&apos;re focused — and when you&apos;re not.
      </p>

      <div className="landing-feats">
        <div className="lfeat">
          <div className="lfeat-icon">👁</div>
          <div className="lfeat-title">Pupil Tracking</div>
          <div className="lfeat-desc">Dual EAR + pixel-darkness blink detection</div>
        </div>
        <div className="lfeat">
          <div className="lfeat-icon">📡</div>
          <div className="lfeat-title">Gaze Detection</div>
          <div className="lfeat-desc">Knows when you look away from the screen</div>
        </div>
        <div className="lfeat">
          <div className="lfeat-icon">🎤</div>
          <div className="lfeat-title">Noise Alerts</div>
          <div className="lfeat-desc">Flags sustained ambient sound distractions</div>
        </div>
        <div className="lfeat">
          <div className="lfeat-icon">📊</div>
          <div className="lfeat-title">Session History</div>
          <div className="lfeat-desc">Track your focus scores across sessions</div>
        </div>
      </div>

      <SignedOut>
        <div className="landing-btns">
          <SignUpButton mode="modal">
            <button className="btn-cta">Get Started →</button>
          </SignUpButton>
          <SignInButton mode="modal">
            <button className="btn-cta-outline">Sign In</button>
          </SignInButton>
        </div>
      </SignedOut>

      <SignedIn>
        <a href="/dashboard" className="btn-cta">Open App →</a>
      </SignedIn>
    </div>
  )
}
