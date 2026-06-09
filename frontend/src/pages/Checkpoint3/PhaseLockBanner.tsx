import { Link } from "react-router-dom";

export default function PhaseLockBanner({ clientId, approved }: { clientId: string; approved?: boolean }) {
  if (approved) return null;
  return (
    <div className="banner" data-tone="warn" style={{ borderRadius: 8 }}>
      <div className="banner-body">
        <div className="banner-title">Phase 5 Campaign Execution locked</div>
        <div className="banner-text">CP3 review is pending Operator approval and client sign-off.</div>
      </div>
      <Link className="btn" data-variant="primary" to={`/checkpoint-3?client_id=${clientId}`}>
        Open CP3
      </Link>
    </div>
  );
}
