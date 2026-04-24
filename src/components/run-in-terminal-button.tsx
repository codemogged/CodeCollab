"use client";

import { useActiveDesktopProject } from "@/hooks/use-active-desktop-project";

/**
 * Returns true when the language tag and/or code contents look like a shell
 * command that can reasonably be pasted into a real OS terminal.
 */
export function isShellLikeCode(lang: string | undefined | null, code: string): boolean {
  const l = (lang || "").toLowerCase();
  if (/^(bash|shell|sh|zsh|console|terminal|powershell|ps1|pwsh|cmd|bat|batch|dos)$/.test(l)) return true;
  if (l && !/^(bash|shell|sh|zsh|console|terminal|powershell|ps1|pwsh|cmd|bat|batch|dos|text|)$/.test(l)) {
    // Explicit non-shell language (js, ts, py, sql, etc.) → don't show.
    return false;
  }
  // No language tag → sniff the code.
  const first = code.split("\n").map((l) => l.trim()).find((l) => l.length > 0 && !l.startsWith("#")) || "";
  return /^(?:\$\s+)?(?:sudo\s+)?(?:curl|wget|npm|npx|node|yarn|pnpm|git|pip|pip3|python|python3|docker|cargo|mkdir|cd|ls|echo|export|source|chmod|chown|apt|apt-get|brew|dotnet|go|cmake|make|rm|cp|mv|touch|ssh|scp|kubectl|helm|terraform|pwsh|powershell)\b/i.test(first);
}

/**
 * Small "Run in Terminal" button meant to sit next to a Copy button on a
 * rendered code block. Opens a real OS terminal in the active project's
 * working directory with the command pre-populated.
 */
export function RunInTerminalButton({
  code,
  lang,
  variant = "default",
}: {
  code: string;
  lang?: string;
  variant?: "default" | "muted";
}) {
  const { activeProject } = useActiveDesktopProject();
  if (!isShellLikeCode(lang, code)) return null;
  const trimmed = code.trim();
  if (!trimmed) return null;

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    void window.electronAPI?.system?.openTerminal?.({
      cwd: activeProject?.repoPath ?? undefined,
      command: trimmed,
      run: false, // VS Code-style: open terminal with command ready, user presses Enter
    });
  };

  const cls = variant === "muted"
    ? "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[9.5px] font-medium text-white/30 transition hover:text-white/60 hover:bg-white/[0.06]"
    : "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium theme-muted hover:theme-fg hover:bg-black/[0.04] dark:hover:bg-white/[0.06] transition";

  return (
    <button
      type="button"
      onClick={handleClick}
      className={cls}
      title="Open terminal with this command pre-loaded (paste with Ctrl+V)"
    >
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3">
        <path fillRule="evenodd" d="M2 4.25A2.25 2.25 0 0 1 4.25 2h7.5A2.25 2.25 0 0 1 14 4.25v7.5A2.25 2.25 0 0 1 11.75 14h-7.5A2.25 2.25 0 0 1 2 11.75v-7.5ZM4.75 4a.75.75 0 0 0-.53 1.28l2.22 2.22-2.22 2.22a.75.75 0 1 0 1.06 1.06l2.75-2.75a.75.75 0 0 0 0-1.06L5.28 4.22A.75.75 0 0 0 4.75 4ZM8.5 10.25a.75.75 0 0 1 .75-.75h2a.75.75 0 0 1 0 1.5h-2a.75.75 0 0 1-.75-.75Z" clipRule="evenodd" />
      </svg>
      <span>Insert in Terminal</span>
    </button>
  );
}
