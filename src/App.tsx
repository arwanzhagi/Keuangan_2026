import { ToastProvider } from "@/components/ui/use-toast";
import Dashboard from "@/pages/Dashboard";
import Login from "@/pages/Login";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { LocalFinanceProvider } from "@/context/LocalFinanceProvider";
import { useLocalFinance } from "@/context/LocalFinanceContext";

function FinanceApp() {
  const { loading } = useLocalFinance();

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-[#0a0e1a] px-5 text-white">
        <p className="text-sm text-white/70">Memuat data keuangan...</p>
      </main>
    );
  }

  return <Dashboard />;
}

function AuthenticatedApp() {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-[#07131b] px-5 text-white">
        <p className="text-sm text-white/70">Menyiapkan akun...</p>
      </main>
    );
  }

  if (!session) return <Login />;

  return (
    <LocalFinanceProvider>
      <FinanceApp />
    </LocalFinanceProvider>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <AuthenticatedApp />
      </AuthProvider>
    </ToastProvider>
  );
}
