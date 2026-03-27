"use client";

import { useEffect, useMemo, useState } from "react";
import ProjectSidebar from "@/components/project-sidebar";
import { useActiveDesktopProject } from "@/hooks/use-active-desktop-project";

type ActivityEvent = {
  id: string;
  type: "build" | "review" | "comment" | "status" | "deploy" | "join";
  title: string;
  description: string;
  actor: string;
  actorInitials: string;
  time: string;
  relatedFile?: string;
};

const eventIcons: Record<ActivityEvent["type"], React.ReactNode> = {
  build: (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 text-emerald-500">
      <path fillRule="evenodd" d="M14.5 10a4.5 4.5 0 004.284-5.882c-.105-.324-.51-.391-.752-.15L15.34 6.66a.454.454 0 01-.493.101 3.046 3.046 0 01-1.608-1.607.454.454 0 01.1-.493l2.693-2.692c.24-.241.174-.647-.15-.752a4.5 4.5 0 00-5.873 4.575c.055.873-.128 1.808-.8 2.368l-7.23 6.024a2.724 2.724 0 103.837 3.837l6.024-7.23c.56-.672 1.495-.855 2.368-.8.18.012.362.018.547.018zM3 16.75a.75.75 0 100-1.5.75.75 0 000 1.5z" clipRule="evenodd" />
    </svg>
  ),
  review: (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 text-amber-500">
      <path d="M10 12.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5z" />
      <path fillRule="evenodd" d="M.664 10.59a1.651 1.651 0 010-1.186A10.004 10.004 0 0110 3c4.257 0 7.893 2.66 9.336 6.41.147.381.146.804 0 1.186A10.004 10.004 0 0110 17c-4.257 0-7.893-2.66-9.336-6.41zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd" />
    </svg>
  ),
  comment: (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 text-sky-500">
      <path fillRule="evenodd" d="M10 2c-2.236 0-4.43.18-6.57.524C1.993 2.755 1 4.014 1 5.426v5.148c0 1.413.993 2.67 2.43 2.902 1.168.188 2.352.327 3.55.414.28.02.521.18.642.413l1.713 3.293a.75.75 0 001.33 0l1.713-3.293a.783.783 0 01.642-.413 41.102 41.102 0 003.55-.414c1.437-.231 2.43-1.49 2.43-2.902V5.426c0-1.413-.993-2.67-2.43-2.902A41.289 41.289 0 0010 2zM6.75 6a.75.75 0 000 1.5h6.5a.75.75 0 000-1.5h-6.5zm0 2.5a.75.75 0 000 1.5h3.5a.75.75 0 000-1.5h-3.5z" clipRule="evenodd" />
    </svg>
  ),
  status: (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 text-violet-500">
      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
    </svg>
  ),
  deploy: (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 text-rose-500">
      <path fillRule="evenodd" d="M10 1a.75.75 0 01.75.75v1.5a.75.75 0 01-1.5 0v-1.5A.75.75 0 0110 1zM5.05 3.05a.75.75 0 011.06 0l1.062 1.06A.75.75 0 116.11 5.173L5.05 4.11a.75.75 0 010-1.06zm9.9 0a.75.75 0 010 1.06l-1.06 1.062a.75.75 0 01-1.062-1.061l1.061-1.06a.75.75 0 011.06 0zM3 8a.75.75 0 01.75-.75h1.5a.75.75 0 010 1.5h-1.5A.75.75 0 013 8zm11 0a.75.75 0 01.75-.75h1.5a.75.75 0 010 1.5h-1.5A.75.75 0 0114 8zm-6.828 2.828a.75.75 0 010 1.061L6.11 12.95a.75.75 0 01-1.06-1.06l1.06-1.06a.75.75 0 011.06 0zm3.594-3.317a.75.75 0 00-1.37.364l-.492 6.861a.75.75 0 001.204.65l1.043-.723.992 1.716a.75.75 0 001.071.25l.944-.545a.75.75 0 00.25-1.072l-.992-1.716 1.262-.163a.75.75 0 00.166-1.452l-4.078-2.17z" clipRule="evenodd" />
    </svg>
  ),
  join: (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 text-teal-500">
      <path d="M10 8a3 3 0 100-6 3 3 0 000 6zM3.465 14.493a1.23 1.23 0 00.41 1.412A9.957 9.957 0 0010 18c2.31 0 4.438-.784 6.131-2.1.43-.333.604-.903.408-1.41a7.002 7.002 0 00-13.074.003z" />
    </svg>
  ),
};

