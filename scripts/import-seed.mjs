import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  fs.readFileSync(".env", "utf8")
    .split("\n")
    .filter((line) => line.trim() && !line.startsWith("#"))
    .map((line) => {
      const eq = line.indexOf("=");
      return [line.slice(0, eq).trim(), line.slice(eq + 1).trim()];
    }),
);

const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);

function parseCsv(text) {
  const rows = [];
  let record = [];
  let field = "";
  let quoted = false;
  const content = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < content.length; i += 1) {
    const c = content[i];
    if (quoted) {
      if (c === '"' && content[i + 1] === '"') { field += '"'; i += 1; }
      else if (c === '"') { quoted = false; }
      else field += c;
    } else if (c === '"' && field.length === 0) { quoted = true; }
    else if (c === ",") { record.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      record.push(field); field = "";
      if (record.some((v) => v.trim() !== "")) rows.push(record);
      record = [];
      if (c === "\r" && content[i + 1] === "\n") i += 1;
    } else field += c;
  }
  record.push(field);
  if (record.some((v) => v.trim() !== "")) rows.push(record);
  return rows;
}

function readRows(file) {
  const lines = parseCsv(fs.readFileSync(file, "utf8"));
  const headers = lines[0].map((h) => h.trim().toLowerCase());
  return lines.slice(1).map((r) => Object.fromEntries(headers.map((h, i) => [h, (r[i] ?? "").trim()])));
}

const txRows = readRows("supabase/seed_data/transactions.csv").map((row) => ({
  id: row.id,
  amount: Number(row.amount),
  type: row.type,
  category: row.category,
  description: row.description,
  date: row.tanggal || row.date,
  ...(row.created_at ? { created_at: row.created_at } : {}),
}));

const savingRows = readRows("supabase/seed_data/savings.csv").map((row) => ({
  id: row.id,
  amount: Number(row.amount),
  category: row.category || "Umum",
  description: row.description,
  date: row.date,
  ...(row.created_at ? { created_at: row.created_at } : {}),
  ...(row.source_transaction_id ? { source_transaction_id: row.source_transaction_id } : { source_transaction_id: null }),
}));

const debtRows = readRows("supabase/seed_data/debts.csv").map((row) => ({
  id: row.id,
  amount: Number(row.amount),
  type: row.type,
  context: row.context || (Number(row.amount) < 0 ? "external" : "personal"),
  description: row.description,
  date: row.date,
  ...(row.created_at ? { created_at: row.created_at } : {}),
  source_transaction_id: row.source_transaction_id || null,
}));

async function upsert(table, rows) {
  if (rows.length === 0) {
    console.log(`${table}: nothing to import`);
    return;
  }
  const { error } = await supabase.from(table).upsert(rows, { onConflict: "id" });
  if (error) throw new Error(`${table}: ${error.message}`);
  console.log(`${table}: imported ${rows.length} rows`);
}

await upsert("transactions", txRows);
await upsert("savings", savingRows);
await upsert("debts", debtRows);

const { data: counts, error: countError } = await supabase.rpc("replace_finance_dataset", {
  p_transactions: null,
  p_savings: null,
  p_debts: null,
});
console.log("post-check rpc (no-op):", countError ? countError.message : "ok", counts ?? "");
