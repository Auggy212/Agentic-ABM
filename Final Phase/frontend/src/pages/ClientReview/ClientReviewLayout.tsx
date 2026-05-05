export default function ClientReviewLayout({ children }: { children: React.ReactNode }) {
  return (
    <main style={{ minHeight: "100vh", background: "var(--ink-paper)", color: "var(--text)" }}>
      <div style={{ maxWidth: 860, margin: "0 auto", padding: "36px 20px 48px" }}>{children}</div>
      <footer style={{ maxWidth: 860, margin: "0 auto", padding: "0 20px 28px", color: "var(--text-3)", fontSize: 12 }}>
        Powered by FCP · Privacy & Security
      </footer>
    </main>
  );
}
