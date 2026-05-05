import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { loadDraft } from "@/lib/api";
import { useIntakeStore, type IntakeFormData } from "@/store/intakeStore";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import Button from "@/components/ui/Button";

/**
 * Landing page at /intake/resume?draft={client_id}
 *
 * Fetches the saved draft from /api/intake/draft/:id, maps the backend
 * shape back into IntakeFormData, rehydrates the Zustand store, then
 * redirects to /intake so the user resumes exactly where they left off.
 */
function mapDraftToFormData(draft: Record<string, unknown>): Partial<IntakeFormData> {
  const company  = (draft.company  as Record<string, unknown>) ?? {};
  const icp      = (draft.icp      as Record<string, unknown>) ?? {};
  const buyers   = (draft.buyers   as Record<string, unknown>) ?? {};
  const gtm      = (draft.gtm      as Record<string, unknown>) ?? {};

  // Competitors array
  const rawComps = (draft.competitors as Array<Record<string, unknown>>) ?? [];
  const competitors = rawComps.map((c) => ({
    name:       String(c.name ?? ""),
    weaknesses: (c.weaknesses as string[]) ?? [],
  }));

  return {
    company_name:        String(company.name       ?? ""),
    website:             String(company.website    ?? ""),
    industry:            String(company.industry   ?? ""),
    stage:               String(company.stage      ?? ""),
    product:             String(company.product    ?? ""),
    value_prop:          String(company.value_prop ?? ""),
    differentiators:     (company.differentiators  as string[]) ?? [],
    pricing_model:       String(company.pricing_model ?? ""),
    acv_range:           String(company.acv_range  ?? ""),
    reference_customers: (company.reference_customers as string[]) ?? [],

    icp_industries:          (icp.industries            as string[]) ?? [],
    company_size_employees:  String(icp.company_size_employees ?? ""),
    company_size_arr:        String(icp.company_size_arr       ?? ""),
    funding_stage:           (icp.funding_stage          as string[]) ?? [],
    geographies:             (icp.geographies            as string[]) ?? [],
    tech_stack_signals:      (icp.tech_stack_signals     as string[]) ?? [],
    buying_triggers:         (icp.buying_triggers        as string[]) ?? [],
    negative_icp:            (icp.negative_icp           as string[]) ?? [],
    // Do NOT carry over negative_icp_confirmed_empty — force explicit re-confirmation
    negative_icp_confirmed_empty: null,

    titles:                (buyers.titles                as string[]) ?? [],
    seniority:             (buyers.seniority             as string[]) ?? [],
    buying_committee_size: String(buyers.buying_committee_size ?? ""),
    pain_points:           (buyers.pain_points           as string[]) ?? [],
    unstated_needs:        (buyers.unstated_needs        as string[]) ?? [],

    competitors,
    win_themes:   (gtm.win_themes  as string[]) ?? [],
    loss_themes:  (gtm.loss_themes as string[]) ?? [],
    channels:     (gtm.channels    as string[]) ?? [],
    crm:          String(gtm.crm   ?? ""),
    existing_account_list: (gtm.existing_account_list as string | null) ?? null,
  };
}

export default function ResumeDraft() {
  const [params]   = useSearchParams();
  const navigate   = useNavigate();
  const { rehydrate } = useIntakeStore();

  const clientId = params.get("draft");

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["draft", clientId],
    queryFn:  () => loadDraft(clientId!),
    enabled:  !!clientId,
    retry:    false,
  });

  useEffect(() => {
    if (data) {
      rehydrate(mapDraftToFormData(data));
      navigate("/intake", { replace: true });
    }
  }, [data, navigate, rehydrate]);

  if (!clientId) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="max-w-sm w-full text-center space-y-4">
          <p className="text-gray-600">No draft ID provided.</p>
          <Button variant="primary" onClick={() => navigate("/intake")}>
            Start fresh
          </Button>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-3">
          <LoadingSpinner size="lg" />
          <p className="text-sm text-gray-500">Restoring your progress…</p>
        </div>
      </div>
    );
  }

  if (isError) {
    const msg = (error as Error)?.message ?? "Draft not found or has expired.";
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="max-w-sm w-full bg-white rounded-xl border border-gray-200 shadow-sm p-8 text-center space-y-4">
          <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center mx-auto">
            <svg className="w-6 h-6 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 9v2m0 4h.01M5.07 19h13.86C20.42 19 21 18.1 20.54 17.24L13.68 4.26a1.5 1.5 0 00-2.61-.01L3.46 17.24C2.99 18.1 3.58 19 5.07 19z" />
            </svg>
          </div>
          <div>
            <h2 className="text-base font-semibold text-gray-900 mb-1">Draft not found</h2>
            <p className="text-sm text-gray-500">{msg}</p>
            <p className="text-xs text-gray-400 mt-1">Drafts expire after 7 days.</p>
          </div>
          <Button variant="primary" onClick={() => navigate("/intake")} className="w-full">
            Start a new intake
          </Button>
        </div>
      </div>
    );
  }

  return null;
}
