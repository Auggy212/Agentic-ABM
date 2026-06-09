import axios from "axios";
import { getToken } from "./session";

// Default to same-origin so Vite's /api proxy handles local development.
const BASE = import.meta.env.VITE_API_BASE_URL?.trim() || "";

export const api = axios.create({
  baseURL: BASE,
  headers: { "Content-Type": "application/json" },
  timeout: 30_000,
});

api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) {
    config.headers = config.headers ?? {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// ── Types ────────────────────────────────────────────────────────────────────

export interface ClarifyingQuestion {
  field: string;
  question: string;
}

export interface IntakeResponse {
  status: "complete" | "needs_clarification";
  master_context?: Record<string, unknown>;
  clarifying_questions?: ClarifyingQuestion[];
  warnings: string[];
}

export interface DraftSaveResponse {
  draft_id: string;
  saved_at: string;
}

export interface CsvUploadResponse {
  valid: boolean;
  row_count: number;
  warnings: string[];
  errors: string[];
  preview: Record<string, string>[];
}

// ── Intake endpoints ─────────────────────────────────────────────────────────

export async function submitIntake(payload: Record<string, unknown>): Promise<IntakeResponse> {
  const { data } = await api.post<IntakeResponse>("/api/intake", payload);
  return data;
}

export async function saveDraft(clientId: string, payload: Record<string, unknown>): Promise<DraftSaveResponse> {
  const { data } = await api.post<DraftSaveResponse>("/api/intake/draft", {
    client_id: clientId,
    payload,
  });
  return data;
}

export async function loadDraft(clientId: string): Promise<Record<string, unknown>> {
  const { data } = await api.get<Record<string, unknown>>(`/api/intake/draft/${clientId}`);
  return data;
}

export async function uploadCsv(file: File): Promise<CsvUploadResponse> {
  const form = new FormData();
  form.append("file", file);
  const { data } = await api.post<CsvUploadResponse>("/api/intake/csv", form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data;
}

// ── Visual asset endpoints ────────────────────────────────────────────────────

export interface VisualAsset {
  id: string;
  client_id: string;
  message_id: string | null;
  account_domain: string;
  contact_id: string | null;
  channel: string;
  design_type: string;
  canva_design_id: string | null;
  canva_edit_url: string | null;
  canva_view_url: string | null;
  thumbnail_url: string | null;
  prompt_used: string;
  status: "PENDING" | "GENERATING" | "READY" | "FAILED";
  error_detail: string | null;
}

export interface PrepareVisualsResponse {
  prepared: Array<{
    asset_id: string;
    message_id: string;
    account_domain: string;
    channel: string;
    design_type: string;
    prompt: string;
  }>;
  message: string;
}

export async function prepareVisuals(clientId: string): Promise<PrepareVisualsResponse> {
  const { data } = await api.post<PrepareVisualsResponse>(`/api/visual/prepare/${clientId}`);
  return data;
}

export async function listVisualAssets(clientId: string): Promise<VisualAsset[]> {
  const { data } = await api.get<VisualAsset[]>(`/api/visual/${clientId}`);
  return data;
}

export async function markVisualReady(
  assetId: string,
  payload: { canva_design_id: string; canva_edit_url?: string; canva_view_url?: string; thumbnail_url?: string },
): Promise<VisualAsset> {
  const { data } = await api.patch<VisualAsset>(`/api/visual/${assetId}/ready`, payload);
  return data;
}

export async function markVisualFailed(assetId: string, errorDetail: string): Promise<VisualAsset> {
  const { data } = await api.patch<VisualAsset>(`/api/visual/${assetId}/failed`, { error_detail: errorDetail });
  return data;
}
