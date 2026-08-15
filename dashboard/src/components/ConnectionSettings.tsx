// src/components/ConnectionSettings.tsx
import { useState } from "react";
import { Wifi, WifiOff } from "lucide-react";

interface ConnectionSettingsProps {
  host: string;
  isDefault: boolean;
  connected: boolean;
  onSave: (host: string) => void;
  onReset: () => void;
}

// Lets anyone repoint the dashboard at a live backend (e.g. the demo
// host's LAN IP) without editing dashboard/.env.local and restarting
// `npm run dev` — Vite only reads that file at startup, which was the
// main friction point during cross-machine rehearsals. Persisted to
// localStorage so the choice survives a page reload.
export default function ConnectionSettings({
  host,
  isDefault,
  connected,
  onSave,
  onReset,
}: ConnectionSettingsProps) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState(host);

  const commit = () => {
    const trimmed = input.trim();
    if (!trimmed) return;
    onSave(trimmed);
    setOpen(false);
  };

  return (
    <div className="relative">
      <button
        onClick={() => {
          setInput(host);
          setOpen((v) => !v);
        }}
        title={`Connected to ${host}${connected ? "" : " (unreachable)"}`}
        className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 transition-colors font-mono"
      >
        {connected ? (
          <Wifi size={12} className="text-emerald-400 shrink-0" />
        ) : (
          <WifiOff size={12} className="text-slate-500 shrink-0" />
        )}
        {host}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute top-full right-0 mt-2 w-72 p-3 rounded-lg bg-slate-800 border border-slate-700 shadow-xl z-50">
            <label className="text-[10px] uppercase tracking-wider text-slate-500">
              Backend host
            </label>
            <input
              autoFocus
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") commit();
                if (e.key === "Escape") setOpen(false);
              }}
              placeholder="192.168.1.42:8000"
              className="mt-1 w-full text-xs bg-slate-900 border border-slate-700 rounded-md px-2 py-1.5 text-slate-200 font-mono focus:outline-none focus:border-slate-500"
            />
            <p className="mt-1.5 text-[10px] text-slate-500">
              Host:port only — e.g. the demo host's LAN IP. No protocol prefix.
            </p>
            <div className="flex gap-2 mt-2">
              <button
                onClick={commit}
                className="flex-1 text-xs px-2 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white font-medium transition-colors"
              >
                Connect
              </button>
              {!isDefault && (
                <button
                  onClick={() => {
                    onReset();
                    setOpen(false);
                  }}
                  className="text-xs px-2 py-1.5 rounded-md bg-slate-700 hover:bg-slate-600 text-slate-300 transition-colors"
                >
                  Reset
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
