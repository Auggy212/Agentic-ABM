export function getApiErrorMessage(error: unknown, fallback: string): string {
  if (typeof error !== "object" || error === null) return fallback;
  const maybeResponse = error as { response?: { data?: { detail?: unknown } } };
  const detail = maybeResponse.response?.data?.detail;
  return typeof detail === "string" && detail.length > 0 ? detail : fallback;
}

export function formatDateTime(value: string | null): string {
  if (!value) return "Not recorded";
  return new Date(value).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
