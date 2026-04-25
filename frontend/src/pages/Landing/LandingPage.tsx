import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import "@/landing.css";

/* ─── tiny hook: intersection observer for scroll-reveal ─── */
function useReveal(threshold = 0.15) {
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

/* ─── typewriter ─── */
function Typewriter({ strings, speed = 60 }: { strings: string[]; speed?: number }) {
  const [idx, setIdx] = useState(0);
  const [chars, setChars] = useState(0);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const current = strings[idx];
    const delay = deleting ? speed / 2 : chars === current.length ? 1800 : speed;
    const t = setTimeout(() => {
      if (!deleting && chars === current.length) {
        setDeleting(true);
      } else if (deleting && chars === 0) {
        setDeleting(false);
        setIdx((i) => (i + 1) % strings.length);
      } else {
        setChars((c) => c + (deleting ? -1 : 1));
      }
    }, delay);
    return () => clearTimeout(t);
  }, [chars, deleting, idx, strings, speed]);

  return (
    <span style={{ color: "var(--acc-500)" }}>
      {strings[idx].slice(0, chars)}
      <span className="lp-cursor" />
    </span>
  );
}

/* ─── auth modal ─── */
type AuthMode = "login" | "signup";
interface AuthModalProps { mode: AuthMode; onClose: () => void; onSuccess: () => void; }

function AuthModal({ mode: initMode, onClose, onSuccess }: AuthModalProps) {
  const [mode, setMode] = useState<AuthMode>(initMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);

  function handleOverlayClick(e: React.MouseEvent) {
    if (e.target === overlayRef.current) onClose();
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      onSuccess();
    }, 900);
  }

  return (
    <div className="lp-overlay" ref={overlayRef} onClick={handleOverlayClick}>
      <div className="lp-modal" role="dialog" aria-modal="true" aria-label={mode === "login" ? "Sign in" : "Create account"}>
        <button className="lp-modal-close" onClick={onClose} aria-label="Close">×</button>

        <div className="lp-modal-brand">
          <div className="lp-modal-mark">A</div>
          <span>ABM Engine</span>
        </div>

        <h2 className="lp-modal-title">
          {mode === "login" ? "Welcome back" : "Start your free trial"}
        </h2>
        <p className="lp-modal-sub">
          {mode === "login"
            ? "Sign in to your workspace"
            : "No credit card required · 14-day free trial"}
        </p>

        <form onSubmit={handleSubmit} className="lp-modal-form">
          {mode === "signup" && (
            <div className="lp-field">
              <label htmlFor="auth-name">Full name</label>
              <input
                id="auth-name"
                type="text"
                autoComplete="name"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Maya Okafor"
              />
            </div>
          )}
          <div className="lp-field">
            <label htmlFor="auth-email">Work email</label>
            <input
              id="auth-email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
            />
          </div>
          <div className="lp-field">
            <label htmlFor="auth-password" style={{ display: "flex", justifyContent: "space-between" }}>
              <span>Password</span>
              {mode === "login" && (
                <button type="button" className="lp-link" tabIndex={-1}>Forgot?</button>
              )}
            </label>
            <input
              id="auth-password"
              type="password"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </div>

          <button type="submit" className="lp-btn-primary lp-btn-full" disabled={loading}>
            {loading
              ? <span className="lp-spinner" />
              : mode === "login" ? "Sign in →" : "Create account →"}
          </button>
        </form>

        <div className="lp-divider"><span>or continue with</span></div>

        <button className="lp-btn-oauth" onClick={() => { setLoading(true); setTimeout(onSuccess, 900); }}>
          <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          Continue with Google
        </button>

        <p className="lp-modal-switch">
          {mode === "login" ? "Don't have an account? " : "Already have an account? "}
          <button type="button" className="lp-link" onClick={() => setMode(mode === "login" ? "signup" : "login")}>
            {mode === "login" ? "Sign up free" : "Sign in"}
          </button>
        </p>

        {mode === "signup" && (
          <p className="lp-modal-legal">
            By creating an account you agree to our{" "}
            <button type="button" className="lp-link">Terms of Service</button>
            {" "}and{" "}
            <button type="button" className="lp-link">Privacy Policy</button>.
          </p>
        )}
      </div>
    </div>
  );
}

