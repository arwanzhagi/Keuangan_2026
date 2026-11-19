import { useState, type FormEvent } from "react";
import { ToastProvider } from "@/components/ui/use-toast";
import { LocalFinanceProvider } from "@/context/LocalFinanceProvider";
import { useAuth } from "@/context/AuthContext";
import { AuthProvider } from "@/context/AuthProvider";
import { supabase } from "@/lib/supabase";
import Dashboard from "@/pages/Dashboard";

function AuthGate() {
  const { user, role, loading, error, needsSetup, signIn, setupLocalUsers, signOut } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [resitaPassword, setResitaPassword] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!supabase) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#0a0e1a] px-5 text-white">
        <section className="w-full max-w-lg rounded-3xl border border-white/10 bg-white/5 p-7">
          <h1 className="text-xl font-bold">Konfigurasi Supabase diperlukan</h1>
          <p className="mt-3 text-sm text-white/70">
            Tambahkan <code>VITE_SUPABASE_URL</code> dan <code>VITE_SUPABASE_ANON_KEY</code>
            {" "}di Environment Variables Bolt, lalu jalankan migration Supabase.
          </p>
        </section>
      </main>
    );
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#0a0e1a] px-5 text-white">
        <p className="text-sm text-white/70">Memeriksa sesi...</p>
      </main>
    );
  }

  if (user && error) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#0a0e1a] px-5 text-white">
        <section className="w-full max-w-lg rounded-3xl border border-white/10 bg-white/5 p-7">
          <h1 className="text-xl font-bold">Akun belum siap</h1>
          <p role="alert" className="mt-3 text-sm text-red-300">{error}</p>
          <button onClick={() => { void signOut(); }} className="mt-5 rounded-xl bg-white/10 px-4 py-2 text-sm">
            Keluar
          </button>
        </section>
      </main>
    );
  }

  if (!user && error) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#0a0e1a] px-5 text-white">
        <section className="w-full max-w-lg rounded-3xl border border-white/10 bg-white/5 p-7">
          <h1 className="text-xl font-bold">Gagal memuat akun website</h1>
          <p role="alert" className="mt-3 text-sm text-red-300">{error}</p>
        </section>
      </main>
    );
  }

  if (user && !role) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#0a0e1a] px-5 text-white">
        <p className="text-sm text-white/70">Memuat hak akses...</p>
      </main>
    );
  }

  if (!user && needsSetup) {
    const handleSetup = async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setSubmitting(true);
      setFormError(null);
      try {
        await setupLocalUsers({ admin: adminPassword, user: resitaPassword });
        setAdminPassword("");
        setResitaPassword("");
      } catch (setupError) {
        setFormError(setupError instanceof Error ? setupError.message : "Gagal membuat akun lokal.");
      } finally {
        setSubmitting(false);
      }
    };

    return (
      <main className="flex min-h-screen items-center justify-center bg-[#0a0e1a] px-5 py-8 text-white">
        <form onSubmit={(event) => { void handleSetup(event); }} className="w-full max-w-md rounded-3xl border border-white/10 bg-white/5 p-7 shadow-2xl">
          <div className="mb-6">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-teal-300">Pengaturan awal</p>
            <h1 className="mt-2 text-2xl font-extrabold">Buat akun website</h1>
            <p className="mt-2 text-sm text-white/60">Akun disimpan di browser ini, bukan di tabel Supabase. Isi password untuk Arwan dan Resita.</p>
          </div>
          <label className="mb-4 block text-sm">
            <span className="mb-1.5 block text-white/70">Password Arwan · Super Admin</span>
            <input
              type="password"
              autoComplete="new-password"
              minLength={6}
              required
              value={adminPassword}
              onChange={(event) => setAdminPassword(event.target.value)}
              className="w-full rounded-xl border border-white/15 bg-slate-950/60 px-4 py-3 outline-none focus:border-teal-400"
            />
          </label>
          <label className="mb-5 block text-sm">
            <span className="mb-1.5 block text-white/70">Password Resita · User biasa</span>
            <input
              type="password"
              autoComplete="new-password"
              minLength={6}
              required
              value={resitaPassword}
              onChange={(event) => setResitaPassword(event.target.value)}
              className="w-full rounded-xl border border-white/15 bg-slate-950/60 px-4 py-3 outline-none focus:border-teal-400"
            />
          </label>
          <p className="mb-4 rounded-xl border border-amber-300/20 bg-amber-300/10 p-3 text-xs text-amber-100/80">
            Login browser-only hanya menyembunyikan fitur di website; bukan pengamanan database. Akun hanya tersedia di browser/perangkat ini.
          </p>
          {formError && <p role="alert" className="mb-4 text-sm text-red-300">{formError}</p>}
          <button type="submit" disabled={submitting} className="w-full rounded-xl bg-teal-500 px-4 py-3 font-semibold text-slate-950 disabled:opacity-60">
            {submitting ? "Membuat akun..." : "Buat akun"}
          </button>
        </form>
      </main>
    );
  }

  if (!user) {
    const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setSubmitting(true);
      setFormError(null);
      try {
        await signIn(username, password);
        setPassword("");
      } catch (signInError) {
        setFormError(signInError instanceof Error ? signInError.message : "Login gagal.");
      } finally {
        setSubmitting(false);
      }
    };

    return (
      <main className="flex min-h-screen items-center justify-center bg-[#0a0e1a] px-5 text-white">
        <form onSubmit={(event) => { void handleSubmit(event); }} className="w-full max-w-md rounded-3xl border border-white/10 bg-white/5 p-7 shadow-2xl">
          <div className="mb-7">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-teal-300">Keuangan Arwan Resita</p>
            <h1 className="mt-2 text-3xl font-extrabold">Masuk</h1>
            <p className="mt-2 text-sm text-white/60">Masuk dengan akun yang tersimpan di browser ini.</p>
          </div>
          <label className="mb-4 block text-sm">
            <span className="mb-1.5 block text-white/70">Nama pengguna</span>
            <input
              type="text"
              autoComplete="username"
              required
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              className="w-full rounded-xl border border-white/15 bg-slate-950/60 px-4 py-3 outline-none focus:border-teal-400"
            />
          </label>
          <label className="mb-5 block text-sm">
            <span className="mb-1.5 block text-white/70">Password</span>
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full rounded-xl border border-white/15 bg-slate-950/60 px-4 py-3 outline-none focus:border-teal-400"
            />
          </label>
          {formError && <p role="alert" className="mb-4 text-sm text-red-300">{formError}</p>}
          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-xl bg-teal-500 px-4 py-3 font-semibold text-slate-950 transition hover:bg-teal-400 disabled:opacity-60"
          >
            {submitting ? "Memeriksa..." : "Masuk"}
          </button>
        </form>
      </main>
    );
  }

  return (
    <LocalFinanceProvider key={user.id}>
      <Dashboard />
    </LocalFinanceProvider>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <AuthGate />
      </AuthProvider>
    </ToastProvider>
  );
}
