import { FormEvent, useState } from "react";
import { LockKeyhole, LogIn, UserRound, Wallet } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

export default function Login() {
  const { signIn, signUp, error: setupError } = useAuth();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [usernameOrEmail, setUsernameOrEmail] = useState("");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      if (mode === "login") {
        await signIn(usernameOrEmail, password);
      } else {
        await signUp(email, username, password);
        setMode("login");
        setUsernameOrEmail(email);
        setPassword("");
        setMessage("Akun berhasil dibuat. Silakan masuk.");
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Permintaan belum dapat diproses.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#07131b] px-5 py-10 text-white">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-md items-center justify-center">
        <section className="w-full rounded-[2rem] border border-white/10 bg-white/[0.07] p-6 shadow-2xl backdrop-blur-xl sm:p-8">
          <div className="mb-8 flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-teal-500 shadow-lg shadow-teal-500/20">
              <Wallet className="h-5 w-5 text-white" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-teal-300">Fluid Ledger</p>
              <h1 className="font-heading text-xl font-extrabold">Keuangan Arwan Resita</h1>
            </div>
          </div>

          <div className="mb-7">
            <h2 className="font-heading text-3xl font-extrabold">{mode === "login" ? "Selamat datang" : "Buat akun"}</h2>
            <p className="mt-2 text-sm leading-6 text-white/60">
              {mode === "login" ? "Masuk untuk melihat dan mencatat keuangan bersama." : "Akun baru otomatis menjadi pengguna biasa."}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === "login" ? (
              <label className="block">
                <span className="mb-2 block text-xs font-semibold uppercase tracking-wider text-white/60">User</span>
                <span className="relative block">
                  <UserRound className="pointer-events-none absolute left-4 top-3.5 h-4 w-4 text-white/40" />
                  <input value={usernameOrEmail} onChange={(event) => setUsernameOrEmail(event.target.value)} placeholder="Arwan atau Resita" required autoComplete="username" className="w-full rounded-2xl border border-white/10 bg-white/10 px-11 py-3 text-sm text-white outline-none transition focus:border-teal-300" />
                </span>
              </label>
            ) : (
              <>
                <label className="block">
                  <span className="mb-2 block text-xs font-semibold uppercase tracking-wider text-white/60">Nama pengguna</span>
                  <input value={username} onChange={(event) => setUsername(event.target.value)} placeholder="Nama Anda" required className="w-full rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-sm text-white outline-none transition focus:border-teal-300" />
                </label>
                <label className="block">
                  <span className="mb-2 block text-xs font-semibold uppercase tracking-wider text-white/60">Email</span>
                  <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="nama@email.com" required autoComplete="email" className="w-full rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-sm text-white outline-none transition focus:border-teal-300" />
                </label>
              </>
            )}
            <label className="block">
              <span className="mb-2 block text-xs font-semibold uppercase tracking-wider text-white/60">Password</span>
              <span className="relative block">
                <LockKeyhole className="pointer-events-none absolute left-4 top-3.5 h-4 w-4 text-white/40" />
                <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Masukkan password" required minLength={6} autoComplete={mode === "login" ? "current-password" : "new-password"} className="w-full rounded-2xl border border-white/10 bg-white/10 px-11 py-3 text-sm text-white outline-none transition focus:border-teal-300" />
              </span>
            </label>

            {(message || setupError) && <p className="rounded-xl border border-amber-300/20 bg-amber-300/10 px-3 py-2 text-xs leading-5 text-amber-100">{message || setupError}</p>}

            <button type="submit" disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-teal-500 py-3.5 text-sm font-bold text-white transition hover:bg-teal-400 disabled:cursor-not-allowed disabled:opacity-50">
              {mode === "login" ? <LogIn className="h-4 w-4" /> : <UserRound className="h-4 w-4" />}
              {busy ? "Memproses..." : mode === "login" ? "Masuk" : "Daftar"}
            </button>
          </form>

          <button type="button" onClick={() => { setMode(mode === "login" ? "signup" : "login"); setMessage(null); }} className="mt-5 w-full text-center text-xs font-semibold text-teal-300 transition hover:text-teal-200">
            {mode === "login" ? "Buat akun pengguna biasa" : "Kembali ke halaman masuk"}
          </button>

          {mode === "login" && (
            <p className="mt-6 text-center text-[11px] leading-5 text-white/40">Arwan memiliki akses admin. Resita memiliki akses pengguna biasa.</p>
          )}
        </section>
      </div>
    </main>
  );
}
