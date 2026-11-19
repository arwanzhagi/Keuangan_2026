import { useCallback, useEffect, useState, type ReactNode } from "react";
import { LocalFinanceContext, type FinanceImportResult } from "@/context/LocalFinanceContext";
import type { Debt, QuickAddInput, Saving, Transaction } from "@/lib/finance";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";

interface FinanceData {
  transactions: Transaction[];
  savings: Saving[];
  debts: Debt[];
}

function errorMessage(error: unknown): string {
  if (error instanceof TypeError && /fetch/i.test(error.message)) {
    return "Tidak dapat terhubung ke Supabase. Periksa URL dan anon key di Environment Variables Bolt, lalu rebuild/redeploy.";
  }
  return error instanceof Error ? error.message : "Terjadi kesalahan saat mengakses Supabase.";
}

function makeId(): string {
  return crypto.randomUUID();
}

function parseCsv(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const contents = text.replace(/^\uFEFF/, "");
  const records: string[][] = [];
  let record: string[] = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < contents.length; index += 1) {
    const character = contents[index];
    if (quoted) {
      if (character === '"' && contents[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
    } else if (character === '"' && field.length === 0) {
      quoted = true;
    } else if (character === ",") {
      record.push(field);
      field = "";
    } else if (character === "\n" || character === "\r") {
      record.push(field);
      if (record.some((value) => value.trim())) records.push(record);
      record = [];
      field = "";
      if (character === "\r" && contents[index + 1] === "\n") index += 1;
    } else {
      field += character;
    }
  }

  if (quoted) throw new Error("File CSV memiliki tanda kutip yang tidak berpasangan.");
  record.push(field);
  if (record.some((value) => value.trim())) records.push(record);
  if (records.length === 0) throw new Error("File CSV kosong.");

  const headers = records[0].map((header) => header.trim().toLocaleLowerCase("id-ID"));
  if (new Set(headers).size !== headers.length) throw new Error("Nama kolom CSV tidak boleh duplikat.");

  return {
    headers,
    rows: records.slice(1).map((values, rowIndex) => {
      if (values.length !== headers.length) {
        throw new Error(`Jumlah kolom pada baris ${rowIndex + 2} tidak sesuai header.`);
      }
      return Object.fromEntries(headers.map((header, index) => [header, values[index].trim()]));
    }),
  };
}

function requiredValue(row: Record<string, string>, key: string, line: number): string {
  const value = row[key]?.trim();
  if (!value) throw new Error(`Kolom "${key}" wajib diisi pada baris ${line}.`);
  return value;
}

function readDate(row: Record<string, string>, line: number): string {
  const date = row.date || row.tanggal;
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error(`Tanggal tidak valid pada baris ${line}; gunakan format YYYY-MM-DD.`);
  }
  return date;
}

function readAmount(row: Record<string, string>, line: number): number {
  const amount = Number(requiredValue(row, "amount", line));
  if (!Number.isFinite(amount)) throw new Error(`Jumlah tidak valid pada baris ${line}.`);
  return amount;
}

function parseTransactionRow(row: Record<string, string>, line: number): Transaction {
  const type = requiredValue(row, "type", line);
  if (type !== "income" && type !== "expense") {
    throw new Error(`Jenis transaksi harus income atau expense pada baris ${line}.`);
  }
  const amount = readAmount(row, line);
  if (amount <= 0) throw new Error(`Jumlah transaksi harus lebih dari nol pada baris ${line}.`);
  return {
    id: row.id || makeId(),
    amount,
    type,
    category: requiredValue(row, "category", line),
    description: row.description || "",
    date: readDate(row, line),
    created_at: row.created_at || undefined,
  };
}

function inferSavingsCategory(description: string): string {
  const normalized = description.toLocaleLowerCase("id-ID");
  if (normalized.includes("stockbit")) return "Investasi";
  if (normalized.includes("maybank")) return "Maybank";
  if (normalized.includes("mirae")) return "Mirae";
  if (normalized.includes("ajaib")) return "Ajaib";
  return "Umum";
}

function parseSavingRow(row: Record<string, string>, line: number): Saving {
  const description = requiredValue(row, "description", line);
  return {
    id: row.id || makeId(),
    amount: readAmount(row, line),
    category: row.category || inferSavingsCategory(description),
    description,
    date: readDate(row, line),
    created_at: row.created_at || undefined,
    source_transaction_id: row.source_transaction_id || null,
  };
}

function parseDebtRow(row: Record<string, string>, line: number): Debt {
  const type = requiredValue(row, "type", line);
  if (type !== "payable" && type !== "receivable") {
    throw new Error(`Jenis hutang harus payable atau receivable pada baris ${line}.`);
  }
  const amount = readAmount(row, line);
  const context = row.context || (amount < 0 ? "external" : "personal");
  if (context !== "personal" && context !== "external") {
    throw new Error(`Konteks hutang harus personal atau external pada baris ${line}.`);
  }
  return {
    id: row.id || makeId(),
    amount,
    type,
    context,
    description: requiredValue(row, "description", line),
    date: readDate(row, line),
    created_at: row.created_at || undefined,
    source_transaction_id: row.source_transaction_id || null,
  };
}

