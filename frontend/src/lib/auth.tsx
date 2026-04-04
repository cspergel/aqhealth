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
  setDemoRole: (role: string) => void;
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
  // Demo mode is only available when VITE_DEMO_ENABLED=true at build time,
  // OR when running on localhost (development). This prevents demo mode
  // from being activated in production deployments that don't set the flag.
  const demoAllowed = import.meta.env.VITE_DEMO_ENABLED === "true"
    || window.location.hostname === "localhost"
    || window.location.hostname === "127.0.0.1"
    || window.location.hostname.endsWith(".github.io")  // GitHub Pages demo
    || window.location.hostname.endsWith("aqhealth.ai") // Production demo site
    || window.location.hostname.endsWith(".pages.dev");  // Cloudflare Pages preview

  if (!demoAllowed) return false;

  return new URLSearchParams(window.location.search).get("demo") === "true"
    || localStorage.getItem("demo_mode") === "true";
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isDemo, setIsDemo] = useState(false);

  useEffect(() => {
    const urlHasDemo = new URLSearchParams(window.location.search).get("demo") === "true";

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

    // If the URL no longer has ?demo=true, clear stale demo flag so real auth takes over
    if (!urlHasDemo && localStorage.getItem("demo_mode") === "true") {
      localStorage.removeItem("demo_mode");
    }

    const token = localStorage.getItem("access_token");
    const userData = localStorage.getItem("user");
    if (token && userData) {
      try {
        const parsed = JSON.parse(userData);
        // Validate expected shape before trusting localStorage data
        if (
          parsed &&
          typeof parsed === "object" &&
          typeof parsed.id === "number" &&
          typeof parsed.email === "string" &&
          typeof parsed.role === "string"
        ) {
          setUser(parsed as User);
        } else {
          // Corrupted data — clear it
          localStorage.removeItem("access_token");
          localStorage.removeItem("refresh_token");
          localStorage.removeItem("user");
        }
      } catch {
        // Malformed JSON — clear corrupted data
        localStorage.removeItem("access_token");
        localStorage.removeItem("refresh_token");
        localStorage.removeItem("user");
      }
    }
    setIsLoading(false);
  }, []);

  const login = async (email: string, password: string) => {
    // Real login clears any lingering demo state
    localStorage.removeItem("demo_mode");
    demoModeInitialized = false;
    setIsDemo(false);

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
    // Clear global filter state so the next user session starts clean
    localStorage.removeItem("global_filter_group_id");
    localStorage.removeItem("global_filter_provider_id");
    setUser(null);
    setIsDemo(false);
  };

  const setDemoRole = (role: string) => {
    if (!isDemo) return;
    const ROLE_NAMES: Record<string, string> = {
      superadmin: "Super Admin",
      mso_admin: "MSO Admin",
      analyst: "Analyst",
      provider: "Provider",
      care_manager: "Care Manager",
      outreach: "Outreach",
      auditor: "Auditor",
      financial: "Financial",
    };
    setUser({
      ...DEMO_USER,
      role,
      full_name: `Demo User (${ROLE_NAMES[role] || role})`,
    });
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, isLoading, isDemo, setDemoRole }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
