import {
  createContext,
  useContext,
  useEffect,
  useCallback,
  useMemo,
  useState,
  ReactNode,
} from "react";
import { authApi, ProfileUpdate, ProfileUser, Role, User } from "../lib/api";
type AuthContextValue = {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (data: Record<string, unknown>) => Promise<string>;
  logout: () => void;
  refreshProfile: () => Promise<ProfileUser>;
  updateProfile: (data: ProfileUpdate) => Promise<ProfileUser>;
};
const AuthContext = createContext<AuthContextValue | null>(null);
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (localStorage.getItem("hp_token"))
      authApi
        .me()
        .then((r) => setUser(r.user))
        .catch(() => localStorage.removeItem("hp_token"))
        .finally(() => setLoading(false));
    else setLoading(false);
  }, []);
  const save = (r: { user: User; token: string }) => {
    localStorage.setItem("hp_token", r.token);
    setUser(r.user);
  };
  const refreshProfile = useCallback(async () => {
    const result = await authApi.me();
    setUser(result.user);
    return result.user;
  }, []);
  const updateProfile = useCallback(async (data: ProfileUpdate) => {
    const result = await authApi.updateProfile(data);
    setUser(result.user);
    return result.user;
  }, []);
  const value = useMemo(
    () => ({
      user,
      loading,
      login: async (e: string, p: string) =>
        save(await authApi.login({ email: e, password: p })),
      register: async (d: Record<string, unknown>) => {
        const result = await authApi.register(d);
        save(result);
        return result.notification?.message || "Confirmation notification recorded for local development.";
      },
      refreshProfile,
      updateProfile,
      logout: () => {
        localStorage.removeItem("hp_token");
        setUser(null);
      },
    }),
    [user, loading, refreshProfile, updateProfile],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
export const useAuth = () => {
  const c = useContext(AuthContext);
  if (!c) throw new Error("useAuth must be used within AuthProvider");
  return c;
};
export const roleLabel = (role: Role) =>
  role.charAt(0) + role.slice(1).toLowerCase();
