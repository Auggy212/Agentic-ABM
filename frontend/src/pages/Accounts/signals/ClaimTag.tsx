import type { EvidenceStatus } from "./types";

interface ClaimTagProps {
  status: EvidenceStatus;
  sourceUrl?: string;
}

export default function ClaimTag({ status, sourceUrl }: ClaimTagProps) {
  if (status === "VERIFIED") {
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            padding: "2px 6px",
            borderRadius: 4,
            background: "#f0fdf4",
            color: "#15803d",
            border: "1px solid #bbf7d0",
            flexShrink: 0,
          }}
        >
          VERIFIED
        </span>
        {sourceUrl && sourceUrl !== "not_found" && (
          <a
            href={sourceUrl}
            target="_blank"
            rel="noreferrer"
            style={{
              fontSize: 10,
              color: "#15803d",
              textDecoration: "underline",
              flexShrink: 0,
            }}
          >
            source ↗
          </a>
        )}
      </span>
    );
  }

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        position: "relative",
      }}
      title="This is an inference, not a verified fact. Will be reviewed at Checkpoint 2."
    >
      <span
        style={{
          fontSize: 10,
          fontWeight: 700,
          padding: "2px 6px",
          borderRadius: 4,
          background: "#fffbeb",
          color: "#b45309",
          border: "1px solid #fde68a",
          flexShrink: 0,
        }}
      >
        INFERRED
      </span>
      <span
        style={{
          fontSize: 11,
          color: "#b45309",
          cursor: "help",
          flexShrink: 0,
        }}
        title="This is an inference, not a verified fact. Will be reviewed at Checkpoint 2."
      >
        ⓘ
      </span>
    </span>
  );
}
