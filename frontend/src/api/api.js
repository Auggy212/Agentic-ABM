import axios from "axios";

const baseURL = import.meta.env.VITE_API_BASE_URL || "http://localhost:3001";

export const apiClient = axios.create({
  baseURL,
  timeout: 15000,
  headers: {
    "Content-Type": "application/json"
  }
});

export function normalizeApiError(error) {
  if (axios.isAxiosError(error)) {
    const message =
      error.response?.data?.error?.message ||
      error.response?.data?.message ||
      error.message ||
      "Something went wrong while contacting the API.";

    return {
      message,
      status: error.response?.status ?? null,
      details: error.response?.data?.error?.details ?? []
    };
  }

  return {
    message: error instanceof Error ? error.message : "Something went wrong while contacting the API.",
    status: null,
    details: []
  };
}

async function runRequest(request) {
  try {
    const data = await request();

    return {
      data,
      error: null
    };
  } catch (error) {
    return {
      data: null,
      error: normalizeApiError(error)
    };
  }
}

export async function submitIntake(data) {
  return runRequest(async () => {
    const response = await apiClient.post("/api/intake", data);
    return response.data;
  });
}

export async function fetchAccounts() {
  return runRequest(async () => {
    const response = await apiClient.get("/api/accounts");

    if (Array.isArray(response.data)) {
      return response.data;
    }

    return response.data?.items ?? [];
  });
}