/* ─── step item ─── */
interface StepItemProps { n: string; title: string; body: string; delay: number; }
function StepItem({ n, title, body, delay }: StepItemProps) {
  const { ref, visible } = useReveal(0.2);
  return (
    <li
      ref={ref as React.RefObject<HTMLLIElement>}
      className="lp-step"
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "translateX(0)" : "translateX(-24px)",
        transition: `opacity 0.5s ease ${delay}ms, transform 0.5s ease ${delay}ms`,
      }}
    >
      <div className="lp-step-num" aria-hidden="true">{n}</div>
      <div>
        <h3 className="lp-step-title">{title}</h3>
        <p className="lp-step-body">{body}</p>
      </div>
    </li>
  );
}

/* ─── testimonial card ─── */
interface TestimonialCardProps { quote: string; name: string; role: string; initials: string; color: string; delay: number; }
function TestimonialCard({ quote, name, role, initials, color, delay }: TestimonialCardProps) {
  const { ref, visible } = useReveal(0.15);
  return (
    <figure
      ref={ref as React.RefObject<HTMLElement>}
      className="lp-testimonial"
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(20px)",
        transition: `opacity 0.5s ease ${delay}ms, transform 0.5s ease ${delay}ms`,
      }}
    >
      <blockquote className="lp-testimonial-quote">"{quote}"</blockquote>
      <figcaption className="lp-testimonial-author">
        <div className="lp-testimonial-avatar" style={{ background: color }}>{initials}</div>
        <div>
          <div className="lp-testimonial-name">{name}</div>
          <div className="lp-testimonial-role">{role}</div>
        </div>
      </figcaption>
    </figure>
  );
}

/* ─── feature card ─── */
interface FeatureCardProps {
  icon: string;
  eyebrow: string;
  title: string;
  body: string;
  delay?: number;
}

function FeatureCard({ icon, eyebrow, title, body, delay = 0 }: FeatureCardProps) {
  const { ref, visible } = useReveal();
  return (
    <article
      ref={ref as React.RefObject<HTMLElement>}
      className="lp-feature-card"
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(24px)",
        transition: `opacity 0.5s ease ${delay}ms, transform 0.5s ease ${delay}ms`,
      }}
    >
      <div className="lp-feature-icon">{icon}</div>
      <div className="lp-feature-eyebrow">{eyebrow}</div>
      <h3 className="lp-feature-title">{title}</h3>
      <p className="lp-feature-body">{body}</p>
    </article>
  );
}

/* ─── stat ─── */
function Stat({ num, label, delay = 0 }: { num: string; label: string; delay?: number }) {
  const { ref, visible } = useReveal(0.3);
  return (
    <div
      ref={ref as React.RefObject<HTMLDivElement>}
      className="lp-stat"
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(16px)",
        transition: `opacity 0.45s ease ${delay}ms, transform 0.45s ease ${delay}ms`,
      }}
    >
      <div className="lp-stat-num">{num}</div>
      <div className="lp-stat-label">{label}</div>
    </div>
  );
}

