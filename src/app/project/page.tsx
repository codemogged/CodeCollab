"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import ProjectSidebar from "@/components/project-sidebar";
import { useActiveDesktopProject } from "@/hooks/use-active-desktop-project";

type BuildTaskStatus = "planned" | "building" | "review" | "done";

type ProjectTask = {
  id: string;
  title: string;
  status: BuildTaskStatus;
  owner: string;
  reviewer?: string;
  note: string;
  dueDate: string;
  startingPrompt: string;
};

type ProjectSubproject = {
  id: string;
  title: string;
  goal: string;
  status: BuildTaskStatus;
  updatedAgo: string;
  agentName: string;
  agentBrief: string;
  preview: {
    eyebrow: string;
    title: string;
    subtitle: string;
    accent: string;
    cards: string[];
  };
  tasks: ProjectTask[];
};

type ProjectTaskThread = {
  id: string;
  taskId: string;
  title: string;
  agentName: string;
  updatedAgo: string;
  summary: string;
  messages: Array<{
    id: string;
    from: string;
    text: string;
    isAI?: boolean;
  }>;
};

type ProjectPlan = {
  buildOrder: Array<{
    subprojectId: string;
    taskIds: string[];
  }>;
  subprojects: ProjectSubproject[];
};

/* ─── visual constants ─── */

const statusColor: Record<BuildTaskStatus, string> = {
  planned: "#d4cfc7",
  building: "#a78bfa",
  review: "#fbbf24",
  done: "#34d399",
};

const statusLabel: Record<BuildTaskStatus, string> = {
  planned: "Planned",
  building: "Building",
  review: "Review",
  done: "Done",
};

const cardAccents = [
  "from-[#667eea] to-[#764ba2]",
  "from-[#f093fb] to-[#f5576c]",
  "from-[#4facfe] to-[#00f2fe]",
  "from-[#43e97b] to-[#38f9d7]",
  "from-[#fa709a] to-[#fee140]",
];

const allStatuses: BuildTaskStatus[] = ["planned", "building", "review", "done"];

/* ─── helpers ─── */

function getPlanCounts(tasks: { status: BuildTaskStatus }[]) {
  const done = tasks.filter((t) => t.status === "done").length;
  return { done, total: tasks.length };
}

function formatDueDate(value: string) {
  if (!value) return "No date";

  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(date);
}

function getDueDateMeta(value: string) {
  if (!value) {
    return { label: "No date", tone: "muted" as const };
  }

  const dueDate = new Date(`${value}T00:00:00`);
  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const diffDays = Math.round((dueDate.getTime() - startOfToday.getTime()) / 86400000);

  if (diffDays < 0) {
    return { label: `${formatDueDate(value)} · overdue`, tone: "late" as const };
  }

  if (diffDays <= 2) {
    return { label: `${formatDueDate(value)} · soon`, tone: "soon" as const };
  }

  return { label: formatDueDate(value), tone: "muted" as const };
}

function moveItem<T>(items: T[], fromIndex: number, toIndex: number) {
  const next = [...items];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
}

/* ─── progress ring ─── */

function ProgressRing({ progress, size = 130 }: { progress: number; size?: number }) {
  const sw = 10;
  const r = (size - sw) / 2;
  const c = 2 * Math.PI * r;
  const offset = c - (progress / 100) * c;

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(140,128,112,0.18)" strokeWidth={sw} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="url(#ring-gradient)"
          strokeWidth={sw}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          className="transition-all duration-700 ease-out"
        />
        <defs>
          <linearGradient id="ring-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#a78bfa" />
            <stop offset="100%" stopColor="#34d399" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center rounded-full bg-[rgba(255,251,244,0.65)] dark:bg-[rgba(15,17,19,0.78)]">
        <span className="text-[2rem] font-bold tracking-tight theme-fg">{progress}</span>
        <span className="text-[10px] font-medium uppercase tracking-wider theme-muted">percent</span>
      </div>
    </div>
  );
}

/* ─── action items ─── */

type ActionItem = {
  id: string;
  title: string;
  description: string;
  category: "setup" | "config" | "deploy" | "manual";
  completed: boolean;
  helpPrompt: string;
  taskName?: string;
};

const categoryIcon: Record<ActionItem["category"], { bg: string; icon: string }> = {
  setup: { bg: "bg-blue-500/15 text-blue-400", icon: "⚙" },
  config: { bg: "bg-amber-500/15 text-amber-400", icon: "🔑" },
  deploy: { bg: "bg-emerald-500/15 text-emerald-400", icon: "🚀" },
  manual: { bg: "bg-purple-500/15 text-purple-400", icon: "📋" },
};

/* ─── markdown renderer for help responses ─── */

