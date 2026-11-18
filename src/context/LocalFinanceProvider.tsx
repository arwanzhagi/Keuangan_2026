import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { LocalFinanceContext } from "@/context/LocalFinanceContext";
import type { Debt, QuickAddInput, Saving, Transaction } from "@/lib/finance";

type CsvTable = "transactions" | "savings" | "debts";

interface FinanceData {
  transactions: Transaction[];
  savings: Saving[];
  debts: Debt[];
}

interface CsvFileHandle {
  name: string;
  getFile: () => Promise<File>;
  queryPermission: (descriptor: { mode: "readwrite" }) => Promise<PermissionState>;
}

interface CsvHandles {
  transactions: CsvFileHandle;
  savings: CsvFileHandle;
  debts: CsvFileHandle;
}

const DATABASE_NAME = "arwan-finance-browser-data";
const STORE_NAME = "finance";
const STATE_KEY = "data";
const LEGACY_DATABASE_NAME = "arwan-finance-local-files";
const LEGACY_STORE_NAME = "file-handles";
const TABLES: CsvTable[] = ["transactions", "savings", "debts"];

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Terjadi kesalahan saat mengakses data lokal.";
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

function openFinanceDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Gagal membuka penyimpanan lokal browser."));
  });
}

async function loadBrowserData(): Promise<FinanceData | null> {
  const database = await openFinanceDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readonly");
    const request = transaction.objectStore(STORE_NAME).get(STATE_KEY);
    let data: FinanceData | null = null;
    request.onsuccess = () => {
      data = (request.result as FinanceData | undefined) || null;
    };
    request.onerror = () => reject(request.error || new Error("Gagal membaca data lokal browser."));
    transaction.oncomplete = () => {
      database.close();
      resolve(data);
    };
    transaction.onerror = () => reject(transaction.error || new Error("Gagal membaca data lokal browser."));
  });
}

async function saveBrowserData(data: FinanceData): Promise<void> {
  const database = await openFinanceDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put(data, STATE_KEY);
    transaction.oncomplete = () => {
      database.close();
      resolve();
    };
    transaction.onerror = () => {
      database.close();
      reject(transaction.error || new Error("Gagal menyimpan data lokal browser."));
    };
    transaction.onabort = () => {
      database.close();
      reject(transaction.error || new Error("Penyimpanan data lokal dibatalkan."));
    };
  });
}

async function loadLegacyHandles(): Promise<Partial<CsvHandles> | null> {
  const database = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(LEGACY_DATABASE_NAME);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Gagal memeriksa izin file lama."));
  });
  if (!database.objectStoreNames.contains(LEGACY_STORE_NAME)) {
    database.close();
    return null;
  }
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(LEGACY_STORE_NAME, "readonly");
    const store = transaction.objectStore(LEGACY_STORE_NAME);
    const handles: Partial<CsvHandles> = {};
    let remaining = 3;
    TABLES.forEach((table) => {
      const request = store.get(`${table}.csv`);
      request.onsuccess = () => {
        const handle = request.result as CsvFileHandle | undefined;
        if (handle) handles[table] = handle;
        remaining -= 1;
        if (remaining === 0) resolve(handles);
      };
      request.onerror = () => reject(request.error || new Error("Gagal membaca izin file lama."));
    });
    transaction.oncomplete = () => database.close();
    transaction.onerror = () => reject(transaction.error || new Error("Gagal membaca izin file lama."));
  });
}

