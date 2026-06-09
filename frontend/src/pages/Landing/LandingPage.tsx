import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { setSession, getActiveClientId } from "@/lib/session";
import "@/landing.css";

/* ─── intersection reveal ─── */
function useReveal(threshold = 0.12) {
  const ref = useRef<HTMLElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setVisible(true); obs.disconnect(); } },
      { threshold }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);
  return { ref, visible };
}

/* ─── 3D mouse-tracking tilt ─── */
function use3DTilt(strength = 14) {
  const ref = useRef<HTMLDivElement>(null);
  function onMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    el.style.transform = `perspective(900px) rotateY(${x * strength}deg) rotateX(${-y * strength}deg) translateZ(10px)`;
    el.style.transition = "transform 0.05s linear";
    const shine = el.querySelector<HTMLElement>(".lp3-shine");
    if (shine) {
      shine.style.background = `radial-gradient(circle at ${(x + 0.5) * 100}% ${(y + 0.5) * 100}%, rgba(255,255,255,0.12) 0%, transparent 60%)`;
    }
  }
  function onMouseLeave() {
    const el = ref.current;
    if (!el) return;
    el.style.transform = "";
    el.style.transition = "transform 0.6s cubic-bezier(0.23,1,0.32,1)";
    const shine = el.querySelector<HTMLElement>(".lp3-shine");
    if (shine) shine.style.background = "";
  }
  return { ref, onMouseMove, onMouseLeave };
}

/* ─── typewriter ─── */
function Typewriter({ strings, speed = 65 }: { strings: string[]; speed?: number }) {
  const [idx, setIdx] = useState(0);
  const [chars, setChars] = useState(0);
  const [deleting, setDeleting] = useState(false);
  useEffect(() => {
    const current = strings[idx];
    const delay = deleting ? speed / 2 : chars === current.length ? 2000 : speed;
    const t = setTimeout(() => {
      if (!deleting && chars === current.length) setDeleting(true);
      else if (deleting && chars === 0) { setDeleting(false); setIdx((i) => (i + 1) % strings.length); }
      else setChars((c) => c + (deleting ? -1 : 1));
    }, delay);
    return () => clearTimeout(t);
  }, [chars, deleting, idx, strings, speed]);
  return (
    <span className="lp3-tw-text">
      {strings[idx].slice(0, chars)}
      <span className="lp3-cursor" />
    </span>
  );
}

/* ─── auth modal ─── */
type AuthMode = "login" | "signup";
type AuthStep = "login" | "signup" | "verify";
interface AuthModalProps { mode: AuthMode; onClose: () => void; onSuccess: (isNewUser: boolean) => void; }

