import { useRef, type ChangeEvent } from "react";
import { motion } from "framer-motion";
import { TrendingUp, TrendingDown, Wallet, Sparkles, FileSpreadsheet, Download, Upload } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import Layout from "@/components/Layout";
import WealthWave from "@/components/WealthWave";
import QuickAddBar from "@/components/QuickAddBar";
import TransactionStream from "@/components/TransactionStream";
import HorizonProjection from "@/components/HorizonProjection";
import ExpenseSummary from "@/components/ExpenseSummary";
import ActivitySection from "@/components/ActivitySection";
import SpendingTrend from "@/components/SpendingTrend";
import SavingsPanel from "@/components/SavingsPanel";
import DebtPanel from "@/components/DebtPanel";
import FinancialRunway from "@/components/FinancialRunway";
import CanIAfford from "@/components/CanIAfford";
import FinancialSnapshot from "@/components/afford/FinancialSnapshot";
import AssetOverview from "@/components/AssetOverview";
import { dailySpendingRate, formatRupiah, type QuickAddInput } from "@/lib/finance";
import { useLocalFinance } from "@/context/LocalFinanceContext";

export default function Dashboard() {
  const { toast } = useToast();
  const {
    transactions,
    savings: savingsEntries,
    debts,
    addFinanceAction,
    deleteTransaction,
    importCsvFiles,
    exportCsvFile,
    error,
  } = useLocalFinance();
  const importInputRef = useRef<HTMLInputElement>(null);
  const savings = savingsEntries.reduce((sum, saving) => sum + saving.amount, 0);
  const receivable = debts
    .filter((entry) => entry.type === "receivable")
    .reduce((sum, entry) => sum + entry.amount, 0);
  const payable = debts
    .filter((entry) => entry.type === "payable")
    .reduce((sum, entry) => sum + entry.amount, 0);

  const handleAdd = async (data: QuickAddInput) => {
    try {
      const savedTransaction = await addFinanceAction(data);
      toast({
        title: "Transaksi tersimpan",
        description: data.action === "withdrawal"
          ? `Tarik tabungan ${formatRupiah(savedTransaction.amount)} dicatat utuh sebagai pemasukan.`
          : `${data.action === "debt" ? "Hutang/Piutang" : data.action === "income" ? "Pemasukan" : "Pengeluaran"} ${formatRupiah(savedTransaction.amount)}`,
      });
    } catch (error) {
      const description = error instanceof Error ? error.message : "Silakan coba lagi.";
      toast({ title: "Gagal menyimpan", description, variant: "destructive" });
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteTransaction(id);
      toast({ title: "Transaksi dihapus" });
    } catch (error) {
      toast({
        title: "Gagal menghapus",
        description: error instanceof Error ? error.message : "Silakan coba lagi.",
        variant: "destructive",
      });
    }
  };
  const txList = transactions;
  const totalBalance = txList.reduce((s, t) => s + (t.type === "income" ? t.amount : -t.amount), 0);
  const now = new Date();
  const monthTx = txList.filter((t) => {
    const d = new Date(t.date);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  });
  const monthIncome = monthTx.filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0);
  const monthExpense = monthTx.filter((t) => t.type === "expense").reduce((s, t) => s + t.amount, 0);
  const monthlyBudget = 3000000;
  const { daily: avgDailySpend, monthly: monthlySpendEstimate } = dailySpendingRate(txList);
  const netWorthTotal = totalBalance + savings + receivable - payable;

  const handleImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    if (files.length === 0) return;
    try {
      const imported = await importCsvFiles(files);
      toast({
        title: "Impor CSV berhasil",
        description: `${imported.transactions.length} transaksi, ${imported.savings.length} tabungan, dan ${imported.debts.length} hutang/piutang tersimpan di browser ini.`,
      });
    } catch (importError) {
      toast({
        title: "Gagal mengimpor CSV",
        description: importError instanceof Error ? importError.message : "Silakan periksa file CSV dan coba lagi.",
        variant: "destructive",
      });
    } finally {
      event.target.value = "";
    }
  };

  return (
    <Layout>
        <div className="px-5 md:px-10 pt-5 max-w-7xl mx-auto">
          <div className="glass rounded-2xl border border-white/60 p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <FileSpreadsheet className="mt-0.5 h-5 w-5 flex-none text-accent" />
              <div>
                <p className="text-sm font-semibold">Data tersimpan lokal di browser ini</p>
                <p className="text-xs text-muted-foreground">Penyimpanan otomatis di perangkat ini; data tidak diunggah atau tersinkron.</p>
                {error && <p role="alert" className="mt-1 text-xs text-red-600">{error}</p>}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <input
                ref={importInputRef}
                type="file"
                accept=".csv,text/csv"
                multiple
                onChange={(event) => { void handleImport(event); }}
                className="hidden"
                aria-label="Pilih CSV untuk diimpor"
              />
              <button
                type="button"
                onClick={() => importInputRef.current?.click()}
                className="inline-flex items-center gap-2 rounded-xl border border-border bg-white/70 px-4 py-2 text-xs font-semibold hover:border-accent"
              >
                <Upload className="h-4 w-4" />
                Impor CSV
              </button>
              <button
                type="button"
                onClick={exportCsvFile}
                className="inline-flex items-center gap-2 rounded-xl border border-border bg-white/70 px-4 py-2 text-xs font-semibold hover:border-accent"
              >
                <Download className="h-4 w-4" />
                Ekspor CSV
              </button>
            </div>
          </div>
        </div>

        {/* ===== PULSE DASHBOARD ===== */}
        <section id="pulse" className="relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-teal-900/20 via-background/40 to-background" />

          <div className="relative px-5 md:px-10 pt-12 md:pt-20 pb-16 max-w-7xl mx-auto">
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }} className="mb-10">
              <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full glass border border-white/60 text-xs font-medium text-muted-foreground mb-5">
                <Sparkles className="w-3.5 h-3.5 text-accent" />
                Fluid Intelligence Dashboard
              </span>
              <h1 className="text-4xl md:text-6xl font-heading font-extrabold leading-[1.05] mb-4 max-w-3xl">
                Keuangan Anda,
                <br />
                <span className="text-accent">seperti detak nadi.</span>
              </h1>
              <p className="text-muted-foreground text-base md:text-lg max-w-xl">
                Pantau arus kas, catat transaksi, dan proyeksikan masa depan — semua diproses langsung di browser Anda.
              </p>
            </motion.div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="glass-dark rounded-3xl p-6 text-white">
                <div className="flex items-center gap-2 text-white/50 text-xs font-medium uppercase tracking-wider mb-3">
                  <Wallet className="w-4 h-4" />
                  Saldo Bersih
                </div>
                <p className={`text-3xl md:text-2xl lg:text-4xl font-heading font-extrabold tracking-tight leading-none break-words ${totalBalance >= 0 ? "text-accent" : "text-red-400"}`}>
                  {totalBalance >= 0 ? "" : "−"}Rp {Math.abs(totalBalance).toLocaleString("id-ID")}
                </p>
                <p className="mt-2 text-[11px] text-white/50">Total pemasukan dikurangi pengeluaran</p>
                <div className="mt-4 h-1 bg-white/10 rounded-full overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.min(100, (totalBalance / Math.max(monthIncome, 1)) * 100)}%` }}
                    className="h-full bg-accent rounded-full"
                  />
                </div>
              </motion.div>

              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="glass rounded-3xl p-6 border border-white/60">
                <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium uppercase tracking-wider mb-3">
                  <TrendingUp className="w-4 h-4 text-accent" />
                  Pemasukan Bulan Ini
                </div>
                <p className="text-3xl md:text-2xl lg:text-3xl font-heading font-extrabold tracking-tight leading-none break-words text-accent">
                  Rp {monthIncome.toLocaleString("id-ID")}
                </p>
                <p className="text-xs text-muted-foreground mt-2">{monthTx.filter((t) => t.type === "income").length} transaksi</p>
              </motion.div>

              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="glass rounded-3xl p-6 border border-white/60">
                <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium uppercase tracking-wider mb-3">
                  <TrendingDown className="w-4 h-4 text-orange-500" />
                  Pengeluaran Bulan Ini
                </div>
                <p className="text-3xl md:text-2xl lg:text-3xl font-heading font-extrabold tracking-tight leading-none break-words text-orange-500">
                  Rp {monthExpense.toLocaleString("id-ID")}
                </p>
                <p className="text-xs text-muted-foreground mt-2">{monthTx.filter((t) => t.type === "expense").length} transaksi</p>
                <p className="text-[11px] text-muted-foreground mt-1">
                  Estimasi {formatRupiah(monthlySpendEstimate)}/bulan ({formatRupiah(avgDailySpend)}/hari × 30)
                </p>
              </motion.div>
            </div>

            <AssetOverview savings={savings} receivable={receivable} payable={payable} net={netWorthTotal} loading={false} />

            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }} className="glass rounded-3xl p-6 md:p-8 border border-white/60">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="font-heading font-bold text-lg">Dynamic Wealth Wave</h3>
                  <p className="text-sm text-muted-foreground">Perkembangan saldo dari waktu ke waktu</p>
                </div>
              </div>
              <WealthWave transactions={txList} />
            </motion.div>
          </div>
        </section>

        {/* ===== LIQUIDITY STREAM ===== */}
        <TransactionStream transactions={transactions} onDelete={handleDelete} />

        {/* ===== EXPENSE SUMMARY ===== */}
        <ExpenseSummary transactions={txList} />

        {/* ===== SPENDING TREND ===== */}
        <SpendingTrend transactions={txList} />

        {/* ===== ACTIVITY ===== */}
        <ActivitySection transactions={txList} monthlyBudget={monthlyBudget} />

        {/* ===== SAVINGS ===== */}
        <SavingsPanel />
        <DebtPanel />

        {/* ===== PLANNING ===== */}
        <section id="planning" className="px-5 md:px-10 py-20 max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-secondary text-muted-foreground text-xs font-medium mb-4">
              <Sparkles className="w-3.5 h-3.5 text-accent" />
              Decision Intelligence
            </span>
            <h2 className="text-3xl md:text-5xl font-heading font-extrabold mb-3">Runway &amp; Keputusan</h2>
            <p className="text-muted-foreground max-w-xl mx-auto text-base">
              Keputusan dihitung dari aset bersih — saldo + tabungan + piutang − utang — dengan estimasi pengeluaran rata-rata harian × 30 hari.
            </p>
          </div>
          <div className="grid lg:grid-cols-2 gap-6">
            <FinancialRunway transactions={txList} savings={savings} receivable={receivable} payable={payable} />
            <CanIAfford transactions={txList} savings={savings} receivable={receivable} payable={payable} />
            <FinancialSnapshot transactions={txList} savings={savings} receivable={receivable} payable={payable} />
          </div>
        </section>

        {/* ===== HORIZON ===== */}
        <HorizonProjection transactions={txList} savings={savings} receivable={receivable} payable={payable} />

        {/* ===== FOOTER ===== */}
        <footer className="border-t border-border mt-10">
          <div className="px-5 md:px-10 py-10 max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-foreground flex items-center justify-center">
                <Wallet className="w-4 h-4 text-background" />
              </div>
              <span className="font-heading font-bold">Keuangan Arwan Resita</span>
            </div>
            <p className="text-xs text-muted-foreground text-center">Berjalan lokal di browser · Data tidak diunggah · Tidak tersinkron antarperangkat</p>
            <div className="flex gap-4 text-xs text-muted-foreground">
              <a href="#pulse" className="hover:text-foreground transition-colors">Pulse</a>
              <a href="#stream" className="hover:text-foreground transition-colors">Stream</a>
              <a href="#summary" className="hover:text-foreground transition-colors">Summary</a>
              <a href="#horizon" className="hover:text-foreground transition-colors">Horizon</a>
            </div>
          </div>
        </footer>

        <QuickAddBar onAdd={handleAdd} transactions={txList} />
    </Layout>
  );
}