/* ─── mock dashboard screenshot ─── */
function DashboardPreview() {
  const { ref, visible } = useReveal(0.1);
  return (
    <div
      ref={ref as React.RefObject<HTMLDivElement>}
      className="lp-preview-wrap"
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "perspective(1200px) rotateX(0deg) translateY(0)" : "perspective(1200px) rotateX(4deg) translateY(40px)",
        transition: "opacity 0.9s ease, transform 0.9s ease",
      }}
    >
      <div className="lp-preview">
        {/* Mock nav */}
        <div className="lp-preview-nav">
          <div className="lp-preview-brand">
            <div className="lp-preview-mark">A</div>
            <span>ABM Engine</span>
          </div>
          {["Accounts", "Sequences", "Agents", "Intake"].map((l) => (
            <div key={l} className="lp-preview-navitem" data-active={l === "Accounts" ? "true" : "false"}>{l}</div>
          ))}
        </div>
        {/* Mock content */}
        <div className="lp-preview-body">
          {/* KPI tiles */}
          <div className="lp-preview-kpi-row">
            {[["38", "Accounts"], ["92", "Avg score"], ["14", "Tier 1"], ["$2.1M", "Pipeline"]].map(([n, l]) => (
              <div key={l} className="lp-preview-kpi">
                <div className="lp-preview-kpi-num">{n}</div>
                <div className="lp-preview-kpi-label">{l}</div>
              </div>
            ))}
          </div>
          {/* Mock rows */}
          <div className="lp-preview-table">
            <div className="lp-preview-thead">
              {["Company", "Score", "Tier", "Signal", "Source"].map((h) => (
                <div key={h} className="lp-preview-th">{h}</div>
              ))}
            </div>
            {[
              { name: "Linear", score: 92, tier: "T1", signal: "Series B", color: "#6366f1" },
              { name: "Mercury", score: 88, tier: "T1", signal: "Hiring spike", color: "#0ea5e9" },
              { name: "Vercel", score: 81, tier: "T1", signal: "Tech match", color: "#111110" },
              { name: "Rippling", score: 74, tier: "T2", signal: "Expansion", color: "#10b981" },
              { name: "Notion", score: 68, tier: "T2", signal: "Funding", color: "#f59e0b" },
            ].map((row) => (
              <div key={row.name} className="lp-preview-row">
                <div className="lp-preview-cell lp-preview-company">
                  <div className="lp-preview-logo" style={{ background: row.color }}>
                    {row.name[0]}
                  </div>
                  {row.name}
                </div>
                <div className="lp-preview-cell">
                  <div className="lp-preview-score-bar" style={{ "--score": `${row.score}%` } as React.CSSProperties} />
                  <span>{row.score}</span>
                </div>
                <div className="lp-preview-cell">
                  <span className={`lp-preview-tier lp-preview-tier-${row.tier.toLowerCase()}`}>{row.tier}</span>
                </div>
                <div className="lp-preview-cell lp-preview-signal">{row.signal}</div>
                <div className="lp-preview-cell">
                  <span className="lp-preview-source">Apollo</span>
                </div>
              </div>
            ))}
          </div>
        </div>
        {/* Mock copilot strip */}
        <div className="lp-preview-copilot">
          <div className="lp-preview-copilot-msg">
            <span className="lp-preview-copilot-dot" />
            ABM Copilot · 4 agents on standby
          </div>
          <div className="lp-preview-copilot-input">Build a sequence for Tier 1…</div>
        </div>
      </div>
      {/* Glow effect */}
      <div className="lp-preview-glow" aria-hidden="true" />
    </div>
  );
}

/* ─── logo ticker ─── */
const LOGOS = ["Salesforce", "HubSpot", "Apollo", "Outreach", "Snowflake", "Gong", "Harmonic", "Crunchbase", "LinkedIn", "Clearbit"];

