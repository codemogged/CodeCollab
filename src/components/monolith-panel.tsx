"use client";

import { type ReactNode } from "react";
import { usePathname } from "next/navigation";

type LayoutMode = "standard" | "wide" | "full" | "onboarding";

function getLayoutMode(pathname: string): LayoutMode {
  if (pathname.startsWith("/onboarding")) return "onboarding";
  if (pathname === "/project/ide" || pathname === "/project/files" || pathname === "/project/code") return "full";
  if (
    pathname === "/project/chat" ||
    pathname === "/project/code" ||
    pathname === "/project/messages" ||
    pathname === "/project/preview"
  ) return "wide";
  return "standard";
}

export default function MonolithPanel({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const mode = getLayoutMode(pathname);

  if (mode === "onboarding") {
    return (
      <div className="flex flex-1 min-h-screen flex-col">
        <div className="monolith-panel flex-1 flex flex-col overflow-hidden">
          {children}
        </div>
      </div>
    );
  }

  // All other modes: panel fills all available space next to the rail
  return (
    <div className="flex flex-1 min-h-screen flex-col">
      <div className="monolith-panel flex-1 m-2 flex flex-col overflow-hidden">
        {children}
      </div>
    </div>
  );
}
