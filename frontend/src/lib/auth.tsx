import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import api from "./api";
import { enableDemoMode } from "./mockApi";

interface User {
  id: number;
  email: string;
  full_name: string;
  role: string;
}

interface AuthContextType {
  user: User | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  isLoading: boolean;
  isDemo: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

const DEMO_USER: User = {
  id: 1,
  email: "demo@aqsoft.ai",
  full_name: "Demo User (MSO Admin)",
  role: "mso_admin",
};

let demoModeInitialized = false;

function isDemoMode(): boolean {
  return new URLSearchParams(window.location.search).get("demo") === "true"
    || localStorage.getItem("demo_mode") === "true";
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isDemo, setIsDemo] = useState(false);

  useEffect(() => {
    if (isDemoMode()) {
      if (!demoModeInitialized) {
        enableDemoMode();
        demoModeInitialized = true;
      }
      localStorage.setItem("demo_mode", "true");
      setUser(DEMO_USER);
      setIsDemo(true);
      setIsLoading(false);
      return;
    }

    const token = localStorage.getItem("access_token");
    const userData = localStorage.getItem("user");
    if (token && userData) {
      setUser(JSON.parse(userData));
    }
    setIsLoading(false);
  }, []);

  const login = async (email: string, password: string) => {
    const res = await api.post("/api/auth/login", { email, password });
    localStorage.setItem("access_token", res.data.access_token);
    localStorage.setItem("refresh_token", res.data.refresh_token);
    localStorage.setItem("user", JSON.stringify(res.data.user));
    setUser(res.data.user);
  };

  const logout = () => {
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    localStorage.removeItem("user");
    localStorage.removeItem("demo_mode");
    setUser(null);
    setIsDemo(false);
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, isLoading, isDemo }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
