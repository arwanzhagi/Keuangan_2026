import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { AuthContext, type FinanceUser, type UserRole } from "@/context/AuthContext";

interface StoredAccount extends FinanceUser {
  salt: string;
  passwordHash: string;
}

const ACCOUNTS_KEY = "keuangan-web-accounts-v1";
const SESSION_KEY = "keuangan-web-session-v1";
const PASSWORD_ITERATIONS = 120_000;

function toBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

function fromBase64(value: string): Uint8Array {
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
}

async function hashPassword(password: string, salt: Uint8Array): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const result = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: PASSWORD_ITERATIONS, hash: "SHA-256" },
    key,
    256,
  );
  return toBase64(new Uint8Array(result));
}

function equalHash(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) {
    mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return mismatch === 0;
}

function isStoredAccount(value: unknown): value is StoredAccount {
  if (typeof value !== "object" || value === null) return false;
  const account = value as Record<string, unknown>;
  return typeof account.id === "string"
    && typeof account.username === "string"
    && (account.role === "admin" || account.role === "user")
    && typeof account.salt === "string"
    && typeof account.passwordHash === "string";
}

function publicUser(account: StoredAccount): FinanceUser {
  return { id: account.id, username: account.username, role: account.role };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [accounts, setAccounts] = useState<StoredAccount[]>([]);
  const [user, setUser] = useState<FinanceUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const savedAccounts = localStorage.getItem(ACCOUNTS_KEY);
      const parsed: unknown = savedAccounts ? JSON.parse(savedAccounts) : [];
      if (!Array.isArray(parsed) || !parsed.every(isStoredAccount)) {
        throw new Error("Data user lokal tidak valid. Hapus data user website dan atur ulang akun.");
      }

      setAccounts(parsed);
      const sessionId = localStorage.getItem(SESSION_KEY);
      const activeAccount = parsed.find((account) => account.id === sessionId);
      setUser(activeAccount ? publicUser(activeAccount) : null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Gagal membaca akun lokal.");
    } finally {
      setLoading(false);
    }
  }, []);

  const setupLocalUsers = useCallback(async (passwords: { admin: string; user: string }) => {
    if (localStorage.getItem(ACCOUNTS_KEY)) {
      throw new Error("Akun lokal sudah dibuat di browser ini.");
    }
    if (passwords.admin.length < 6 || passwords.user.length < 6) {
      throw new Error("Kedua password harus memiliki sedikitnya 6 karakter.");
    }

    const definitions: { username: string; role: UserRole; password: string }[] = [
      { username: "Arwan", role: "admin", password: passwords.admin },
      { username: "Resita", role: "user", password: passwords.user },
    ];
    const created = await Promise.all(definitions.map(async (definition) => {
      const salt = crypto.getRandomValues(new Uint8Array(16));
      return {
        id: crypto.randomUUID(),
        username: definition.username,
        role: definition.role,
        salt: toBase64(salt),
        passwordHash: await hashPassword(definition.password, salt),
      };
    }));

    localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(created));
    localStorage.setItem(SESSION_KEY, created[0].id);
    setAccounts(created);
    setUser(publicUser(created[0]));
    setError(null);
  }, []);

  const signIn = useCallback(async (username: string, password: string) => {
    const account = accounts.find(
      (candidate) => candidate.username.toLocaleLowerCase("id-ID") === username.trim().toLocaleLowerCase("id-ID"),
    );
    if (!account || !equalHash(await hashPassword(password, fromBase64(account.salt)), account.passwordHash)) {
      throw new Error("Nama pengguna atau password salah.");
    }

    localStorage.setItem(SESSION_KEY, account.id);
    setUser(publicUser(account));
    setError(null);
  }, [accounts]);

  const signOut = useCallback(() => {
    localStorage.removeItem(SESSION_KEY);
    setUser(null);
  }, []);

  const value = useMemo(() => ({
    user,
    role: user?.role || null,
    loading,
    error,
    needsSetup: !loading && accounts.length === 0,
    signIn,
    setupLocalUsers,
    signOut,
  }), [accounts.length, error, loading, signIn, setupLocalUsers, signOut, user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
