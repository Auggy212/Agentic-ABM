import type { Account, BuyersResponse, IntakeResponse, SignalsResponse } from "../types/api.types";

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
export function fetchBuyers(company: string): Promise<ApiResult<BuyersResponse>>;
export function fetchSignals(company: string): Promise<ApiResult<SignalsResponse>>;