function AuthModal({ mode: initMode, onClose, onSuccess }: AuthModalProps) {
  const [step, setStep] = useState<AuthStep>(initMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const overlayRef = useRef<HTMLDivElement>(null);

  function handleOverlayClick(e: React.MouseEvent) { if (e.target === overlayRef.current) onClose(); }
  function apiError(err: unknown): string {
    if (axios.isAxiosError(err)) return err.response?.data?.detail ?? err.message;
    return "Something went wrong. Please try again.";
  }

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault(); setError(""); setLoading(true);
    try { await axios.post("/api/auth/signup", { email, name, password }); setStep("verify"); }
    catch (err) { setError(apiError(err)); } finally { setLoading(false); }
  }
  async function handleVerify(e: React.FormEvent) {
    e.preventDefault(); setError(""); setLoading(true);
    try {
      await axios.post("/api/auth/verify-email", { email, code });
      const prevClientId = getActiveClientId();
      const { data } = await axios.post("/api/auth/login", { email, password, prev_client_id: prevClientId });
      setSession(data.token, data.user); onSuccess(true);
    } catch (err) { setError(apiError(err)); } finally { setLoading(false); }
  }
  async function handleLogin(e: React.FormEvent) {
    e.preventDefault(); setError(""); setLoading(true);
    try {
      const prevClientId = getActiveClientId();
      const { data } = await axios.post("/api/auth/login", { email, password, prev_client_id: prevClientId });
      setSession(data.token, data.user); onSuccess(false);
    } catch (err) { setError(apiError(err)); } finally { setLoading(false); }
  }
  async function handleResend() {
    setError(""); setLoading(true);
    try { await axios.post("/api/auth/resend-verification", { email }); }
    catch (err) { setError(apiError(err)); } finally { setLoading(false); }
  }

  const title = step === "login" ? "Welcome back" : step === "signup" ? "Start your free trial" : "Check your inbox";
  const subtitle = step === "login" ? "Sign in to your workspace" : step === "signup" ? "No credit card · 14-day free trial" : `We sent a 6-digit code to ${email}`;

  return (
    <div className="lp3-overlay" ref={overlayRef} onClick={handleOverlayClick}>
      <div className="lp3-modal" role="dialog" aria-modal="true">
        <button className="lp3-modal-close" onClick={onClose} aria-label="Close">×</button>
        <div className="lp3-modal-brand">
          <div className="lp3-mark">A</div>
          <span>ABM Engine</span>
        </div>
        <h2 className="lp3-modal-title">{title}</h2>
        <p className="lp3-modal-sub">{subtitle}</p>
        {error && (
          <div style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 8, padding: "10px 14px", color: "#f87171", fontSize: 13, marginBottom: 12 }}>
            {error}
          </div>
        )}
        {step === "signup" && (
          <form onSubmit={handleSignup} className="lp3-form">
            <div className="lp3-field"><label>Full name</label><input type="text" autoComplete="name" required value={name} onChange={(e) => setName(e.target.value)} placeholder="Alex Johnson" /></div>
            <div className="lp3-field"><label>Work email</label><input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" /></div>
            <div className="lp3-field"><label>Password</label><input type="password" autoComplete="new-password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Min 8 characters" /></div>
            <button type="submit" className="lp3-btn-primary lp3-btn-full" disabled={loading}>{loading ? <span className="lp3-spinner" /> : "Create account →"}</button>
            <p className="lp3-modal-switch">Already have an account? <button type="button" className="lp3-link" onClick={() => { setStep("login"); setError(""); }}>Sign in</button></p>
            <p className="lp3-modal-legal">By creating an account you agree to our <button type="button" className="lp3-link">Terms</button> and <button type="button" className="lp3-link">Privacy Policy</button>.</p>
          </form>
        )}
        {step === "verify" && (
          <form onSubmit={handleVerify} className="lp3-form">
            <div className="lp3-field"><label>Verification code</label><input type="text" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} required value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g,"").slice(0,6))} placeholder="123456" style={{ letterSpacing: "0.3em", fontSize: "1.4em", textAlign: "center" }} /></div>
            <button type="submit" className="lp3-btn-primary lp3-btn-full" disabled={loading || code.length !== 6}>{loading ? <span className="lp3-spinner" /> : "Verify email →"}</button>
            <p className="lp3-modal-switch">Didn't get it? <button type="button" className="lp3-link" onClick={handleResend} disabled={loading}>Resend code</button></p>
          </form>
        )}
        {step === "login" && (
          <form onSubmit={handleLogin} className="lp3-form">
            <div className="lp3-field"><label>Work email</label><input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" /></div>
            <div className="lp3-field"><label>Password</label><input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" /></div>
            <button type="submit" className="lp3-btn-primary lp3-btn-full" disabled={loading}>{loading ? <span className="lp3-spinner" /> : "Sign in →"}</button>
            <p className="lp3-modal-switch">Don't have an account? <button type="button" className="lp3-link" onClick={() => { setStep("signup"); setError(""); }}>Sign up free</button></p>
          </form>
        )}
      </div>
    </div>
  );
}