function readTransactions(text: string): Transaction[] {
  return parseCsv(text).rows.map((row, index) => parseTransactionRow(row, index + 2));
}

function readSavings(text: string): Saving[] {
  return parseCsv(text).rows.map((row, index) => parseSavingRow(row, index + 2));
}

function readDebts(text: string): Debt[] {
  return parseCsv(text).rows.map((row, index) => parseDebtRow(row, index + 2));
}

function readCombinedCsv(text: string): FinanceData {
  const { headers, rows } = parseCsv(text);
  if (!headers.includes("record_type")) {
    throw new Error("CSV gabungan harus memiliki kolom record_type.");
  }
  const data: FinanceData = { transactions: [], savings: [], debts: [] };
  rows.forEach((row, index) => {
    const line = index + 2;
    if (row.record_type === "transaction") data.transactions.push(parseTransactionRow(row, line));
    else if (row.record_type === "saving") data.savings.push(parseSavingRow(row, line));
    else if (row.record_type === "debt") data.debts.push(parseDebtRow(row, line));
    else throw new Error(`record_type tidak dikenal pada baris ${line}.`);
  });
  return data;
}

function csvCell(value: string | number | null | undefined): string {
  const text = value == null ? "" : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function createCombinedCsv(data: FinanceData): string {
  const headers = [
    "record_type",
    "id",
    "amount",
    "type",
    "category",
    "description",
    "date",
    "created_at",
    "source_transaction_id",
    "context",
  ];
  const rows = [
    ...data.transactions.map((row) => [
      "transaction", row.id, row.amount, row.type, row.category, row.description, row.date, row.created_at, "", "",
    ]),
    ...data.savings.map((row) => [
      "saving", row.id, row.amount, "", row.category || "Umum", row.description, row.date, row.created_at, row.source_transaction_id, "",
    ]),
    ...data.debts.map((row) => [
      "debt", row.id, row.amount, row.type, "", row.description, row.date, row.created_at, row.source_transaction_id, row.context || "personal",
    ]),
  ];
  return [
    headers.join(","),
    ...rows.map((row) => row.map(csvCell).join(",")),
  ].join("\r\n") + "\r\n";
}

function addMissingDebtContexts(data: FinanceData): FinanceData {
  return {
    ...data,
    debts: data.debts.map((debt) => ({
      ...debt,
      context: debt.context || (debt.amount < 0 ? "external" : "personal"),
    })),
  };
}

export function LocalFinanceProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [data, setData] = useState<FinanceData>({ transactions: [], savings: [], debts: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!supabase) throw new Error("Konfigurasi Supabase belum tersedia.");
    const [transactionsResult, savingsResult, debtsResult] = await Promise.all([
      supabase.from("transactions").select("*").order("date", { ascending: false }),
      supabase.from("savings").select("*").order("date", { ascending: false }),
      supabase.from("debts").select("*").order("date", { ascending: false }),
    ]);
    const resultError = transactionsResult.error || savingsResult.error || debtsResult.error;
    if (resultError) throw resultError;

    setData(addMissingDebtContexts({
      transactions: (transactionsResult.data || []) as Transaction[],
      savings: (savingsResult.data || []) as Saving[],
      debts: (debtsResult.data || []) as Debt[],
    }));
    setError(null);
  }, []);

  const refreshAfterWrite = useCallback(async () => {
    try {
      await refresh();
    } catch (loadError) {
      setError(`Perubahan tersimpan, tetapi data gagal dimuat ulang: ${errorMessage(loadError)}`);
    }
  }, [refresh]);

  useEffect(() => {
    if (!user || !supabase) {
      setLoading(false);
      return;
    }

    const client = supabase;
    let active = true;
    const load = async () => {
      try {
        await refresh();
      } catch (loadError) {
        if (active) setError(errorMessage(loadError));
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();

    const channel = client
      .channel(`finance-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "transactions" }, () => {
        void refresh().catch((loadError) => {
          if (active) setError(`Gagal menyinkronkan data: ${errorMessage(loadError)}`);
        });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "savings" }, () => {
        void refresh().catch((loadError) => {
          if (active) setError(`Gagal menyinkronkan data: ${errorMessage(loadError)}`);
        });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "debts" }, () => {
        void refresh().catch((loadError) => {
          if (active) setError(`Gagal menyinkronkan data: ${errorMessage(loadError)}`);
        });
      })
      .subscribe((status, subscriptionError) => {
        if (status === "CHANNEL_ERROR" && subscriptionError && active) {
          setError(`Sinkronisasi realtime gagal: ${subscriptionError.message}`);
        }
      });

    return () => {
      active = false;
      void client.removeChannel(channel);
    };
  }, [user, refresh]);

  const importCsvFiles = useCallback(async (files: File[]): Promise<FinanceImportResult> => {
    if (!supabase) throw new Error("Konfigurasi Supabase belum tersedia.");
    if (files.length === 0) throw new Error("Pilih setidaknya satu file CSV.");

    const entries = await Promise.all(files.map(async (file) => ({
      name: file.name.toLocaleLowerCase("id-ID"),
      contents: await file.text(),
    })));
    const combinedFiles = entries.filter((entry) => entry.name === "finance.csv");
    if (combinedFiles.length > 1 || (combinedFiles.length === 1 && entries.length > 1)) {
      throw new Error("Impor finance.csv gabungan secara terpisah dari CSV per kategori.");
    }

    let imported: FinanceData;
    if (combinedFiles.length === 1) {
      imported = readCombinedCsv(combinedFiles[0].contents);
    } else {
      const updates: Partial<FinanceData> = {};
      entries.forEach(({ name, contents }) => {
        if (name === "transactions.csv") {
          if (updates.transactions) throw new Error("Pilih satu transactions.csv saja.");
          updates.transactions = readTransactions(contents);
        } else if (name === "savings.csv") {
          if (updates.savings) throw new Error("Pilih satu savings.csv saja.");
          updates.savings = readSavings(contents);
        } else if (name === "debts.csv") {
          if (updates.debts) throw new Error("Pilih satu debts.csv saja.");
          updates.debts = readDebts(contents);
        } else {
          throw new Error(`Nama file "${name}" tidak dikenal. Gunakan finance.csv atau transactions.csv, savings.csv, debts.csv.`);
        }
      });
      imported = { ...data, ...updates };
    }

    const { error: importError } = await supabase.rpc("replace_finance_dataset", {
      p_transactions: entries.some((entry) => entry.name === "finance.csv") || entries.some((entry) => entry.name === "transactions.csv")
        ? imported.transactions
        : null,
      p_savings: entries.some((entry) => entry.name === "finance.csv") || entries.some((entry) => entry.name === "savings.csv")
        ? imported.savings
        : null,
      p_debts: entries.some((entry) => entry.name === "finance.csv") || entries.some((entry) => entry.name === "debts.csv")
        ? imported.debts
        : null,
    });
    if (importError) throw importError;
    await refreshAfterWrite();
    return { transactions: imported.transactions, savings: imported.savings, debts: imported.debts };
  }, [data, refreshAfterWrite]);

  const exportCsvFile = useCallback(() => {
    const blob = new Blob([createCombinedCsv(data)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "finance.csv";
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, [data]);

  const addFinanceAction = useCallback(async (input: QuickAddInput) => {
    if (!supabase) throw new Error("Konfigurasi Supabase belum tersedia.");
    const { data: transaction, error: actionError } = await supabase
      .rpc("record_financial_action", {
        p_action: input.action,
        p_amount: input.amount,
        p_category: input.category,
        p_date: input.date,
        p_debt_context: input.debtContext || null,
        p_savings_category: input.savingsCategory || null,
        p_description: input.description,
      })
      .single();
    if (actionError) throw actionError;
    await refreshAfterWrite();
    return transaction as Transaction;
  }, [refreshAfterWrite]);

  const deleteTransaction = useCallback(async (id: string) => {
    if (!supabase) throw new Error("Konfigurasi Supabase belum tersedia.");
    const { error: deleteError } = await supabase.from("transactions").delete().eq("id", id);
    if (deleteError) throw deleteError;
    await refreshAfterWrite();
  }, [refreshAfterWrite]);

  const addSaving = useCallback(async (saving: Omit<Saving, "id">) => {
    if (!supabase) throw new Error("Konfigurasi Supabase belum tersedia.");
    const { error: insertError } = await supabase.from("savings").insert({
      ...saving,
      id: makeId(),
      created_at: new Date().toISOString(),
    });
    if (insertError) throw insertError;
    await refreshAfterWrite();
  }, [refreshAfterWrite]);

  const deleteSaving = useCallback(async (id: string) => {
    if (!supabase) throw new Error("Konfigurasi Supabase belum tersedia.");
    const { error: deleteError } = await supabase.from("savings").delete().eq("id", id);
    if (deleteError) throw deleteError;
    await refreshAfterWrite();
  }, [refreshAfterWrite]);

  const addDebt = useCallback(async (debt: Omit<Debt, "id">) => {
    if (!supabase) throw new Error("Konfigurasi Supabase belum tersedia.");
    const { error: insertError } = await supabase.from("debts").insert({
      ...debt,
      id: makeId(),
      created_at: new Date().toISOString(),
      source_transaction_id: null,
    });
    if (insertError) throw insertError;
    await refreshAfterWrite();
  }, [refreshAfterWrite]);

  const deleteDebt = useCallback(async (id: string) => {
    if (!supabase) throw new Error("Konfigurasi Supabase belum tersedia.");
    const { error: deleteError } = await supabase.from("debts").delete().eq("id", id);
    if (deleteError) throw deleteError;
    await refreshAfterWrite();
  }, [refreshAfterWrite]);

  return (
    <LocalFinanceContext.Provider
      value={{
        ...data,
        loading,
        error,
        importCsvFiles,
        exportCsvFile,
        addFinanceAction,
        deleteTransaction,
        addSaving,
        deleteSaving,
        addDebt,
        deleteDebt,
      }}
    >
      {children}
    </LocalFinanceContext.Provider>
  );
}