const categoryLabels: Record<ActivityEvent["type"], string> = {
  build: "Builds",
  review: "Reviews",
  comment: "Comments",
  status: "Status changes",
  deploy: "Deploys",
  join: "Team",
};

const categoryColors: Record<ActivityEvent["type"], string> = {
  build: "bg-emerald-100 text-emerald-700",
  review: "bg-amber-100 text-amber-700",
  comment: "bg-sky-100 text-sky-700",
  status: "bg-violet-100 text-violet-700",
  deploy: "bg-rose-100 text-rose-700",
  join: "bg-teal-100 text-teal-700",
};

function EventRow({ event }: { event: ActivityEvent }) {
  return (
    <div className="flex gap-3 py-2.5">
      <div className="app-surface-strong flex h-7 w-7 shrink-0 items-center justify-center rounded-full">
        {eventIcons[event.type]}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-medium theme-fg">{event.title}</p>
        <p className="mt-0.5 text-[12px] theme-soft">{event.description}</p>
        {event.relatedFile && (
          <p className="mt-1 flex items-center gap-1.5 text-[11px] theme-muted">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3">
              <path d="M3 3.5A1.5 1.5 0 014.5 2h6.879a1.5 1.5 0 011.06.44l1.122 1.12A1.5 1.5 0 0114 4.622V12.5a1.5 1.5 0 01-1.5 1.5h-9A1.5 1.5 0 012 12.5v-9z" />
            </svg>
            {event.relatedFile}
          </p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <div className="app-avatar flex h-5 w-5 items-center justify-center rounded-full text-[8px] font-bold">
          {event.actorInitials}
        </div>
        <span className="text-[11px] theme-muted">{event.time}</span>
      </div>
    </div>
  );
}

type ViewMode = "categories" | "all";

export default function ActivityPage() {
  const { activeProject } = useActiveDesktopProject();
  const [viewMode, setViewMode] = useState<ViewMode>("categories");
  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set());
  const [personFilter, setPersonFilter] = useState<string | null>(null);
  const [desktopEvents, setDesktopEvents] = useState<ActivityEvent[]>([]);

  useEffect(() => {
    if (!window.electronAPI?.activity) {
      return;
    }

    let cancelled = false;

    const hydrateEvents = async () => {
      const events = await window.electronAPI!.activity.list();
      if (!cancelled) {
        setDesktopEvents(events as ActivityEvent[]);
      }
    };

    void hydrateEvents();

    const stopListening = window.electronAPI.activity.onCreated((event) => {
      setDesktopEvents((current) => [event as ActivityEvent, ...current]);
    });

    return () => {
      cancelled = true;
      stopListening();
    };
  }, []);

  const projectActivity = (activeProject?.dashboard.activity ?? []) as ActivityEvent[];
  const sourceFeed = desktopEvents.length > 0 ? desktopEvents : projectActivity;

  // Unique actors
  const actors = useMemo(() => Array.from(new Map(sourceFeed.map((e) => [e.actor, e.actorInitials]))), [sourceFeed]);

  // Filter by person first
  const filtered = personFilter ? sourceFeed.filter((e) => e.actor === personFilter) : sourceFeed;

  // Group by category
  const grouped = filtered.reduce<Record<string, ActivityEvent[]>>((acc, e) => {
    if (!acc[e.type]) acc[e.type] = [];
    acc[e.type].push(e);
    return acc;
  }, {});

  const toggleCat = (cat: string) => {
    setExpandedCats((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  return (
    <div className="flex min-h-screen bg-[linear-gradient(180deg,var(--gradient-page-start)_0%,var(--gradient-page-end)_100%)] text-ink dark:text-[var(--fg)]">
      <ProjectSidebar />

      <div className="min-w-0 flex-1 px-5 pb-32 pt-[5.6rem] sm:px-6 xl:px-8">
        {/* Header */}
        <div className="mb-6">
          <h1 className="display-font text-[22px] font-bold tracking-tight theme-fg">Activity</h1>
          <p className="mt-1 text-[13px] theme-muted">
            {activeProject
              ? `Everything happening across ${activeProject.name}.`
              : "Open a real project to see its activity feed."}
          </p>
        </div>

        {/* Controls row */}
        <div className="mb-4 flex flex-wrap items-center gap-3">
          {/* View toggle */}
          <div className="app-control-rail flex items-center gap-1 rounded-xl p-1">
            <button
              onClick={() => setViewMode("categories")}
              className={`rounded-lg px-3.5 py-1.5 text-[12px] font-medium transition ${
                viewMode === "categories" ? "app-control-active" : "app-control-idle"
              }`}
            >
              Categories
            </button>
            <button
              onClick={() => setViewMode("all")}
              className={`rounded-lg px-3.5 py-1.5 text-[12px] font-medium transition ${
                viewMode === "all" ? "app-control-active" : "app-control-idle"
              }`}
            >
              All
            </button>
          </div>

          {/* Separator */}
          <div className="h-5 w-px bg-black/[0.08]" />

          {/* Person filter */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setPersonFilter(null)}
              className={`rounded-full px-3 py-1.5 text-[12px] font-medium transition ${
                !personFilter ? "bg-ink text-cream dark:bg-white dark:text-[#17181b]" : "app-surface-strong theme-muted hover:text-[var(--fg)]"
              }`}
            >
              Everyone
            </button>
            {actors.map(([name, initials]) => (
              <button
                key={name}
                onClick={() => setPersonFilter(personFilter === name ? null : name)}
                className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-medium transition ${
                  personFilter === name
                    ? "bg-ink text-cream dark:bg-white dark:text-[#17181b]"
                    : "app-surface-strong theme-muted hover:text-[var(--fg)]"
                }`}
              >
                <span className={`flex h-4 w-4 items-center justify-center rounded-full text-[8px] font-bold ${
                  personFilter === name ? "bg-cream/20 text-cream dark:bg-black/15 dark:text-[#17181b]" : "app-avatar"
                }`}>
                  {initials}
                </span>
                {name}
              </button>
            ))}
          </div>
        </div>

        {/* Category view */}
        {viewMode === "categories" && (
          <div className="space-y-2">
            {(Object.keys(categoryLabels) as ActivityEvent["type"][])
              .filter((cat) => grouped[cat]?.length)
              .map((cat) => {
                const events = grouped[cat]!;
                const isOpen = expandedCats.has(cat);
                return (
                  <div key={cat} className="app-surface overflow-hidden rounded-xl">
                    <button
                      onClick={() => toggleCat(cat)}
                      className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-black/[0.02]"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                        className={`h-3.5 w-3.5 theme-muted transition-transform ${isOpen ? "rotate-90" : ""}`}
                      >
                        <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
                      </svg>
                      <span className="flex items-center gap-2">
                        {eventIcons[cat]}
                        <span className="text-[13px] font-semibold theme-fg">{categoryLabels[cat]}</span>
                      </span>
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${categoryColors[cat]}`}>
                        {events.length}
                      </span>
                      <span className="ml-auto text-[12px] theme-muted">{events[0].time}</span>
                    </button>
                    {isOpen && (
                      <div className="border-t border-black/[0.04] px-4 py-1 dark:border-white/[0.08]">
                        {events.map((e) => (
                          <EventRow key={e.id} event={e} />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            {Object.keys(grouped).length === 0 && (
              <div className="app-surface rounded-xl px-4 py-8 text-center text-[13px] theme-muted">
                No activity found{personFilter ? ` for ${personFilter}` : ""}.
              </div>
            )}
          </div>
        )}

        {/* All view — full chronological log */}
        {viewMode === "all" && (
          <div className="app-surface overflow-hidden rounded-xl">
            <div className="divide-y divide-black/[0.04] px-4 dark:divide-white/[0.08]">
              {filtered.length > 0 ? (
                filtered.map((event) => <EventRow key={event.id} event={event} />)
              ) : (
                <div className="py-8 text-center text-[13px] theme-muted">
                  No activity found{personFilter ? ` for ${personFilter}` : ""}.
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
