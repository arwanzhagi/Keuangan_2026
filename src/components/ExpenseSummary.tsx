import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { PieChart as PieIcon } from "lucide-react";
import type { Transaction } from "@/lib/finance";
import { formatRupiah, getCategoryColor, getMonthlyCategoryBreakdown, monthKey } from "@/lib/finance";

export default function ExpenseSummary({ transactions }: { transactions: Transaction[] }) {
  const monthlyBreakdown = useMemo(() => getMonthlyCategoryBreakdown(transactions), [transactions]);
  const [selectedMonth, setSelectedMonth] = useState(() => monthKey(new Date()));
  const selectedSummary = monthlyBreakdown.find((month) => month.monthKey === selectedMonth) || monthlyBreakdown[0];
  const categories = selectedSummary
    ? Object.values(selectedSummary.groups)
      .flatMap((group) => group.categories)
      .sort((a, b) => b.amount - a.amount)
    : [];
  const totalExpense = categories.reduce((s, c) => s + c.amount, 0);

  const radius = 70;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;
  const segments = categories.map((c) => {
    const pct = c.amount / totalExpense;
    const dash = pct * circumference;
    const seg = { ...c, pct, dash, offset };
    offset += dash;
    return seg;
  });

  return (
    <section id="summary" className="px-5 md:px-10 py-16 max-w-7xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-teal-500/10 flex items-center justify-center">
          <PieIcon className="w-5 h-5 text-teal-500" />
        </div>
        <div>
          <h2 className="font-heading font-bold text-xl">Ringkasan Pengeluaran</h2>
          <p className="text-sm text-muted-foreground">Rincian bulanan seluruh kategori pengeluaran</p>
        </div>
        <select
          aria-label="Pilih bulan ringkasan pengeluaran"
          value={selectedSummary?.monthKey || ""}
          onChange={(event) => setSelectedMonth(event.target.value)}
          className="ml-auto max-w-[11rem] rounded-xl border border-white/60 bg-white/70 px-3 py-2 text-xs text-foreground focus:border-accent focus:outline-none"
        >
          {monthlyBreakdown.map((month) => (
            <option key={month.monthKey} value={month.monthKey}>{month.monthLabel}</option>
          ))}
        </select>
      </div>

      {categories.length > 0 ? (
      <div className="grid md:grid-cols-2 gap-6">
        <div className="glass rounded-3xl p-6 border border-white/60 flex flex-col items-center justify-center">
          <svg width="200" height="200" viewBox="0 0 200 200">
            {segments.map((s, i) => (
              <motion.circle
                key={s.category}
                cx="100"
                cy="100"
                r={radius}
                fill="none"
                stroke={getCategoryColor(s.category)}
                strokeWidth="20"
                strokeDasharray={`${s.dash} ${circumference - s.dash}`}
                strokeDashoffset={-s.offset}
                transform="rotate(-90 100 100)"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: i * 0.1 }}
              />
            ))}
            <text x="100" y="95" textAnchor="middle" className="fill-foreground font-bold text-sm">
              Total
            </text>
            <text x="100" y="115" textAnchor="middle" className="fill-muted-foreground text-xs">
              {formatRupiah(totalExpense)}
            </text>
          </svg>
        </div>

        <div className="glass rounded-3xl p-6 border border-white/60">
          <div className="space-y-3">
            {categories.map((c, i) => {
              const pct = (c.amount / totalExpense) * 100;
              return (
                <motion.div
                  key={c.category}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="flex items-center gap-3"
                >
                  <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: getCategoryColor(c.category) }} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium">{c.category}</span>
                      <span className="text-sm font-bold">{formatRupiah(c.amount)}</span>
                    </div>
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                      <motion.div
                        className="h-full rounded-full"
                        style={{ backgroundColor: getCategoryColor(c.category) }}
                        initial={{ width: 0 }}
                        animate={{ width: `${pct}%` }}
                        transition={{ delay: i * 0.05, duration: 0.6 }}
                      />
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{pct.toFixed(1)}% · {c.count} transaksi</p>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      </div>
      ) : (
        <div className="glass rounded-3xl p-8 border border-white/60 text-center text-muted-foreground">
          {selectedSummary ? "Belum ada pengeluaran pada bulan ini." : "Belum ada data pengeluaran."}
        </div>
      )}
    </section>
  );
}