/* ─── main page ─── */
export default function LandingPage() {
  const navigate = useNavigate();
  const [authMode, setAuthMode] = useState<AuthMode | null>(null);

  function openLogin()  { setAuthMode("login"); }
  function openSignup() { setAuthMode("signup"); }
  function closeAuth()  { setAuthMode(null); }
  function onAuthSuccess() { navigate("/accounts"); }

  const heroRef = useReveal(0.05);

  return (
    <>
      {/* ── SEO meta is in index.html; structured data via JSON-LD ── */}
      <div className="lp-root">

        {/* ── Top nav ── */}
        <header className="lp-topnav" role="banner">
          <div className="lp-topnav-inner">
            <div className="lp-topnav-brand">
              <div className="lp-topnav-mark">A</div>
              <span>ABM Engine</span>
            </div>
            <nav className="lp-topnav-links" aria-label="Main navigation">
              <a href="#features">Features</a>
              <a href="#how-it-works">How it works</a>
              <a href="#social-proof">Customers</a>
              <a href="#pricing">Pricing</a>
            </nav>
            <div className="lp-topnav-cta">
              <button className="lp-btn-ghost" onClick={openLogin}>Sign in</button>
              <button className="lp-btn-primary" onClick={openSignup}>Start free →</button>
            </div>
          </div>
        </header>

        {/* ── Hero ── */}
        <section
          className="lp-hero"
          aria-labelledby="hero-headline"
          ref={heroRef.ref as React.RefObject<HTMLElement>}
          style={{
            opacity: heroRef.visible ? 1 : 0,
            transform: heroRef.visible ? "translateY(0)" : "translateY(20px)",
            transition: "opacity 0.7s ease, transform 0.7s ease",
          }}
        >
          <div className="lp-hero-inner">
            <div className="lp-hero-badge">
              <span className="lp-hero-badge-dot" aria-hidden="true" />
              Now with AI-powered Copilot · 4 agents, always on
            </div>

            <h1 id="hero-headline" className="lp-hero-h1">
              Turn your ICP into a<br />
              <Typewriter strings={["revenue engine", "pipeline machine", "Tier-1 hit list", "closing machine"]} />
            </h1>

            <p className="lp-hero-sub">
              ABM Engine automatically discovers, scores, and sequences your ideal accounts —
              so your revenue team spends time closing, not researching.
            </p>

            <div className="lp-hero-actions">
              <button className="lp-btn-primary lp-btn-lg" onClick={openSignup}>
                Start free trial →
              </button>
              <button className="lp-btn-ghost lp-btn-lg" onClick={openLogin}>
                See a live demo
              </button>
            </div>

            <p className="lp-hero-footnote">
              No credit card · 14-day trial · Setup in under 10 minutes
            </p>
          </div>

          <DashboardPreview />
        </section>

        {/* ── Logo ticker ── */}
        <section className="lp-ticker" aria-label="Integrates with your existing stack">
          <p className="lp-ticker-label">Integrates with your stack</p>
          <div className="lp-ticker-track-wrap" aria-hidden="true">
            <div className="lp-ticker-track">
              {[...LOGOS, ...LOGOS].map((l, i) => (
                <span key={i} className="lp-ticker-logo">{l}</span>
              ))}
            </div>
          </div>
        </section>

        {/* ── Stats ── */}
        <section className="lp-stats" aria-label="Platform metrics" id="social-proof">
          <div className="lp-section-inner">
            <Stat num="38k+" label="Accounts scored per month" delay={0} />
            <Stat num="3.4×" label="Pipeline coverage increase" delay={80} />
            <Stat num="14%" label="Average reply rate" delay={160} />
            <Stat num="< 10 min" label="Time to first Tier-1 list" delay={240} />
          </div>
        </section>

        {/* ── Features ── */}
        <section className="lp-features-section" id="features" aria-labelledby="features-headline">
          <div className="lp-section-inner">
            <div className="lp-section-header">
              <div className="lp-eyebrow">Built for modern revenue teams</div>
              <h2 id="features-headline" className="lp-section-h2">
                Four AI agents.<br />One revenue command center.
              </h2>
              <p className="lp-section-sub">
                Every part of your ABM motion — discovery, enrichment, signal detection, and sequencing —
                runs automatically in the background while your reps focus on conversations.
              </p>
            </div>

            <div className="lp-features-grid">
              <FeatureCard
                icon="🎯"
                eyebrow="ICP Scout"
                title="Discover accounts that match your exact ICP"
                body="Define your ideal customer profile once. ICP Scout continuously surfaces and scores accounts from Apollo, Harmonic, Crunchbase, and BuiltWith — ranked by fit, not volume."
                delay={0}
              />
              <FeatureCard
                icon="👥"
                eyebrow="Buyer Intel"
                title="Map every buying committee automatically"
                body="Know the VP Sales, CRO, and RevOps Director at every Tier-1 account before your first touch. Buyer Intel enriches personas with pain points and messaging hooks."
                delay={80}
              />
              <FeatureCard
                icon="⚡"
                eyebrow="Signal Watcher"
                title="Never miss a buying trigger again"
                body="Funding rounds, hiring spikes, tech-stack changes, expansion announcements — Signal Watcher monitors your account list 24/7 and bubbles the right accounts to the top."
                delay={160}
              />
              <FeatureCard
                icon="✉️"
                eyebrow="Sequence Author"
                title="Outbound sequences written in your voice"
                body="Paste in your best-performing emails. Sequence Author learns your tone and drafts personalized, trigger-aware outreach for every account and persona — ready to review, not rewrite."
                delay={240}
              />
              <FeatureCard
                icon="🤖"
                eyebrow="AI Copilot"
                title="One chat interface for your entire pipeline"
                body="Ask in plain English. 'Build a 5-step sequence for Tier-1 fintech accounts with a recent Series B.' The Copilot plans, executes, and checks in before anything ships."
                delay={320}
              />
              <FeatureCard
                icon="📊"
                eyebrow="ICP Score"
                title="Transparent scoring you can trust"
                body="Every account gets a 0–100 score with a full breakdown: industry fit, company size, geography, tech stack, funding stage, and buying triggers. No black boxes."
                delay={400}
              />
            </div>
          </div>
        </section>

        {/* ── How it works ── */}
        <section className="lp-how" id="how-it-works" aria-labelledby="how-headline">
          <div className="lp-section-inner">
            <div className="lp-section-header">
              <div className="lp-eyebrow">How it works</div>
              <h2 id="how-headline" className="lp-section-h2">From ICP to pipeline in four steps</h2>
            </div>
            <ol className="lp-steps" aria-label="Setup steps">
              {[
                { n: "01", title: "Define your ICP", body: "Fill in the intake form — target industries, company size, funding stage, buying triggers, and negative ICP exclusions. Takes about 8 minutes." },
                { n: "02", title: "Agents discover & score", body: "ICP Scout surfaces accounts across your connected data sources. Every account is scored against your ICP and bucketed into Tier 1, 2, or 3." },
                { n: "03", title: "Review & approve", body: "You get a curated list with full score breakdowns, buying signals, and committee maps. Remove anything that doesn't fit — the model learns." },
                { n: "04", title: "Sequences ship", body: "Sequence Author drafts personalized outreach. You review, approve, and launch — to exactly the right people at exactly the right moment." },
              ].map((s, i) => (
                <StepItem key={s.n} {...s} delay={i * 100} />
              ))}
            </ol>
          </div>
        </section>

        {/* ── Social proof ── */}
        <section className="lp-testimonials" aria-labelledby="testimonials-headline">
          <div className="lp-section-inner">
            <div className="lp-section-header">
              <div className="lp-eyebrow">What revenue leaders say</div>
              <h2 id="testimonials-headline" className="lp-section-h2">Trusted by teams that run tight ABM</h2>
            </div>
            <div className="lp-testimonials-grid">
              {[
                {
                  quote: "We went from a manually curated list of 200 accounts to 800 scored accounts in a weekend. The Tier-1 precision is genuinely surprising — these are the exact companies we'd have picked ourselves.",
                  name: "Sarah Chen",
                  role: "VP Revenue · Meridian Analytics",
                  initials: "SC",
                  color: "#6366f1",
                },
                {
                  quote: "Signal Watcher alone pays for the tool. We get alerted the moment a target account announces a funding round, hires a new CRO, or adopts a new tech. That's 30-minute response time vs. 3 weeks.",
                  name: "Marcus Webb",
                  role: "Head of Sales · Orbital Labs",
                  initials: "MW",
                  color: "#10b981",
                },
                {
                  quote: "The Copilot is the product. I told it to build a 5-step Series B sequence targeting RevOps and CROs — it came back with a full plan, subject lines, and persona-specific hooks. We shipped it same day.",
                  name: "Priya Mehta",
                  role: "CRO · Cascade Revenue",
                  initials: "PM",
                  color: "#f59e0b",
                },
              ].map((t, i) => (
                <TestimonialCard key={t.name} {...t} delay={i * 100} />
              ))}
            </div>
          </div>
        </section>

        {/* ── Pricing ── */}
        <section className="lp-pricing" id="pricing" aria-labelledby="pricing-headline">
          <div className="lp-section-inner">
            <div className="lp-section-header">
              <div className="lp-eyebrow">Pricing</div>
              <h2 id="pricing-headline" className="lp-section-h2">Simple, transparent pricing</h2>
              <p className="lp-section-sub">Start free. Scale as your pipeline grows.</p>
            </div>
            <div className="lp-pricing-grid">
              {[
                {
                  name: "Starter",
                  price: "$199",
                  period: "/mo",
                  desc: "For early-stage teams building their first ICP list.",
                  features: ["Up to 500 scored accounts", "ICP Scout + Buyer Intel", "2 active sequences", "Copilot (100 queries/mo)", "Email support"],
                  cta: "Start free trial",
                  featured: false,
                },
                {
                  name: "Growth",
                  price: "$599",
                  period: "/mo",
                  desc: "For scaling revenue teams running full ABM motions.",
                  features: ["Up to 5,000 scored accounts", "All 4 agents", "Unlimited sequences", "Copilot (unlimited)", "Signal Watcher alerts", "CRM sync (HubSpot / Salesforce)", "Priority support"],
                  cta: "Start free trial",
                  featured: true,
                },
                {
                  name: "Enterprise",
                  price: "Custom",
                  period: "",
                  desc: "For enterprise teams with custom data and compliance needs.",
                  features: ["Unlimited accounts", "Custom data sources", "SSO + SCIM provisioning", "Dedicated CSM", "SLA + compliance review", "Custom agent workflows"],
                  cta: "Talk to sales",
                  featured: false,
                },
              ].map((p) => (
                <div key={p.name} className={`lp-plan ${p.featured ? "lp-plan-featured" : ""}`}>
                  {p.featured && <div className="lp-plan-badge">Most popular</div>}
                  <div className="lp-plan-name">{p.name}</div>
                  <div className="lp-plan-price">
                    <span className="lp-plan-price-num">{p.price}</span>
                    <span className="lp-plan-price-period">{p.period}</span>
                  </div>
                  <p className="lp-plan-desc">{p.desc}</p>
                  <ul className="lp-plan-features" aria-label={`${p.name} features`}>
                    {p.features.map((f) => (
                      <li key={f}><span className="lp-plan-check" aria-hidden="true">✓</span>{f}</li>
                    ))}
                  </ul>
                  <button
                    className={p.featured ? "lp-btn-primary lp-btn-full" : "lp-btn-outline lp-btn-full"}
                    onClick={openSignup}
                  >
                    {p.cta} →
                  </button>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── CTA banner ── */}
        <section className="lp-cta-banner" aria-labelledby="cta-headline">
          <div className="lp-cta-inner">
            <h2 id="cta-headline" className="lp-cta-h2">
              Your next 50 Tier-1 accounts are<br />already out there. Let's find them.
            </h2>
            <p className="lp-cta-sub">
              Join revenue teams using ABM Engine to run precise, agent-powered account-based motion.
            </p>
            <button className="lp-btn-primary lp-btn-lg lp-btn-white" onClick={openSignup}>
              Start your free trial →
            </button>
            <p className="lp-cta-footnote">No credit card required · cancel anytime</p>
          </div>
          <div className="lp-cta-grid-bg" aria-hidden="true" />
        </section>

        {/* ── Footer ── */}
        <footer className="lp-footer" role="contentinfo">
          <div className="lp-footer-inner">
            <div className="lp-footer-brand">
              <div className="lp-topnav-mark" style={{ width: 24, height: 24, fontSize: 12 }}>A</div>
              <span style={{ fontFamily: "var(--font-display)", fontSize: 18 }}>ABM Engine</span>
            </div>
            <nav className="lp-footer-links" aria-label="Footer navigation">
              {["Features", "Pricing", "Docs", "Blog", "Changelog", "Status"].map((l) => (
                <a key={l} href={`#${l.toLowerCase()}`}>{l}</a>
              ))}
            </nav>
            <div className="lp-footer-legal">
              © {new Date().getFullYear()} ABM Engine, Inc. ·
              <button className="lp-link" style={{ marginLeft: 8 }}>Privacy</button>
              {" · "}
              <button className="lp-link">Terms</button>
            </div>
          </div>
        </footer>

      </div>

      {/* Auth modal */}
      {authMode && (
        <AuthModal mode={authMode} onClose={closeAuth} onSuccess={onAuthSuccess} />
      )}

      {/* JSON-LD structured data */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
        "@context": "https://schema.org",
        "@type": "SoftwareApplication",
        "name": "ABM Engine",
        "applicationCategory": "BusinessApplication",
        "description": "AI-powered account-based marketing platform that discovers, scores, and sequences ideal customer accounts automatically.",
        "offers": { "@type": "Offer", "price": "199", "priceCurrency": "USD" },
        "featureList": ["ICP Scoring", "Account Discovery", "Signal Watching", "Sequence Automation", "AI Copilot"],
      })}} />
    </>
  );
}
