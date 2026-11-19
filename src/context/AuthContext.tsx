import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

export type UserRole = "admin" | "user";

export interface Profile {
  id: string;
  username: string;
  role: UserRole;
}

interface AuthContextValue {
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  error: string | null;
  isAdmin: boolean;
  signIn: (usernameOrEmail: string, password: string) => Promise<void>;
  signUp: (email: string, username: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);
const KNOWN_EMAILS: Record<string, string> = {
  arwan: "arwan@keuangan.app",
  resita: "resita@keuangan.app",
};

function publicAuthError(): string {
  return "Nama pengguna atau kata sandi tidak benar.";
}

function resolveEmail(value: string): string {
  const normalized = value.trim().toLocaleLowerCase("id-ID");
  return normalized.includes("@") ? normalized : KNOWN_EMAILS[normalized] || normalized;
}

async function ensureInitialAccounts(): Promise<void> {
  const { error } = await supabase.functions.invoke("bootstrap-finance-users", { body: {} });
  if (error) throw new Error("Akun awal belum dapat disiapkan.");
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadProfile = useCallback(async (userId: string) => {
    const { data, error: profileError } = await supabase
      .from("profiles")
      .select("id, username, role")
      .eq("id", userId)
      .maybeSingle();
    if (profileError || !data) {
      throw new Error("Profil akun belum tersedia.");
    }
    setProfile(data as Profile);
  }, []);

  useEffect(() => {
    let active = true;
    const initialize = async () => {
      try {
        await ensureInitialAccounts();
        const { data, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;
        if (!active) return;
        setSession(data.session);
        if (data.session) await loadProfile(data.session.user.id);
      } catch (_error) {
        if (active) setError("Akun belum dapat disiapkan. Silakan coba muat ulang halaman.");
      } finally {
        if (active) setLoading(false);
      }
    };
    void initialize();

    const { data: listener } = supabase.auth.onAuthStateChange((_, nextSession) => {
      setSession(nextSession);
      if (!nextSession) {
        setProfile(null);
        return;
      }
      void loadProfile(nextSession.user.id).catch(() => setError("Profil akun belum dapat dimuat."));
    });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, [loadProfile]);

  const signIn = useCallback(async (usernameOrEmail: string, password: string) => {
    setError(null);
    const { data, error: signInError } = await supabase.auth.signInWithPassword({
      email: resolveEmail(usernameOrEmail),
      password,
    });
    if (signInError || !data.user) {
      throw new Error(publicAuthError());
    }
    await loadProfile(data.user.id);
  }, [loadProfile]);

  const signUp = useCallback(async (email: string, username: string, password: string) => {
    setError(null);
    const { data, error: signUpError } = await supabase.auth.signUp({
      email: email.trim().toLocaleLowerCase("id-ID"),
      password,
      options: { data: { username: username.trim() } },
    });
    if (signUpError || !data.user) {
      throw new Error("Akun belum dapat dibuat. Periksa data dan coba lagi.");
    }
    if (data.session) await loadProfile(data.user.id);
  }, [loadProfile]);

  const signOut = useCallback(async () => {
    const { error: signOutError } = await supabase.auth.signOut();
    if (signOutError) throw new Error("Akun belum dapat dikeluarkan.");
    setSession(null);
    setProfile(null);
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    session,
    profile,
    loading,
    error,
    isAdmin: profile?.role === "admin",
    signIn,
    signUp,
    signOut,
  }), [session, profile, loading, error, signIn, signUp, signOut]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth harus digunakan di dalam AuthProvider.");
  return context;
}
