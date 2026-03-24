import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { tokens, fonts } from "../lib/tokens";

export function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      await login(email, password);
      navigate("/");
    } catch {
      setError("Invalid email or password");
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{ background: tokens.bg, fontFamily: fonts.body }}
    >
      <form onSubmit={handleSubmit} className="w-full max-w-sm">
        <div className="flex items-center gap-2 mb-8 justify-center">
          <div className="w-2.5 h-2.5 rounded-full" style={{ background: tokens.accent }} />
          <span className="text-xl font-bold tracking-tight" style={{ fontFamily: fonts.heading }}>
            AQSoft Health
          </span>
        </div>

        <div
          className="rounded-xl p-6 space-y-4"
          style={{ background: tokens.surface, border: `1px solid ${tokens.border}` }}
        >
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: tokens.textMuted }}>
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 rounded-lg text-sm outline-none"
              style={{ border: `1px solid ${tokens.border}`, color: tokens.text }}
              required
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: tokens.textMuted }}>
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 rounded-lg text-sm outline-none"
              style={{ border: `1px solid ${tokens.border}`, color: tokens.text }}
              required
            />
          </div>
          {error && <div className="text-xs" style={{ color: tokens.red }}>{error}</div>}
          <button
            type="submit"
            className="w-full py-2 rounded-lg text-sm font-semibold text-white"
            style={{ background: tokens.accent }}
          >
            Sign in
          </button>
        </div>
      </form>
    </div>
  );
}
