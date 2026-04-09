"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

function NavbarContent() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const projectDashboardMode = pathname.startsWith("/project");
  const homeTab = searchParams.get("tab") === "friends" ? "friends" : "projects";
  const [userInitials, setUserInitials] = useState("");
  useEffect(() => {
    if (typeof window !== "undefined" && window.electronAPI?.settings) {
      window.electronAPI.settings.get().then((s) => {
        const settings = s as unknown as Record<string, unknown>;
        if (settings.displayName) {
          const initials = (settings.displayName as string).split(" ").filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("");
          setUserInitials(initials);
        }
      }).catch(() => {});
    }
  }, []);

  if (projectDashboardMode) {
    return null;
  }

  return (
    <nav className="absolute inset-x-0 top-0 z-50 px-4 pt-4 sm:px-6">
      <div className="mx-auto flex w-full max-w-none items-center justify-between rounded-[1.2rem] border border-black/[0.06] bg-[linear-gradient(180deg,rgba(255,255,255,0.82),rgba(255,255,255,0.68))] px-3 py-2 shadow-[0_14px_40px_rgba(15,23,42,0.08)] backdrop-blur-2xl dark:border-white/[0.08] dark:bg-[linear-gradient(180deg,rgba(25,26,29,0.88),rgba(19,20,23,0.8))] dark:shadow-[0_16px_40px_rgba(0,0,0,0.3)] sm:px-4">
        <Link href="/home" className="display-font flex items-center gap-2 rounded-full px-2 py-1 text-[14px] font-semibold tracking-tight text-ink transition hover:bg-black/[0.04] dark:text-[var(--fg)] dark:hover:bg-white/[0.05]">
          <span className="flex h-8 w-8 items-center justify-center rounded-[0.95rem] bg-[#111214] text-[10px] font-bold text-[#f4efe6] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] dark:bg-[#f3efe8] dark:text-[#111214]">cb</span>
          <span className="hidden sm:block">CodeBuddy</span>
        </Link>

        <div className="flex items-center gap-2">
          <Link
            href="/home?tab=projects"
            className={`rounded-full border px-4 py-1.5 text-[11px] font-semibold tracking-[0.01em] transition-all duration-200 sm:px-4.5 ${
              pathname === "/home" && homeTab === "projects"
                ? "border-[#111214] bg-[#111214] text-[#f4efe6] shadow-[0_8px_18px_rgba(17,18,20,0.18)] dark:border-[#f3efe8] dark:bg-[#f3efe8] dark:text-[#111214] dark:shadow-none"
                : "border-black/[0.07] bg-white/44 text-ink/72 hover:bg-white/72 hover:text-ink dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-[var(--muted)] dark:hover:bg-white/[0.08] dark:hover:text-[var(--fg)]"
            }`}
          >
            All Projects
          </Link>
          <Link
            href="/home?tab=friends"
            className={`rounded-full border px-4 py-1.5 text-[11px] font-semibold tracking-[0.01em] transition-all duration-200 sm:px-4.5 ${
              pathname === "/home" && homeTab === "friends"
                ? "border-[#111214] bg-[#111214] text-[#f4efe6] shadow-[0_8px_18px_rgba(17,18,20,0.18)] dark:border-[#f3efe8] dark:bg-[#f3efe8] dark:text-[#111214] dark:shadow-none"
                : "border-black/[0.07] bg-white/44 text-ink/72 hover:bg-white/72 hover:text-ink dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-[var(--muted)] dark:hover:bg-white/[0.08] dark:hover:text-[var(--fg)]"
            }`}
          >
            Coding Friends
          </Link>
        </div>

        <Link href="/settings" className="flex h-9 w-9 items-center justify-center rounded-full border border-black/[0.06] bg-white/72 text-[10px] font-semibold text-ink shadow-[0_6px_16px_rgba(15,23,42,0.06)] transition hover:bg-white hover:text-black dark:border-white/[0.08] dark:bg-white/[0.08] dark:text-[var(--fg)] dark:shadow-none dark:hover:bg-white/[0.12]">
          {userInitials || "CB"}
        </Link>
      </div>
    </nav>
  );
}

export default function Navbar() {
  return (
    <Suspense fallback={null}>
      <NavbarContent />
    </Suspense>
  );
}
