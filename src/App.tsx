import { ToastProvider } from "@/components/ui/use-toast";
import Dashboard from "@/pages/Dashboard";
import { LocalFinanceProvider } from "@/context/LocalFinanceProvider";
import { useLocalFinance } from "@/context/LocalFinanceContext";

function FinanceApp() {
  const { loading } = useLocalFinance();

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-[#0a0e1a] px-5 text-white">
        <p className="text-sm text-white/70">Memuat data keuangan lokal...</p>
      </main>
    );
  }

  return <Dashboard />;
}

export default function App() {
  return (
    <ToastProvider>
      <LocalFinanceProvider>
        <FinanceApp />
      </LocalFinanceProvider>
    </ToastProvider>
  );
}