/* ─── 3D feature card ─── */
interface FeatureCardProps { icon: string; eyebrow: string; title: string; body: string; delay?: number; accent?: string; }
function FeatureCard({ icon, eyebrow, title, body, delay = 0, accent = "#22d3ee" }: FeatureCardProps) {
  const { ref: revealRef, visible } = useReveal();
  const tilt = use3DTilt(10);
  return (
    <div
      ref={revealRef as React.RefObject<HTMLDivElement>}
      style={{ opacity: visible ? 1 : 0, transform: visible ? "translateY(0)" : "translateY(32px)", transition: `opacity 0.6s ease ${delay}ms, transform 0.6s ease ${delay}ms` }}
    >
      <div
        ref={tilt.ref}
        className="lp3-fcard"
        onMouseMove={tilt.onMouseMove}
        onMouseLeave={tilt.onMouseLeave}
        style={{ "--accent": accent } as React.CSSProperties}
      >
        <div className="lp3-shine" />
        <div className="lp3-fcard-icon">{icon}</div>
        <div className="lp3-fcard-eyebrow">{eyebrow}</div>
        <h3 className="lp3-fcard-title">{title}</h3>
        <p className="lp3-fcard-body">{body}</p>
        <div className="lp3-fcard-glow" />
      </div>
    </div>
  );
}

/* ─── stat tile ─── */
function StatTile({ num, label, icon, delay = 0 }: { num: string; label: string; icon: string; delay?: number }) {
  const { ref, visible } = useReveal(0.2);
  const tilt = use3DTilt(8);
  return (
    <div
      ref={ref as React.RefObject<HTMLDivElement>}
      style={{ opacity: visible ? 1 : 0, transform: visible ? "translateY(0)" : "translateY(24px)", transition: `opacity 0.5s ease ${delay}ms, transform 0.5s ease ${delay}ms` }}
    >
      <div ref={tilt.ref} className="lp3-stat-tile" onMouseMove={tilt.onMouseMove} onMouseLeave={tilt.onMouseLeave}>
        <div className="lp3-shine" />
        <div className="lp3-stat-icon">{icon}</div>
        <div className="lp3-stat-num">{num}</div>
        <div className="lp3-stat-label">{label}</div>
      </div>
    </div>
  );
}

/* ─── step card ─── */
function StepCard({ n, title, body, delay }: { n: string; title: string; body: string; delay: number }) {
  const { ref, visible } = useReveal(0.15);
  return (
    <li
      ref={ref as React.RefObject<HTMLLIElement>}
      className="lp3-step"
      style={{ opacity: visible ? 1 : 0, transform: visible ? "translateX(0)" : "translateX(-28px)", transition: `opacity 0.55s ease ${delay}ms, transform 0.55s ease ${delay}ms` }}
    >
      <div className="lp3-step-num">{n}</div>
      <div className="lp3-step-content">
        <h3 className="lp3-step-title">{title}</h3>
        <p className="lp3-step-body">{body}</p>
      </div>
    </li>
  );
}

/* ─── testimonial card ─── */
function TestiCard({ quote, name, role, initials, color, delay }: { quote: string; name: string; role: string; initials: string; color: string; delay: number }) {
  const { ref, visible } = useReveal(0.1);
  const tilt = use3DTilt(7);
  return (
    <div
      ref={ref as React.RefObject<HTMLDivElement>}
      style={{ opacity: visible ? 1 : 0, transform: visible ? "translateY(0)" : "translateY(24px)", transition: `opacity 0.55s ease ${delay}ms, transform 0.55s ease ${delay}ms` }}
    >
      <figure ref={tilt.ref} className="lp3-tcard" onMouseMove={tilt.onMouseMove} onMouseLeave={tilt.onMouseLeave}>
        <div className="lp3-shine" />
        <div className="lp3-tcard-stars">★★★★★</div>
        <blockquote className="lp3-tcard-quote">"{quote}"</blockquote>
        <figcaption className="lp3-tcard-author">
          <div className="lp3-tcard-avatar" style={{ background: color }}>{initials}</div>
          <div>
            <div className="lp3-tcard-name">{name}</div>
            <div className="lp3-tcard-role">{role}</div>
          </div>
        </figcaption>
      </figure>
    </div>
  );
}

