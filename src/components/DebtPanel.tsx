import { useMemo, useState } from "react";
import { ArrowDownLeft, ArrowUpRight, HandCoins, Wallet } from "lucide-react";
import { formatRupiah, type Debt } from "@/lib/finance";
import { useLocalFinance } from "@/context/LocalFinanceContext";

type ContextFilter = "all" | "personal" | "external";
type DebtTypeFilter = "all" | Debt["type"];

interface DebtSummary {
  key: "personal" | "external";
  label: string;
  netBalance: number;
  receivablePaid: number;
  payablePaid: number;
}

function cardDate(date: string): string {
  return new Date(`${date}T12:00:00`).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function summarizeDebts(entries: Debt[], key: DebtSummary["key"], label: string): DebtSummary {
  const receivable = entries
    .filter((entry) => entry.type === "receivable")
    .reduce((total, entry) => total + entry.amount, 0);
  const payable = entries
    .filter((entry) => entry.type === "payable")
    .reduce((total, entry) => total + entry.amount, 0);
  const receivablePaid = entries
    .filter((entry) => entry.type === "receivable" && entry.amount < 0)
    .reduce((total, entry) => total + Math.abs(entry.amount), 0);
  const payablePaid = entries
    .filter((entry) => entry.type === "payable" && entry.amount < 0)
    .reduce((total, entry) => total + Math.abs(entry.amount), 0);

  return { key, label, netBalance: receivable - payable, receivablePaid, payablePaid };
}

export default function DebtPanel() {
  const { debts } = useLocalFinance();
  const [contextFilter, setContextFilter] = useState<ContextFilter>("all");
  const [typeFilter, setTypeFilter] = useState<DebtTypeFilter>("all");
  const [monthFilter, setMonthFilter] = useState("all");
  const [partyFilter, setPartyFilter] = useState("all");

  const months = useMemo(
    () => Array.from(new Set(debts.map((entry) => entry.date.slice(0, 7)))).sort().reverse(),
    [debts],
  );
  const partyOptions = useMemo(
    () => Array.from(new Set(
      debts
        .filter((entry) =>
          (contextFilter === "all" || (entry.context || "personal") === contextFilter)
          && (typeFilter === "all" || entry.type === typeFilter)
          && entry.description.trim(),
        )
        .map((entry) => entry.description.trim()),
    )).sort((a, b) => a.localeCompare(b, "id-ID")),
    [debts, contextFilter, typeFilter],
  );
  const filteredDebts = debts
    .filter((entry) =>
      (contextFilter === "all" || (entry.context || "personal") === contextFilter)
      && (typeFilter === "all" || entry.type === typeFilter)
      && (monthFilter === "all" || entry.date.startsWith(monthFilter))
      && (partyFilter === "all" || entry.description.trim() === partyFilter),
    )
    .sort((a, b) => b.date.localeCompare(a.date));

  const summaries = contextFilter === "all"
    ? [
      summarizeDebts(
        filteredDebts.filter((entry) => (entry.context || "personal") === "personal"),
        "personal",
        "Pribadi",
      ),
      summarizeDebts(
        filteredDebts.filter((entry) => entry.context === "external"),
        "external",
        "Eksternal",
      ),
    ]
    : [
      summarizeDebts(
        filteredDebts,
        contextFilter,
        contextFilter === "personal" ? "Pribadi" : "Eksternal",
      ),
    ];

  return (
    <section id="debts" className="px-5 md:px-10 py-16 max-w-7xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-sky-500/10 flex items-center justify-center">
          <HandCoins className="w-5 h-5 text-sky-600" />
        </div>
        <div>
          <h2 className="font-heading font-bold text-xl">Hutang &amp; Piutang</h2>
          <p className="text-sm text-muted-foreground">
            {contextFilter === "all" ? "Pribadi dan Eksternal ditampilkan terpisah." : `Riwayat ${contextFilter === "personal" ? "Pribadi" : "Eksternal"}.`}
          </p>
        </div>
      </div>

      <div className="glass rounded-2xl border border-white/60 p-4 mb-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <label>
            <span className="mb-1.5 block text-xs font-medium text-muted-foreground">Konteks</span>
            <select
              value={contextFilter}
              onChange={(event) => {
                setContextFilter(event.target.value as ContextFilter);
                setPartyFilter("all");
              }}
              className="w-full rounded-xl border border-white/60 bg-white/70 px-3 py-2 text-sm focus:border-accent focus:outline-none"
            >
              <option value="all">Semua</option>
              <option value="personal">Pribadi</option>
              <option value="external">Eksternal</option>
            </select>
          </label>
          <label>
            <span className="mb-1.5 block text-xs font-medium text-muted-foreground">Jenis</span>
            <select
              value={typeFilter}
              onChange={(event) => {
                setTypeFilter(event.target.value as DebtTypeFilter);
                setPartyFilter("all");
              }}
              className="w-full rounded-xl border border-white/60 bg-white/70 px-3 py-2 text-sm focus:border-accent focus:outline-none"
            >
              <option value="all">Semua jenis</option>
              <option value="receivable">Piutang</option>
              <option value="payable">Hutang</option>
            </select>
          </label>
          <label>
            <span className="mb-1.5 block text-xs font-medium text-muted-foreground">Bulan</span>
            <select
              value={monthFilter}
              onChange={(event) => setMonthFilter(event.target.value)}
              className="w-full rounded-xl border border-white/60 bg-white/70 px-3 py-2 text-sm focus:border-accent focus:outline-none"
            >
              <option value="all">Semua bulan</option>
              {months.map((month) => (
                <option key={month} value={month}>
                  {new Date(`${month}-01T12:00:00`).toLocaleDateString("id-ID", { month: "long", year: "numeric" })}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="mb-1.5 block text-xs font-medium text-muted-foreground">Nama pihak terkait</span>
            <select
              value={partyFilter}
              onChange={(event) => setPartyFilter(event.target.value)}
              className="w-full rounded-xl border border-white/60 bg-white/70 px-3 py-2 text-sm focus:border-accent focus:outline-none"
            >
              <option value="all">Semua pihak</option>
              {partyOptions.map((party) => <option key={party} value={party}>{party}</option>)}
            </select>
          </label>
        </div>
      </div>

      <div className="mb-6 space-y-5">
        {summaries.map((summary) => (
          <div key={summary.key}>
            {contextFilter === "all" && <h3 className="mb-3 font-heading font-bold">{summary.label}</h3>}
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
              <div className="glass rounded-2xl p-5 border border-white/60 flex items-center gap-3">
                <Wallet className="w-5 h-5 text-sky-600" />
                <div>
                  <p className="text-xs text-muted-foreground">Total saldo bersih</p>
                  <p className="font-bold text-lg">{formatRupiah(summary.netBalance)}</p>
                </div>
              </div>
              <div className="glass rounded-2xl p-5 border border-white/60">
                <p className="text-xs text-muted-foreground">Piutang terbayar</p>
                <p className="font-bold text-lg">{formatRupiah(summary.receivablePaid)}</p>
              </div>
              <div className="glass rounded-2xl p-5 border border-white/60">
                <p className="text-xs text-muted-foreground">Hutang terbayar</p>
                <p className="font-bold text-lg">{formatRupiah(summary.payablePaid)}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {filteredDebts.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-slate-300 bg-white/70 p-14 text-center text-sm text-slate-500">
          Tidak ada transaksi hutang/piutang yang sesuai filter.
        </div>
      ) : (
        <div className="space-y-6">
          {(contextFilter === "all" ? ["personal", "external"] as const : [contextFilter]).map((context) => {
            const entries = filteredDebts.filter((entry) => (entry.context || "personal") === context);
            if (entries.length === 0) return null;
            return (
              <div key={context}>
                {contextFilter === "all" && (
                  <h3 className="mb-3 font-heading font-bold">{context === "personal" ? "Pribadi" : "Eksternal"}</h3>
                )}
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {entries.map((entry) => {
                    const isReceivable = entry.type === "receivable";
                    const isPayment = entry.amount < 0;
                    return (
                      <article
                        key={entry.id}
                        className="group relative min-h-[128px] rounded-3xl border border-slate-200/90 bg-white/90 p-5 shadow-[0_8px_24px_rgba(15,23,42,0.04)] transition-all hover:-translate-y-1 hover:shadow-[0_14px_30px_rgba(15,23,42,0.08)]"
                      >
                        <div className="flex items-start gap-3">
                          <div className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl ${isReceivable ? "bg-teal-500/10" : "bg-orange-500/10"}`}>
                            {isReceivable
                              ? <ArrowDownLeft className="h-5 w-5 text-teal-600" />
                              : <ArrowUpRight className="h-5 w-5 text-orange-600" />}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-bold text-slate-800">
                              {isPayment ? `Pembayaran ${isReceivable ? "Piutang" : "Hutang"}` : isReceivable ? "Piutang" : "Hutang"}
                            </p>
                            <p className="text-xs text-slate-400">{cardDate(entry.date)}</p>
                          </div>
                        </div>
                        <p className={`mt-4 text-xl font-extrabold tracking-tight ${isPayment ? "text-teal-600" : "text-orange-600"}`}>
                          {isPayment ? "−" : "+"}{formatRupiah(Math.abs(entry.amount))}
                        </p>
                        <p className="mt-1 truncate text-xs text-slate-500">{entry.description}</p>
                        <p className="mt-1 text-[11px] text-slate-400">{context === "personal" ? "Pribadi" : "Eksternal"}</p>
                      </article>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
