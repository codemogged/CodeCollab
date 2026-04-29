"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useTheme } from "@/components/theme-provider";

/* ─── Rail navigation items ─── */

interface RailNavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
  badge?: React.ReactNode;
  context: "always" | "project";
  matchExact?: boolean;
}

const ICON_SIZE = "w-[18px] h-[18px]";

const projectItems: RailNavItem[] = [
  {
    href: "/project",
    label: "Workspace",
    matchExact: true,
    context: "project",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={ICON_SIZE}>
        <path fillRule="evenodd" d="M6 4.75A.75.75 0 016.75 4h10.5a.75.75 0 010 1.5H6.75A.75.75 0 016 4.75zM6 10a.75.75 0 01.75-.75h10.5a.75.75 0 010 1.5H6.75A.75.75 0 016 10zm0 5.25a.75.75 0 01.75-.75h10.5a.75.75 0 010 1.5H6.75a.75.75 0 01-.75-.75zM1.99 4.75a1 1 0 011-1h.01a1 1 0 010 2h-.01a1 1 0 01-1-1zm0 5.25a1 1 0 011-1h.01a1 1 0 010 2h-.01a1 1 0 01-1-1zm1 4.25a1 1 0 100 2h.01a1 1 0 100-2h-.01z" clipRule="evenodd" />
      </svg>
    ),
  },
  {
    href: "/project/chat",
    label: "PM Chat",
    context: "project",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={ICON_SIZE}>
        <path fillRule="evenodd" d="M10 2c-2.236 0-4.43.18-6.57.524C1.993 2.755 1 4.014 1 5.426v5.148c0 1.413.993 2.67 2.43 2.902 1.168.188 2.352.327 3.55.414.28.02.521.18.642.413l1.713 3.293a.75.75 0 001.33 0l1.713-3.293a.783.783 0 01.642-.413 41.102 41.102 0 003.55-.414c1.437-.231 2.43-1.49 2.43-2.902V5.426c0-1.413-.993-2.67-2.43-2.902A41.289 41.289 0 0010 2zM6.75 6a.75.75 0 000 1.5h6.5a.75.75 0 000-1.5h-6.5zm0 2.5a.75.75 0 000 1.5h3.5a.75.75 0 000-1.5h-3.5z" clipRule="evenodd" />
      </svg>
    ),
  },
  {
    href: "/project/code",
    label: "Freestyle",
    context: "project",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={ICON_SIZE}>
        <path fillRule="evenodd" d="M3.25 3A2.25 2.25 0 001 5.25v9.5A2.25 2.25 0 003.25 17h13.5A2.25 2.25 0 0019 14.75v-9.5A2.25 2.25 0 0016.75 3H3.25zm.943 8.752a.75.75 0 01.055-1.06L6.128 9l-1.88-1.693a.75.75 0 111.004-1.114l2.5 2.25a.75.75 0 010 1.114l-2.5 2.25a.75.75 0 01-1.06-.055zM9.75 10.25a.75.75 0 000 1.5h2.5a.75.75 0 000-1.5h-2.5z" clipRule="evenodd" />
      </svg>
    ),
  },
  {
    href: "/project/files",
    label: "Files",
    context: "project",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={ICON_SIZE}>
        <path d="M3.75 3A1.75 1.75 0 002 4.75v3.26a3.235 3.235 0 011.75-.51h12.5c.644 0 1.245.188 1.75.51V6.75A1.75 1.75 0 0016.25 5h-4.836a.25.25 0 01-.177-.073L9.823 3.513A1.75 1.75 0 008.586 3H3.75zM3.75 9A1.75 1.75 0 002 10.75v4.5c0 .966.784 1.75 1.75 1.75h12.5A1.75 1.75 0 0018 15.25v-4.5A1.75 1.75 0 0016.25 9H3.75z" />
      </svg>
    ),
  },
  {
    href: "/project/ide",
    label: "IDE",
    context: "project",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={ICON_SIZE}>
        <path fillRule="evenodd" d="M6.28 5.22a.75.75 0 010 1.06L2.56 10l3.72 3.72a.75.75 0 01-1.06 1.06L.97 10.53a.75.75 0 010-1.06l4.25-4.25a.75.75 0 011.06 0zm7.44 0a.75.75 0 011.06 0l4.25 4.25a.75.75 0 010 1.06l-4.25 4.25a.75.75 0 01-1.06-1.06L17.44 10l-3.72-3.72a.75.75 0 010-1.06zM11.377 2.011a.75.75 0 01.612.867l-2.5 14.5a.75.75 0 01-1.478-.255l2.5-14.5a.75.75 0 01.866-.612z" clipRule="evenodd" />
      </svg>
    ),
  },
  {
    href: "/project/artifacts",
    label: "Downloads",
    context: "project",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={ICON_SIZE}>
        <path d="M10.75 2.75a.75.75 0 00-1.5 0v8.614L6.295 8.235a.75.75 0 10-1.09 1.03l4.25 4.5a.75.75 0 001.09 0l4.25-4.5a.75.75 0 00-1.09-1.03l-2.955 3.129V2.75z" />
        <path d="M3.5 12.75a.75.75 0 00-1.5 0v2.5A2.75 2.75 0 004.75 18h10.5A2.75 2.75 0 0018 15.25v-2.5a.75.75 0 00-1.5 0v2.5c0 .69-.56 1.25-1.25 1.25H4.75c-.69 0-1.25-.56-1.25-1.25v-2.5z" />
      </svg>
    ),
  },
  {
    href: "/project/preview",
    label: "Preview",
    context: "project",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={ICON_SIZE}>
        <path fillRule="evenodd" d="M2 10a8 8 0 1116 0 8 8 0 01-16 0zm6.39-2.908a.75.75 0 01.766.027l3.5 2.25a.75.75 0 010 1.262l-3.5 2.25A.75.75 0 018 12.25v-4.5a.75.75 0 01.39-.658z" clipRule="evenodd" />
      </svg>
    ),
  },
  {
    href: "/project/activity",
    label: "Activity",
    context: "project",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={ICON_SIZE}>
        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm.75-13a.75.75 0 00-1.5 0v5c0 .414.336.75.75.75h4a.75.75 0 000-1.5h-3.25V5z" clipRule="evenodd" />
      </svg>
    ),
  },
  {
    href: "/project/docs",
    label: "Docs",
    context: "project",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={ICON_SIZE}>
        <path d="M10.75 16.82A7.462 7.462 0 0115 15.5c.71 0 1.396.098 2.046.282A.75.75 0 0018 15.06v-11a.75.75 0 00-.546-.721A9.006 9.006 0 0015 3a8.999 8.999 0 00-4.25 1.065v12.755zM9.25 4.065A8.999 8.999 0 005 3c-.85 0-1.673.118-2.454.339A.75.75 0 002 4.06v11a.75.75 0 00.954.721A7.506 7.506 0 015 15.5c1.579 0 3.042.487 4.25 1.32V4.065z" />
      </svg>
    ),
  },
];

