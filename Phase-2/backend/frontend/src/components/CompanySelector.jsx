import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchAccounts as fetchAccountsRequest } from "../api/api";
import { mockAccountsListResponse } from "../mocks/data";
import { useStore } from "../store/useStore";

async function fetchAccounts() {
  const { data, error } = await fetchAccountsRequest();

  if (error) {
    if (import.meta.env.DEV) {
      return mockAccountsListResponse.items;
    }

    throw new Error(error.message);
  }

  return data ?? [];
}

export function CompanySelector() {
  const accounts = useStore((state) => state.accounts);
  const selectedCompany = useStore((state) => state.selectedCompany);
  const setAccounts = useStore((state) => state.setAccounts);
  const setSelectedCompany = useStore((state) => state.setSelectedCompany);

  const { data = [], isLoading, isError } = useQuery({
    queryKey: ["accounts"],
    queryFn: fetchAccounts
  });

  useEffect(() => {
    if (data.length === 0) {
      return;
    }

    setAccounts(data);

    const selectedAccountExists = data.some((account) => account.domain === selectedCompany?.domain);
    if (!selectedCompany || !selectedAccountExists) {
      setSelectedCompany({
        name: data[0].name,
        domain: data[0].domain
      });
    }
  }, [data, selectedCompany, setAccounts, setSelectedCompany]);

  return (
    <label className="block min-w-[260px]">
      <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">Selected company</span>
      <select
        value={selectedCompany?.domain ?? ""}
        onChange={(event) => {
          const nextDomain = event.target.value;
          const nextAccount = accounts.find((account) => account.domain === nextDomain);

          if (!nextAccount) {
            return;
          }

          setSelectedCompany({
            name: nextAccount.name,
            domain: nextAccount.domain
          });
        }}
        disabled={isLoading || isError || accounts.length === 0}
        className="h-11 w-full rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium text-slate-900 outline-none transition focus:border-brand-accent focus:ring-2 focus:ring-brand-accent/20 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
      >
        {isLoading ? <option>Loading companies...</option> : null}
        {isError ? <option>Unable to load companies</option> : null}
        {!isLoading && !isError && accounts.length === 0 ? <option>No companies available</option> : null}
        {!isLoading && !isError
          ? accounts.map((account) => (
              <option key={account.id} value={account.domain}>
                {account.name}
              </option>
            ))
          : null}
      </select>
    </label>
  );
}
