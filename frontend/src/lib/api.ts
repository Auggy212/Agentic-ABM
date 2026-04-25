import axios from "axios";

// Default to same-origin so Vite's /api proxy handles local development.
const BASE = import.meta.env.VITE_API_BASE_URL?.trim() || "";

export const api = axios.create({
  baseURL: BASE,
  headers: { "Content-Type": "application/json" },
  timeout: 30_000,
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
