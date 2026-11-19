import { createContext, useContext } from "react";
import type { Debt, QuickAddInput, Saving, Transaction } from "@/lib/finance";

export interface LocalFinanceContextValue {
  transactions: Transaction[];
  savings: Saving[];
  debts: Debt[];
  loading: boolean;
  error: string | null;
  importCsvFiles: (files: File[]) => Promise<FinanceImportResult>;
  exportCsvFile: () => void;
  addFinanceAction: (input: QuickAddInput) => Promise<Transaction>;
  deleteTransaction: (id: string) => Promise<void>;
  addSaving: (saving: Omit<Saving, "id">) => Promise<void>;
  deleteSaving: (id: string) => Promise<void>;
  addDebt: (debt: Omit<Debt, "id">) => Promise<void>;
  deleteDebt: (id: string) => Promise<void>;
}

export interface FinanceImportResult {
  transactions: Transaction[];
  savings: Saving[];
  debts: Debt[];
}

export const LocalFinanceContext = createContext<LocalFinanceContextValue | null>(null);

export function useLocalFinance(): LocalFinanceContextValue {
  const context = useContext(LocalFinanceContext);
  if (!context) throw new Error("useLocalFinance harus digunakan di dalam LocalFinanceProvider.");
  return context;
}
