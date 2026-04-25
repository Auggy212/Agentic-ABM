import Button from "@/components/ui/Button";

interface Checkpoint1BannerProps {
  flaggedCount: number;
  phase2Locked: boolean;
  approving?: boolean;
  onApprove: () => void;
  onExport: () => void;
}

export default function Checkpoint1Banner({
  flaggedCount,
  phase2Locked,
  approving,
  onApprove,
  onExport,
}: Checkpoint1BannerProps) {
  return (
    <div className="rounded-3xl border border-brand-200 bg-gradient-to-r from-brand-50 via-white to-sky-50 px-6 py-5 shadow-sm">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 rounded-full bg-white/90 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-brand-700">
            <span className="text-brand-500">⚑</span>
            Checkpoint 1
          </div>
          <div>
            <h2 className="text-xl font-semibold text-gray-900">
              Review the account list before Phase 2.
            </h2>
            <p className="mt-1 text-sm text-gray-600">
              Currently <span className="font-semibold text-gray-900">{flaggedCount}</span> accounts flagged.
              {" "}Skipping this checkpoint compounds errors into Buyer Intel.
            </p>
          </div>
          <p
            className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-sm font-medium text-amber-800"
            aria-live="polite"
          >
            <span className="h-2 w-2 rounded-full bg-amber-500" />
            {phase2Locked ? "Phase 2 is locked until you approve CP1." : "Phase 2 unlocked."}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button variant="secondary" onClick={onExport}>
            Export for client review →
          </Button>
          <Button variant="primary" size="lg" loading={approving} onClick={onApprove}>
            Approve List →
          </Button>
        </div>
      </div>
    </div>
  );
}
