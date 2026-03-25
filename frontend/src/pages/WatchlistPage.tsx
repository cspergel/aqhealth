import { tokens } from "../lib/tokens";
import { WatchlistPanel } from "../components/watchlist/WatchlistPanel";

export function WatchlistPage() {
  return (
    <div style={{ padding: "24px 32px" }}>
      <div
        style={{
          maxWidth: 800,
          margin: "0 auto",
          background: tokens.surface,
          borderRadius: 12,
          border: `1px solid ${tokens.border}`,
          padding: "24px 28px",
        }}
      >
        <WatchlistPanel />
      </div>
    </div>
  );
}