/* ─── 3D dashboard preview ─── */
function DashboardPreview() {
  const { ref, visible } = useReveal(0.05);
  const sceneRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = sceneRef.current;
    if (!el) return;
    let raf = 0;
    let tx = 0, ty = 0, cx = 0, cy = 0;
    function onMove(e: MouseEvent) {
      const r = document.body.getBoundingClientRect();
      tx = ((e.clientX / r.width) - 0.5) * 8;
      ty = ((e.clientY / r.height) - 0.5) * -5;
    }
    function tick() {
      cx += (tx - cx) * 0.06;
      cy += (ty - cy) * 0.06;
      if (el) el.style.transform = `perspective(1400px) rotateY(${cx}deg) rotateX(${cy}deg)`;
      raf = requestAnimationFrame(tick);
    }
    window.addEventListener("mousemove", onMove);
    tick();
    return () => { window.removeEventListener("mousemove", onMove); cancelAnimationFrame(raf); };
  }, []);

  return (
    <div
      ref={ref as React.RefObject<HTMLDivElement>}
      className="lp3-preview-outer"
      style={{ opacity: visible ? 1 : 0, transition: "opacity 1.1s ease 0.2s" }}
    >
      {/* depth layers behind */}
      <div className="lp3-preview-shadow lp3-ps-3" />
      <div className="lp3-preview-shadow lp3-ps-2" />
      <div className="lp3-preview-shadow lp3-ps-1" />

      <div ref={sceneRef} className="lp3-preview-scene">
        <div className="lp3-preview">
          {/* top bar */}
          <div className="lp3-prev-bar">
            <div className="lp3-prev-dots">
              <span style={{ background: "#ef4444" }} /><span style={{ background: "#f59e0b" }} /><span style={{ background: "#10b981" }} />
            </div>
            <div className="lp3-prev-brand">
              <div className="lp3-prev-mark">A</div>
              <span>ABM Engine</span>
            </div>
            <div className="lp3-prev-nav">
              {["Accounts","Agents","Pipeline","Visuals"].map((l) => (
                <div key={l} className="lp3-prev-navitem" data-a={l==="Accounts"?"1":"0"}>{l}</div>
              ))}
            </div>
          </div>
          {/* body */}
          <div className="lp3-prev-body">
            {/* KPIs */}
            <div className="lp3-prev-kpis">
              {[["38","Accounts","#22d3ee"],["14","Tier 1","#10b981"],["16","Tier 2","#f59e0b"],["8","Tier 3","#f97316"]].map(([n,l,c]) => (
                <div key={l} className="lp3-prev-kpi" style={{ "--c": c } as React.CSSProperties}>
                  <div className="lp3-prev-kpi-n">{n}</div>
                  <div className="lp3-prev-kpi-l">{l}</div>
                </div>
              ))}
            </div>
            {/* table */}
            <div className="lp3-prev-table">
              <div className="lp3-prev-thead">
                {["Company","Score","Tier","Signal"].map((h) => <div key={h} className="lp3-prev-th">{h}</div>)}
              </div>
              {[
                { name: "Linear",   score: 92, tier: "T1", signal: "Series B",     color: "#6366f1" },
                { name: "Mercury",  score: 88, tier: "T1", signal: "Hiring spike",  color: "#0ea5e9" },
                { name: "Vercel",   score: 81, tier: "T1", signal: "Tech match",    color: "#111" },
                { name: "Rippling", score: 74, tier: "T2", signal: "Expansion",     color: "#10b981" },
                { name: "Notion",   score: 55, tier: "T3", signal: "Funding",       color: "#f59e0b" },
              ].map((row) => (
                <div key={row.name} className="lp3-prev-row">
                  <div className="lp3-prev-cell lp3-prev-co">
                    <div className="lp3-prev-logo" style={{ background: row.color }}>{row.name[0]}</div>
                    {row.name}
                  </div>
                  <div className="lp3-prev-cell">
                    <div className="lp3-prev-bar-wrap">
                      <div className="lp3-prev-bar-fill" style={{ width: `${row.score}%` }} />
                    </div>
                    <span>{row.score}</span>
                  </div>
                  <div className="lp3-prev-cell">
                    <span className={`lp3-prev-tier lp3-tier-${row.tier.toLowerCase()}`}>{row.tier}</span>
                  </div>
                  <div className="lp3-prev-cell lp3-prev-sig">{row.signal}</div>
                </div>
              ))}
            </div>
          </div>
          {/* copilot strip */}
          <div className="lp3-prev-copilot">
            <div className="lp3-prev-copilot-dot" />
            <span>ABM Copilot · 7 agents on standby</span>
            <div className="lp3-prev-fab">✦</div>
          </div>
        </div>
      </div>
      {/* ambient glow */}
      <div className="lp3-preview-glow" />
    </div>
  );
}

