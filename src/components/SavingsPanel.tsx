import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { PiggyBank, Plus, Trash2, X } from "lucide-react";
import type { Saving } from "@/lib/finance";
import { formatRupiah, getCategoryColor } from "@/lib/finance";
import { useToast } from "@/components/ui/use-toast";
import { useLocalFinance } from "@/context/LocalFinanceContext";

export default function SavingsPanel() {
  const { toast } = useToast();
  const { savings, addSaving, deleteSaving } = useLocalFinance();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("Umum");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [monthFilter, setMonthFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [descriptionFilter, setDescriptionFilter] = useState("");

  const total = savings.reduce((s, r) => s + r.amount, 0);
  const months = useMemo(
    () => Array.from(new Set(savings.map((saving) => saving.date.slice(0, 7)))).sort().reverse(),
    [savings],
  );
  const categories = useMemo(
    () => Array.from(new Set(savings.map((saving) => saving.category?.trim() || "Umum"))).sort((a, b) => a.localeCompare(b, "id-ID")),
    [savings],
  );
  const filteredSavings = useMemo(
    () => savings
      .filter((saving) =>
        (monthFilter === "all" || saving.date.startsWith(monthFilter))
        && (categoryFilter === "all" || (saving.category?.trim() || "Umum") === categoryFilter)
        && saving.description.toLocaleLowerCase("id-ID").includes(descriptionFilter.trim().toLocaleLowerCase("id-ID")),
      )
      .sort((a, b) => b.date.localeCompare(a.date)),
    [savings, monthFilter, categoryFilter, descriptionFilter],
  );
  const categoryTotals = Array.from(
    savings.reduce((totals, saving) => {
      const label = saving.category?.trim() || "Umum";
      totals.set(label, (totals.get(label) || 0) + saving.amount);
      return totals;
    }, new Map<string, number>()),
    ([name, value]) => ({ name, value }),
  ).sort((a, b) => b.value - a.value);
  const positiveCategoryTotal = categoryTotals.reduce((sum, item) => sum + Math.max(0, item.value), 0);
  let chartOffset = 0;
  const chartRadius = 56;
  const chartCircumference = 2 * Math.PI * chartRadius;
  const chartSegments = categoryTotals.filter((item) => item.value > 0).map((item) => {
    const dash = (item.value / positiveCategoryTotal) * chartCircumference;
    const segment = { ...item, dash, offset: chartOffset };
    chartOffset += dash;
    return segment;
  });

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseFloat(amount);
    if (!amt || amt <= 0 || !description.trim()) return;
    try {
      const saving: Omit<Saving, "id"> = { amount: amt, category, description: description.trim(), date };
      await addSaving(saving);
      toast({ title: "Tabungan tersimpan", description: formatRupiah(amt) });
      setAmount("");
      setDescription("");
      setCategory("Umum");
      setOpen(false);
    } catch (error) {
      toast({
        title: "Gagal menyimpan",
        description: error instanceof Error ? error.message : "Silakan coba lagi.",
        variant: "destructive",
      });
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteSaving(id);
      toast({ title: "Tabungan dihapus" });
    } catch (error) {
      toast({
        title: "Gagal menghapus",
        description: error instanceof Error ? error.message : "Silakan coba lagi.",
        variant: "destructive",
      });
    }
  };

  return (
    <section id="savings" className="px-5 md:px-10 py-16 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
            <PiggyBank className="w-5 h-5 text-amber-500" />
          </div>
          <div>
            <h2 className="font-heading font-bold text-xl">Tabungan</h2>
            <p className="text-sm text-muted-foreground">Total: {formatRupiah(total)}</p>
          </div>
        </div>
        <button
          onClick={() => setOpen(true)}
          className="flex items-center gap-2 glass rounded-xl px-4 py-2 text-sm border border-white/60 hover:border-accent transition-colors"
        >
          <Plus className="w-4 h-4" /> Tambah
        </button>
      </div>

      <div className="glass rounded-3xl p-5 md:p-6 border border-white/60 mb-5">
        <h3 className="font-heading font-bold mb-4">Tabungan per Kategori</h3>
        {positiveCategoryTotal > 0 ? (
          <div className="grid md:grid-cols-2 gap-5 items-center">
            <div className="flex justify-center">
              <svg width="180" height="180" viewBox="0 0 160 160" aria-label="Grafik tabungan per kategori">
                {chartSegments.map((segment) => (
                  <circle
                    key={segment.name}
                    cx="80"
                    cy="80"
                    r={chartRadius}
                    fill="none"
                    stroke={getCategoryColor(segment.name)}
                    strokeWidth="18"
                    strokeDasharray={`${segment.dash} ${chartCircumference - segment.dash}`}
                    strokeDashoffset={-segment.offset}
                    transform="rotate(-90 80 80)"
                  />
                ))}
                <text x="80" y="76" textAnchor="middle" className="fill-muted-foreground text-[10px]">Total</text>
                <text x="80" y="94" textAnchor="middle" className="fill-foreground text-[10px] font-bold">{formatRupiah(total)}</text>
              </svg>
            </div>
            <div className="space-y-3">
              {categoryTotals.map((item) => (
                <div key={item.name} className="flex items-center gap-3">
                  <span className="h-3 w-3 flex-none rounded-full" style={{ backgroundColor: getCategoryColor(item.name) }} />
                  <span className="min-w-0 flex-1 truncate text-sm">{item.name}</span>
                  <span className="text-sm font-bold">{formatRupiah(item.value)}</span>
                  <span className="w-12 text-right text-xs text-muted-foreground">
                    {item.value > 0 ? `${((item.value / positiveCategoryTotal) * 100).toFixed(1)}%` : "—"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Belum ada data tabungan untuk ditampilkan.</p>
        )}
      </div>

      <div className="glass rounded-2xl border border-white/60 p-4 mb-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
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
            <span className="mb-1.5 block text-xs font-medium text-muted-foreground">Kategori</span>
            <select
              value={categoryFilter}
              onChange={(event) => setCategoryFilter(event.target.value)}
              className="w-full rounded-xl border border-white/60 bg-white/70 px-3 py-2 text-sm focus:border-accent focus:outline-none"
            >
              <option value="all">Semua kategori</option>
              {categories.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
          <label>
            <span className="mb-1.5 block text-xs font-medium text-muted-foreground">Deskripsi</span>
            <input
              type="search"
              value={descriptionFilter}
              onChange={(event) => setDescriptionFilter(event.target.value)}
              placeholder="Cari deskripsi"
              className="w-full rounded-xl border border-white/60 bg-white/70 px-3 py-2 text-sm focus:border-accent focus:outline-none"
            />
          </label>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {filteredSavings.map((saving) => (
          <article
            key={saving.id}
            className="group relative min-h-[128px] rounded-3xl border border-slate-200/90 bg-white/90 p-5 shadow-[0_8px_24px_rgba(15,23,42,0.04)] transition-all hover:-translate-y-1 hover:shadow-[0_14px_30px_rgba(15,23,42,0.08)]"
          >
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-amber-500/10">
                <PiggyBank className="h-5 w-5 text-amber-500" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-sm font-bold text-slate-800">{saving.category || "Umum"}</p>
                  <button
                    onClick={() => handleDelete(saving.id)}
                    aria-label={`Hapus ${saving.description}`}
                    className="text-slate-300 opacity-0 transition-all hover:text-red-500 group-hover:opacity-100"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                <p className="text-xs text-slate-400">
                  {new Date(`${saving.date}T12:00:00`).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}
                </p>
              </div>
            </div>
            <p className={`mt-4 text-xl font-extrabold tracking-tight ${saving.amount < 0 ? "text-red-500" : "text-teal-600"}`}>
              {saving.amount < 0 ? "−" : "+"}{formatRupiah(Math.abs(saving.amount))}
            </p>
            <p className="mt-1 truncate text-xs text-slate-500">{saving.description}</p>
          </article>
        ))}
        {filteredSavings.length === 0 && (
          <div className="col-span-full rounded-3xl border border-dashed border-slate-300 bg-white/70 p-14 text-center text-sm text-slate-500">
            {savings.length === 0 ? 'Belum ada tabungan. Klik "Tambah" untuk menambahkan.' : "Tidak ada tabungan yang sesuai filter."}
          </div>
        )}
      </div>

      <AnimatePresence>
        {open && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
              className="fixed inset-0 bg-black/50 z-50 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, y: 50, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 50, scale: 0.95 }}
              className="fixed inset-x-0 bottom-0 z-50 mx-auto max-h-[100dvh] w-full max-w-lg overflow-y-auto p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]"
            >
              <div className="glass rounded-3xl border border-white/60 p-4 shadow-2xl sm:p-6">
                <div className="flex items-center justify-between mb-5">
                  <h3 className="font-heading font-bold text-lg">Tambah Tabungan</h3>
                  <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground p-1">
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <form onSubmit={handleAdd} className="space-y-4">
                  <div>
                    <label className="text-xs text-muted-foreground font-medium mb-1.5 block">Jumlah (Rp)</label>
                    <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" required autoFocus
                      className="w-full glass rounded-xl px-4 py-2.5 text-sm border border-white/60 focus:outline-none focus:border-accent" />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground font-medium mb-1.5 block">Kategori</label>
                    <select value={category} onChange={(e) => setCategory(e.target.value)}
                      className="w-full glass rounded-xl px-4 py-2.5 text-sm border border-white/60 focus:outline-none focus:border-accent">
                      {["Umum", "Dana Darurat", "Pendidikan", "Rumah", "Kendaraan", "Investasi", "Maybank", "Mirae", "Ajaib", "Lainnya"].map((item) => (
                        <option key={item} value={item}>{item}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground font-medium mb-1.5 block">Deskripsi</label>
                    <input type="text" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="cth. Maybank Berjangka" required
                      className="w-full glass rounded-xl px-4 py-2.5 text-sm border border-white/60 focus:outline-none focus:border-accent" />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground font-medium mb-1.5 block">Tanggal</label>
                    <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
                      className="w-full glass rounded-xl px-4 py-2.5 text-sm border border-white/60 focus:outline-none focus:border-accent" />
                  </div>
                  <motion.button type="submit" whileTap={{ scale: 0.97 }}
                    className="w-full bg-gradient-to-r from-amber-500 to-orange-400 text-white font-semibold rounded-xl py-3 text-sm">
                    Simpan
                  </motion.button>
                </form>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </section>
  );
}