function RenderMarkdown({ text }: { text: string }) {
  const blocks = text.split(/(```[\s\S]*?```)/g);
  return (
    <div className="space-y-3 text-[13px] leading-[1.75] theme-fg">
      {blocks.map((block, bi) => {
        if (block.startsWith("```") && block.endsWith("```")) {
          const inner = block.slice(3, -3);
          const firstNl = inner.indexOf("\n");
          const lang = firstNl > 0 ? inner.slice(0, firstNl).trim() : "";
          const code = firstNl > 0 ? inner.slice(firstNl + 1) : inner;
          return (
            <div key={bi} className="overflow-hidden rounded-xl bg-[#0d1117] ring-1 ring-white/[0.06]">
              {lang ? (
                <div className="flex items-center justify-between border-b border-white/[0.06] bg-[#161b22] px-4 py-2">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/40">{lang}</span>
                  <button type="button" onClick={() => { try { navigator.clipboard.writeText(code); } catch { /* */ } }} className="text-[10px] font-medium text-white/30 transition hover:text-white/60">Copy</button>
                </div>
              ) : null}
              <pre className="overflow-x-auto px-4 py-3 font-mono text-[12px] leading-[1.7] text-green-300/90 selection:bg-green-600/30"><code>{code}</code></pre>
            </div>
          );
        }

        // Split into paragraphs by double newlines
        const paragraphs = block.split(/\n{2,}/);
        return paragraphs.map((para, pi) => {
          const trimmed = para.trim();
          if (!trimmed) return null;

          // Headings
          const h3Match = trimmed.match(/^###\s+(.+)/);
          if (h3Match) return <h4 key={`${bi}-${pi}`} className="text-[14px] font-bold theme-fg mt-1">{h3Match[1]}</h4>;
          const h2Match = trimmed.match(/^##\s+(.+)/);
          if (h2Match) return <h3 key={`${bi}-${pi}`} className="text-[15px] font-bold theme-fg mt-1">{h2Match[1]}</h3>;
          const h1Match = trimmed.match(/^#\s+(.+)/);
          if (h1Match) return <h2 key={`${bi}-${pi}`} className="text-[16px] font-bold theme-fg mt-1">{h1Match[1]}</h2>;

          // Ordered / unordered list
          const lines = trimmed.split("\n");
          const isList = lines.every((l) => /^\s*[-*•]\s|^\s*\d+\.\s/.test(l) || !l.trim());
          if (isList) {
            return (
              <ul key={`${bi}-${pi}`} className="space-y-1.5 pl-1">
                {lines.filter((l) => l.trim()).map((l, li) => {
                  const cleaned = l.replace(/^\s*[-*•]\s*/, "").replace(/^\s*\d+\.\s*/, "");
                  return (
                    <li key={li} className="flex items-start gap-2.5">
                      <span className="mt-[9px] h-1.5 w-1.5 flex-shrink-0 rounded-full bg-violet-400/60" />
                      <span className="min-w-0"><InlineMarkdown text={cleaned} /></span>
                    </li>
                  );
                })}
              </ul>
            );
          }

          // Default paragraph
          return <p key={`${bi}-${pi}`}><InlineMarkdown text={trimmed} /></p>;
        });
      })}
    </div>
  );
}

function InlineMarkdown({ text }: { text: string }) {
  // Handle bold, inline code, and links
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g);
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith("**") && part.endsWith("**")) {
          return <strong key={i} className="font-semibold theme-fg">{part.slice(2, -2)}</strong>;
        }
        if (part.startsWith("`") && part.endsWith("`")) {
          return <code key={i} className="rounded-md bg-black/[0.06] px-1.5 py-0.5 font-mono text-[12px] dark:bg-white/[0.08]">{part.slice(1, -1)}</code>;
        }
        const linkMatch = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
        if (linkMatch) {
          return <span key={i} className="text-violet-400 underline decoration-violet-400/30">{linkMatch[1]}</span>;
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}

function ActionItemsSection({ projectId }: { projectId: string }) {
  const [items, setItems] = useState<ActionItem[]>([]);
  const [expandedItem, setExpandedItem] = useState<string | null>(null);
  const [helpLoading, setHelpLoading] = useState<string | null>(null);
  const [helpResponses, setHelpResponses] = useState<Record<string, string>>({});
  const [helpStreaming, setHelpStreaming] = useState<string | null>(null);
  const [chatInputs, setChatInputs] = useState<Record<string, string>>({});
  const [chatHistories, setChatHistories] = useState<Record<string, Array<{ role: "user" | "agent"; text: string }>>>({});
  const [removedIds, setRemovedIds] = useState<Set<string>>(new Set());
  const [confirmingDoneId, setConfirmingDoneId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newItemTitle, setNewItemTitle] = useState("");
  const [newItemDesc, setNewItemDesc] = useState("");
  const [newItemCategory, setNewItemCategory] = useState<ActionItem["category"]>("manual");
  const [newItemTask, setNewItemTask] = useState("");
  const helpStreamRef = useRef("");
  const scanStreamRef = useRef("");
  const [isCheckingItems, setIsCheckingItems] = useState(false);

  const handleCheckForItems = async () => {
    if (!window.electronAPI?.project?.sendSoloMessage) return;
    setIsCheckingItems(true);
    scanStreamRef.current = "";

    // Listen for streamed scan output
    const stopScan = window.electronAPI.project.onAgentOutput((event) => {
      if (event.scope !== "solo-chat") return;
      scanStreamRef.current += event.chunk ?? "";
    });

    try {
      await window.electronAPI.project.sendSoloMessage({
        projectId,
        prompt: `Scan this project and list action items the developer must complete manually — things an AI cannot do (e.g. creating accounts, adding API keys, configuring services, manual approvals). Return ONLY a JSON array of objects with these fields: title (string), description (string), category ("setup" | "config" | "deploy" | "manual"), helpPrompt (string — a question the developer can ask the AI for guidance), taskName (string — short group label). Return at most 8 items. Output ONLY the JSON array, no markdown fences.`,
      });
    } catch { /* */ }

    stopScan();

    // Parse the AI response into items
    try {
      const raw = scanStreamRef.current.trim();
      // Extract JSON array even if wrapped in markdown fences
      const jsonMatch = raw.match(/\[\s*\{[\s\S]*\}\s*\]/)?.[0];
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch) as Array<{
          title: string;
          description: string;
          category: ActionItem["category"];
          helpPrompt: string;
          taskName?: string;
        }>;
        const existingTitles = new Set(items.map((i) => i.title.toLowerCase()));
        const newItems: ActionItem[] = parsed
          .filter((p) => p.title && !existingTitles.has(p.title.toLowerCase()))
          .map((p, i) => ({
            id: `ai-scan-${Date.now()}-${i}`,
            title: p.title,
            description: p.description || "",
            category: (["setup", "config", "deploy", "manual"] as const).includes(p.category) ? p.category : "manual",
            completed: false,
            helpPrompt: p.helpPrompt || `Help me with: ${p.title}`,
            taskName: p.taskName,
          }));
        if (newItems.length > 0) {
          setItems((cur) => [...cur, ...newItems]);
        }
      }
    } catch { /* parsing failed — ignore */ }

    setIsCheckingItems(false);
  };

  const visibleItems = items.filter((i) => !removedIds.has(i.id));
  const completedCount = visibleItems.filter((i) => i.completed).length;
  const totalCount = visibleItems.length;
  const allDone = totalCount > 0 && completedCount === totalCount;

  const toggleComplete = (id: string) => {
    setItems((cur) => cur.map((i) => (i.id === id ? { ...i, completed: !i.completed } : i)));
  };

  const markDoneAndRemove = (id: string) => {
    setItems((cur) => cur.map((i) => (i.id === id ? { ...i, completed: true } : i)));
    setRemovedIds((cur) => new Set(cur).add(id));
    if (expandedItem === id) setExpandedItem(null);
    setConfirmingDoneId(null);
  };

  const handleAddItem = () => {
    if (!newItemTitle.trim()) return;
    const id = `ai-custom-${Date.now()}`;
    const item: ActionItem = {
      id,
      title: newItemTitle.trim(),
      description: newItemDesc.trim() || "Custom action item.",
      category: newItemCategory,
      completed: false,
      helpPrompt: `Help me with: ${newItemTitle.trim()}. ${newItemDesc.trim()}`,
      taskName: newItemTask.trim() || undefined,
    };
    setItems((cur) => [...cur, item]);
    setNewItemTitle("");
    setNewItemDesc("");
    setNewItemCategory("manual");
    setNewItemTask("");
    setShowAddForm(false);
  };

  // Listen for streaming output when help is loading
  useEffect(() => {
    if (!helpStreaming || !window.electronAPI?.project) return;
    const itemId = helpStreaming;
    helpStreamRef.current = "";
    const stop = window.electronAPI.project.onAgentOutput((event) => {
      if (event.scope !== "solo-chat") return;
      const chunk = event.chunk ?? "";
      if (chunk) {
        helpStreamRef.current += chunk;
        setHelpResponses((prev) => ({ ...prev, [itemId]: helpStreamRef.current }));
      }
    });
    return () => stop();
  }, [helpStreaming]);

  const handleAskForHelp = async (item: ActionItem) => {
    setHelpLoading(item.id);
    setHelpStreaming(item.id);
    setExpandedItem(item.id);
    setHelpResponses((prev) => ({ ...prev, [item.id]: "" }));
    try {
      if (window.electronAPI?.project?.sendSoloMessage) {
        await window.electronAPI.project.sendSoloMessage({
          projectId,
          prompt: item.helpPrompt,
        });
      }
    } catch { /* */ }
    setHelpLoading(null);
    setHelpStreaming(null);
  };

  const handleSendChat = async (item: ActionItem) => {
    const text = (chatInputs[item.id] ?? "").trim();
    if (!text) return;
    setChatInputs((prev) => ({ ...prev, [item.id]: "" }));
    setChatHistories((prev) => ({
      ...prev,
      [item.id]: [...(prev[item.id] ?? []), { role: "user", text }],
    }));
    setHelpLoading(item.id);
    setHelpStreaming(item.id);
    setHelpResponses((prev) => ({ ...prev, [item.id]: "" }));
    try {
      if (window.electronAPI?.project?.sendSoloMessage) {
        await window.electronAPI.project.sendSoloMessage({
          projectId,
          prompt: text,
        });
      }
    } catch { /* */ }
    // Save streaming response to chat history
    const finalResponse = helpStreamRef.current;
    if (finalResponse) {
      setChatHistories((prev) => ({
        ...prev,
        [item.id]: [...(prev[item.id] ?? []), { role: "agent", text: finalResponse }],
      }));
    }
    setHelpLoading(null);
    setHelpStreaming(null);
  };

  return (
    <section>
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <h2 className="text-[16px] font-bold tracking-tight theme-fg">Action Items</h2>
            <span className="rounded-full bg-black/[0.04] px-2.5 py-0.5 text-[10px] font-bold theme-muted dark:bg-white/[0.06]">
              {completedCount}/{totalCount}
            </span>
          </div>
          <p className="mt-1 text-[12px] theme-muted">Things the AI cannot do for you — API keys, manual config, and one-time setup steps.</p>
        </div>
        <div className="flex items-center gap-2">
          {allDone ? (
            <span className="rounded-full bg-emerald-500/15 px-3 py-1.5 text-[10px] font-bold text-emerald-400">
              All done ✓
            </span>
          ) : null}
          <button
            type="button"
            onClick={handleCheckForItems}
            disabled={isCheckingItems}
            className="inline-flex items-center gap-1.5 rounded-xl border border-black/[0.06] bg-white/80 px-3 py-2 text-[11px] font-semibold text-ink-muted transition hover:border-amber-500/30 hover:bg-amber-500/5 hover:text-amber-600 disabled:opacity-50 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-[var(--muted)] dark:hover:border-amber-500/30 dark:hover:text-amber-400"
          >
            {isCheckingItems ? (
              <svg className="h-3.5 w-3.5 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
                <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z" clipRule="evenodd" />
              </svg>
            )}
            {isCheckingItems ? "Scanning…" : "Check for items"}
          </button>
          <button
            type="button"
            onClick={() => setShowAddForm(!showAddForm)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-black/[0.06] bg-white/80 px-3 py-2 text-[11px] font-semibold text-ink-muted transition hover:border-violet-500/30 hover:bg-violet-500/5 hover:text-violet-500 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-[var(--muted)] dark:hover:border-violet-500/30 dark:hover:text-violet-400"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
              <path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" />
            </svg>
            Add Item
          </button>
        </div>
      </div>

      {/* Add item form */}
      {showAddForm ? (
        <div className="mt-4 overflow-hidden rounded-2xl app-surface shadow-[var(--shadow-card)] ring-1 ring-violet-500/20">
          <div className="border-b border-black/[0.04] bg-violet-500/[0.04] px-4 py-3 dark:border-white/[0.04]">
            <p className="text-[12px] font-semibold theme-fg">New Action Item</p>
            <p className="text-[10px] theme-muted mt-0.5">Add a step you need to complete manually — something the AI can&apos;t do.</p>
          </div>
          <div className="space-y-3 px-4 py-4">
            <div>
              <label className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.14em] theme-muted">Title</label>
              <input
                value={newItemTitle}
                onChange={(e) => setNewItemTitle(e.target.value)}
                placeholder="e.g. Add Stripe API key"
                className="w-full rounded-xl border border-black/[0.06] bg-white/80 px-3 py-2.5 text-[13px] theme-fg outline-none placeholder:theme-muted focus:border-violet-500/40 focus:ring-2 focus:ring-violet-500/10 dark:border-white/[0.08] dark:bg-white/[0.04]"
              />
            </div>
            <div>
              <label className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.14em] theme-muted">Description (optional)</label>
              <input
                value={newItemDesc}
                onChange={(e) => setNewItemDesc(e.target.value)}
                placeholder="Brief description of what needs to be done"
                className="w-full rounded-xl border border-black/[0.06] bg-white/80 px-3 py-2.5 text-[13px] theme-fg outline-none placeholder:theme-muted focus:border-violet-500/40 focus:ring-2 focus:ring-violet-500/10 dark:border-white/[0.08] dark:bg-white/[0.04]"
              />
            </div>
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.14em] theme-muted">Related Task (optional)</label>
                <input
                  value={newItemTask}
                  onChange={(e) => setNewItemTask(e.target.value)}
                  placeholder="e.g. Payment Integration"
                  className="w-full rounded-xl border border-black/[0.06] bg-white/80 px-3 py-2.5 text-[13px] theme-fg outline-none placeholder:theme-muted focus:border-violet-500/40 focus:ring-2 focus:ring-violet-500/10 dark:border-white/[0.08] dark:bg-white/[0.04]"
                />
              </div>
              <div className="w-[140px]">
                <label className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.14em] theme-muted">Category</label>
                <select
                  value={newItemCategory}
                  onChange={(e) => setNewItemCategory(e.target.value as ActionItem["category"])}
                  className="w-full rounded-xl border border-black/[0.06] bg-white/80 px-3 py-2.5 text-[13px] theme-fg outline-none focus:border-violet-500/40 focus:ring-2 focus:ring-violet-500/10 dark:border-white/[0.08] dark:bg-white/[0.04]"
                >
                  <option value="config">Config</option>
                  <option value="setup">Setup</option>
                  <option value="deploy">Deploy</option>
                  <option value="manual">Manual</option>
                </select>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 pt-1">
              <button type="button" onClick={() => setShowAddForm(false)} className="rounded-xl px-3 py-2 text-[11px] font-semibold theme-muted transition hover:bg-black/[0.04] dark:hover:bg-white/[0.06]">Cancel</button>
              <button type="button" onClick={handleAddItem} disabled={!newItemTitle.trim()} className="rounded-xl bg-[#111214] px-4 py-2 text-[11px] font-semibold text-[#f4efe6] transition hover:bg-[#0b1220] disabled:opacity-40 dark:bg-white dark:text-[#111214] dark:hover:bg-white/90">Add Item</button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Progress bar */}
      {totalCount > 0 ? (
        <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-black/[0.06] dark:bg-white/[0.06]">
          <div
            className="h-full rounded-full bg-gradient-to-r from-[#a78bfa] to-[#34d399] transition-all duration-500"
            style={{ width: `${Math.round((completedCount / totalCount) * 100)}%` }}
          />
        </div>
      ) : null}

      {/* Empty state */}
      {totalCount === 0 && !showAddForm ? (
        <div className="mt-6 flex flex-col items-center justify-center rounded-2xl border border-dashed border-black/[0.08] bg-black/[0.015] px-6 py-10 text-center dark:border-white/[0.08] dark:bg-white/[0.015]">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-500/10 text-[20px]">🔍</div>
          <p className="mt-3 text-[14px] font-semibold theme-fg">No action items yet</p>
          <p className="mt-1 max-w-sm text-[12px] leading-relaxed theme-muted">
            Click <strong>Check for items</strong> to scan your project for things that need manual setup — API keys, environment configuration, and more.
          </p>
        </div>
      ) : null}

      {/* Items */}
      <div className="mt-4 space-y-2">
        {visibleItems.map((item) => {
          const cat = categoryIcon[item.category];
          const isExpanded = expandedItem === item.id;
          const hasResponse = helpResponses[item.id] !== undefined && helpResponses[item.id] !== "";
          const isStreaming = helpLoading === item.id;
          const chatHistory = chatHistories[item.id] ?? [];
          return (
            <div
              key={item.id}
              className={`overflow-hidden rounded-2xl transition-all ${
                item.completed
                  ? "opacity-60"
                  : "app-surface shadow-[var(--shadow-card)] ring-1 ring-black/[0.06] dark:ring-white/[0.08]"
              }`}
            >
              <div className="flex items-center gap-3 px-4 py-3.5">
                {/* Checkbox */}
                <button
                  type="button"
                  onClick={() => toggleComplete(item.id)}
                  className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border-2 transition ${
                    item.completed
                      ? "border-emerald-500 bg-emerald-500 text-white"
                      : "border-black/[0.15] hover:border-black/[0.25] dark:border-white/[0.15] dark:hover:border-white/[0.25]"
                  }`}
                >
                  {item.completed ? (
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3 w-3">
                      <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                    </svg>
                  ) : null}
                </button>

                {/* Category icon */}
                <span className={`flex h-7 w-7 items-center justify-center rounded-lg text-[12px] ${cat.bg}`}>
                  {cat.icon}
                </span>

                {/* Text */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className={`text-[13px] font-semibold ${item.completed ? "line-through theme-muted" : "theme-fg"}`}>
                      {item.title}
                    </p>
                    {item.taskName ? (
                      <span className="rounded-md bg-violet-500/10 px-1.5 py-0.5 text-[9px] font-semibold text-violet-400">
                        {item.taskName}
                      </span>
                    ) : null}
                  </div>
                </div>

                {/* Actions */}
                {!item.completed ? (
                  <div className="flex items-center gap-1.5">
                    {!hasResponse && !isStreaming ? (
                      <button
                        type="button"
                        onClick={() => void handleAskForHelp(item)}
                        disabled={isStreaming}
                        className="rounded-lg bg-violet-500/10 px-2.5 py-1.5 text-[10px] font-semibold text-violet-400 transition hover:bg-violet-500/20 disabled:opacity-50"
                      >
                        How do I do this?
                      </button>
                    ) : null}
                    {confirmingDoneId === item.id ? (
                      <div className="flex items-center gap-1.5 animate-in fade-in">
                        <button
                          type="button"
                          onClick={() => markDoneAndRemove(item.id)}
                          className="rounded-lg bg-emerald-500/20 px-3 py-1.5 text-[10px] font-semibold text-emerald-400 ring-1 ring-emerald-500/30 transition hover:bg-emerald-500/30"
                        >
                          Confirm done
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmingDoneId(null)}
                          className="rounded-lg bg-black/[0.04] px-2.5 py-1.5 text-[10px] font-semibold theme-muted transition hover:bg-black/[0.08] dark:bg-white/[0.06] dark:hover:bg-white/[0.1]"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmingDoneId(item.id)}
                        title="Mark done & remove"
                        className="rounded-lg border border-black/[0.06] bg-black/[0.02] px-2.5 py-1.5 text-[10px] font-semibold theme-muted transition hover:border-emerald-500/30 hover:bg-emerald-500/5 hover:text-emerald-400 dark:border-white/[0.06] dark:bg-white/[0.02] dark:hover:border-emerald-500/30"
                      >
                        Done
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setExpandedItem(isExpanded ? null : item.id)}
                      className="flex h-7 w-7 items-center justify-center rounded-lg theme-muted transition hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={`h-3.5 w-3.5 transition ${isExpanded ? "rotate-180" : ""}`}>
                        <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
                      </svg>
                    </button>
                  </div>
                ) : null}
              </div>

              {/* Expanded details + help + chat */}
              {isExpanded && !item.completed ? (
                <div className="border-t border-black/[0.04] bg-black/[0.015] px-4 py-4 dark:border-white/[0.04] dark:bg-white/[0.015]">
                  <p className="text-[12px] leading-relaxed theme-muted">{item.description}</p>

                  {/* Persisted chat history */}
                  {chatHistory.length > 0 ? (
                    <div className="mt-3 space-y-3">
                      {chatHistory.map((msg, mi) => (
                        <div key={mi} className={`flex gap-2.5 ${msg.role === "user" ? "justify-end" : ""}`}>
                          {msg.role === "agent" ? (
                            <span className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-blue-500 text-[9px] font-bold text-white">✦</span>
                          ) : null}
                          <div className={`max-w-[85%] rounded-2xl px-4 py-3 ${
                            msg.role === "user"
                              ? "bg-[#111214] text-[#f4efe6] dark:bg-white/[0.1] dark:text-[var(--fg)]"
                              : "app-surface ring-1 ring-black/[0.06] dark:ring-white/[0.08]"
                          }`}>
                            {msg.role === "agent" ? <RenderMarkdown text={msg.text} /> : (
                              <p className="text-[13px] leading-[1.7]">{msg.text}</p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : null}

                  {/* Current streaming / completed help response */}
                  {helpResponses[item.id] !== undefined ? (
                    <div className="mt-3">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-blue-500 text-[9px] font-bold text-white">✦</span>
                        <span className="text-[11px] font-semibold theme-muted">Coding Agent</span>
                        {isStreaming ? <span className="animate-pulse text-[10px] text-violet-400">Thinking...</span> : null}
                      </div>
                      <div className="app-surface rounded-2xl px-4 py-3 ring-1 ring-black/[0.06] dark:ring-white/[0.08]">
                        {helpResponses[item.id] ? (
                          isStreaming ? (
                            <div className="whitespace-pre-wrap text-[13px] leading-[1.7] theme-fg">{helpResponses[item.id]}</div>
                          ) : (
                            <RenderMarkdown text={helpResponses[item.id]} />
                          )
                        ) : isStreaming ? (
                          <div className="flex items-center gap-1.5 py-2">
                            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-violet-400/60 [animation-delay:0ms]" />
                            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-violet-400/60 [animation-delay:150ms]" />
                            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-violet-400/60 [animation-delay:300ms]" />
                          </div>
                        ) : null}
                      </div>
                    </div>
                  ) : null}

                  {/* Inline chat input */}
                  <div className="mt-3 flex items-center gap-2">
                    <input
                      type="text"
                      value={chatInputs[item.id] ?? ""}
                      onChange={(e) => setChatInputs((prev) => ({ ...prev, [item.id]: e.target.value }))}
                      onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void handleSendChat(item); } }}
                      placeholder="Ask a follow-up or provide info..."
                      disabled={isStreaming}
                      className="min-w-0 flex-1 rounded-xl border border-black/[0.06] bg-white/80 px-3 py-2.5 text-[13px] theme-fg outline-none placeholder:theme-muted transition focus:border-violet-500/40 focus:ring-2 focus:ring-violet-500/10 disabled:opacity-50 dark:border-white/[0.08] dark:bg-white/[0.04]"
                    />
                    <button
                      type="button"
                      onClick={() => void handleSendChat(item)}
                      disabled={!(chatInputs[item.id] ?? "").trim() || isStreaming}
                      className="flex h-9 items-center gap-1.5 rounded-xl bg-[#111214] px-3.5 text-[11px] font-semibold text-[#f4efe6] transition hover:bg-[#0b1220] disabled:opacity-40 dark:bg-white dark:text-[#111214] dark:hover:bg-white/90"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
                        <path d="M3.105 2.289a.75.75 0 00-.826.95l1.414 4.925A1.5 1.5 0 005.135 9.25h6.115a.75.75 0 010 1.5H5.135a1.5 1.5 0 00-1.442 1.086l-1.414 4.926a.75.75 0 00.826.95 28.896 28.896 0 0015.293-7.154.75.75 0 000-1.115A28.897 28.897 0 003.105 2.289z" />
                      </svg>
                      Send
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}

/* ─── page ─── */

export default function ProjectPage() {
  const { activeProject, canUseDesktopProject } = useActiveDesktopProject();
  const plan = (activeProject?.dashboard.plan ?? null) as ProjectPlan | null;
  const taskConversationThreads = (activeProject?.dashboard.taskThreads ?? []) as ProjectTaskThread[];
  const suggestedSubprojectOrder = plan?.buildOrder?.map((step) => step.subprojectId) ?? [];
  const suggestedTaskOrder = plan?.buildOrder?.flatMap((step) => step.taskIds) ?? [];
  const initialSubprojectOrder = [...new Set([...suggestedSubprojectOrder, ...(plan?.subprojects.map((sp) => sp.id) ?? [])])];
  const initialTaskOrder = [...new Set([...suggestedTaskOrder, ...(plan?.subprojects.flatMap((sp) => sp.tasks.map((task) => task.id)) ?? [])])];
  const [displayName, setDisplayName] = useState("");
  useEffect(() => {
    if (typeof window !== "undefined" && window.electronAPI?.settings) {
      window.electronAPI.settings.get().then((s) => {
        const settings = s as unknown as Record<string, unknown>;
        if (settings.displayName) setDisplayName(settings.displayName as string);
      }).catch(() => {});
    }
  }, []);
  const currentUserName = displayName || "You";
  const currentUserInitials = displayName ? displayName.split(" ").filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("") : "CB";
  const assignablePeople = [
    { name: currentUserName, initials: currentUserInitials },
    { name: "Project Manager", initials: "✦" },
  ];

  /* state */
  const [subprojects, setSubprojects] = useState<ProjectSubproject[]>(plan?.subprojects ?? []);
  const [showSubprojectCreator, setShowSubprojectCreator] = useState(false);
  const [showTaskCreator, setShowTaskCreator] = useState(false);
  const [showTaskDetails, setShowTaskDetails] = useState(false);
  const [newSubprojectTitle, setNewSubprojectTitle] = useState("");
  const [newSubprojectGoal, setNewSubprojectGoal] = useState("");
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskNote, setNewTaskNote] = useState("");
  const [newTaskOwner, setNewTaskOwner] = useState(currentUserName);
  const [newTaskDueDate, setNewTaskDueDate] = useState("2026-03-31");
  const [subprojectOrder, setSubprojectOrder] = useState(initialSubprojectOrder);
  const [taskOrder, setTaskOrder] = useState(initialTaskOrder);
  const [selectedSubprojectId, setSelectedSubprojectId] = useState(plan?.subprojects[0]?.id ?? "");
  const [selectedTaskId, setSelectedTaskId] = useState(plan?.subprojects[0]?.tasks[0]?.id ?? "");
  const [showAssigneePicker, setShowAssigneePicker] = useState(false);
  const [showDueDatePicker, setShowDueDatePicker] = useState(false);
  const [currentVersion, setCurrentVersion] = useState(1);
  const [showVersionConfirm, setShowVersionConfirm] = useState(false);
  const [pushingToGithub, setPushingToGithub] = useState(false);
  const [pushResult, setPushResult] = useState<{ ok: boolean; message: string } | null>(null);

  /* File watcher / auto-sync state */
  const [fileWatcherActive, setFileWatcherActive] = useState(false);
  const [autoSyncing, setAutoSyncing] = useState(false);
  const [lastAutoSync, setLastAutoSync] = useState<string | null>(null);
  const [pushingToMain, setPushingToMain] = useState(false);
  const [pushToMainResult, setPushToMainResult] = useState<{ ok: boolean; message: string } | null>(null);

  /* P2P collaboration state */
  const [p2pJoined, setP2pJoined] = useState(false);
  const [p2pJoining, setP2pJoining] = useState(false);
  const [p2pPeers, setP2pPeers] = useState<Array<{ id: string; name: string; initials: string; role: string; status: string }>>([]);
  const [p2pError, setP2pError] = useState<string | null>(null);
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [inviteCopied, setInviteCopied] = useState(false);
  const [inviteRemoteUrl, setInviteRemoteUrl] = useState<string | null>(null);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
  const [hasRemote, setHasRemote] = useState(false);
  const syncInFlightRef = useRef(false);

  // Check if project has a remote URL (enables auto-sync)
  useEffect(() => {
    if (!activeProject?.repoPath) { setHasRemote(false); return; }
    window.electronAPI?.repo?.getRemoteUrl(activeProject.repoPath).then((url) => {
      setHasRemote(Boolean(url));
    });
  }, [activeProject?.repoPath]);

  // Silent background sync — doesn't show banners, just pulls + imports
  const doSilentSync = async () => {
    if (!activeProject?.id || !hasRemote || syncInFlightRef.current) return;
    syncInFlightRef.current = true;
    try {
      const result = await window.electronAPI?.project?.syncWorkspace(activeProject.id);
      if (result?.success) {
        console.log("[auto-sync] Imported", result.subprojects, "subprojects,", result.tasks, "tasks");
      }
      setLastSyncTime(new Date());
    } catch (err) {
      console.warn("[auto-sync] Silent sync failed:", err);
    } finally {
      syncInFlightRef.current = false;
    }
  };

  // Auto-sync: initial pull-first on project entry (hard pull — remote wins)
  // After initial sync, P2P handles real-time updates so no interval needed
  const initialSyncProjectRef = useRef<string | null>(null);
  useEffect(() => {
    if (!activeProject?.id || !hasRemote) return;
    if (initialSyncProjectRef.current === activeProject.id) return;
    initialSyncProjectRef.current = activeProject.id;

    // Pull-first on project entry — syncWorkspace does git fetch + reset --hard
    doSilentSync();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProject?.id, hasRemote]);

  const handlePushToGithub = async () => {
    if (!activeProject?.repoPath) return;
    setPushingToGithub(true);
    setPushResult(null);
    try {
      // First check if a remote exists
      const remoteUrl = await window.electronAPI?.repo?.getRemoteUrl(activeProject.repoPath);
      if (!remoteUrl) {
        // Try ensureGithubRepo to create one
        try {
          await window.electronAPI?.project?.ensureGithubRepo(activeProject.id);
        } catch {
          setPushResult({ ok: false, message: "No Git remote found. Connect a GitHub repo first in Settings." });
          return;
        }
      }
      // Sync shared state: stage .codebuddy/, commit, push
      await window.electronAPI?.repo?.syncSharedState({ repoPath: activeProject.repoPath });
      setPushResult({ ok: true, message: "Pushed to GitHub! Teammates can now pull to sync." });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Push failed";
      // If nothing to push, that's still fine
      if (msg.includes("nothing to commit") || msg.includes("Everything up-to-date")) {
        setPushResult({ ok: true, message: "Already up to date — nothing new to push." });
      } else {
        setPushResult({ ok: false, message: msg });
      }
    } finally {
      setPushingToGithub(false);
      setTimeout(() => setPushResult(null), 5000);
    }
  };

  const handlePushToMain = async () => {
    if (!activeProject?.repoPath) return;
    setPushingToMain(true);
    setPushToMainResult(null);
    try {
      const result = await window.electronAPI?.fileWatcher?.pushToMain({ repoPath: activeProject.repoPath });
      if (result?.success) {
        setPushToMainResult({ ok: true, message: result.message });
      } else {
        setPushToMainResult({ ok: false, message: result?.message || "Push to main failed." });
      }
    } catch (err) {
      setPushToMainResult({ ok: false, message: err instanceof Error ? err.message : "Push to main failed." });
    } finally {
      setPushingToMain(false);
      setTimeout(() => setPushToMainResult(null), 5000);
    }
  };

  // Auto-join P2P: opening a project = going live automatically (no manual toggle)
  const autoJoinProjectRef = useRef<string | null>(null);
  useEffect(() => {
    if (!activeProject?.id || !activeProject?.repoPath || !hasRemote) return;
    if (p2pJoined || p2pJoining) return;
    if (autoJoinProjectRef.current === activeProject.id) return;
    autoJoinProjectRef.current = activeProject.id;

    (async () => {
      setP2pJoining(true);
      setP2pError(null);
      try {
        const remoteUrl = await window.electronAPI?.repo?.getRemoteUrl(activeProject.repoPath);
        if (!remoteUrl) return;
        await window.electronAPI?.p2p?.join({
          projectId: activeProject.id,
          repoPath: activeProject.repoPath,
          remoteUrl,
          member: { id: "owner", name: currentUserName, initials: currentUserInitials, role: "Owner" },
        });
        setP2pJoined(true);
      } catch (err) {
        console.warn("[P2P] Auto-join failed:", err);
        setP2pError(err instanceof Error ? err.message : "Failed to connect");
      } finally {
        setP2pJoining(false);
      }
    })();
  }, [activeProject?.id, activeProject?.repoPath, hasRemote, p2pJoined, p2pJoining, currentUserName, currentUserInitials]);

  /* File watcher: auto-start when project is active, listen for sync events */
  useEffect(() => {
    if (!activeProject?.repoPath) return;
    const api = window.electronAPI?.fileWatcher;
    if (!api) return;

    // Start file watcher on project load
    api.start({ repoPath: activeProject.repoPath }).then((status) => {
      setFileWatcherActive(status?.watching ?? false);
    }).catch(() => {});

    const unsubs: Array<(() => void) | undefined> = [];
    unsubs.push(api.onSyncStart?.(() => {
      setAutoSyncing(true);
    }));
    unsubs.push(api.onSyncComplete?.((data) => {
      setAutoSyncing(false);
      if (data.success && data.commitMessage) {
        setLastAutoSync(new Date().toLocaleTimeString());
      }
    }));
    unsubs.push(api.onPeerSync?.((data) => {
      if (data.pullResult?.success) {
        setLastAutoSync(`pulled from ${data.peerName} at ${new Date().toLocaleTimeString()}`);
      }
    }));
    unsubs.push(api.onStatus?.((data) => {
      setFileWatcherActive(data.watching);
    }));

    return () => {
      unsubs.forEach(u => u?.());
      // Don't stop watcher on unmount — it should keep running while the project is open
    };
  }, [activeProject?.repoPath]);

  /* P2P event listeners — filter events by current project */
  useEffect(() => {
    const pid = activeProject?.id;
    const unsubs: Array<(() => void) | undefined> = [];
    unsubs.push(window.electronAPI?.p2p?.onPresence((event) => {
      if (event.projectId && event.projectId !== pid) return; // not our project
      setP2pPeers(event.peers);
    }));
    unsubs.push(window.electronAPI?.p2p?.onPeerJoined((event) => {
      if (event.projectId && event.projectId !== pid) return;
      window.electronAPI?.p2p?.peers({ projectId: pid }).then((list) => { if (list) setP2pPeers(list); });
    }));
    unsubs.push(window.electronAPI?.p2p?.onPeerLeft((event) => {
      if (event.projectId && event.projectId !== pid) return;
      window.electronAPI?.p2p?.peers({ projectId: pid }).then((list) => { if (list) setP2pPeers(list); });
    }));
    unsubs.push(window.electronAPI?.p2p?.onLeft((event) => {
      if (event.projectId && event.projectId !== pid) return;
      setP2pJoined(false);
      setP2pPeers([]);
    }));

    // Listen for P2P state changes from peers — triggers a settings refetch
    // so the dashboard/task board re-renders with the peer's updates
    unsubs.push(window.electronAPI?.p2p?.onStateChanged?.((event) => {
      if (event.projectId && event.projectId !== pid) return;
      console.log(`[P2P-recv] State change from ${event.peerName}: ${event.category}/${event.id}`);

      // If this is a plan update, log details and suppress echo broadcast
      if (event.category === "plan" && event.data?.plan) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const incoming = event.data.plan as any;
        const taskStatuses = incoming.subprojects?.map((sp: { title: string; tasks: { title: string; status: string }[] }) =>
          `${sp.title}: ${sp.tasks.map((t: { title: string; status: string }) => `${t.title}=${t.status}`).join(", ")}`
        );
        console.log("[P2P-recv] Incoming plan tasks:", taskStatuses);

        // Update echo-suppression refs using SUBPROJECTS-ONLY key
        try {
          const subKey = JSON.stringify(incoming.subprojects ?? []);
          lastBroadcastRef.current = subKey;
          lastSavedPlanRef.current = subKey;
        } catch { /* ignore */ }
      }
    }));

    // Check initial status for THIS project
    if (pid) {
      window.electronAPI?.p2p?.status({ projectId: pid }).then((s) => {
        // When called with projectId, returns a single P2PStatus object
        const status = s as import("@/lib/electron").P2PStatus;
        if (status?.joined) {
          setP2pJoined(true);
          window.electronAPI?.p2p?.peers({ projectId: pid }).then((list) => { if (list) setP2pPeers(list); });
        } else {
          setP2pJoined(false);
          setP2pPeers([]);
        }
      });
    }

    return () => { unsubs.forEach((u) => u?.()); };
  }, [activeProject?.id]);

  const lastAppliedPlanRef = useRef<string>("");

  useEffect(() => {
    // Skip the full reset if plan content hasn't actually changed (prevents settings:changed echo loops)
    const planKey = JSON.stringify(plan?.subprojects ?? []) + "|" + (activeProject?.id ?? "");
    if (planKey === lastAppliedPlanRef.current) return;
    lastAppliedPlanRef.current = planKey;

    setSubprojects(plan?.subprojects ?? []);
    setSubprojectOrder(initialSubprojectOrder);
    setTaskOrder(initialTaskOrder);
    setSelectedSubprojectId(plan?.subprojects[0]?.id ?? "");
    setSelectedTaskId(plan?.subprojects[0]?.tasks[0]?.id ?? "");
    planLoadedRef.current = false; // reset on plan change from settings
    // Mark as loaded after a tick so the debounced save doesn't fire on initial load
    requestAnimationFrame(() => { 
      planLoadedRef.current = true;
      console.log("[planLoaded] Set to true after rAF. Subprojects:", plan?.subprojects?.length || 0);
    });
  }, [plan, activeProject?.id]);

  // Debounced auto-save: persist plan changes to settings + .codebuddy/plan.json + git push
  // Also broadcast instantly via P2P when live-connected
  const planLoadedRef = useRef(false);
  const savePlanTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastBroadcastRef = useRef<string>("");
  const lastSavedPlanRef = useRef<string>("");
  // When true, the next subprojects change came from a task-status-only click
  // and the individual P2P task message already handled sync — skip full plan broadcast
  const taskStatusOnlyRef = useRef(false);

  useEffect(() => {
    if (!activeProject?.id || !planLoadedRef.current || subprojects.length === 0) {
      if (activeProject?.id && subprojects.length > 0) {
        console.log("[broadcast-check] SKIPPED — planLoaded:", planLoadedRef.current, "subprojects:", subprojects.length, "p2p:", p2pJoined);
      }
      return;
    }

    const currentPlan = plan ? { ...plan, subprojects } : { buildOrder: [], subprojects };
    // Use subprojects-only key for comparison — the full plan JSON can differ
    // in key order after reassembly, causing false mismatches and echo loops.
    const subKey = JSON.stringify(subprojects);

    // Skip save if plan content hasn't actually changed (breaks settings:changed → save → settings:changed cascade)
    if (subKey === lastSavedPlanRef.current) {
      return;
    }

    // P2P broadcast: instant (no debounce) — send to all connected peers immediately
    // Skip full plan broadcast when only a task status changed (individual task message handles it)
    const isTaskStatusOnly = taskStatusOnlyRef.current;
    taskStatusOnlyRef.current = false;
    if (p2pJoined && !isTaskStatusOnly) {
      // Only broadcast if plan actually changed (avoid echo loops from incoming P2P updates)
      if (subKey !== lastBroadcastRef.current) {
        lastBroadcastRef.current = subKey;
        const taskStatuses = currentPlan.subprojects?.map((sp: ProjectSubproject) =>
          `${sp.title}: ${sp.tasks.map((t: ProjectTask) => `${t.title}=${t.status}`).join(", ")}`
        );
        console.log("[P2P] Broadcasting plan to peers. Tasks:", taskStatuses);
        window.electronAPI?.p2p?.broadcastStateChange({
          projectId: activeProject.id,
          category: "plan",
          id: activeProject.id,
          data: { plan: currentPlan },
        });
      }
    }

    // Debounced save: write to settings + always push to git (offline peers need it)
    if (savePlanTimerRef.current) clearTimeout(savePlanTimerRef.current);
    savePlanTimerRef.current = setTimeout(async () => {
      try {
        lastSavedPlanRef.current = subKey;
        await window.electronAPI?.project?.savePlan({
          projectId: activeProject.id,
          plan: currentPlan,
          skipGitPush: false,
        });
        console.log("[auto-save] Plan saved + pushed to git");
      } catch (err) {
        console.warn("[auto-save] Failed:", err);
      }
    }, 2000);

    return () => {
      if (savePlanTimerRef.current) clearTimeout(savePlanTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subprojects, activeProject?.id, p2pJoined]);

  // Auto-import synced plan from .codebuddy/plan.json if the project has no plan yet
  useEffect(() => {
    if (!activeProject?.id || plan) return;
    let cancelled = false;
    (async () => {
      try {
        const result = await window.electronAPI?.project?.importSyncedPlan(activeProject.id);
        if (result?.imported && !cancelled) {
          console.log("[workspace] Auto-imported synced plan:", result.subprojects, "subprojects");
          // The IPC handler sends settings:changed which will trigger a re-render
        }
      } catch (err) {
        console.warn("[workspace] Plan auto-import failed:", err);
      }
    })();
    return () => { cancelled = true; };
  }, [activeProject?.id, plan]);

  const workspaceTitle = activeProject?.name ?? "Project workspace";
  const workspaceSubtitle = activeProject?.description ?? "Open a real project to see its dashboard.";
  const hasRealProjectWithoutPlan = Boolean(activeProject && !plan);
  const hasNoActiveDesktopProject = Boolean(canUseDesktopProject && !activeProject);

  /* derived */
  const orderedSubprojects = subprojectOrder
    .map((id) => subprojects.find((sp) => sp.id === id))
    .filter((sp): sp is NonNullable<typeof sp> => Boolean(sp));
  const allTasks = orderedSubprojects.flatMap((sp) =>
    [...sp.tasks].sort((left, right) => taskOrder.indexOf(left.id) - taskOrder.indexOf(right.id))
  );
  const overallProgress = allTasks.length > 0
    ? Math.round((allTasks.filter((t) => t.status === "done").length / allTasks.length) * 100)
    : 0;
  const selectedSubproject = orderedSubprojects.find((sp) => sp.id === selectedSubprojectId) ?? orderedSubprojects[0] ?? null;
  const selectedTask = allTasks.find((t) => t.id === selectedTaskId) ?? selectedSubproject?.tasks[0] ?? null;
  const selectedTaskConversations = selectedTask
    ? taskConversationThreads.filter((thread) => thread.taskId === selectedTask.id)
    : [];
  const personalTasks = orderedSubprojects
    .flatMap((sp) => sp.tasks.map((task) => ({ ...task, subprojectTitle: sp.title })))
    .filter((task) => task.owner === currentUserName)
    .sort((left, right) => taskOrder.indexOf(left.id) - taskOrder.indexOf(right.id));

  const getAssigneeMeta = (name: string) =>
    assignablePeople.find((person) => person.name === name) ?? { name, initials: name.slice(0, 2).toUpperCase() };
  const getSubprojectOrderNumber = (subprojectId: string) => {
    const index = subprojectOrder.indexOf(subprojectId);
    return index === -1 ? null : index + 1;
  };
  const getTaskOrderNumber = (taskId: string) => {
    const index = taskOrder.indexOf(taskId);
    return index === -1 ? null : index + 1;
  };

  /* handlers */

  const handleAddSubproject = () => {
    if (!newSubprojectTitle.trim()) return;
    const id = `sp-${Date.now()}`;
    const sp = {
      id,
      title: newSubprojectTitle.trim(),
      goal: newSubprojectGoal.trim() || "Custom subproject.",
      status: "planned" as BuildTaskStatus,
      updatedAgo: "Just now",
      agentName: `${newSubprojectTitle.trim()} agent`,
      agentBrief: "Custom agent context.",
      preview: {
        eyebrow: "Preview",
        title: newSubprojectTitle.trim(),
        subtitle: newSubprojectGoal.trim() || "Ready for tasks.",
        accent: "from-[#2a2a2a] to-[#73624b]",
        cards: ["Custom", "Tasks", "Review"],
      },
      tasks: [],
    };
    setSubprojects((cur) => [...cur, sp]);
    setSubprojectOrder((cur) => [...cur, id]);
    setSelectedSubprojectId(id);
    setSelectedTaskId("");
    setShowSubprojectCreator(false);
    setNewSubprojectTitle("");
    setNewSubprojectGoal("");
  };

  const handleAddTask = () => {
    if (!selectedSubproject || !newTaskTitle.trim()) return;
    const id = `task-${Date.now()}`;
    const task = {
      id,
      title: newTaskTitle.trim(),
      status: "planned" as BuildTaskStatus,
      owner: newTaskOwner,
      reviewer: currentUserName,
      note: newTaskNote.trim() || "Custom task.",
      dueDate: newTaskDueDate,
      startingPrompt: `Build the "${newTaskTitle.trim()}" feature.`,
    };
    setSubprojects((cur) =>
      cur.map((sp) =>
        sp.id === selectedSubproject.id
          ? { ...sp, updatedAgo: "Just now", tasks: [...sp.tasks, task] }
          : sp
      )
    );
    setTaskOrder((cur) => [...cur, id]);
    setSelectedTaskId(id);
    setShowTaskCreator(false);
    setShowTaskDetails(true);
    setNewTaskTitle("");
    setNewTaskNote("");
    setNewTaskOwner(currentUserName);
    setNewTaskDueDate("2026-03-31");
  };

  const handleSelectTask = (spId: string, taskId: string) => {
    setSelectedSubprojectId(spId);
    setSelectedTaskId(taskId);
    setShowAssigneePicker(false);
    setShowDueDatePicker(false);
    setShowTaskDetails(true);
  };

  const handleChangeTaskStatus = (taskId: string, newStatus: BuildTaskStatus) => {
    console.log("[task-change] Status:", taskId, "→", newStatus, "planLoaded:", planLoadedRef.current, "p2p:", p2pJoined);
    taskStatusOnlyRef.current = true; // suppress full plan broadcast — individual task P2P message is enough
    setSubprojects((cur) =>
      cur.map((sp) => ({
        ...sp,
        tasks: sp.tasks.map((t) =>
          t.id === taskId ? { ...t, status: newStatus } : t
        ),
      }))
    );

    // Send a dedicated task-status P2P message for fast, reliable sync
    if (p2pJoined && activeProject?.id) {
      const sp = subprojects.find((s) => s.tasks.some((t) => t.id === taskId));
      const task = sp?.tasks.find((t) => t.id === taskId);
      window.electronAPI?.p2p?.broadcastStateChange({
        projectId: activeProject.id,
        category: "tasks",
        id: taskId,
        data: {
          taskId,
          title: task?.title ?? "",
          previousStatus: task?.status ?? "",
          status: newStatus,
          subprojectTitle: sp?.title ?? "",
          updatedAt: new Date().toISOString(),
        },
      });
    }
  };

  const handleAssignTask = (taskId: string, owner: string) => {
    setSubprojects((cur) =>
      cur.map((sp) => ({
        ...sp,
        tasks: sp.tasks.map((task) =>
          task.id === taskId ? { ...task, owner } : task
        ),
      }))
    );
    setShowAssigneePicker(false);
  };

  const handleChangeTaskDueDate = (taskId: string, dueDate: string) => {
    setSubprojects((cur) =>
      cur.map((sp) => ({
        ...sp,
        tasks: sp.tasks.map((task) =>
          task.id === taskId ? { ...task, dueDate } : task
        ),
      }))
    );
  };

  const handleSetRelativeDueDate = (taskId: string, daysFromToday: number) => {
    const nextDate = new Date();
    nextDate.setHours(0, 0, 0, 0);
    nextDate.setDate(nextDate.getDate() + daysFromToday);
    const formatted = nextDate.toISOString().slice(0, 10);
    handleChangeTaskDueDate(taskId, formatted);
    setShowDueDatePicker(false);
  };

  const handleMoveSubproject = (subprojectId: string, direction: "earlier" | "later") => {
    setSubprojectOrder((current) => {
      const index = current.indexOf(subprojectId);
      if (index === -1) return current;
      const nextIndex = direction === "earlier" ? index - 1 : index + 1;
      if (nextIndex < 0 || nextIndex >= current.length) return current;
      return moveItem(current, index, nextIndex);
    });
  };

  const handleMoveTask = (taskId: string, direction: "earlier" | "later") => {
    setTaskOrder((current) => {
      const index = current.indexOf(taskId);
      if (index === -1) return current;
      const nextIndex = direction === "earlier" ? index - 1 : index + 1;
      if (nextIndex < 0 || nextIndex >= current.length) return current;
      return moveItem(current, index, nextIndex);
    });
  };

  /* ─── render ─── */

  return (
    <div className="flex min-h-full bg-[linear-gradient(180deg,var(--gradient-page-start)_0%,var(--gradient-page-end)_100%)] text-ink dark:text-[var(--fg)]">
      <ProjectSidebar />

      <div className="min-w-0 flex-1 px-5 pb-32 pt-[5.6rem] sm:px-6 xl:px-8">
      <div className="mx-auto flex w-full max-w-[1120px] flex-col gap-8">

        {/* ═══════════════════ HERO ═══════════════════ */}
        <header className="flex flex-col items-start gap-8 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] theme-muted">
              Build workspace
            </p>
            <div className="mt-2 flex items-center gap-3">
              <h1 className="display-font text-[2.4rem] font-semibold leading-[0.96] tracking-tight theme-fg sm:text-[3rem]">
                {workspaceTitle}
              </h1>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-violet-500/15 to-blue-500/15 px-3 py-1 text-[11px] font-bold text-violet-400 ring-1 ring-violet-500/20">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3 w-3">
                  <path fillRule="evenodd" d="M15 8a3 3 0 10-2.977-2.63l-4.94 2.47a3 3 0 100 4.319l4.94 2.47a3 3 0 10.895-1.789l-4.94-2.47a3.027 3.027 0 000-.74l4.94-2.47C13.456 7.68 14.19 8 15 8z" clipRule="evenodd" />
                </svg>
                v{currentVersion}
              </span>
              {showVersionConfirm ? (
                <span className="inline-flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setCurrentVersion((v) => v + 1);
                      setShowVersionConfirm(false);
                    }}
                    className="inline-flex items-center gap-1 rounded-full bg-violet-500/15 px-2.5 py-1 text-[10px] font-semibold text-violet-400 transition hover:bg-violet-500/25"
                  >
                    Create v{currentVersion + 1}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowVersionConfirm(false)}
                    className="rounded-full px-2 py-1 text-[10px] font-semibold theme-muted transition hover:text-red-400"
                  >
                    Cancel
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowVersionConfirm(true)}
                  className="inline-flex items-center gap-1 rounded-full border border-dashed border-black/[0.1] px-2.5 py-1 text-[10px] font-semibold theme-muted transition hover:border-violet-500/30 hover:text-violet-400 dark:border-white/[0.1] dark:hover:border-violet-500/30"
                  title="Fork the project into a new version"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3 w-3">
                    <path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" />
                  </svg>
                  New version
                </button>
              )}
              <button
                type="button"
                onClick={() => void handlePushToGithub()}
                disabled={pushingToGithub || !activeProject?.repoPath}
                className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-emerald-500/15 to-teal-500/15 px-3 py-1 text-[10px] font-semibold text-emerald-500 ring-1 ring-emerald-500/20 transition hover:from-emerald-500/25 hover:to-teal-500/25 disabled:opacity-50 dark:text-emerald-400"
                title="Stage, commit, and push workspace + shared state to GitHub"
              >
                {pushingToGithub ? (
                  <>
                    <svg className="h-3 w-3 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                    Pushing…
                  </>
                ) : (
                  <>
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3 w-3">
                      <path d="M10 2a.75.75 0 01.75.75v5.59l1.95-2.1a.75.75 0 111.1 1.02l-3.25 3.5a.75.75 0 01-1.1 0L6.2 7.26a.75.75 0 011.1-1.02l1.95 2.1V2.75A.75.75 0 0110 2z" />
                      <path d="M5.273 4.5a1.25 1.25 0 00-1.205.918l-1.523 5.52c-.006.02-.01.041-.015.062H6a1 1 0 01.894.553l.448.894a1 1 0 00.894.553h3.438a1 1 0 00.86-.49l.606-1.02A1 1 0 0114 11h3.47a1.318 1.318 0 00-.015-.062l-1.523-5.52a1.25 1.25 0 00-1.205-.918h-.977a.75.75 0 010-1.5h.977a2.75 2.75 0 012.651 2.019l1.523 5.52c.066.239.099.485.099.732V15a2 2 0 01-2 2H3a2 2 0 01-2-2v-3.73c0-.246.033-.492.099-.73l1.523-5.521A2.75 2.75 0 015.273 3h.977a.75.75 0 010 1.5h-.977z" />
                    </svg>
                    Push to GitHub
                  </>
                )}
              </button>
              {pushResult && (
                <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${pushResult.ok ? "bg-emerald-500/15 text-emerald-500 dark:text-emerald-400" : "bg-red-500/15 text-red-500 dark:text-red-400"}`}>
                  {pushResult.message}
                </span>
              )}
              {/* Push to Main button */}
              <button
                type="button"
                onClick={() => void handlePushToMain()}
                disabled={pushingToMain || !activeProject?.repoPath}
                className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-blue-500/15 to-indigo-500/15 px-3 py-1 text-[10px] font-semibold text-blue-500 ring-1 ring-blue-500/20 transition hover:from-blue-500/25 hover:to-indigo-500/25 disabled:opacity-50 dark:text-blue-400"
                title="Merge codebuddy-build → main and push to GitHub"
              >
                {pushingToMain ? (
                  <>
                    <svg className="h-3 w-3 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                    Merging…
                  </>
                ) : (
                  <>
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3 w-3">
                      <path fillRule="evenodd" d="M5.22 14.78a.75.75 0 001.06 0l7.22-7.22v5.69a.75.75 0 001.5 0v-7.5a.75.75 0 00-.75-.75h-7.5a.75.75 0 000 1.5h5.69l-7.22 7.22a.75.75 0 000 1.06z" clipRule="evenodd" />
                    </svg>
                    Push to Main
                  </>
                )}
              </button>
              {pushToMainResult && (
                <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${pushToMainResult.ok ? "bg-blue-500/15 text-blue-500 dark:text-blue-400" : "bg-red-500/15 text-red-500 dark:text-red-400"}`}>
                  {pushToMainResult.message}
                </span>
              )}
            </div>
            {/* Auto-sync status bar */}
            {fileWatcherActive && (
              <div className="mt-2 flex items-center gap-2 text-[10px] theme-muted">
                <span className={`inline-block h-1.5 w-1.5 rounded-full ${autoSyncing ? "bg-amber-400 animate-pulse" : "bg-emerald-400"}`} />
                <span>
                  {autoSyncing ? "Syncing changes to codebuddy-build…" : "Auto-sync active"}
                  {lastAutoSync && !autoSyncing ? ` · Last sync: ${lastAutoSync}` : ""}
                </span>
              </div>
            )}
            <p className="mt-3 text-[14px] leading-relaxed theme-soft">
              {subprojects.length} subprojects · {allTasks.length} tasks
            </p>
            <p className="mt-2 max-w-2xl text-[13px] leading-relaxed theme-muted">
              {workspaceSubtitle}
            </p>

            {/* ─── P2P Live Collaboration Bar ─── */}
            <div className="mt-3 flex items-center gap-3">
              {/* Always-on live status indicator (no manual toggle) */}
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-semibold ${
                  p2pJoined
                    ? "bg-emerald-500/15 text-emerald-500 ring-1 ring-emerald-500/25 dark:text-emerald-400"
                    : p2pJoining
                    ? "bg-amber-500/10 text-amber-500 ring-1 ring-amber-500/20 dark:text-amber-400"
                    : hasRemote
                    ? "bg-white/5 text-white/40 ring-1 ring-white/10"
                    : "bg-white/5 text-white/30 ring-1 ring-white/10"
                }`}
              >
                {p2pJoining ? (
                  <>
                    <svg className="h-3 w-3 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                    Connecting…
                  </>
                ) : p2pJoined ? (
                  <>
                    <span className="relative flex h-2 w-2">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                    </span>
                    Live
                  </>
                ) : (
                  <>
                    <span className="inline-flex h-2 w-2 rounded-full bg-white/20" />
                    {hasRemote ? "Offline" : "No remote"}
                  </>
                )}
              </span>

              {/* Online peers */}
              {p2pJoined && (
                <div className="flex items-center gap-1.5">
                  {p2pPeers.length > 0 ? (
                    <>
                      <div className="flex -space-x-1.5">
                        {p2pPeers.slice(0, 5).map((peer) => (
                          <div
                            key={peer.id}
                            className="relative flex h-6 w-6 items-center justify-center rounded-full bg-cyan-100 text-[9px] font-bold text-cyan-700 ring-2 ring-white dark:bg-cyan-500/20 dark:text-cyan-300 dark:ring-black/50"
                            title={`${peer.name} (${peer.status})`}
                          >
                            {peer.initials}
                            <span className={`absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full ring-1 ring-white dark:ring-black/50 ${peer.status === "online" ? "bg-emerald-500" : "bg-amber-400"}`} />
                          </div>
                        ))}
                      </div>
                      <span className="text-[10px] font-medium theme-muted">
                        {p2pPeers.length} peer{p2pPeers.length !== 1 ? "s" : ""} online
                      </span>
                    </>
                  ) : (
                    <span className="text-[10px] theme-muted">Waiting for teammates…</span>
                  )}
                </div>
              )}

              {p2pError && (
                <span className="rounded-full bg-red-500/10 px-2.5 py-1 text-[10px] font-medium text-red-500 dark:text-red-400">
                  {p2pError}
                </span>
              )}

              {/* Invite Friend button */}
              {p2pJoined && (
                <button
                  type="button"
                  onClick={async () => {
                    if (!activeProject?.repoPath) return;
                    try {
                      const remoteUrl = await window.electronAPI?.repo?.getRemoteUrl(activeProject.repoPath);
                      if (!remoteUrl) { setP2pError("Push to GitHub first to invite friends"); return; }
                      const result = await window.electronAPI?.p2p?.generateInvite({ remoteUrl, projectName: activeProject.name });
                      if (result?.code) {
                        setInviteCode(result.code);
                        setInviteCopied(false);
                        setInviteRemoteUrl(remoteUrl);
                      }
                    } catch { setP2pError("Could not generate invite code"); }
                  }}
                  className="inline-flex items-center gap-1 rounded-full bg-violet-500/10 px-3 py-1.5 text-[11px] font-semibold text-violet-600 ring-1 ring-violet-500/20 transition hover:bg-violet-500/15 dark:text-violet-400"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3 w-3"><path d="M11 5a3 3 0 11-6 0 3 3 0 016 0zM2.615 16.428a1.224 1.224 0 01-.569-1.175 6.002 6.002 0 0111.908 0c.058.467-.172.92-.57 1.174A9.953 9.953 0 018 18a9.953 9.953 0 01-5.385-1.572zM16.25 5.75a.75.75 0 00-1.5 0v2h-2a.75.75 0 000 1.5h2v2a.75.75 0 001.5 0v-2h2a.75.75 0 000-1.5h-2v-2z" /></svg>
                  Invite Friend
                </button>
              )}

              {/* Sync Workspace — now runs automatically on project entry, removed manual button */}

              {/* Auto-sync indicator */}
              {hasRemote && (
                <span className={`text-[10px] ${p2pJoined ? "text-emerald-400/60" : "text-white/30 dark:text-white/25"}`}>
                  {p2pJoined ? "" : lastSyncTime ? `synced ${lastSyncTime.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : ""}
                </span>
              )}
            </div>

            {/* Invite code popup */}
            {inviteCode && (
              <div className="mt-3 space-y-3 rounded-xl border border-violet-400/20 bg-violet-500/5 px-4 py-3">
                {/* Close button */}
                <div className="flex justify-end">
                  <button
                    onClick={() => { setInviteCode(null); setInviteRemoteUrl(null); }}
                    className="rounded-lg bg-white/5 px-2 py-1 text-[11px] text-white/40 hover:bg-white/10 hover:text-white/60"
                  >
                    ✕
                  </button>
                </div>

                {/* Step 1: Give friend access on GitHub */}
                {(() => {
                  const ghMatch = inviteRemoteUrl?.match(/github\.com[/:]([^/]+)\/([^/.]+)/);
                  if (!ghMatch) return null;
                  const collabUrl = `https://github.com/${ghMatch[1]}/${ghMatch[2]}/settings/access`;
                  return (
                    <div className="rounded-lg border border-emerald-400/20 bg-emerald-500/5 px-3 py-2.5">
                      <p className="text-[11px] font-semibold uppercase tracking-widest text-emerald-400/70">Step 1 — Give your friend access</p>
                      <p className="mt-1.5 text-[12px] leading-relaxed text-emerald-200/80 dark:text-emerald-200/80">
                        Your friend needs collaborator access on GitHub before they can join.
                      </p>
                      <ol className="mt-2 ml-4 list-decimal space-y-1 text-[11.5px] leading-relaxed text-emerald-200/70 dark:text-emerald-200/70">
                        <li>Click the button below to open your repo&apos;s GitHub settings</li>
                        <li>Click <span className="font-semibold text-emerald-300/90">&ldquo;Add people&rdquo;</span> (green button)</li>
                        <li>Type your friend&apos;s GitHub username and send the invite</li>
                        <li>Wait for your friend to accept the GitHub email invite</li>
                      </ol>
                      <button
                        type="button"
                        onClick={() => window.electronAPI?.system?.openExternal?.(collabUrl)}
                        className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-emerald-500/20 px-4 py-2 text-[12px] font-semibold text-emerald-300 transition hover:bg-emerald-500/30"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4"><path fillRule="evenodd" d="M4.25 5.5a.75.75 0 00-.75.75v8.5c0 .414.336.75.75.75h8.5a.75.75 0 00.75-.75v-4a.75.75 0 011.5 0v4A2.25 2.25 0 0112.75 17h-8.5A2.25 2.25 0 012 14.75v-8.5A2.25 2.25 0 014.25 4h5a.75.75 0 010 1.5h-5zm7.25-.75a.75.75 0 01.75-.75h3.5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0V6.31l-5.47 5.47a.75.75 0 01-1.06-1.06l5.47-5.47H12.25a.75.75 0 01-.75-.75z" clipRule="evenodd" /></svg>
                        Add collaborator on GitHub
                      </button>
                    </div>
                  );
                })()}

                {/* Step 2: Send the invite code */}
                <div className="rounded-lg border border-violet-400/15 bg-violet-500/5 px-3 py-2.5">
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-violet-400/60">Step 2 — Send them this invite code</p>
                  <p className="mt-1.5 text-[12px] leading-relaxed text-violet-200/70 dark:text-violet-200/70">
                    Once your friend has GitHub access, send them this code to paste in CodeBuddy.
                  </p>
                  <div className="mt-2 flex items-center gap-2">
                    <p className="flex-1 min-w-0 truncate rounded-lg bg-black/20 px-3 py-2 font-mono text-[12px] text-violet-300 dark:text-violet-300">{inviteCode}</p>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(inviteCode);
                        setInviteCopied(true);
                        setTimeout(() => setInviteCopied(false), 2000);
                      }}
                      className="shrink-0 rounded-lg bg-violet-500/20 px-4 py-2 text-[12px] font-semibold text-violet-300 transition hover:bg-violet-500/30"
                    >
                      {inviteCopied ? "Copied!" : "Copy code"}
                    </button>
                  </div>
                </div>
              </div>
            )}

            <div className="mt-5 flex flex-wrap items-center gap-3">
              <Link href="/project/chat" className="btn-primary flex items-center gap-2 px-5 py-2.5 text-[13px]">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                  <path fillRule="evenodd" d="M10 2c-2.236 0-4.43.18-6.57.524C1.993 2.755 1 4.014 1 5.426v5.148c0 1.413.993 2.67 2.43 2.902 1.168.188 2.352.327 3.55.414.28.02.521.18.642.413l1.713 3.293a.75.75 0 001.33 0l1.713-3.293a.783.783 0 01.642-.413 41.102 41.102 0 003.55-.414c1.437-.231 2.43-1.49 2.43-2.902V5.426c0-1.413-.993-2.67-2.43-2.902A41.289 41.289 0 0010 2zM6.75 6a.75.75 0 000 1.5h6.5a.75.75 0 000-1.5h-6.5zm0 2.5a.75.75 0 000 1.5h3.5a.75.75 0 000-1.5h-3.5z" clipRule="evenodd" />
                </svg>
                Talk to Project Manager
              </Link>
              <Link href="/project/preview" className="inline-flex items-center gap-2 rounded-2xl border border-black/[0.06] bg-white/80 px-5 py-2.5 text-[13px] font-semibold text-emerald-600 transition hover:border-emerald-500/30 hover:bg-emerald-500/5 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-emerald-400 dark:hover:border-emerald-500/30">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                  <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
                </svg>
                Run App
              </Link>
            </div>
          </div>
          <ProgressRing progress={overallProgress} />
        </header>

        {/* ═══════════════════ ACTION ITEMS ═══════════════════ */}
        {activeProject && (
          <ActionItemsSection projectId={activeProject.id} />
        )}

        {/* ═══════════════════ SUBPROJECT CARDS ═══════════════════ */}
        <section>
          {hasNoActiveDesktopProject && (
            <div className="mb-5 rounded-[1.5rem] border border-dashed border-black/[0.08] bg-black/[0.02] px-5 py-5 dark:border-white/[0.12] dark:bg-white/[0.03]">
              <p className="text-[12px] font-semibold uppercase tracking-[0.16em] theme-muted">No active real project</p>
              <h2 className="mt-2 text-[18px] font-semibold theme-fg">This workspace is no longer backed by seeded demo data.</h2>
              <p className="mt-2 max-w-2xl text-[13px] leading-relaxed theme-soft">
                Open or create a real project first. Once a real project is active, its dashboard, tasks, and PM Chat plan will show here.
              </p>
            </div>
          )}

          {hasRealProjectWithoutPlan && (
            <div className="mb-5 rounded-[1.5rem] border border-dashed border-black/[0.08] bg-black/[0.02] px-5 py-5 dark:border-white/[0.12] dark:bg-white/[0.03]">
              <p className="text-[12px] font-semibold uppercase tracking-[0.16em] theme-muted">Fresh workspace</p>
              <h2 className="mt-2 text-[18px] font-semibold theme-fg">This real project does not have seeded subprojects.</h2>
              <p className="mt-2 max-w-2xl text-[13px] leading-relaxed theme-soft">
                That is intentional. This workspace is attached to your real repo, so it starts empty instead of inheriting the old demo plan. Add subprojects and tasks for this project, or go to PM Chat to start planning it from scratch.
              </p>
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {orderedSubprojects.map((sp, i) => {
              const active = sp.id === selectedSubprojectId;
              const counts = getPlanCounts(sp.tasks);
              const pct = counts.total > 0 ? Math.round((counts.done / counts.total) * 100) : 0;
              const orderNumber = getSubprojectOrderNumber(sp.id);

              return (
                <button
                  key={sp.id}
                  type="button"
                  onClick={() => {
                    setSelectedSubprojectId(sp.id);
                    setShowTaskCreator(false);
                  }}
                  className={`group relative overflow-hidden rounded-[1.25rem] text-left transition-all duration-200 ${
                    active
                      ? "bg-[rgba(255,252,247,0.96)] ring-2 ring-white/10 shadow-[0_14px_34px_rgba(0,0,0,0.20)] scale-[1.02] dark:bg-[#23262b]"
                      : "app-surface-strong shadow-sm hover:shadow-[0_6px_24px_rgba(0,0,0,0.08)]"
                  }`}
                >
                  <div className={`h-1.5 bg-gradient-to-r ${cardAccents[i % cardAccents.length]}`} />
                  <div className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-[14px] font-semibold theme-fg">{sp.title}</h3>
                          {orderNumber && (
                            <span className="rounded-full bg-black/[0.05] px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.16em] theme-muted dark:bg-white/[0.06]">
                              Step {orderNumber}
                            </span>
                          )}
                        </div>
                      </div>
                      <span className="text-[11px] theme-muted">{sp.updatedAgo}</span>
                    </div>
                    <div className="mt-3 flex items-center gap-1.5">
                      {sp.tasks.map((task) => (
                        <span
                          key={task.id}
                          className="h-2.5 w-2.5 rounded-full transition-transform group-hover:scale-110"
                          style={{ backgroundColor: statusColor[task.status] }}
                          title={`${task.title} — ${statusLabel[task.status]}`}
                        />
                      ))}
                      {sp.tasks.length === 0 && (
                        <span className="text-[11px] theme-muted">No tasks yet</span>
                      )}
                    </div>
                    <div className="mt-3">
                      <div className="h-1.5 overflow-hidden rounded-full bg-black/[0.08] dark:bg-white/[0.08]">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-[#a78bfa] to-[#34d399] transition-all duration-500"
                          style={{ width: `${Math.max(pct, 2)}%` }}
                        />
                      </div>
                      <p className="mt-2 text-[11px] theme-muted">
                        {counts.done}/{counts.total} done
                      </p>
                    </div>
                  </div>
                </button>
              );
            })}

            {/* add-subproject card */}
            <button
              type="button"
              onClick={() => setShowSubprojectCreator(true)}
              disabled={hasNoActiveDesktopProject}
              className="flex min-h-[140px] items-center justify-center rounded-[1.25rem] border-2 border-dashed border-black/[0.08] bg-white/40 text-ink-muted/50 transition-colors hover:border-black/[0.16] hover:text-ink-muted dark:border-white/[0.10] dark:bg-white/[0.03] dark:text-[var(--muted)] dark:hover:border-white/[0.18]"
            >
              <div className="flex flex-col items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-6 w-6">
                  <path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" />
                </svg>
                <span className="text-[13px] font-medium">Add subproject</span>
              </div>
            </button>
          </div>
        </section>

        {/* ═══════════════════ TASK BOARD (kanban) ═══════════════════ */}
        {selectedSubproject && (
          <section className="app-surface overflow-hidden rounded-[1.5rem] p-5 shadow-sm sm:p-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <div
                  className={`h-3 w-3 rounded-full bg-gradient-to-br ${
                    cardAccents[subprojects.findIndex((sp) => sp.id === selectedSubproject.id) % cardAccents.length]
                  }`}
                />
                <h2 className="text-[16px] font-semibold theme-fg">{selectedSubproject.title}</h2>
                {getSubprojectOrderNumber(selectedSubproject.id) && (
                  <span className="rounded-full bg-black/[0.05] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] theme-muted dark:bg-white/[0.06]">
                    Step {getSubprojectOrderNumber(selectedSubproject.id)}
                  </span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowTaskCreator((v) => !v)}
                  disabled={hasNoActiveDesktopProject}
                  className="btn-secondary px-4 py-2 text-[12px]"
                >
                  + Task
                </button>
              </div>
            </div>

            {/* inline task creator */}
            {showTaskCreator && (
              <div className="app-surface-soft mt-4 rounded-[1rem] p-4">
                <div className="grid gap-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <input
                      value={newTaskTitle}
                      onChange={(e) => setNewTaskTitle(e.target.value)}
                      placeholder="Task title"
                      className="app-input rounded-xl px-4 py-2.5 text-[13px] outline-none"
                    />
                    <input
                      value={newTaskNote}
                      onChange={(e) => setNewTaskNote(e.target.value)}
                      placeholder="Quick note"
                      className="app-input rounded-xl px-4 py-2.5 text-[13px] outline-none"
                    />
                  </div>

                  <div className="grid gap-3 lg:grid-cols-[1.5fr_0.95fr_auto] lg:items-end">
                    <div>
                      <p className="px-1 text-[10px] font-semibold uppercase tracking-[0.14em] theme-muted">Assign to</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {assignablePeople.map((person) => {
                          const active = newTaskOwner === person.name;

                          return (
                            <button
                              key={person.name}
                              type="button"
                              onClick={() => setNewTaskOwner(person.name)}
                              className={`inline-flex items-center gap-2 rounded-full px-3 py-2 text-[12px] font-medium transition ${active ? "bg-ink text-cream shadow-[0_8px_20px_rgba(0,0,0,0.12)] dark:bg-white dark:text-[#141414]" : "bg-white/75 text-ink-muted shadow-[inset_0_0_0_1px_rgba(0,0,0,0.05)] hover:bg-white hover:text-ink dark:bg-white/[0.05] dark:text-[var(--muted)] dark:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)] dark:hover:bg-white/[0.08] dark:hover:text-[var(--fg)]"}`}
                            >
                              <span className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-semibold ${active ? "bg-white/16 text-current dark:bg-black/8" : "bg-black/[0.05] text-ink dark:bg-[#202328] dark:text-[var(--fg)]"}`}>
                                {person.initials}
                              </span>
                              {person.name}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <label className="app-input rounded-[1rem] px-4 py-3">
                      <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] theme-muted">Due date</span>
                      <input
                        type="date"
                        value={newTaskDueDate}
                        onChange={(e) => setNewTaskDueDate(e.target.value)}
                        className="mt-2 w-full bg-transparent text-[13px] font-medium theme-fg outline-none"
                      />
                    </label>

                    <button type="button" onClick={handleAddTask} className="btn-primary px-5 py-2.5 text-[13px]">
                      Add
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* kanban columns */}
            <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
              {allStatuses.map((status) => {
                const tasksInCol = selectedSubproject.tasks.filter((t) => t.status === status);
                return (
                  <div key={status} className="flex flex-col gap-2">
                    <div className="flex items-center gap-2 px-1 pb-1">
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: statusColor[status] }} />
                      <span className="text-[10px] font-semibold uppercase tracking-[0.12em] theme-muted">
                        {statusLabel[status]}
                      </span>
                      <span className="ml-auto text-[10px] theme-muted">{tasksInCol.length}</span>
                    </div>
                    <div className="flex min-h-[60px] flex-col gap-2">
                      {tasksInCol.map((task) => {
                        const isActive = task.id === selectedTaskId;
                        const orderNumber = getTaskOrderNumber(task.id);
                        return (
                          <button
                            key={task.id}
                            type="button"
                            onClick={() => handleSelectTask(selectedSubproject.id, task.id)}
                            className={`rounded-[0.85rem] px-3 py-2.5 text-left transition-all duration-150 ${
                              isActive
                                ? "bg-[#fffaf2] text-[#17181b] shadow-[0_10px_26px_rgba(0,0,0,0.12)] dark:bg-[#f3efe8]"
                                : "app-surface-strong hover:shadow-md"
                            }`}
                          >
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-[12px] font-medium leading-snug">{task.title}</p>
                              {orderNumber && (
                                <span className={`rounded-full px-2 py-[4px] text-[9px] font-semibold uppercase tracking-[0.14em] ${isActive ? "bg-black/[0.08] text-black/55" : "bg-black/[0.04] theme-muted dark:bg-white/[0.08]"}`}>
                                  Step {orderNumber}
                                </span>
                              )}
                            </div>
                            <div className={`mt-1.5 flex flex-wrap items-center gap-1.5 text-[10px] ${isActive ? "text-black/50" : "theme-muted"}`}>
                              <span className="rounded-full bg-black/[0.05] px-2 py-1 dark:bg-white/[0.08]">{task.owner}</span>
                              <span className="rounded-full bg-black/[0.05] px-2 py-1 dark:bg-white/[0.08]">Due {formatDueDate(task.dueDate)}</span>
                            </div>
                          </button>
                        );
                      })}
                      {tasksInCol.length === 0 && (
                        <div className="flex min-h-[60px] items-center justify-center rounded-[0.85rem] border border-dashed border-black/[0.06]">
                          <span className="text-[10px] text-ink-muted/25">—</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        <section className="overflow-hidden rounded-[1.5rem] border border-black/[0.05] bg-white/55 px-5 py-5 shadow-[0_10px_30px_rgba(32,24,16,0.04)] backdrop-blur-sm dark:border-white/[0.08] dark:bg-white/[0.03] sm:px-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] theme-muted">Your tasks</p>
              <h2 className="mt-2 text-[16px] font-semibold theme-fg">Your current focus</h2>
            </div>
            <span className="rounded-full bg-black/[0.04] px-3 py-1 text-[11px] font-semibold theme-muted dark:bg-white/[0.06]">
              {personalTasks.length} task{personalTasks.length === 1 ? "" : "s"}
            </span>
          </div>

          <div className="mt-4 overflow-hidden rounded-[1.2rem] border border-black/[0.05] bg-white/36 dark:border-white/[0.08] dark:bg-white/[0.02]">
            {personalTasks.length > 0 ? (
              personalTasks.map((task, index) => (
                <button
                  key={task.id}
                  type="button"
                  onClick={() => handleSelectTask(subprojects.find((sp) => sp.title === task.subprojectTitle)?.id ?? selectedSubprojectId, task.id)}
                  className={`w-full px-4 py-4 text-left transition hover:bg-white/55 dark:hover:bg-white/[0.04] ${index !== personalTasks.length - 1 ? "border-b border-black/[0.05] dark:border-white/[0.08]" : ""}`}
                >
                  <div className="grid items-center gap-3 sm:grid-cols-[auto_minmax(0,1fr)_auto]">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-black/[0.05] text-[12px] font-semibold theme-fg dark:bg-white/[0.06]">
                      {getTaskOrderNumber(task.id) ?? index + 1}
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-[14px] font-semibold tracking-tight theme-fg">{task.title}</p>
                        <span className="rounded-full bg-black/[0.04] px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.16em] theme-muted dark:bg-white/[0.06]">
                          {task.subprojectTitle}
                        </span>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] theme-muted">
                        <span className="inline-flex items-center gap-2 rounded-full bg-black/[0.04] px-2.5 py-1 dark:bg-white/[0.06] dark:text-[var(--fg)]">
                          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white/75 text-[9px] font-semibold text-[#4a4137] dark:bg-[#24272d] dark:text-[var(--fg)]">
                            {getAssigneeMeta(task.owner).initials}
                          </span>
                          {task.owner}
                        </span>
                        <span className={`inline-flex items-center rounded-full px-2.5 py-1 ${getDueDateMeta(task.dueDate).tone === "late" ? "bg-[#fff0eb] text-[#c96d4f] dark:bg-[#3a241f] dark:text-[#ffbea7]" : getDueDateMeta(task.dueDate).tone === "soon" ? "bg-[#fff7e7] text-[#b5842d] dark:bg-[#382d15] dark:text-[#f4ca75]" : "bg-black/[0.04] theme-muted dark:bg-white/[0.06] dark:text-[var(--muted)]"}`}>
                          Due {getDueDateMeta(task.dueDate).label}
                        </span>
                      </div>
                    </div>
                    <div className="shrink-0">
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] ${task.status === "done" ? "bg-emerald-500/12 text-emerald-700 dark:bg-emerald-400/14 dark:text-emerald-200/90" : task.status === "building" ? "bg-violet-500/12 text-violet-700 dark:bg-violet-400/14 dark:text-violet-200/90" : task.status === "review" ? "bg-amber-500/14 text-amber-700 dark:bg-amber-400/16 dark:text-amber-200/90" : "bg-stone-500/10 text-stone-600 dark:bg-stone-400/12 dark:text-stone-200/80"}`}>
                        {statusLabel[task.status]}
                      </span>
                    </div>
                  </div>
                </button>
              ))
            ) : (
              <div className="rounded-[1.15rem] border border-dashed border-black/[0.08] px-4 py-5 text-[13px] leading-relaxed theme-soft dark:border-white/[0.12]">
                Nothing is assigned to you right now. Assign yourself a task to keep your next actions visible here.
              </div>
            )}
          </div>
        </section>

        {/* ═══════════════════ VERSION CONTROL ═══════════════════ */}
        {/* Removed — now lives compact in hero header */}
      </div>

      {/* ═══════════════════ ADD SUBPROJECT MODAL ═══════════════════ */}
      {showSubprojectCreator && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <button
            type="button"
            aria-label="Close"
            onClick={() => setShowSubprojectCreator(false)}
            className="absolute inset-0 bg-black/20 backdrop-blur-sm"
          />
          <div className="relative w-full max-w-md rounded-[1.5rem] bg-white p-6 shadow-2xl ring-1 ring-black/[0.06]">
            <h3 className="text-[16px] font-semibold text-ink">New subproject</h3>
            <div className="mt-4 grid gap-3">
              <input
                value={newSubprojectTitle}
                onChange={(e) => setNewSubprojectTitle(e.target.value)}
                placeholder="Subproject name"
                className="rounded-xl border border-black/[0.06] bg-[#faf8f4] px-4 py-3 text-[14px] text-ink outline-none placeholder:text-ink-muted/50"
              />
              <textarea
                value={newSubprojectGoal}
                onChange={(e) => setNewSubprojectGoal(e.target.value)}
                rows={3}
                placeholder="What is it for? (optional)"
                className="resize-none rounded-xl border border-black/[0.06] bg-[#faf8f4] px-4 py-3 text-[14px] text-ink outline-none placeholder:text-ink-muted/50"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowSubprojectCreator(false)}
                  className="btn-ghost px-4 py-2.5 text-[13px]"
                >
                  Cancel
                </button>
                <button type="button" onClick={handleAddSubproject} className="btn-primary px-5 py-2.5 text-[13px]">
                  Add
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════ TASK DETAIL DRAWER ═══════════════════ */}

      {showTaskDetails && selectedTask && (
        <div className="fixed inset-0 z-[70]">
          <button
            type="button"
            aria-label="Close"
            onClick={() => {
              setShowTaskDetails(false);
              setShowAssigneePicker(false);
              setShowDueDatePicker(false);
            }}
            className="absolute inset-0 bg-black/20 backdrop-blur-[6px]"
          />
          <div className="pointer-events-none absolute inset-y-0 right-0 flex w-full justify-end p-3 sm:p-5 lg:p-6">
            <div className="drawer-panel pointer-events-auto flex h-full w-full max-w-[580px] flex-col overflow-hidden rounded-[2rem] bg-[#111] text-white shadow-2xl ring-1 ring-white/10 xl:max-w-[640px]">

              {/* close */}
              <div className="flex justify-end px-5 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowTaskDetails(false);
                    setShowAssigneePicker(false);
                    setShowDueDatePicker(false);
                  }}
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-white/8 text-white/60 transition hover:bg-white/12"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                    <path
                      fillRule="evenodd"
                      d="M4.22 4.22a.75.75 0 011.06 0L10 8.94l4.72-4.72a.75.75 0 111.06 1.06L11.06 10l4.72 4.72a.75.75 0 11-1.06 1.06L10 11.06l-4.72 4.72a.75.75 0 01-1.06-1.06L8.94 10 4.22 5.28a.75.75 0 010-1.06z"
                      clipRule="evenodd"
                    />
                  </svg>
                </button>
              </div>

              {/* body */}
              <div className="custom-scroll flex-1 overflow-y-auto px-6 pb-6">
                {/* title */}
                <h2 className="display-font text-[1.5rem] font-semibold leading-tight tracking-tight">
                  {selectedTask.title}
                </h2>

                {/* interactive status selector */}
                <div className="mt-5 flex flex-wrap gap-2">
                  {allStatuses.map((s) => {
                    const active = selectedTask.status === s;
                    return (
                      <button
                        key={s}
                        type="button"
                        onClick={() => handleChangeTaskStatus(selectedTask.id, s)}
                        className={`flex items-center gap-2 rounded-full px-3.5 py-2 text-[12px] font-medium transition-all ${
                          active
                            ? "bg-white/15 text-white ring-1 ring-white/20"
                            : "text-white/35 hover:bg-white/[0.05] hover:text-white/60"
                        }`}
                      >
                        <span
                          className={`h-2 w-2 rounded-full transition-all ${active ? "scale-125" : ""}`}
                          style={{ backgroundColor: statusColor[s] }}
                        />
                        {statusLabel[s]}
                      </button>
                    );
                  })}
                </div>

                <div className="mt-6">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setShowAssigneePicker((current) => !current);
                        setShowDueDatePicker(false);
                      }}
                      className={`inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-[12px] font-medium transition ${showAssigneePicker ? "bg-white text-[#141414] shadow-[0_12px_28px_rgba(255,255,255,0.12)]" : "bg-white/[0.06] text-white/78 hover:bg-white/[0.1] hover:text-white"}`}
                    >
                      <span className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-semibold ${showAssigneePicker ? "bg-black/8" : "bg-white/[0.08]"}`}>
                        {getAssigneeMeta(selectedTask.owner).initials}
                      </span>
                      Assign: {selectedTask.owner}
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setShowDueDatePicker((current) => !current);
                        setShowAssigneePicker(false);
                      }}
                      className={`inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-[12px] font-medium transition ${showDueDatePicker ? "bg-white text-[#141414] shadow-[0_12px_28px_rgba(255,255,255,0.12)]" : "bg-white/[0.06] text-white/78 hover:bg-white/[0.1] hover:text-white"}`}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                        <path fillRule="evenodd" d="M5.75 2a.75.75 0 01.75.75V4h7V2.75a.75.75 0 011.5 0V4h.25A2.25 2.25 0 0117.5 6.25v8A2.25 2.25 0 0115.25 16.5h-10A2.25 2.25 0 013 14.25v-8A2.25 2.25 0 015.25 4H5V2.75A.75.75 0 015.75 2zM4.5 8v6.25c0 .414.336.75.75.75h10a.75.75 0 00.75-.75V8h-11.5z" clipRule="evenodd" />
                      </svg>
                      Due: {formatDueDate(selectedTask.dueDate)}
                    </button>
                  </div>

                  {showAssigneePicker && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {assignablePeople.map((person) => {
                        const active = selectedTask.owner === person.name;

                        return (
                          <button
                            key={person.name}
                            type="button"
                            onClick={() => handleAssignTask(selectedTask.id, person.name)}
                            className={`inline-flex items-center gap-2 rounded-full px-3 py-2 text-[12px] font-medium transition ${active ? "bg-white text-[#141414] shadow-[0_12px_28px_rgba(255,255,255,0.12)]" : "bg-white/[0.06] text-white/72 hover:bg-white/[0.1] hover:text-white"}`}
                          >
                            <span className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-semibold ${active ? "bg-black/8" : "bg-white/[0.08]"}`}>
                              {person.initials}
                            </span>
                            {person.name}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {showDueDatePicker && (
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleSetRelativeDueDate(selectedTask.id, 0)}
                        className="rounded-full bg-white/[0.06] px-3 py-2 text-[11px] font-medium text-white/72 transition hover:bg-white/[0.1] hover:text-white"
                      >
                        Today
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSetRelativeDueDate(selectedTask.id, 3)}
                        className="rounded-full bg-white/[0.06] px-3 py-2 text-[11px] font-medium text-white/72 transition hover:bg-white/[0.1] hover:text-white"
                      >
                        +3 days
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSetRelativeDueDate(selectedTask.id, 7)}
                        className="rounded-full bg-white/[0.06] px-3 py-2 text-[11px] font-medium text-white/72 transition hover:bg-white/[0.1] hover:text-white"
                      >
                        +1 week
                      </button>
                      <label className="inline-flex items-center rounded-full border border-white/10 bg-black/20 px-3.5 py-2 text-[12px] text-white/82">
                        <span className="mr-2 text-white/45">Pick</span>
                        <input
                          type="date"
                          value={selectedTask.dueDate}
                          onChange={(e) => handleChangeTaskDueDate(selectedTask.id, e.target.value)}
                          className="bg-transparent text-[12px] text-white outline-none"
                        />
                      </label>
                    </div>
                  )}
                </div>

                <div className="mt-6 rounded-[1.25rem] border border-white/8 bg-white/[0.03] p-4">
                  <div className="flex items-start justify-between gap-3 border-b border-white/8 pb-3">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/42">Conversation history</p>
                    </div>
                    <span className="rounded-full bg-white/[0.06] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/58">
                      {selectedTaskConversations.length} thread{selectedTaskConversations.length === 1 ? "" : "s"}
                    </span>
                  </div>

                  <div className="mt-4 space-y-3">
                    {selectedTaskConversations.length > 0 ? (
                      selectedTaskConversations.map((thread) => {
                        const lastMessage = thread.messages[thread.messages.length - 1];

                        return (
                          <Link
                            key={thread.id}
                            href={`/project/chat?task=${encodeURIComponent(selectedTask.id)}&thread=${encodeURIComponent(thread.id)}`}
                            className="block rounded-[0.95rem] border border-white/8 bg-white/[0.025] px-4 py-3 transition hover:border-white/14 hover:bg-white/[0.04]"
                          >
                            <div className="flex items-center justify-between gap-3">
                              <div className="min-w-0 flex-1">
                                <p className="text-[13px] font-semibold text-white">{thread.title}</p>
                                <p className="mt-1 text-[11px] text-white/45">{thread.agentName} • {thread.updatedAgo}</p>
                              </div>
                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 shrink-0 text-white/34">
                                <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
                              </svg>
                            </div>

                            <div className="mt-3 space-y-2 border-t border-white/8 pt-3">
                              <p className="line-clamp-1 text-[12px] leading-relaxed text-white/62">{thread.summary}</p>
                              {lastMessage && (
                                <div className="flex items-start gap-2 text-[11px] leading-relaxed">
                                  <span className="shrink-0 rounded-full bg-white/[0.05] px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-white/46">
                                    {lastMessage.from}
                                  </span>
                                  <p className={`line-clamp-1 ${lastMessage.isAI ? "text-white/62" : "text-white/82"}`}>
                                    {lastMessage.text}
                                  </p>
                                </div>
                              )}
                            </div>
                          </Link>
                        );
                      })
                    ) : (
                      <div className="rounded-[1rem] border border-dashed border-white/12 bg-black/15 px-4 py-4 text-[12px] leading-relaxed text-white/52">
                        No conversation history yet. Start working on this task to create the first thread.
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* footer */}
              <div className="border-t border-white/8 px-5 py-4 flex flex-col gap-2.5">
                <Link
                  href={`/project/chat?task=${encodeURIComponent(selectedTask.id)}`}
                  className="flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-[#a78bfa] to-[#34d399] px-5 py-3 text-[13px] font-semibold text-white shadow-[0_8px_24px_rgba(167,139,250,0.25)] transition hover:shadow-[0_12px_32px_rgba(167,139,250,0.35)] hover:brightness-110"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                    <path fillRule="evenodd" d="M2 10a.75.75 0 01.75-.75h12.59l-2.1-1.95a.75.75 0 111.02-1.1l3.5 3.25a.75.75 0 010 1.1l-3.5 3.25a.75.75 0 11-1.02-1.1l2.1-1.95H2.75A.75.75 0 012 10z" clipRule="evenodd" />
                  </svg>
                  Start working on this task
                </Link>
                <Link
                  href={`/project/chat?ask=${encodeURIComponent(selectedTask.id)}`}
                  className="flex items-center justify-center gap-2 rounded-full bg-white/[0.06] px-5 py-3 text-[13px] font-medium text-white/70 ring-1 ring-white/10 transition hover:bg-white/[0.1] hover:text-white"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                    <path fillRule="evenodd" d="M10 2c-2.236 0-4.43.18-6.57.524C1.993 2.755 1 4.014 1 5.426v5.148c0 1.413.993 2.67 2.43 2.902 1.168.188 2.352.327 3.55.414.28.02.521.18.642.413l1.713 3.293a.75.75 0 001.33 0l1.713-3.293a.783.783 0 01.642-.413 41.102 41.102 0 003.55-.414c1.437-.231 2.43-1.49 2.43-2.902V5.426c0-1.413-.993-2.67-2.43-2.902A41.289 41.289 0 0010 2zM6.75 6a.75.75 0 000 1.5h6.5a.75.75 0 000-1.5h-6.5zm0 2.5a.75.75 0 000 1.5h3.5a.75.75 0 000-1.5h-3.5z" clipRule="evenodd" />
                  </svg>
                  Ask the project manager about this task
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
