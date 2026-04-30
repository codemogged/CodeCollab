"use client";

import { useEffect, useState } from "react";
import type { UpdaterStatus } from "@/lib/electron";

/**
 * Update toast — appears in the bottom-right when a new version is downloaded.
 * No-op in dev mode and on macOS (which doesn't auto-update unsigned builds).
 */
export default function UpdateToast() {
  const [status, setStatus] = useState<UpdaterStatus>({ state: "idle", info: null });
  const [dismissed, setDismissed] = useState(false);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const api = window.electronAPI?.updater;
    if (!api) return;

    api.getStatus().then(setStatus).catch(() => { /* ignore */ });
    const unsubscribe = api.onStatus((next) => setStatus(next));
    return () => { try { unsubscribe(); } catch { /* ignore */ } };
  }, []);

  // Only show the toast once an update is fully downloaded and ready to install.
  if (dismissed) return null;
  if (status.state !== "downloaded") return null;

  const version = status.info?.version;

  return (
    <div className="fixed bottom-6 right-6 z-[9999] max-w-sm rounded-2xl border border-white/10 bg-zinc-900/95 p-4 shadow-2xl backdrop-blur-md">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
        </div>
        <div className="flex-1">
          <div className="text-sm font-semibold text-white">
            Update ready{version ? ` — v${version}` : ""}
          </div>
          <div className="mt-1 text-xs text-zinc-400">
            A new version of CodeCollab has been downloaded. Restart now to apply, or it'll install automatically next time you quit the app.
          </div>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              disabled={installing}
              onClick={async () => {
                setInstalling(true);
                try {
                  await window.electronAPI?.updater?.installNow();
                } catch {
                  setInstalling(false);
                }
              }}
              className="rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-black transition hover:bg-emerald-400 disabled:opacity-60"
            >
              {installing ? "Restarting…" : "Restart now"}
            </button>
            <button
              type="button"
              onClick={() => setDismissed(true)}
              className="rounded-lg border border-white/15 px-3 py-1.5 text-xs font-medium text-zinc-300 transition hover:bg-white/5"
            >
              Later
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