function RailContent() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { theme, toggle } = useTheme();
  const isInProject = pathname.startsWith("/project");
  const [expanded, setExpanded] = useState(false);
  const [pinned, setPinned] = useState(false);
  const hoverTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const leaveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [userInitials, setUserInitials] = useState("");
  const [projectName, setProjectName] = useState("");

  useEffect(() => {
    if (typeof window !== "undefined" && window.electronAPI?.settings) {
      window.electronAPI.settings.get().then((s) => {
        const settings = s as unknown as Record<string, unknown>;
        if (settings.displayName) {
          const initials = (settings.displayName as string)
            .split(" ").filter(Boolean).slice(0, 2)
            .map((w) => w[0]?.toUpperCase() ?? "").join("");
          setUserInitials(initials);
        }
      }).catch(() => {});
    }
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined" && window.electronAPI?.project && window.electronAPI?.settings) {
      Promise.all([
        window.electronAPI.settings.get(),
        window.electronAPI.project.list(),
      ]).then(([settings, projects]) => {
        const activeId = (settings as unknown as Record<string, unknown>).activeProjectId as string | null;
        if (activeId) {
          const active = projects.find((p) => p.id === activeId);
          if (active?.name) setProjectName(active.name);
        }
      }).catch(() => {});
    }
  }, [pathname]);

  const handleMouseEnter = useCallback(() => {
    if (pinned) return;
    if (leaveTimeout.current) clearTimeout(leaveTimeout.current);
    hoverTimeout.current = setTimeout(() => setExpanded(true), 200);
  }, [pinned]);

  const handleMouseLeave = useCallback(() => {
    if (pinned) return;
    if (hoverTimeout.current) clearTimeout(hoverTimeout.current);
    leaveTimeout.current = setTimeout(() => setExpanded(false), 300);
  }, [pinned]);

  const togglePin = useCallback(() => {
    setPinned((prev) => {
      if (prev) setExpanded(false);
      else setExpanded(true);
      return !prev;
    });
  }, []);

  const isActive = (item: RailNavItem) => {
    if (item.matchExact) return pathname === item.href;
    // Handle query-param-based items like IDE (/project/files?tab=ide)
    const [itemPath, itemQuery] = item.href.split("?");
    if (itemQuery) {
      const params = new URLSearchParams(itemQuery);
      if (!pathname.startsWith(itemPath)) return false;
      for (const [k, v] of params.entries()) {
        if (searchParams.get(k) !== v) return false;
      }
      return true;
    }
    // For /project/files, only match if there's no ?tab= param
    if (pathname.startsWith(itemPath) && pathname === itemPath.replace(/\/$/, "")) {
      const hasTabParam = searchParams.has("tab");
      if (hasTabParam) return false;
    }
    return pathname.startsWith(item.href);
  };

  // Hide rail on onboarding
  if (pathname.startsWith("/onboarding")) return null;

  return (
    <nav
      className={`left-rail flex-shrink-0 flex h-screen flex-col py-2 sticky top-0 ${expanded ? "expanded" : ""}`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* ── CodeCollab logo mark ── */}
      <div className="flex justify-center px-3 pb-1">
        <Link href="/home" className="group flex items-center gap-2.5 overflow-hidden">
          <img
            src="/codecollab-logo.png"
            alt="CodeCollab"
            className="h-8 w-8 flex-shrink-0 rounded-lg"
          />
          {expanded && (
            <span className="font-display text-[13px] font-semibold text-text-dim whitespace-nowrap">
              CodeCollab
            </span>
          )}
        </Link>
      </div>

      <div className="rail-separator" />

      {/* ── Always-visible items ── */}
      <div className="px-0.5">
        <Link href="/home?tab=projects" className={`rail-item ${pathname === "/home" || pathname === "/" ? "active" : ""}`}>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={`${ICON_SIZE} flex-shrink-0`}>
            <path fillRule="evenodd" d="M4.25 2A2.25 2.25 0 002 4.25v2.5A2.25 2.25 0 004.25 9h2.5A2.25 2.25 0 009 6.75v-2.5A2.25 2.25 0 006.75 2h-2.5zm0 9A2.25 2.25 0 002 13.25v2.5A2.25 2.25 0 004.25 18h2.5A2.25 2.25 0 009 15.75v-2.5A2.25 2.25 0 006.75 11h-2.5zm9-9A2.25 2.25 0 0011 4.25v2.5A2.25 2.25 0 0013.25 9h2.5A2.25 2.25 0 0018 6.75v-2.5A2.25 2.25 0 0015.75 2h-2.5zm0 9A2.25 2.25 0 0011 13.25v2.5A2.25 2.25 0 0013.25 18h2.5A2.25 2.25 0 0018 15.75v-2.5A2.25 2.25 0 0015.75 11h-2.5z" clipRule="evenodd" />
          </svg>
          {expanded && <span className="text-[13px]">Projects</span>}
        </Link>
      </div>

      {/* ── Project context items ── */}
      {isInProject && (
        <>
          <div className="rail-separator" />
          {expanded && projectName && (
            <div className="rail-section-label truncate">{projectName}</div>
          )}
          <div className="flex-1 overflow-y-auto overflow-x-hidden custom-scroll px-0.5">
            {projectItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`rail-item ${isActive(item) ? "active" : ""}`}
              >
                <span className="flex-shrink-0">{item.icon}</span>
                {expanded && (
                  <span className="flex items-center gap-1.5 text-[13px]">
                    {item.label}
                    {(item.label === "Preview" || item.label === "PM Chat" || item.label === "IDE") && (
                      <span className="rounded-sm border border-amber-500/40 bg-amber-500/10 px-1 py-px text-[8.5px] font-semibold uppercase leading-none tracking-wider text-amber-500">
                        Beta
                      </span>
                    )}
                  </span>
                )}
              </Link>
            ))}
          </div>
        </>
      )}

      {!isInProject && <div className="flex-1" />}

      {/* ── Bottom items ── */}
      <div className="rail-separator" />
      <div className="px-0.5">
        {/* Theme toggle */}
        <button onClick={toggle} className="rail-item w-full">
          {theme === "dark" ? (
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={`${ICON_SIZE} flex-shrink-0`}>
              <path d="M10 2a.75.75 0 01.75.75v1.5a.75.75 0 01-1.5 0v-1.5A.75.75 0 0110 2zm0 13a.75.75 0 01.75.75v1.5a.75.75 0 01-1.5 0v-1.5A.75.75 0 0110 15zm0-8a3 3 0 100 6 3 3 0 000-6zm5.657-1.596a.75.75 0 010 1.06l-1.06 1.061a.75.75 0 11-1.061-1.06l1.06-1.061a.75.75 0 011.061 0zm-9.193 9.193a.75.75 0 010 1.06l-1.06 1.06a.75.75 0 01-1.061-1.06l1.06-1.06a.75.75 0 011.061 0zM18 10a.75.75 0 01-.75.75h-1.5a.75.75 0 010-1.5h1.5A.75.75 0 0118 10zM5 10a.75.75 0 01-.75.75h-1.5a.75.75 0 010-1.5h1.5A.75.75 0 015 10zm9.596 5.657a.75.75 0 010-1.06l1.061-1.061a.75.75 0 111.06 1.06l-1.06 1.061a.75.75 0 01-1.061 0zm-9.193-9.193a.75.75 0 010-1.06L6.464 4.343a.75.75 0 011.06 1.06L6.464 6.464a.75.75 0 01-1.06 0z" />
            </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={`${ICON_SIZE} flex-shrink-0`}>
              <path fillRule="evenodd" d="M7.455 2.004a.75.75 0 01.26.77 7 7 0 009.958 7.967.75.75 0 011.067.853A8.5 8.5 0 116.647 1.921a.75.75 0 01.808.083z" clipRule="evenodd" />
            </svg>
          )}
          {expanded && <span className="text-[13px]">{theme === "dark" ? "Light" : "Dark"}</span>}
        </button>

        {/* Settings */}
        <Link href="/settings" className={`rail-item ${pathname.startsWith("/settings") ? "active" : ""}`}>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={`${ICON_SIZE} flex-shrink-0`}>
            <path fillRule="evenodd" d="M7.84 1.804A1 1 0 018.82 1h2.36a1 1 0 01.98.804l.331 1.652a6.993 6.993 0 011.929 1.115l1.598-.54a1 1 0 011.186.447l1.18 2.044a1 1 0 01-.205 1.251l-1.267 1.113a7.047 7.047 0 010 2.228l1.267 1.113a1 1 0 01.206 1.25l-1.18 2.045a1 1 0 01-1.187.447l-1.598-.54a6.993 6.993 0 01-1.929 1.115l-.33 1.652a1 1 0 01-.98.804H8.82a1 1 0 01-.98-.804l-.331-1.652a6.993 6.993 0 01-1.929-1.115l-1.598.54a1 1 0 01-1.186-.447l-1.18-2.044a1 1 0 01.205-1.251l1.267-1.114a7.05 7.05 0 010-2.227L1.821 7.773a1 1 0 01-.206-1.25l1.18-2.045a1 1 0 011.187-.447l1.598.54A6.993 6.993 0 017.51 3.456l.33-1.652zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
          </svg>
          {expanded && <span className="text-[13px]">Settings</span>}
        </Link>

        {/* Pin toggle */}
        <button onClick={togglePin} className="rail-item w-full">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={`${ICON_SIZE} flex-shrink-0 ${pinned ? "text-sun" : ""}`}>
            <path fillRule="evenodd" d="M10 1a.75.75 0 01.75.75v1.5a.75.75 0 01-1.5 0v-1.5A.75.75 0 0110 1zM5.05 3.05a.75.75 0 011.06 0l1.062 1.062a.75.75 0 11-1.061 1.06L5.05 4.112a.75.75 0 010-1.06zm9.9 0a.75.75 0 010 1.06l-1.062 1.062a.75.75 0 01-1.06-1.06l1.061-1.062a.75.75 0 011.06 0zM3 8a.75.75 0 01.75-.75h1.5a.75.75 0 010 1.5h-1.5A.75.75 0 013 8zm11 0a.75.75 0 01.75-.75h1.5a.75.75 0 010 1.5h-1.5A.75.75 0 0114 8zm-6.828 2.828a.75.75 0 011.061 0L10 12.596l1.768-1.768a.75.75 0 111.06 1.06l-2.297 2.298a.75.75 0 01-1.061 0l-2.298-2.298a.75.75 0 010-1.06z" clipRule="evenodd" />
          </svg>
          {expanded && <span className="text-[13px]">{pinned ? "Unpin" : "Pin"}</span>}
        </button>

        {/* User avatar */}
        <Link href="/settings" className="rail-item justify-center">
          <div className="app-avatar w-6 h-6 text-[9px] flex-shrink-0">
            {userInitials || "CB"}
          </div>
          {expanded && (
            <span className="text-[13px] text-text-mid truncate">Profile</span>
          )}
        </Link>
      </div>
    </nav>
  );
}

export default function LeftRail() {
  return (
    <Suspense fallback={null}>
      <RailContent />
    </Suspense>
  );
}