/* ─── ticker logos ─── */
const LOGOS = ["Salesforce","HubSpot","Apollo","Outreach","Snowflake","Gong","Harmonic","Crunchbase","LinkedIn","Clearbit","ZoomInfo","6sense"];

/* ─── main page ─── */
export default function LandingPage() {
  const navigate = useNavigate();
  const [authMode, setAuthMode] = useState<AuthMode | null>(null);

  function openLogin()  { setAuthMode("login"); }
  function openSignup() { setAuthMode("signup"); }
  function closeAuth()  { setAuthMode(null); }
  function onAuthSuccess(isNewUser: boolean) { navigate(isNewUser ? "/intake" : "/accounts"); }

  return (
    <>
      <div className="lp3-root">

        {/* ── background geometry ── */}
        <div className="lp3-bg-mesh" aria-hidden="true" />
        <div className="lp3-bg-grid" aria-hidden="true" />

        {/* ── nav ── */}
        <header className="lp3-nav">
          <div className="lp3-nav-inner">
            <div className="lp3-nav-brand">
              <div className="lp3-mark">A</div>
              <span>ABM Engine</span>
            </div>
            <nav className="lp3-nav-links">
              <a href="#features">Features</a>
              <a href="#how-it-works">How it works</a>
              <a href="#customers">Customers</a>
              <a href="#pricing">Pricing</a>
            </nav>
            <div className="lp3-nav-cta">
              <button className="lp3-btn-ghost" onClick={openLogin}>Sign in</button>
              <button className="lp3-btn-primary" onClick={openSignup}>Start free →</button>
            </div>
          </div>
        </header>

        {/* ── hero ── */}
        <section className="lp3-hero">
          {/* floating geometric orbs */}
          <div className="lp3-orb lp3-orb-1" aria-hidden="true" />
          <div className="lp3-orb lp3-orb-2" aria-hidden="true" />
          <div className="lp3-orb lp3-orb-3" aria-hidden="true" />
          {/* 3D wireframe cubes */}
          <div className="lp3-cube lp3-cube-1" aria-hidden="true"><div className="lp3-cube-inner" /></div>
          <div className="lp3-cube lp3-cube-2" aria-hidden="true"><div className="lp3-cube-inner" /></div>

          <div className="lp3-hero-grid">
            <div className="lp3-hero-left">
              <div className="lp3-hero-badge">
                <span className="lp3-badge-pulse" />
                7 AI agents · always on
              </div>

              <h1 className="lp3-hero-h1">
                Turn your ICP<br />into a{" "}
                <Typewriter strings={["revenue engine", "pipeline machine", "Tier-1 hit list", "closing machine"]} />
              </h1>

              <p className="lp3-hero-sub">
                ABM Engine automatically discovers, scores, and sequences your ideal accounts —
                so your revenue team spends time closing, not researching.
              </p>

              <div className="lp3-hero-cta">
                <button className="lp3-btn-primary lp3-btn-lg lp3-btn-glow" onClick={openSignup}>
                  <span className="lp3-btn-shine" />
                  Start free trial →
                </button>
                <button className="lp3-btn-ghost lp3-btn-lg" onClick={openLogin}>
                  See live demo
                </button>
              </div>

              <div className="lp3-hero-social">
                <div className="lp3-avatars">
                  {["#6366f1","#10b981","#f59e0b","#ef4444"].map((c, i) => (
                    <div key={i} className="lp3-avatar" style={{ background: c, marginLeft: i ? -10 : 0 }} />
                  ))}
                </div>
                <span>Trusted by <strong>400+</strong> revenue teams</span>
              </div>
            </div>

            <div className="lp3-hero-right">
              <DashboardPreview />
            </div>
          </div>

          {/* perspective floor grid */}
          <div className="lp3-floor-grid" aria-hidden="true" />
        </section>

        {/* ── ticker ── */}
        <div className="lp3-ticker">
          <p className="lp3-ticker-label">Integrates with your existing stack</p>
          <div className="lp3-ticker-wrap">
            <div className="lp3-ticker-track">
              {[...LOGOS, ...LOGOS].map((l, i) => <span key={i} className="lp3-ticker-item">{l}</span>)}
            </div>
          </div>
        </div>

        {/* ── stats ── */}
        <section className="lp3-stats-section" id="customers">
          <div className="lp3-section-inner">
            <div className="lp3-section-head">
              <div className="lp3-eyebrow">By the numbers</div>
              <h2 className="lp3-section-h2">Results that speak for themselves</h2>
            </div>
            <div className="lp3-stats-grid">
              <StatTile num="38k+" label="Accounts scored per month" icon="📈" delay={0} />
              <StatTile num="3.4×" label="Pipeline coverage increase" icon="🚀" delay={80} />
              <StatTile num="14%" label="Average reply rate" icon="✉️" delay={160} />
              <StatTile num="< 10 min" label="Time to first Tier-1 list" icon="⚡" delay={240} />
            </div>
          </div>
        </section>

        {/* ── features ── */}
        <section className="lp3-features" id="features">
          <div className="lp3-section-inner">
            <div className="lp3-section-head">
              <div className="lp3-eyebrow">Built for modern revenue teams</div>
              <h2 className="lp3-section-h2">Seven AI agents.<br />One revenue command center.</h2>
              <p className="lp3-section-sub">
                Every part of your ABM motion — discovery, enrichment, signal detection, sequencing,
                and campaign visuals — runs automatically while your reps focus on conversations.
              </p>
            </div>
            <div className="lp3-features-grid">
              <FeatureCard icon="🎯" eyebrow="ICP Scout" title="Discover accounts that match your exact ICP" body="Define your ideal customer profile once. ICP Scout surfaces and scores accounts from Apollo, Harmonic, Crunchbase, and BuiltWith — ranked by fit, not volume." delay={0} accent="#22d3ee" />
              <FeatureCard icon="👥" eyebrow="Buyer Intel" title="Map every buying committee automatically" body="Know the VP Sales, CRO, and RevOps Director at every Tier-1 account before your first touch. Buyer Intel enriches personas with pain points and messaging hooks." delay={80} accent="#a855f7" />
              <FeatureCard icon="⚡" eyebrow="Signal Watcher" title="Never miss a buying trigger again" body="Funding rounds, hiring spikes, tech-stack changes — Signal Watcher monitors your account list 24/7 and surfaces the right accounts at the right moment." delay={160} accent="#10b981" />
              <FeatureCard icon="✉️" eyebrow="Sequence Author" title="Outbound sequences written in your voice" body="Paste in your best-performing emails. Sequence Author drafts personalized, trigger-aware outreach for every account and persona — ready to review, not rewrite." delay={0} accent="#f59e0b" />
              <FeatureCard icon="🤖" eyebrow="AI Copilot" title="One chat interface for your entire pipeline" body="Ask in plain English. 'Build a 5-step sequence for Tier-1 fintech accounts with a recent Series B.' The Copilot plans, executes, and checks in before anything ships." delay={80} accent="#6366f1" />
              <FeatureCard icon="📊" eyebrow="ICP Score" title="Transparent scoring you can trust" body="Every account gets a 0–100 score with full breakdown: industry fit, company size, geography, tech stack, funding stage, and buying triggers. No black boxes." delay={160} accent="#22d3ee" />
              <FeatureCard icon="🎨" eyebrow="Visual Agent" title="On-brand campaign visuals, automatically" body="For every approved message, Visual Agent generates a Canva-quality design — email banners, LinkedIn visuals, and more — matched to your brand kit. No design team needed." delay={80} accent="#ec4899" />
            </div>
          </div>
        </section>

        {/* ── how it works ── */}
        <section className="lp3-how" id="how-it-works">
          <div className="lp3-section-inner lp3-how-layout">
            <div className="lp3-how-left">
              <div className="lp3-eyebrow">How it works</div>
              <h2 className="lp3-section-h2">From ICP to pipeline<br />in four steps</h2>
              <p className="lp3-section-sub" style={{ textAlign: "left", margin: 0 }}>
                Setup takes 10 minutes. After that, the agents run continuously — surfacing accounts,
                drafting sequences, and alerting on signals automatically.
              </p>
            </div>
            <ol className="lp3-steps" aria-label="Setup steps">
              {[
                { n: "01", title: "Define your ICP", body: "Fill in the intake form — target industries, company size, funding stage, buying triggers, and negative ICP exclusions. Takes about 8 minutes." },
                { n: "02", title: "Agents discover & score", body: "ICP Scout surfaces accounts across your connected data sources. Every account is scored against your ICP and bucketed into Tier 1, 2, or 3." },
                { n: "03", title: "Review & approve", body: "You get a curated list with full score breakdowns, buying signals, and committee maps. Remove anything that doesn't fit — the model learns." },
                { n: "04", title: "Sequences ship", body: "Sequence Author drafts personalized outreach. You review, approve, and launch — to exactly the right people at exactly the right moment." },
              ].map((s, i) => <StepCard key={s.n} {...s} delay={i * 120} />)}
            </ol>
          </div>
        </section>

        {/* ── testimonials ── */}
        <section className="lp3-testimonials">
          <div className="lp3-section-inner">
            <div className="lp3-section-head">
              <div className="lp3-eyebrow">What revenue leaders say</div>
              <h2 className="lp3-section-h2">Trusted by teams that run tight ABM</h2>
            </div>
            <div className="lp3-tcards-grid">
              {[
                { quote: "We went from a manually curated list of 200 accounts to 800 scored accounts in a weekend. The Tier-1 precision is genuinely surprising — these are the exact companies we'd have picked ourselves.", name: "Sarah Chen", role: "VP Revenue · Meridian Analytics", initials: "SC", color: "linear-gradient(135deg,#6366f1,#8b5cf6)" },
                { quote: "Signal Watcher alone pays for the tool. We get alerted the moment a target account announces a funding round, hires a new CRO, or adopts a new tech. That's 30-minute response time vs. 3 weeks.", name: "Marcus Webb", role: "Head of Sales · Orbital Labs", initials: "MW", color: "linear-gradient(135deg,#10b981,#059669)" },
                { quote: "The Copilot is the product. I told it to build a 5-step Series B sequence targeting RevOps and CROs — it came back with a full plan, subject lines, and persona-specific hooks. We shipped it same day.", name: "Priya Mehta", role: "CRO · Cascade Revenue", initials: "PM", color: "linear-gradient(135deg,#f59e0b,#d97706)" },
              ].map((t, i) => <TestiCard key={t.name} {...t} delay={i * 120} />)}
            </div>
          </div>
        </section>

        {/* ── pricing ── */}
        <section className="lp3-pricing" id="pricing">
          <div className="lp3-section-inner">
            <div className="lp3-section-head">
              <div className="lp3-eyebrow">Pricing</div>
              <h2 className="lp3-section-h2">Simple, transparent pricing</h2>
              <p className="lp3-section-sub">Start free. Scale as your pipeline grows.</p>
            </div>
            <div className="lp3-plans-grid">
              {[
                { name: "Starter", price: "$199", period: "/mo", desc: "For early-stage teams building their first ICP list.", features: ["Up to 500 scored accounts", "ICP Scout + Buyer Intel", "2 active sequences", "Copilot (100 queries/mo)", "Email support"], cta: "Start free trial", hot: false },
                { name: "Growth", price: "$599", period: "/mo", desc: "For scaling revenue teams running full ABM motions.", features: ["Up to 5,000 scored accounts", "All 7 agents", "Unlimited sequences", "Copilot (unlimited)", "Signal Watcher alerts", "CRM sync (HubSpot / Salesforce)", "Priority support"], cta: "Start free trial", hot: true },
                { name: "Enterprise", price: "Custom", period: "", desc: "For enterprise teams with custom data and compliance needs.", features: ["Unlimited accounts", "Custom data sources", "SSO + SCIM provisioning", "Dedicated CSM", "SLA + compliance review", "Custom agent workflows"], cta: "Talk to sales", hot: false },
              ].map((p) => (
                <div key={p.name} className={`lp3-plan ${p.hot ? "lp3-plan-hot" : ""}`}>
                  {p.hot && <div className="lp3-plan-badge">Most popular</div>}
                  <div className="lp3-shine" />
                  <div className="lp3-plan-name">{p.name}</div>
                  <div className="lp3-plan-price">
                    <span className="lp3-plan-price-n">{p.price}</span>
                    <span className="lp3-plan-price-per">{p.period}</span>
                  </div>
                  <p className="lp3-plan-desc">{p.desc}</p>
                  <ul className="lp3-plan-feats">
                    {p.features.map((f) => <li key={f}><span className="lp3-check">✓</span>{f}</li>)}
                  </ul>
                  <button className={p.hot ? "lp3-btn-primary lp3-btn-full" : "lp3-btn-outline lp3-btn-full"} onClick={openSignup}>
                    {p.cta} →
                  </button>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── CTA ── */}
        <section className="lp3-cta">
          <div className="lp3-cta-grid" aria-hidden="true" />
          <div className="lp3-cta-orb" aria-hidden="true" />
          <div className="lp3-cta-inner">
            <div className="lp3-eyebrow">Get started today</div>
            <h2 className="lp3-cta-h2">
              Your next 50 Tier-1 accounts<br />are already out there.
            </h2>
            <p className="lp3-cta-sub">
              Join revenue teams using ABM Engine to run precise, agent-powered account-based motion.
            </p>
            <button className="lp3-btn-primary lp3-btn-lg lp3-btn-glow lp3-btn-white" onClick={openSignup}>
              <span className="lp3-btn-shine" />
              Start your free trial →
            </button>
            <p className="lp3-cta-note">No credit card required · cancel anytime · setup in 10 minutes</p>
          </div>
        </section>

        {/* ── footer ── */}
        <footer className="lp3-footer">
          <div className="lp3-footer-inner">
            <div className="lp3-footer-brand">
              <div className="lp3-mark" style={{ width: 24, height: 24, fontSize: 11 }}>A</div>
              <span>ABM Engine</span>
            </div>
            <nav className="lp3-footer-links">
              {["Features","Pricing","Docs","Blog","Changelog","Status"].map((l) => (
                <a key={l} href={`#${l.toLowerCase()}`}>{l}</a>
              ))}
            </nav>
            <div className="lp3-footer-legal">
              © {new Date().getFullYear()} ABM Engine, Inc. ·{" "}
              <button className="lp3-link" style={{ marginLeft: 4 }}>Privacy</button>
              {" · "}
              <button className="lp3-link">Terms</button>
            </div>
          </div>
        </footer>

      </div>

      {authMode && <AuthModal mode={authMode} onClose={closeAuth} onSuccess={onAuthSuccess} />}

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
        "@context": "https://schema.org",
        "@type": "SoftwareApplication",
        "name": "ABM Engine",
        "applicationCategory": "BusinessApplication",
        "description": "AI-powered account-based marketing platform that discovers, scores, and sequences ideal customer accounts automatically.",
        "offers": { "@type": "Offer", "price": "199", "priceCurrency": "USD" },
      })}} />
    </>
  );
}
