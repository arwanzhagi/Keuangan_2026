import { createContext, useContext } from "react";

export type UserRole = "admin" | "user";

export interface FinanceUser {
  id: string;
  username: string;
  role: UserRole;
}

export interface AuthContextValue {
  user: FinanceUser | null;
  role: UserRole | null;
  loading: boolean;
  error: string | null;
  needsSetup: boolean;
  signIn: (username: string, password: string) => Promise<void>;
  setupLocalUsers: (passwords: { admin: string; user: string }) => Promise<void>;
  signOut: () => void;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth harus digunakan di dalam AuthProvider.");
  return context;
}