async function migrateLegacyFileData(): Promise<FinanceData | null> {
  const saved = await loadLegacyHandles();
  if (!saved || !TABLES.every((table) => saved[table])) return null;
  const handles = saved as CsvHandles;
  const permissions = await Promise.all(TABLES.map((table) => handles[table].queryPermission({ mode: "readwrite" })));
  if (!permissions.every((permission) => permission === "granted")) return null;

  const contents = {} as Record<CsvTable, string>;
  for (const table of TABLES) {
    contents[table] = await (await handles[table].getFile()).text();
  }
  return {
    transactions: readTransactions(contents.transactions),
    savings: readSavings(contents.savings),
    debts: readDebts(contents.debts),
  };
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

function makeTransaction(input: {
  amount: number;
  type: "income" | "expense";
  category: string;
  description: string;
  date: string;
}): Transaction {
  return { ...input, id: makeId(), created_at: new Date().toISOString() };
}

function makeSavingRow(row: Omit<Saving, "id" | "created_at">): Saving {
  return { ...row, id: makeId(), created_at: new Date().toISOString() };
}

function makeDebtRow(row: Omit<Debt, "id" | "created_at">): Debt {
  return { ...row, id: makeId(), created_at: new Date().toISOString() };
}

export function LocalFinanceProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<FinanceData>({ transactions: [], savings: [], debts: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const dataRef = useRef(data);
  const initializedRef = useRef(false);
  const writeQueueRef = useRef<Promise<void>>(Promise.resolve());

  const applyData = useCallback((next: FinanceData) => {
    dataRef.current = next;
    setData(next);
  }, []);

  useEffect(() => {
    let active = true;
    const initialize = async () => {
      try {
        let stored = await loadBrowserData();
        if (stored) {
          const needsContextMigration = stored.debts.some((debt) => !debt.context);
          stored = addMissingDebtContexts(stored);
          if (needsContextMigration) await saveBrowserData(stored);
        }
        if (!stored) {
          let initialData: FinanceData = { transactions: [], savings: [], debts: [] };
          try {
            initialData = (await migrateLegacyFileData()) || initialData;
          } catch (migrationError) {
            if (active) setError(`Data file sebelumnya belum dipindahkan: ${errorMessage(migrationError)} Impor CSV untuk memulihkan data.`);
          }
          await saveBrowserData(initialData);
          stored = initialData;
        }
        if (active) {
          applyData(stored);
          initializedRef.current = true;
        }
      } catch (loadError) {
        if (active) setError(errorMessage(loadError));
      } finally {
        if (active) setLoading(false);
      }
    };
    void initialize();
    return () => {
      active = false;
    };
  }, [applyData]);

  const mutate = useCallback(<T,>(change: (current: FinanceData) => { next: FinanceData; result: T }): Promise<T> => {
    const operation = writeQueueRef.current.then(async () => {
      if (!initializedRef.current) throw new Error("Penyimpanan lokal belum siap. Muat ulang aplikasi.");
      const { next, result } = change(dataRef.current);
      await saveBrowserData(next);
      applyData(next);
      setError(null);
      return result;
    });
    writeQueueRef.current = operation.then(() => undefined, () => undefined);
    return operation;
  }, [applyData]);

  const importCsvFiles = useCallback((files: File[]) => {
    if (files.length === 0) return Promise.reject(new Error("Pilih setidaknya satu file CSV."));

    return Promise.all(files.map(async (file) => ({
      name: file.name.toLocaleLowerCase("id-ID"),
      contents: await file.text(),
    }))).then((entries) => {
      const combinedFiles = entries.filter((entry) => entry.name === "finance.csv");
      if (combinedFiles.length > 1 || (combinedFiles.length === 1 && entries.length > 1)) {
        throw new Error("Impor finance.csv gabungan secara terpisah dari CSV per kategori.");
      }
      if (combinedFiles.length === 1) {
        const imported = readCombinedCsv(combinedFiles[0].contents);
        return mutate(() => ({ next: imported, result: imported }));
      }

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
      return mutate((current) => {
        const next = { ...current, ...updates };
        return { next, result: next };
      });
    });
  }, [mutate]);

  const exportCsvFile = useCallback(() => {
    const blob = new Blob([createCombinedCsv(dataRef.current)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "finance.csv";
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, []);

  const addFinanceAction = useCallback((input: QuickAddInput) => mutate((current) => {
    let transaction: Transaction;
    let savings = current.savings;
    let debts = current.debts;

    if (input.action === "income" || input.action === "expense") {
      transaction = makeTransaction({
        amount: input.amount,
        type: input.action,
        category: input.category,
        description: input.description,
        date: input.date,
      });
    } else if (input.action === "withdrawal") {
      const category = input.savingsCategory || "Umum";
      const available = current.savings
        .filter((entry) => (entry.category || "Umum").toLocaleLowerCase("id-ID") === category.toLocaleLowerCase("id-ID"))
        .reduce((sum, entry) => sum + entry.amount, 0);
      if (input.amount > available) throw new Error(`Saldo tabungan kategori ${category} tidak mencukupi.`);
      transaction = makeTransaction({
        amount: input.amount,
        type: "income",
        category: "Tabungan",
        description: `Tarik tabungan - ${input.description}`,
        date: input.date,
      });
      savings = [
        makeSavingRow({
          amount: -input.amount,
          category,
          description: `Tarik tabungan - ${input.description}`,
          date: input.date,
          source_transaction_id: transaction.id,
        }),
        ...current.savings,
      ];
    } else {
      if (input.category !== "Hutang" && input.category !== "Piutang") {
        throw new Error("Kategori harus Hutang atau Piutang.");
      }
      const context = input.debtContext || "personal";
      const debtType = input.category === "Hutang" ? "payable" : "receivable";
      const debtAmount = context === "personal" ? input.amount : -input.amount;
      if (context === "external") {
        const balance = current.debts
          .filter((entry) =>
            entry.type === debtType
            && entry.description.trim().toLocaleLowerCase("id-ID") === input.description.trim().toLocaleLowerCase("id-ID"),
          )
          .reduce((sum, entry) => sum + entry.amount, 0);
        if (input.amount > balance) throw new Error("Jumlah pembayaran melebihi saldo pihak tersebut.");
      }
      const transactionType =
        input.category === "Hutang"
          ? (context === "personal" ? "income" : "expense")
          : (context === "personal" ? "expense" : "income");
      transaction = makeTransaction({
        amount: input.amount,
        type: transactionType,
        category: input.category,
        description: input.description,
        date: input.date,
      });
      debts = [
        makeDebtRow({
          amount: debtAmount,
          type: debtType,
          context,
          description: input.description,
          date: input.date,
          source_transaction_id: transaction.id,
        }),
        ...current.debts,
      ];
    }

    return {
      next: { transactions: [transaction, ...current.transactions], savings, debts },
      result: transaction,
    };
  }), [mutate]);

  const deleteTransaction = useCallback((id: string) => mutate((current) => ({
    next: {
      transactions: current.transactions.filter((transaction) => transaction.id !== id),
      savings: current.savings.filter((saving) => saving.source_transaction_id !== id),
      debts: current.debts.filter((debt) => debt.source_transaction_id !== id),
    },
    result: undefined,
  })), [mutate]);

  const addSaving = useCallback((saving: Omit<Saving, "id">) => mutate((current) => ({
    next: {
      ...current,
      savings: [{ ...saving, id: makeId(), created_at: new Date().toISOString() }, ...current.savings],
    },
    result: undefined,
  })), [mutate]);

  const deleteSaving = useCallback((id: string) => mutate((current) => ({
    next: { ...current, savings: current.savings.filter((saving) => saving.id !== id) },
    result: undefined,
  })), [mutate]);

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
      }}
    >
      {children}
    </LocalFinanceContext.Provider>
  );
}
