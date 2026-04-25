import type { Account, IntakeResponse } from "../types/api.types";

export interface ApiError {
  message: string;
  status: number | null;
  details: unknown[];
}

export interface ApiResult<T> {
  data: T | null;
  error: ApiError | null;
}

export const apiClient: unknown;

export function normalizeApiError(error: unknown): ApiError;
export function submitIntake(data: unknown): Promise<ApiResult<IntakeResponse>>;
export function fetchAccounts(): Promise<ApiResult<Account[]>>;
