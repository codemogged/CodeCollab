"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useActiveDesktopProject } from "@/hooks/use-active-desktop-project";
import ActivityStream from "@/components/activity-stream-v2";
import { useStreamEvents } from "@/hooks/use-stream-events";
import { RunInTerminalButton } from "@/components/run-in-terminal-button";

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
  planned: "var(--text-ghost)",
  building: "var(--violet)",
  review: "var(--sun)",
  done: "var(--mint)",
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

// Module-scoped set of project ids we've already done an initial git-sync for
// during this app session. The workspace page remounts on every navigation, so
// a per-component ref would trigger a fresh git fetch on every visit — that's
// the main cause of the 5-10 s freeze the user was seeing. P2P keeps things
// live once the first sync completes, so we only need to run it once.
const SYNCED_PROJECTS = new Set<string>();

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
                  <div className="flex items-center gap-2">
                    <RunInTerminalButton code={code} lang={lang} variant="muted" />
                    <button type="button" onClick={() => { try { navigator.clipboard.writeText(code); } catch { /* */ } }} className="text-[10px] font-medium text-white/30 transition hover:text-white/60">Copy</button>
                  </div>
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
  const { events: helpEvents, processChunk: helpProcessChunk, startStreaming: helpStartStreaming, finalize: helpFinalize, reset: helpResetEvents, getRawText: helpGetRawText } = useStreamEvents();
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
    helpStreamRef.current = "";
    helpStartStreaming();

    const stop = window.electronAPI.project.onAgentOutput((event) => {
      if (event.scope !== "solo-chat") return;
      const chunk = event.chunk ?? "";
      if (chunk) {
        helpStreamRef.current += chunk;
        helpProcessChunk(chunk);
      }
    });
    return () => { stop(); };
  }, [helpStreaming, helpStartStreaming, helpProcessChunk]);

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
    await helpFinalize();
    setHelpResponses((prev) => ({ ...prev, [item.id]: helpGetRawText() || helpStreamRef.current || "Done." }));
    helpResetEvents();
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
    await helpFinalize();
    // Save streaming response to chat history
    const finalResponse = helpGetRawText() || helpStreamRef.current;
    setHelpResponses((prev) => ({ ...prev, [item.id]: finalResponse || "Done." }));
    if (finalResponse) {
      setChatHistories((prev) => ({
        ...prev,
        [item.id]: [...(prev[item.id] ?? []), { role: "agent", text: finalResponse }],
      }));
    }
    helpResetEvents();
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
                        {isStreaming && helpEvents.length > 0 ? (
                          <ActivityStream
                            events={helpEvents}
                            rawText={helpGetRawText()}
                            isStreaming={isStreaming}
                          />
                        ) : helpResponses[item.id] ? (
                          <ActivityStream
                            text={helpResponses[item.id]}
                          />
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

/* ─── status dropdown ─── */

function StatusDropdown({
  value,
  onChange,
  size = "sm",
  className = "",
}: {
  value: BuildTaskStatus;
  onChange: (next: BuildTaskStatus) => void;
  size?: "sm" | "md";
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const tone = (status: BuildTaskStatus) => (
    status === "done" ? "bg-mint/15 text-mint ring-mint/30" :
    status === "building" ? "bg-violet/15 text-violet ring-violet/30" :
    status === "review" ? "bg-sun/15 text-sun ring-sun/30" :
    "bg-text-ghost/10 text-text-dim ring-text-ghost/20"
  );

  const sizeCls = size === "md"
    ? "px-3 py-1.5 text-[11px]"
    : "px-2 py-0.5 text-[9.5px]";

  return (
    <div ref={rootRef} className={`relative inline-block ${className}`}>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        className={`inline-flex items-center gap-1 rounded-full font-semibold uppercase tracking-[0.08em] ring-1 transition ${tone(value)} ${sizeCls}`}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: statusColor[value] }} />
        {statusLabel[value]}
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-2.5 w-2.5 opacity-70"><path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" /></svg>
      </button>
      {open ? (
        <div role="listbox" className="absolute right-0 top-full z-50 mt-1 w-36 overflow-hidden rounded-xl border border-edge bg-stage shadow-[0_16px_36px_rgba(0,0,0,0.18)] ring-1 ring-black/[0.04]">
          {allStatuses.map((s) => {
            const active = s === value;
            return (
              <button
                key={s}
                type="button"
                role="option"
                aria-selected={active}
                onClick={(e) => { e.stopPropagation(); onChange(s); setOpen(false); }}
                className={`flex w-full items-center gap-2 px-3 py-2 text-left text-[11.5px] font-medium transition ${active ? "bg-text-ghost/10 text-text" : "text-text-mid hover:bg-text-ghost/[0.06] hover:text-text"}`}
              >
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: statusColor[s] }} />
                <span className="flex-1">{statusLabel[s]}</span>
                {active ? (
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3 w-3 text-text-dim"><path fillRule="evenodd" d="M16.704 5.296a1 1 0 010 1.408l-8 8a1 1 0 01-1.408 0l-4-4a1 1 0 011.408-1.408L8 12.584l7.296-7.296a1 1 0 011.408 0z" clipRule="evenodd" /></svg>
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

/* ─── page ─── */

export default function ProjectPage() {
  const { activeProject, canUseDesktopProject } = useActiveDesktopProject();
  const router = useRouter();
  const plan = (activeProject?.dashboard.plan ?? null) as ProjectPlan | null;
  const taskConversationThreads = (activeProject?.dashboard.taskThreads ?? []) as ProjectTaskThread[];
  // Order arrays derived from plan — only recompute when the plan reference changes.
  const { initialSubprojectOrder, initialTaskOrder } = useMemo(() => {
    const ssp = plan?.buildOrder?.map((step) => step.subprojectId) ?? [];
    const sto = plan?.buildOrder?.flatMap((step) => step.taskIds) ?? [];
    const isp = [...new Set([...ssp, ...(plan?.subprojects.map((sp) => sp.id) ?? [])])];
    const ito = [...new Set([...sto, ...(plan?.subprojects.flatMap((sp) => sp.tasks.map((task) => task.id)) ?? [])])];
    return {
      initialSubprojectOrder: isp,
      initialTaskOrder: ito,
    };
  }, [plan]);
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
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());
  const [inlineAssignTaskId, setInlineAssignTaskId] = useState<string | null>(null);
  const [inlineNotesTaskId, setInlineNotesTaskId] = useState<string | null>(null);
  const [editingNoteText, setEditingNoteText] = useState("");
  const [inlineSpDetailsId, setInlineSpDetailsId] = useState<string | null>(null);
  const [inlineSpAssignId, setInlineSpAssignId] = useState<string | null>(null);
  const [editingSpGoalText, setEditingSpGoalText] = useState("");
  // Drag & drop state
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [dragOverTaskId, setDragOverTaskId] = useState<string | null>(null);
  const [draggedSpId, setDraggedSpId] = useState<string | null>(null);
  const [dragOverSpId, setDragOverSpId] = useState<string | null>(null);
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

  // People you can assign a task to: yourself + the AI + anyone currently
  // connected as a P2P peer on this project + any historical assignee stored
  // in the plan (so teammates who are offline stay assignable).
  const assignablePeople = useMemo(() => {
    const base: Array<{ name: string; initials: string }> = [
      { name: currentUserName, initials: currentUserInitials },
      { name: "Project Manager", initials: "✦" },
    ];
    const seen = new Set(base.map((p) => p.name.toLowerCase()));
    for (const peer of p2pPeers) {
      const key = (peer.name || "").toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      base.push({ name: peer.name, initials: peer.initials || peer.name.slice(0, 2).toUpperCase() });
    }
    // Historical roster: harvest every owner name that has ever been saved
    // into the plan. This makes offline teammates appear in the picker.
    for (const sp of subprojects) {
      const spAgent = (sp.agentName || "").trim();
      if (spAgent) {
        const key = spAgent.toLowerCase();
        if (!seen.has(key)) {
          seen.add(key);
          base.push({ name: spAgent, initials: spAgent.slice(0, 2).toUpperCase() });
        }
      }
      for (const t of sp.tasks) {
        const owner = (t.owner || "").trim();
        if (!owner) continue;
        const key = owner.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        base.push({ name: owner, initials: owner.slice(0, 2).toUpperCase() });
      }
    }
    return base;
  }, [currentUserName, currentUserInitials, p2pPeers, subprojects]);

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
  // After initial sync, P2P handles real-time updates so no interval needed.
  // Deferred to idle time so it doesn't fight the first paint / hover responsiveness.
  //
  // Module-scoped guard (not a ref): the workspace page unmounts and remounts
  // on every navigation to /project. A per-instance ref would re-run the
  // expensive git fetch on every visit, re-blocking the main process for
  // several seconds each time. We only want to silent-sync once per project
  // per app session (P2P keeps us live after that). See SYNCED_PROJECTS below.
  useEffect(() => {
    if (!activeProject?.id || !hasRemote) return;
    if (SYNCED_PROJECTS.has(activeProject.id)) return;
    SYNCED_PROJECTS.add(activeProject.id);

    const w = window as unknown as { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => void };
    const schedule = (cb: () => void) => {
      if (typeof w.requestIdleCallback === "function") w.requestIdleCallback(cb, { timeout: 2500 });
      else setTimeout(cb, 250);
    };
    schedule(() => { void doSilentSync(); });
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

      // Apply drag/drop reorder events from peers. Reorders are pure UI
      // state on top of the plan, so we don't round-trip them through the
      // plan save — just set our local order arrays directly.
      if (event.category === "task-order" && Array.isArray(event.data?.taskOrder)) {
        setTaskOrder(event.data.taskOrder as string[]);
      }
      if (event.category === "subproject-order" && Array.isArray(event.data?.subprojectOrder)) {
        setSubprojectOrder(event.data.subprojectOrder as string[]);
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

  // Auto-import synced plan from .codebuddy/plan.json if the project has no plan yet.
  // Guarded so it runs at most once per project after mount and doesn't block the first paint.
  const importAttemptedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!activeProject?.id || plan) return;
    if (importAttemptedRef.current === activeProject.id) return;
    importAttemptedRef.current = activeProject.id;
    let cancelled = false;
    const schedule = (cb: () => void) => {
      const w = window as unknown as { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => void };
      if (typeof w.requestIdleCallback === "function") w.requestIdleCallback(cb, { timeout: 1500 });
      else setTimeout(cb, 120);
    };
    schedule(async () => {
      try {
        const result = await window.electronAPI?.project?.importSyncedPlan(activeProject.id);
        if (result?.imported && !cancelled) {
          console.log("[workspace] Auto-imported synced plan:", result.subprojects, "subprojects");
        }
      } catch (err) {
        console.warn("[workspace] Plan auto-import failed:", err);
      }
    });
    return () => { cancelled = true; };
  }, [activeProject?.id, plan]);

  const workspaceTitle = activeProject?.name ?? "Project workspace";
  const workspaceSubtitle = activeProject?.description ?? "Open a real project to see its dashboard.";
  const hasRealProjectWithoutPlan = Boolean(activeProject && !plan);
  const hasNoActiveDesktopProject = Boolean(canUseDesktopProject && !activeProject);

  /* derived — memoized so we don't redo O(n²) sorts on every render
     (every settings:changed / P2P tick / drag-over used to refire these). */
  const taskIndex = useMemo(() => {
    const m = new Map<string, number>();
    for (let i = 0; i < taskOrder.length; i++) m.set(taskOrder[i], i);
    return m;
  }, [taskOrder]);
  const subprojectIndex = useMemo(() => {
    const m = new Map<string, number>();
    for (let i = 0; i < subprojectOrder.length; i++) m.set(subprojectOrder[i], i);
    return m;
  }, [subprojectOrder]);
  const subprojectById = useMemo(() => {
    const m = new Map<string, ProjectSubproject>();
    for (const sp of subprojects) m.set(sp.id, sp);
    return m;
  }, [subprojects]);

  const orderedSubprojects = useMemo(() => {
    const out: ProjectSubproject[] = [];
    for (const id of subprojectOrder) {
      const sp = subprojectById.get(id);
      if (sp) out.push(sp);
    }
    return out;
  }, [subprojectOrder, subprojectById]);

  const allTasks = useMemo(() => {
    const out: ProjectTask[] = [];
    for (const sp of orderedSubprojects) {
      const sorted = [...sp.tasks].sort(
        (a, b) => (taskIndex.get(a.id) ?? 0) - (taskIndex.get(b.id) ?? 0),
      );
      for (const t of sorted) out.push(t);
    }
    return out;
  }, [orderedSubprojects, taskIndex]);

  const overallProgress = useMemo(() => {
    if (allTasks.length === 0) return 0;
    let done = 0;
    for (const t of allTasks) if (t.status === "done") done++;
    return Math.round((done / allTasks.length) * 100);
  }, [allTasks]);

  const selectedSubproject = orderedSubprojects.find((sp) => sp.id === selectedSubprojectId) ?? orderedSubprojects[0] ?? null;
  const selectedTask = allTasks.find((t) => t.id === selectedTaskId) ?? selectedSubproject?.tasks[0] ?? null;
  const selectedTaskConversations = selectedTask
    ? taskConversationThreads.filter((thread) => thread.taskId === selectedTask.id)
    : [];
  const personalTasks = useMemo(() => {
    const out: Array<ProjectTask & { subprojectTitle: string }> = [];
    for (const sp of orderedSubprojects) {
      for (const task of sp.tasks) {
        if (task.owner === currentUserName) out.push({ ...task, subprojectTitle: sp.title });
      }
    }
    out.sort((a, b) => (taskIndex.get(a.id) ?? 0) - (taskIndex.get(b.id) ?? 0));
    return out;
  }, [orderedSubprojects, taskIndex, currentUserName]);

  const getAssigneeMeta = (name: string) =>
    assignablePeople.find((person) => person.name === name) ?? { name, initials: name.slice(0, 2).toUpperCase() };
  const getSubprojectOrderNumber = (subprojectId: string) => {
    const idx = subprojectIndex.get(subprojectId);
    return idx === undefined ? null : idx + 1;
  };
  const getTaskOrderNumber = (taskId: string) => {
    const idx = taskIndex.get(taskId);
    return idx === undefined ? null : idx + 1;
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
    // Stay on the workspace page after creating — don't auto-open the task card.
    setShowTaskDetails(false);
    setNewTaskTitle("");
    setNewTaskNote("");
    setNewTaskOwner(currentUserName);
    setNewTaskDueDate("2026-03-31");
  };

  const handleSelectTask = (spId: string, taskId: string) => {
    setSelectedSubprojectId(spId);
    setSelectedTaskId(taskId);
    // Navigate directly to chat for this task
    router.push(`/project/chat?task=${encodeURIComponent(taskId)}`);
  };

  const handleChangeTaskStatus = (taskId: string, newStatus: BuildTaskStatus) => {
    console.log("[task-change] Status:", taskId, "→", newStatus, "planLoaded:", planLoadedRef.current, "p2p:", p2pJoined);
    // We only suppress the full-plan broadcast when the cascade did NOT
    // move the parent subproject. If the subproject status changed too,
    // the peer needs the full plan so its subproject pill stays in sync.
    let cascadedSubproject = false;
    setSubprojects((cur) =>
      cur.map((sp) => {
        if (!sp.tasks.some((t) => t.id === taskId)) return sp;
        const nextTasks = sp.tasks.map((t) =>
          t.id === taskId ? { ...t, status: newStatus } : t
        );
        // Auto-advance subproject: if all tasks done → subproject done. If any task building → subproject building.
        let nextSpStatus: BuildTaskStatus = sp.status;
        if (nextTasks.length > 0) {
          if (nextTasks.every((t) => t.status === "done")) {
            nextSpStatus = "done";
          } else if (sp.status === "done") {
            // someone re-opened a task — move subproject back to building
            nextSpStatus = "building";
          } else if (nextTasks.some((t) => t.status === "building") && sp.status === "planned") {
            nextSpStatus = "building";
          }
        }
        if (nextSpStatus !== sp.status) cascadedSubproject = true;
        return { ...sp, tasks: nextTasks, status: nextSpStatus };
      })
    );
    // If only the task moved, the dedicated `tasks` broadcast is enough and
    // we can skip the debounced full-plan push (saves a git round-trip).
    // If the subproject also cascaded, we let the plan save fire so peers
    // receive both changes atomically.
    taskStatusOnlyRef.current = !cascadedSubproject;

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

  const handleChangeSubprojectStatus = (spId: string, newStatus: BuildTaskStatus) => {
    setSubprojects((cur) =>
      cur.map((sp) => (sp.id === spId ? { ...sp, status: newStatus, updatedAgo: "Just now" } : sp))
    );
  };

  const handleAssignSubproject = (spId: string, personName: string) => {
    setSubprojects((cur) =>
      cur.map((sp) => (sp.id === spId ? { ...sp, agentName: personName, updatedAgo: "Just now" } : sp))
    );
  };

  const handleUpdateSubprojectGoal = (spId: string, nextGoal: string) => {
    setSubprojects((cur) =>
      cur.map((sp) => (sp.id === spId ? { ...sp, goal: nextGoal, updatedAgo: "Just now" } : sp))
    );
  };

  const handleOpenTaskDetails = (spId: string, taskId: string) => {
    // Open inline drawer without navigating away from the workspace page
    setSelectedSubprojectId(spId);
    setSelectedTaskId(taskId);
    setShowTaskDetails(true);
  };

  const handleReorderTasks = (draggedId: string, targetId: string) => {
    if (draggedId === targetId) return;
    setTaskOrder((cur) => {
      const next = cur.filter((id) => id !== draggedId);
      const targetIndex = next.indexOf(targetId);
      if (targetIndex < 0) return [...next, draggedId];
      next.splice(targetIndex, 0, draggedId);
      return next;
    });
    // Reorders only update the taskOrder state (a UI layer on top of the
    // plan), not subprojects. The debounced plan save doesn't see a change,
    // so peers never learn about the new order. Broadcast a dedicated order
    // event that the other side applies to its own taskOrder list.
    if (p2pJoined && activeProject?.id) {
      window.electronAPI?.p2p?.broadcastStateChange({
        projectId: activeProject.id,
        category: "task-order",
        id: activeProject.id,
        data: { taskOrder: (() => {
          const next = taskOrder.filter((id) => id !== draggedId);
          const targetIndex = next.indexOf(targetId);
          if (targetIndex < 0) next.push(draggedId); else next.splice(targetIndex, 0, draggedId);
          return next;
        })() },
      });
    }
  };

  const handleReorderSubprojects = (draggedId: string, targetId: string) => {
    if (draggedId === targetId) return;
    setSubprojectOrder((cur) => {
      const next = cur.filter((id) => id !== draggedId);
      const targetIndex = next.indexOf(targetId);
      if (targetIndex < 0) return [...next, draggedId];
      next.splice(targetIndex, 0, draggedId);
      return next;
    });
    if (p2pJoined && activeProject?.id) {
      window.electronAPI?.p2p?.broadcastStateChange({
        projectId: activeProject.id,
        category: "subproject-order",
        id: activeProject.id,
        data: { subprojectOrder: (() => {
          const next = subprojectOrder.filter((id) => id !== draggedId);
          const targetIndex = next.indexOf(targetId);
          if (targetIndex < 0) next.push(draggedId); else next.splice(targetIndex, 0, draggedId);
          return next;
        })() },
      });
    }
  };

  const handleDeleteTask = (taskId: string) => {
    setSubprojects((cur) =>
      cur.map((sp) => ({
        ...sp,
        tasks: sp.tasks.filter((t) => t.id !== taskId),
        updatedAgo: sp.tasks.some((t) => t.id === taskId) ? "Just now" : sp.updatedAgo,
      }))
    );
    setTaskOrder((cur) => cur.filter((id) => id !== taskId));
    if (selectedTaskId === taskId) {
      setSelectedTaskId("");
      setShowTaskDetails(false);
    }
    // The debounced plan save + broadcast will pick this up and sync peers.
  };

  const handleDeleteSubproject = (spId: string) => {
    const sp = subprojects.find((s) => s.id === spId);
    if (!sp) return;
    const taskIds = new Set(sp.tasks.map((t) => t.id));
    setSubprojects((cur) => cur.filter((s) => s.id !== spId));
    setSubprojectOrder((cur) => cur.filter((id) => id !== spId));
    setTaskOrder((cur) => cur.filter((id) => !taskIds.has(id)));
    if (selectedSubprojectId === spId) setSelectedSubprojectId("");
    if (taskIds.has(selectedTaskId)) {
      setSelectedTaskId("");
      setShowTaskDetails(false);
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
    setInlineAssignTaskId(null);
  };

  const handleUpdateTaskNote = (taskId: string, note: string) => {
    setSubprojects((cur) =>
      cur.map((sp) => ({
        ...sp,
        tasks: sp.tasks.map((task) =>
          task.id === taskId ? { ...task, note } : task
        ),
      }))
    );
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

  const toggleSection = (spId: string) => {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(spId)) next.delete(spId);
      else next.add(spId);
      return next;
    });
  };

  return (
    <div className="min-h-full text-text">
      <div className="px-4 py-6 pb-32 sm:px-6">
      <div className="mx-auto flex w-full max-w-[1800px] flex-col gap-0">

        {/* ═══════════════════ HEADER ═══════════════════ */}
        <header className="flex items-center justify-between border-b border-edge pb-3">
          <div className="flex items-center gap-3 min-w-0">
            <Link href="/home" className="text-[12px] text-text-dim hover:text-text-soft transition">← esc</Link>
            <span className="text-text-ghost">·</span>
            <h1 className="font-display text-[18px] font-semibold text-text truncate">{workspaceTitle}</h1>
          </div>

          <div className="flex items-center gap-3">
            {/* Quick nav */}
            <Link href="/project/chat" className="inline-flex items-center gap-1.5 rounded-lg bg-sun/10 px-3 py-1.5 text-[11px] font-semibold text-sun transition hover:bg-sun/15">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3 w-3">
                <path fillRule="evenodd" d="M10 2c-2.236 0-4.43.18-6.57.524C1.993 2.755 1 4.014 1 5.426v5.148c0 1.413.993 2.67 2.43 2.902 1.168.188 2.352.327 3.55.414.28.02.521.18.642.413l1.713 3.293a.75.75 0 001.33 0l1.713-3.293a.783.783 0 01.642-.413 41.102 41.102 0 003.55-.414c1.437-.231 2.43-1.49 2.43-2.902V5.426c0-1.413-.993-2.67-2.43-2.902A41.289 41.289 0 0010 2z" clipRule="evenodd" />
              </svg>
              Chat
            </Link>
            <Link href="/project/ide" className="inline-flex items-center gap-1.5 rounded-lg bg-stage-up px-3 py-1.5 text-[11px] font-semibold text-text-dim ring-1 ring-edge transition hover:bg-stage-up2 hover:text-text-mid">
              {'</>'}
              IDE
            </Link>

            {/* Fire ring progress */}
            <div
              className="relative flex-shrink-0"
              style={{
                width: 36,
                height: 36,
                borderRadius: "50%",
                background: `conic-gradient(var(--sun) 0deg, rgba(255,159,28,0.3) ${overallProgress * 3.6}deg, rgba(240,236,228,0.06) ${overallProgress * 3.6}deg)`,
                boxShadow: overallProgress > 0 ? "0 0 12px rgba(255,159,28,0.12)" : "none",
              }}
            >
              <div className="absolute inset-[4px] rounded-full bg-stage flex items-center justify-center">
                <span className="font-display text-[10px] font-bold text-sun">{overallProgress}%</span>
              </div>
            </div>
          </div>
        </header>

        {/* ═══════════════════ SYNC / P2P BAR ═══════════════════ */}
        <div className="flex flex-wrap items-center gap-2 py-2.5 border-b border-edge/50">
          {/* Version badge */}
          <span className="inline-flex items-center gap-1 rounded-full bg-violet/10 px-2.5 py-1 text-[10px] font-bold text-violet">
            v{currentVersion}
          </span>

          {/* Merge to main */}
          <button type="button" onClick={() => void handlePushToMain()} disabled={pushingToMain || !activeProject?.repoPath} className="inline-flex items-center gap-1 rounded-full bg-sky/10 px-2.5 py-1 text-[10px] font-semibold text-sky hover:bg-sky/20 disabled:opacity-50">
            {pushingToMain ? <><svg className="h-2.5 w-2.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>…</> : <>→ Merge to main</>}
          </button>
          {pushToMainResult && <span className={`rounded-full px-2 py-0.5 text-[9px] font-semibold ${pushToMainResult.ok ? "bg-sky/15 text-sky" : "bg-coral/15 text-coral"}`}>{pushToMainResult.message}</span>}

          <span className="text-text-ghost">·</span>
          {/* P2P status */}
          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold ${
            p2pJoined ? "bg-mint/15 text-mint" : p2pJoining ? "bg-sun/10 text-sun" : "bg-stage-up/60 text-text-ghost ring-1 ring-edge"
          }`}>
            {p2pJoining ? (
              <><svg className="h-2.5 w-2.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>Connecting…</>
            ) : p2pJoined ? (
              <><span className="relative flex h-1.5 w-1.5"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-mint opacity-75" /><span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-mint" /></span>Live</>
            ) : (
              <><span className="inline-flex h-1.5 w-1.5 rounded-full bg-text-ghost" />{hasRemote ? "Offline" : "No remote"}</>
            )}
          </span>

          {/* Peer avatars */}
          {p2pJoined && p2pPeers.length > 0 && (
            <div className="flex items-center gap-1.5">
              <div className="flex -space-x-1.5">
                {p2pPeers.slice(0, 5).map((peer) => (
                  <div key={peer.id} className="relative flex h-5 w-5 items-center justify-center rounded-full bg-aqua/15 text-[8px] font-bold text-aqua ring-1 ring-stage" title={`${peer.name} (${peer.status})`}>
                    {peer.initials}
                    <span className={`absolute -bottom-0.5 -right-0.5 h-1.5 w-1.5 rounded-full ring-1 ring-stage ${peer.status === "online" ? "bg-mint" : "bg-sun"}`} />
                  </div>
                ))}
              </div>
              <span className="text-[9px] text-text-dim">{p2pPeers.length} online</span>
            </div>
          )}
          {p2pJoined && p2pPeers.length === 0 && <span className="text-[9px] text-text-ghost">Waiting for teammates…</span>}

          {p2pError && <span className="rounded-full bg-coral/10 px-2 py-0.5 text-[9px] text-coral">{p2pError}</span>}

          {/* Invite friend */}
          {p2pJoined && (
            <button type="button" onClick={async () => {
              if (!activeProject?.repoPath) return;
              try {
                const remoteUrl = await window.electronAPI?.repo?.getRemoteUrl(activeProject.repoPath);
                if (!remoteUrl) { setP2pError("Push to GitHub first to invite friends"); return; }
                const result = await window.electronAPI?.p2p?.generateInvite({ remoteUrl, projectName: activeProject.name });
                if (result?.code) { setInviteCode(result.code); setInviteCopied(false); setInviteRemoteUrl(remoteUrl); }
              } catch { setP2pError("Could not generate invite code"); }
            }} className="inline-flex items-center gap-1 rounded-full bg-violet/10 px-2.5 py-1 text-[10px] font-semibold text-violet hover:bg-violet/15">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3 w-3"><path d="M11 5a3 3 0 11-6 0 3 3 0 016 0zM2.615 16.428a1.224 1.224 0 01-.569-1.175 6.002 6.002 0 0111.908 0c.058.467-.172.92-.57 1.174A9.953 9.953 0 018 18a9.953 9.953 0 01-5.385-1.572zM16.25 5.75a.75.75 0 00-1.5 0v2h-2a.75.75 0 000 1.5h2v2a.75.75 0 001.5 0v-2h2a.75.75 0 000-1.5h-2v-2z" /></svg>
              Invite
            </button>
          )}

          {/* Auto-sync */}
          {fileWatcherActive && (
            <span className="ml-auto flex items-center gap-1.5 text-[9px] text-text-dim">
              <span className={`inline-block h-1.5 w-1.5 rounded-full ${autoSyncing ? "bg-sun animate-pulse" : "bg-mint"}`} />
              {autoSyncing ? "Syncing…" : "Auto-sync"}
              {lastAutoSync && !autoSyncing ? ` · ${lastAutoSync}` : ""}
            </span>
          )}
        </div>

        {/* ═══════════════════ INVITE CODE POPUP ═══════════════════ */}
        {inviteCode && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-void/70 backdrop-blur-sm p-4" onClick={() => { setInviteCode(null); setInviteRemoteUrl(null); }}>
            <div
              className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-xl border border-violet/30 bg-stage px-4 py-3 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] font-semibold uppercase tracking-widest text-violet">Invite a collaborator</p>
                <button onClick={() => { setInviteCode(null); setInviteRemoteUrl(null); }} className="rounded-lg bg-stage-up px-2 py-1 text-[11px] text-text-ghost hover:bg-stage-up2 hover:text-text-dim">✕</button>
              </div>
              {(() => {
                const ghMatch = inviteRemoteUrl?.match(/github\.com[/:]([^/]+)\/([^/.]+)/);
                if (!ghMatch) return null;
                const collabUrl = `https://github.com/${ghMatch[1]}/${ghMatch[2]}/settings/access`;
                return (
                  <div className="mt-2 rounded-lg border border-mint/20 bg-mint/5 px-2.5 py-2">
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-mint/70">Step 1 — Give them GitHub access</p>
                    <ol className="mt-1.5 ml-4 list-decimal space-y-0.5 text-[11px] leading-relaxed text-text-dim">
                      <li>Open your repo&apos;s settings</li>
                      <li>Click <span className="font-semibold text-mint">Add people</span></li>
                      <li>Type their GitHub username &amp; invite</li>
                      <li>They must accept the email invite</li>
                    </ol>
                    <button type="button" onClick={() => window.electronAPI?.system?.openExternal?.(collabUrl)} className="mt-2 inline-flex items-center gap-1 rounded-lg bg-mint/20 px-2.5 py-1.5 text-[11px] font-semibold text-mint transition hover:bg-mint/30">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3 w-3"><path fillRule="evenodd" d="M4.25 5.5a.75.75 0 00-.75.75v8.5c0 .414.336.75.75.75h8.5a.75.75 0 00.75-.75v-4a.75.75 0 011.5 0v4A2.25 2.25 0 0112.75 17h-8.5A2.25 2.25 0 012 14.75v-8.5A2.25 2.25 0 014.25 4h5a.75.75 0 010 1.5h-5zm7.25-.75a.75.75 0 01.75-.75h3.5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0V6.31l-5.47 5.47a.75.75 0 01-1.06-1.06l5.47-5.47H12.25a.75.75 0 01-.75-.75z" clipRule="evenodd" /></svg>
                      Open GitHub access page
                    </button>
                  </div>
                );
              })()}
              <div className="mt-2 rounded-lg border border-violet/15 bg-violet/5 px-2.5 py-2">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-violet/60">Step 2 — Send them this code</p>
                <p className="mt-1 text-[11px] leading-relaxed text-text-dim">Paste it in their CodeCollab &ldquo;Accept invite&rdquo; screen.</p>
                <div className="mt-1.5 flex flex-col gap-1.5">
                  <p className="w-full truncate rounded-lg bg-void/30 px-2.5 py-1.5 font-mono text-[11px] text-violet select-all" title={inviteCode}>{inviteCode}</p>
                  <button onClick={() => { navigator.clipboard.writeText(inviteCode); setInviteCopied(true); setTimeout(() => setInviteCopied(false), 2000); }} className="w-full rounded-lg bg-violet/20 px-3 py-1.5 text-[11px] font-semibold text-violet transition hover:bg-violet/30">
                    {inviteCopied ? "Copied!" : "Copy code"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ═══════════════════ CONTEXT LINE ═══════════════════ */}
        <div className="py-3 text-center text-[10px] text-text-ghost">
          {subprojects.length} subprojects · {allTasks.filter((t) => t.status === "done").length} done · {allTasks.filter((t) => t.status === "building").length} building · {allTasks.length} total tasks
        </div>

        {/* ═══════════════════ EMPTY STATES ═══════════════════ */}
        {hasNoActiveDesktopProject && (
          <div className="mb-4 rounded-xl border border-dashed border-edge bg-stage-up/30 px-4 py-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-dim">No active real project</p>
            <p className="mt-2 text-[13px] text-text-soft">Open or create a real project first.</p>
          </div>
        )}
        {hasRealProjectWithoutPlan && (
          <div className="mb-4 rounded-xl border border-dashed border-edge bg-stage-up/30 px-4 py-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-dim">Fresh workspace</p>
            <p className="mt-2 text-[13px] text-text-soft">Add subprojects and tasks, or go to PM Chat to start planning.</p>
          </div>
        )}

        {/* ═══════════════════ ACTION ITEMS ═══════════════════ */}
        {activeProject && (
          <ActionItemsSection projectId={activeProject.id} />
        )}

        {/* ═══════════════════ TASK TREE BY SUBPROJECT ═══════════════════ */}
        <div className="flex flex-col gap-0">
          {orderedSubprojects.map((sp, spIndex) => {
            const spCounts = getPlanCounts(sp.tasks);
            const spPct = spCounts.total > 0 ? Math.round((spCounts.done / spCounts.total) * 100) : 0;
            const isCollapsed = collapsedSections.has(sp.id);
            const hasBuildingTasks = sp.tasks.some((t) => t.status === "building");
            const orderedTasks = [...sp.tasks].sort((a, b) => taskOrder.indexOf(a.id) - taskOrder.indexOf(b.id));

            return (
              <div
                key={sp.id}
                data-sp-container
                className={`border border-black/[0.12] dark:border-white/[0.1] rounded-lg mb-2 px-2 py-1.5 ${hasBuildingTasks ? "bg-sun/[0.02]" : ""} ${dragOverSpId === sp.id && draggedSpId && draggedSpId !== sp.id ? "ring-2 ring-violet/40" : ""} ${draggedSpId === sp.id ? "opacity-40" : ""}`}
                onDragOver={(e) => {
                  if (!draggedSpId || draggedTaskId) return;
                  e.preventDefault();
                  if (dragOverSpId !== sp.id) setDragOverSpId(sp.id);
                }}
                onDragLeave={() => { if (dragOverSpId === sp.id) setDragOverSpId(null); }}
                onDrop={(e) => {
                  if (!draggedSpId || draggedTaskId) return;
                  e.preventDefault();
                  handleReorderSubprojects(draggedSpId, sp.id);
                  setDraggedSpId(null);
                  setDragOverSpId(null);
                }}
              >
                {/* Section header */}
                <div className="w-full flex items-center justify-between py-3 group">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <span
                      draggable
                      onDragStart={(e) => {
                        setDraggedSpId(sp.id);
                        setDraggedTaskId(null);
                        e.dataTransfer.effectAllowed = "move";
                        try { e.dataTransfer.setData("text/plain", sp.id); } catch { /* */ }
                        // Use the full subproject container as the drag ghost so the whole card appears to move
                        try {
                          const container = (e.currentTarget as HTMLElement).closest("[data-sp-container]") as HTMLElement | null;
                          if (container) {
                            const rect = container.getBoundingClientRect();
                            e.dataTransfer.setDragImage(container, e.clientX - rect.left, e.clientY - rect.top);
                          }
                        } catch { /* */ }
                      }}
                      onDragEnd={() => { setDraggedSpId(null); setDragOverSpId(null); }}
                      title="Drag to reorder subproject"
                      className="cursor-grab select-none text-text-ghost transition hover:text-text-dim active:cursor-grabbing"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3 w-3"><path d="M7 4a1 1 0 100 2 1 1 0 000-2zM7 9a1 1 0 100 2 1 1 0 000-2zM7 14a1 1 0 100 2 1 1 0 000-2zM13 4a1 1 0 100 2 1 1 0 000-2zM13 9a1 1 0 100 2 1 1 0 000-2zM13 14a1 1 0 100 2 1 1 0 000-2z" /></svg>
                    </span>
                    <button
                      type="button"
                      onClick={() => toggleSection(sp.id)}
                      className="flex items-center gap-2 min-w-0 flex-1 text-left"
                    >
                      <span className="text-[10px] text-text-ghost transition group-hover:text-text-dim">{isCollapsed ? "▸" : "▾"}</span>
                      <span className="text-[11px] font-semibold uppercase tracking-[0.05em] text-text-dim truncate">{sp.title}</span>
                      <span className="text-[10px] text-text-ghost">{spCounts.done}/{spCounts.total}</span>
                      {hasBuildingTasks && (
                        <span className="inline-flex h-1.5 w-1.5 rounded-full bg-sun shadow-[0_0_6px_rgba(255,159,28,0.5)]" />
                      )}
                    </button>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <StatusDropdown value={sp.status} onChange={(next) => handleChangeSubprojectStatus(sp.id, next)} />

                    {/* Subproject Details — compact icon button */}
                    <button
                      type="button"
                      title={sp.goal ? `Goal: ${sp.goal}` : "Add goal / description"}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (inlineSpDetailsId === sp.id) {
                          setInlineSpDetailsId(null);
                        } else {
                          setEditingSpGoalText(sp.goal || "");
                          setInlineSpDetailsId(sp.id);
                          setInlineSpAssignId(null);
                        }
                      }}
                      className={`relative inline-flex h-5 w-5 items-center justify-center rounded-full border transition ${
                        sp.goal
                          ? "border-sun/30 bg-sun/10 text-sun hover:bg-sun/20"
                          : "border-edge bg-stage-up text-text-ghost hover:border-text-ghost/40 hover:text-text-dim"
                      }`}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-2.5 w-2.5"><path d="M2 4.5A2.5 2.5 0 014.5 2h7A2.5 2.5 0 0114 4.5v7a2.5 2.5 0 01-2.5 2.5h-7A2.5 2.5 0 012 11.5v-7zm3.5 1.5a.5.5 0 000 1h5a.5.5 0 000-1h-5zm0 2.5a.5.5 0 000 1h5a.5.5 0 000-1h-5zm0 2.5a.5.5 0 000 1h3a.5.5 0 000-1h-3z" /></svg>
                      {sp.goal ? <span className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-sun" /> : null}
                    </button>

                    {/* Subproject Assign — avatar-only button */}
                    <button
                      type="button"
                      title={sp.agentName ? `Assigned to ${sp.agentName} — click to change` : "Assign subproject"}
                      onClick={(e) => {
                        e.stopPropagation();
                        setInlineSpAssignId(inlineSpAssignId === sp.id ? null : sp.id);
                        setInlineSpDetailsId(null);
                      }}
                      className={`inline-flex h-5 w-5 items-center justify-center rounded-full border text-[8.5px] font-bold transition ${
                        sp.agentName
                          ? "border-edge bg-stage-up2 text-text-soft hover:border-text-ghost/40"
                          : "border-dashed border-edge bg-stage-up text-text-ghost hover:border-text-ghost/40 hover:text-text-dim"
                      }`}
                    >
                      {sp.agentName ? getAssigneeMeta(sp.agentName).initials : "+"}
                    </button>

                    <span className="ml-0.5 text-[9px] text-text-ghost tabular-nums">{spIndex + 1}/{orderedSubprojects.length}</span>
                    <button
                      type="button"
                      title="Delete subproject"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm(`Delete "${sp.title}" and its ${sp.tasks.length} task${sp.tasks.length === 1 ? "" : "s"}? This can't be undone.`)) {
                          handleDeleteSubproject(sp.id);
                        }
                      }}
                      className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-edge bg-stage-up text-text-ghost transition hover:border-coral/40 hover:bg-coral/10 hover:text-coral"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-2.5 w-2.5"><path fillRule="evenodd" d="M5 3.25V4H2.75a.75.75 0 000 1.5h.3l.713 8.557A1.5 1.5 0 005.256 15.5h5.488a1.5 1.5 0 001.494-1.443L12.95 5.5h.3a.75.75 0 000-1.5H11v-.75A2.25 2.25 0 008.75 1h-1.5A2.25 2.25 0 005 3.25zm2.25-.75a.75.75 0 00-.75.75V4h3v-.75a.75.75 0 00-.75-.75h-1.5z" clipRule="evenodd" /></svg>
                    </button>
                  </div>
                </div>

                {/* Inline subproject assign picker */}
                {inlineSpAssignId === sp.id && (
                  <div className="ml-7 mb-1 flex flex-wrap items-center gap-1.5 rounded-lg border border-edge/50 bg-stage-up px-2 py-1.5">
                    {assignablePeople.map((person) => {
                      const active = sp.agentName === person.name;
                      return (
                        <button key={person.name} type="button" onClick={() => { handleAssignSubproject(sp.id, person.name); setInlineSpAssignId(null); }}
                          className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-medium transition ${active ? "bg-sun/15 text-sun" : "text-text-dim hover:bg-stage-up2 hover:text-text-soft"}`}>
                          <span className={`flex h-4 w-4 items-center justify-center rounded-full text-[8px] font-semibold ${active ? "bg-sun/20" : "bg-stage-up2"}`}>{person.initials}</span>
                          {person.name}
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Inline subproject details editor */}
                {inlineSpDetailsId === sp.id && (
                  <div className="ml-7 mb-2 rounded-lg border border-edge/50 bg-stage-up px-3 py-2">
                    <label className="text-[10px] font-semibold uppercase tracking-[0.08em] text-text-dim">Goal / description</label>
                    <textarea
                      value={editingSpGoalText}
                      onChange={(e) => setEditingSpGoalText(e.target.value)}
                      placeholder="What is this subproject about?"
                      rows={3}
                      className="mt-1.5 w-full resize-none rounded-md border border-edge/30 bg-stage px-2.5 py-1.5 text-[12px] text-text outline-none placeholder:text-text-ghost focus:border-sun/30"
                    />
                    <div className="mt-1.5 flex items-center justify-end gap-1.5">
                      <button type="button" onClick={() => setInlineSpDetailsId(null)} className="rounded-md px-2 py-1 text-[10px] text-text-dim hover:text-coral">Cancel</button>
                      <button type="button" onClick={() => { handleUpdateSubprojectGoal(sp.id, editingSpGoalText); setInlineSpDetailsId(null); }} className="rounded-md bg-sun/15 px-2.5 py-1 text-[10px] font-semibold text-sun hover:bg-sun/25">Save</button>
                    </div>
                  </div>
                )}

                {/* Task rows */}
                {!isCollapsed && (
                  <div className="pb-2">
                    {orderedTasks.map((task) => {
                      const isDone = task.status === "done";
                      const isBuilding = task.status === "building";
                      const isReview = task.status === "review";
                      const isPlanned = task.status === "planned";

                      return (
                        <div
                          key={task.id}
                          data-task-container
                          className={`group relative ${dragOverTaskId === task.id && draggedTaskId && draggedTaskId !== task.id ? "before:absolute before:left-2 before:right-2 before:top-0 before:h-[2px] before:rounded-full before:bg-violet" : ""} ${draggedTaskId === task.id ? "opacity-40" : ""}`}
                          onDragOver={(e) => {
                            if (!draggedTaskId || draggedSpId) return;
                            e.preventDefault();
                            if (dragOverTaskId !== task.id) setDragOverTaskId(task.id);
                          }}
                          onDragLeave={() => { if (dragOverTaskId === task.id) setDragOverTaskId(null); }}
                          onDrop={(e) => {
                            if (!draggedTaskId || draggedSpId) return;
                            e.preventDefault();
                            handleReorderTasks(draggedTaskId, task.id);
                            setDraggedTaskId(null);
                            setDragOverTaskId(null);
                          }}
                        >
                        <button
                          type="button"
                          onClick={() => handleSelectTask(sp.id, task.id)}
                          onKeyDown={(e) => {
                            if (e.key === " ") {
                              e.preventDefault();
                              const nextMap: Record<BuildTaskStatus, BuildTaskStatus> = { planned: "building", building: "review", review: "done", done: "planned" };
                              handleChangeTaskStatus(task.id, nextMap[task.status]);
                            }
                          }}
                          className={`w-full flex items-center gap-3 py-2.5 pl-3 pr-9 rounded-lg text-left transition cursor-pointer ${
                            isBuilding
                              ? "bg-sun/[0.03] border border-sun/[0.08]"
                              : "hover:bg-stage-up"
                          }`}
                        >
                          {/* Drag handle */}
                          <span
                            draggable
                            onDragStart={(e) => {
                              e.stopPropagation();
                              setDraggedTaskId(task.id);
                              setDraggedSpId(null);
                              e.dataTransfer.effectAllowed = "move";
                              try { e.dataTransfer.setData("text/plain", task.id); } catch { /* */ }
                              // Full row follows the cursor
                              try {
                                const container = (e.currentTarget as HTMLElement).closest("[data-task-container]") as HTMLElement | null;
                                if (container) {
                                  const rect = container.getBoundingClientRect();
                                  e.dataTransfer.setDragImage(container, e.clientX - rect.left, e.clientY - rect.top);
                                }
                              } catch { /* */ }
                            }}
                            onDragEnd={() => { setDraggedTaskId(null); setDragOverTaskId(null); }}
                            onClick={(e) => e.stopPropagation()}
                            title="Drag to reorder task"
                            className="cursor-grab select-none text-text-ghost opacity-0 transition hover:text-text-dim group-hover:opacity-100 active:cursor-grabbing"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3 w-3"><path d="M7 4a1 1 0 100 2 1 1 0 000-2zM7 9a1 1 0 100 2 1 1 0 000-2zM7 14a1 1 0 100 2 1 1 0 000-2zM13 4a1 1 0 100 2 1 1 0 000-2zM13 9a1 1 0 100 2 1 1 0 000-2zM13 14a1 1 0 100 2 1 1 0 000-2z" /></svg>
                          </span>

                          {/* Status checkbox — click to cycle status */}
                          <span
                            role="button"
                            tabIndex={0}
                            title={`Status: ${task.status} — click to advance`}
                            onClick={(e) => {
                              e.stopPropagation();
                              const nextMap: Record<BuildTaskStatus, BuildTaskStatus> = { planned: "building", building: "review", review: "done", done: "planned" };
                              handleChangeTaskStatus(task.id, nextMap[task.status]);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                e.stopPropagation();
                                const nextMap: Record<BuildTaskStatus, BuildTaskStatus> = { planned: "building", building: "review", review: "done", done: "planned" };
                                handleChangeTaskStatus(task.id, nextMap[task.status]);
                              }
                            }}
                            className={`flex h-4 w-4 flex-shrink-0 cursor-pointer items-center justify-center rounded border-[1.5px] transition hover:scale-110 ${
                              isDone ? "border-mint/70 bg-mint/10 dark:border-mint/40" :
                              isBuilding ? "border-sun/80 bg-sun/10 dark:border-sun/50" :
                              isReview ? "border-violet/70 bg-violet/10 dark:border-violet/40" :
                              "border-black/35 dark:border-white/25"
                            }`}>
                            {isDone && (
                              <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M2 5.5L4 7.5L8 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-mint" /></svg>
                            )}
                            {isBuilding && (
                              <div className="h-1.5 w-1.5 rounded-sm bg-sun shadow-[0_0_6px_rgba(255,159,28,0.5)]" />
                            )}
                            {isReview && (
                              <div className="h-1.5 w-1.5 rounded-sm bg-violet" />
                            )}
                          </span>

                          {/* Task title */}
                          <span className={`flex-1 text-[13px] min-w-0 truncate ${
                            isDone ? "text-text-dim line-through" :
                            isBuilding ? "text-text font-semibold" :
                            isReview ? "text-text-mid" :
                            "text-text-dim"
                          }`}>
                            {task.title}
                          </span>

                          {/* Right side: status dropdown, details icon, assignee avatar */}
                          <div className="flex items-center gap-1.5 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                            <StatusDropdown value={task.status} onChange={(next) => handleChangeTaskStatus(task.id, next)} />

                            {/* Details — compact icon button, badged when a note exists */}
                            <button
                              type="button"
                              title={task.note ? `Note: ${task.note}` : "Add a note"}
                              onClick={(e) => {
                                e.stopPropagation();
                                if (inlineNotesTaskId === task.id) {
                                  setInlineNotesTaskId(null);
                                } else {
                                  setEditingNoteText(task.note || "");
                                  setInlineNotesTaskId(task.id);
                                  setInlineAssignTaskId(null);
                                }
                              }}
                              className={`relative inline-flex h-5 w-5 items-center justify-center rounded-full border transition opacity-0 group-hover:opacity-100 ${
                                task.note
                                  ? "border-sun/30 bg-sun/10 text-sun hover:bg-sun/20"
                                  : "border-edge bg-stage-up text-text-ghost hover:border-text-ghost/40 hover:text-text-dim"
                              }`}
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-2.5 w-2.5"><path d="M2 4.5A2.5 2.5 0 014.5 2h7A2.5 2.5 0 0114 4.5v7a2.5 2.5 0 01-2.5 2.5h-7A2.5 2.5 0 012 11.5v-7zm3.5 1.5a.5.5 0 000 1h5a.5.5 0 000-1h-5zm0 2.5a.5.5 0 000 1h5a.5.5 0 000-1h-5zm0 2.5a.5.5 0 000 1h3a.5.5 0 000-1h-3z" /></svg>
                              {task.note ? <span className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-sun" /> : null}
                            </button>

                            {/* Assignee — avatar-only button */}
                            <button
                              type="button"
                              title={task.owner ? `Assigned to ${task.owner} — click to change` : "Unassigned"}
                              onClick={(e) => { e.stopPropagation(); setInlineAssignTaskId(inlineAssignTaskId === task.id ? null : task.id); setInlineNotesTaskId(null); }}
                              className={`inline-flex h-5 w-5 items-center justify-center rounded-full border text-[8.5px] font-bold transition ${
                                task.owner
                                  ? "border-edge bg-stage-up2 text-text-soft hover:border-text-ghost/40"
                                  : "border-dashed border-edge bg-stage-up text-text-ghost hover:border-text-ghost/40 hover:text-text-dim"
                              }`}
                            >
                              {task.owner ? getAssigneeMeta(task.owner).initials : "+"}
                            </button>
                          </div>
                        </button>

                        {/* Delete task — floats on hover of row */}
                        <button
                          type="button"
                          title="Delete task"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (confirm(`Delete task "${task.title}"? This can't be undone.`)) {
                              handleDeleteTask(task.id);
                            }
                          }}
                          className="absolute right-2 top-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full border border-edge bg-stage-up text-text-ghost opacity-0 transition group-hover:opacity-100 hover:border-coral/40 hover:bg-coral/10 hover:text-coral"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-2.5 w-2.5"><path fillRule="evenodd" d="M5 3.25V4H2.75a.75.75 0 000 1.5h.3l.713 8.557A1.5 1.5 0 005.256 15.5h5.488a1.5 1.5 0 001.494-1.443L12.95 5.5h.3a.75.75 0 000-1.5H11v-.75A2.25 2.25 0 008.75 1h-1.5A2.25 2.25 0 005 3.25zm2.25-.75a.75.75 0 00-.75.75V4h3v-.75a.75.75 0 00-.75-.75h-1.5z" clipRule="evenodd" /></svg>
                        </button>

                        {/* Inline assign picker */}
                        {inlineAssignTaskId === task.id && (
                          <div className="ml-7 mb-1 flex items-center gap-1.5 rounded-lg border border-edge/50 bg-stage-up px-2 py-1.5">
                            {assignablePeople.map((person) => {
                              const active = task.owner === person.name;
                              return (
                                <button key={person.name} type="button" onClick={() => handleAssignTask(task.id, person.name)}
                                  className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-medium transition ${active ? "bg-sun/15 text-sun" : "text-text-dim hover:bg-stage-up2 hover:text-text-soft"}`}>
                                  <span className={`flex h-4 w-4 items-center justify-center rounded-full text-[8px] font-semibold ${active ? "bg-sun/20" : "bg-stage-up2"}`}>{person.initials}</span>
                                  {person.name}
                                </button>
                              );
                            })}
                          </div>
                        )}

                        {/* Inline notes editor */}
                        {inlineNotesTaskId === task.id && (
                          <div className="ml-7 mb-1 rounded-lg border border-edge/50 bg-stage-up px-3 py-2">
                            <textarea
                              value={editingNoteText}
                              onChange={(e) => setEditingNoteText(e.target.value)}
                              placeholder="Add a note…"
                              rows={2}
                              className="w-full resize-none rounded-md border border-edge/30 bg-stage px-2.5 py-1.5 text-[12px] text-text outline-none placeholder:text-text-ghost focus:border-sun/30"
                              onClick={(e) => e.stopPropagation()}
                            />
                            <div className="mt-1.5 flex items-center justify-between">
                              {task.note && <span className="text-[9px] text-text-ghost">by {task.owner || currentUserName}</span>}
                              <div className="ml-auto flex items-center gap-1.5">
                                <button type="button" onClick={() => setInlineNotesTaskId(null)} className="rounded-md px-2 py-1 text-[10px] text-text-dim hover:text-coral">Cancel</button>
                                <button type="button" onClick={() => { handleUpdateTaskNote(task.id, editingNoteText); setInlineNotesTaskId(null); }} className="rounded-md bg-sun/15 px-2.5 py-1 text-[10px] font-semibold text-sun hover:bg-sun/25">Save</button>
                              </div>
                            </div>
                          </div>
                        )}
                        </div>
                      );
                    })}

                    {sp.tasks.length === 0 && (
                      <p className="px-3 py-3 text-[12px] text-text-ghost">No tasks yet — click + Task to add one</p>
                    )}

                    {/* Add task for this subproject */}
                    {selectedSubprojectId === sp.id && showTaskCreator && (
                      <div className="mt-2 mx-3 rounded-lg border border-edge bg-stage-up p-3">
                        <div className="grid gap-2 sm:grid-cols-2">
                          <input value={newTaskTitle} onChange={(e) => setNewTaskTitle(e.target.value)} placeholder="Task title" className="rounded-lg border border-edge bg-stage px-3 py-2 text-[12px] text-text outline-none placeholder:text-text-ghost focus:border-sun/30" />
                          <input value={newTaskNote} onChange={(e) => setNewTaskNote(e.target.value)} placeholder="Quick note" className="rounded-lg border border-edge bg-stage px-3 py-2 text-[12px] text-text outline-none placeholder:text-text-ghost focus:border-sun/30" />
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <label className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-text-ghost">
                            Subproject
                            <select value={selectedSubprojectId} onChange={(e) => setSelectedSubprojectId(e.target.value)} className="rounded-lg border border-edge bg-stage px-2 py-1.5 text-[11px] text-text-mid outline-none">
                              {subprojects.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
                            </select>
                          </label>
                          <select value={newTaskOwner} onChange={(e) => setNewTaskOwner(e.target.value)} className="rounded-lg border border-edge bg-stage px-2 py-1.5 text-[11px] text-text-mid outline-none">
                            {assignablePeople.map((p) => <option key={p.name} value={p.name}>{p.name}</option>)}
                          </select>
                          <input type="date" value={newTaskDueDate} onChange={(e) => setNewTaskDueDate(e.target.value)} className="rounded-lg border border-edge bg-stage px-2 py-1.5 text-[11px] text-text-mid outline-none" />
                          <div className="flex-1" />
                          <button type="button" onClick={() => setShowTaskCreator(false)} className="rounded-lg px-3 py-1.5 text-[11px] text-text-dim hover:text-coral">Cancel</button>
                          <button type="button" onClick={handleAddTask} className="rounded-lg bg-sun/15 px-3 py-1.5 text-[11px] font-semibold text-sun hover:bg-sun/25">Add</button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Section divider */}
                {spIndex < orderedSubprojects.length - 1 && <div className="border-b border-edge/30" />}
              </div>
            );
          })}
        </div>

        {/* ═══════════════════ ADD SUBPROJECT / TASK BUTTONS ═══════════════════ */}
        <div className="flex items-center gap-2 py-3 border-t border-edge/30">
          <button type="button" onClick={() => setShowSubprojectCreator(true)} disabled={hasNoActiveDesktopProject}
            className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-edge px-3 py-1.5 text-[11px] font-medium text-text-ghost transition hover:border-text-dim hover:text-text-dim">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3 w-3"><path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" /></svg>
            Add subproject
          </button>
          {selectedSubproject && (
            <button type="button" onClick={() => { setShowTaskCreator(true); }} disabled={hasNoActiveDesktopProject}
              className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-edge px-3 py-1.5 text-[11px] font-medium text-text-ghost transition hover:border-text-dim hover:text-text-dim">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3 w-3"><path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" /></svg>
              Add task
            </button>
          )}
        </div>

        {/* ═══════════════════ BOTTOM PROGRESS BAR ═══════════════════ */}
        <div className="py-4">
          <div className="h-1 overflow-hidden rounded-full bg-edge/50">
            <div className="h-full rounded-full bg-gradient-to-r from-sun to-mint transition-all duration-700" style={{ width: `${Math.max(overallProgress, 1)}%` }} />
          </div>
          <p className="mt-2 text-center text-[10px] text-text-ghost">
            {allTasks.filter((t) => t.status === "done").length} of {allTasks.length} tasks complete
          </p>
        </div>

      </div>

      {/* ═══════════════════ ADD SUBPROJECT MODAL ═══════════════════ */}
      {showSubprojectCreator && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <button type="button" aria-label="Close" onClick={() => setShowSubprojectCreator(false)} className="absolute inset-0 bg-black/20 backdrop-blur-sm" />
          <div className="relative w-full max-w-md overflow-hidden rounded-xl border border-edge bg-stage p-6 shadow-2xl">
            <h3 className="text-[16px] font-semibold text-text">New subproject</h3>
            <div className="mt-4 grid gap-3">
              <input value={newSubprojectTitle} onChange={(e) => setNewSubprojectTitle(e.target.value)} placeholder="Subproject name" className="rounded-lg border border-edge bg-stage-up px-4 py-3 text-[14px] text-text outline-none placeholder:text-text-ghost focus:border-sun/30" />
              <textarea value={newSubprojectGoal} onChange={(e) => setNewSubprojectGoal(e.target.value)} rows={3} placeholder="What is it for? (optional)" className="resize-none rounded-lg border border-edge bg-stage-up px-4 py-3 text-[14px] text-text outline-none placeholder:text-text-ghost focus:border-sun/30" />
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setShowSubprojectCreator(false)} className="rounded-lg px-4 py-2.5 text-[13px] text-text-dim hover:text-text">Cancel</button>
                <button type="button" onClick={handleAddSubproject} className="rounded-lg bg-sun/15 px-5 py-2.5 text-[13px] font-semibold text-sun hover:bg-sun/25">Add</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════ TASK DETAIL DRAWER ═══════════════════ */}
      {showTaskDetails && selectedTask && (
        <div className="fixed inset-0 z-[70]">
          <button type="button" aria-label="Close" onClick={() => { setShowTaskDetails(false); setShowAssigneePicker(false); setShowDueDatePicker(false); }} className="absolute inset-0 bg-black/20 backdrop-blur-[6px]" />
          <div className="pointer-events-none absolute inset-y-0 right-0 flex w-full justify-end p-3 sm:p-5 lg:p-6">
            <div className="drawer-panel pointer-events-auto flex h-full w-full max-w-[580px] flex-col overflow-hidden rounded-[2rem] bg-[#111] text-white shadow-2xl ring-1 ring-white/10 xl:max-w-[640px]">

              {/* close */}
              <div className="flex justify-end px-5 pt-4">
                <button type="button" onClick={() => { setShowTaskDetails(false); setShowAssigneePicker(false); setShowDueDatePicker(false); }}
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-white/8 text-white/60 transition hover:bg-white/12">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                    <path fillRule="evenodd" d="M4.22 4.22a.75.75 0 011.06 0L10 8.94l4.72-4.72a.75.75 0 111.06 1.06L11.06 10l4.72 4.72a.75.75 0 11-1.06 1.06L10 11.06l-4.72 4.72a.75.75 0 01-1.06-1.06L8.94 10 4.22 5.28a.75.75 0 010-1.06z" clipRule="evenodd" />
                  </svg>
                </button>
              </div>

              {/* body */}
              <div className="custom-scroll flex-1 overflow-y-auto px-6 pb-6">
                <h2 className="display-font text-[1.5rem] font-semibold leading-tight tracking-tight">{selectedTask.title}</h2>

                {/* interactive status selector */}
                <div className="mt-5 flex flex-wrap gap-2">
                  {allStatuses.map((s) => {
                    const active = selectedTask.status === s;
                    return (
                      <button key={s} type="button" onClick={() => handleChangeTaskStatus(selectedTask.id, s)}
                        className={`flex items-center gap-2 rounded-full px-3.5 py-2 text-[12px] font-medium transition-all ${
                          active ? "bg-white/15 text-white ring-1 ring-white/20" : "text-white/35 hover:bg-white/[0.05] hover:text-white/60"
                        }`}>
                        <span className={`h-2 w-2 rounded-full transition-all ${active ? "scale-125" : ""}`} style={{ backgroundColor: statusColor[s] }} />
                        {statusLabel[s]}
                      </button>
                    );
                  })}
                </div>

                <div className="mt-6">
                  <div className="flex flex-wrap items-center gap-2">
                    <button type="button" onClick={() => { setShowAssigneePicker((c) => !c); setShowDueDatePicker(false); }}
                      className={`inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-[12px] font-medium transition ${showAssigneePicker ? "bg-white text-[#141414] shadow-[0_12px_28px_rgba(255,255,255,0.12)]" : "bg-white/[0.06] text-white/78 hover:bg-white/[0.1] hover:text-white"}`}>
                      <span className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-semibold ${showAssigneePicker ? "bg-black/8" : "bg-white/[0.08]"}`}>
                        {getAssigneeMeta(selectedTask.owner).initials}
                      </span>
                      Assign: {selectedTask.owner}
                    </button>
                    <button type="button" onClick={() => { setShowDueDatePicker((c) => !c); setShowAssigneePicker(false); }}
                      className={`inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-[12px] font-medium transition ${showDueDatePicker ? "bg-white text-[#141414] shadow-[0_12px_28px_rgba(255,255,255,0.12)]" : "bg-white/[0.06] text-white/78 hover:bg-white/[0.1] hover:text-white"}`}>
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4"><path fillRule="evenodd" d="M5.75 2a.75.75 0 01.75.75V4h7V2.75a.75.75 0 011.5 0V4h.25A2.25 2.25 0 0117.5 6.25v8A2.25 2.25 0 0115.25 16.5h-10A2.25 2.25 0 013 14.25v-8A2.25 2.25 0 015.25 4H5V2.75A.75.75 0 015.75 2zM4.5 8v6.25c0 .414.336.75.75.75h10a.75.75 0 00.75-.75V8h-11.5z" clipRule="evenodd" /></svg>
                      Due: {formatDueDate(selectedTask.dueDate)}
                    </button>
                  </div>

                  {showAssigneePicker && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {assignablePeople.map((person) => {
                        const active = selectedTask.owner === person.name;
                        return (
                          <button key={person.name} type="button" onClick={() => handleAssignTask(selectedTask.id, person.name)}
                            className={`inline-flex items-center gap-2 rounded-full px-3 py-2 text-[12px] font-medium transition ${active ? "bg-white text-[#141414]" : "bg-white/[0.06] text-white/72 hover:bg-white/[0.1]"}`}>
                            <span className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-semibold ${active ? "bg-black/8" : "bg-white/[0.08]"}`}>{person.initials}</span>
                            {person.name}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {showDueDatePicker && (
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <button type="button" onClick={() => handleSetRelativeDueDate(selectedTask.id, 0)} className="rounded-full bg-white/[0.06] px-3 py-2 text-[11px] font-medium text-white/72 hover:bg-white/[0.1]">Today</button>
                      <button type="button" onClick={() => handleSetRelativeDueDate(selectedTask.id, 3)} className="rounded-full bg-white/[0.06] px-3 py-2 text-[11px] font-medium text-white/72 hover:bg-white/[0.1]">+3 days</button>
                      <button type="button" onClick={() => handleSetRelativeDueDate(selectedTask.id, 7)} className="rounded-full bg-white/[0.06] px-3 py-2 text-[11px] font-medium text-white/72 hover:bg-white/[0.1]">+1 week</button>
                      <label className="inline-flex items-center rounded-full border border-white/10 bg-black/20 px-3.5 py-2 text-[12px] text-white/82">
                        <span className="mr-2 text-white/45">Pick</span>
                        <input type="date" value={selectedTask.dueDate} onChange={(e) => handleChangeTaskDueDate(selectedTask.id, e.target.value)} className="bg-transparent text-[12px] text-white outline-none" />
                      </label>
                    </div>
                  )}
                </div>

                <div className="mt-6 rounded-[1.25rem] border border-white/8 bg-white/[0.03] p-4">
                  <div className="flex items-start justify-between gap-3 border-b border-white/8 pb-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/42">Conversation history</p>
                    <span className="rounded-full bg-white/[0.06] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/58">
                      {selectedTaskConversations.length} thread{selectedTaskConversations.length === 1 ? "" : "s"}
                    </span>
                  </div>
                  <div className="mt-4 space-y-3">
                    {selectedTaskConversations.length > 0 ? (
                      selectedTaskConversations.map((thread) => {
                        const lastMessage = thread.messages[thread.messages.length - 1];
                        return (
                          <Link key={thread.id} href={`/project/chat?task=${encodeURIComponent(selectedTask.id)}&thread=${encodeURIComponent(thread.id)}`}
                            className="block rounded-[0.95rem] border border-white/8 bg-white/[0.025] px-4 py-3 transition hover:border-white/14 hover:bg-white/[0.04]">
                            <div className="flex items-center justify-between gap-3">
                              <div className="min-w-0 flex-1">
                                <p className="text-[13px] font-semibold text-white">{thread.title}</p>
                                <p className="mt-1 text-[11px] text-white/45">{thread.agentName} • {thread.updatedAgo}</p>
                              </div>
                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 shrink-0 text-white/34"><path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" /></svg>
                            </div>
                            <div className="mt-3 space-y-2 border-t border-white/8 pt-3">
                              <p className="line-clamp-1 text-[12px] leading-relaxed text-white/62">{thread.summary}</p>
                              {lastMessage && (
                                <div className="flex items-start gap-2 text-[11px] leading-relaxed">
                                  <span className="shrink-0 rounded-full bg-white/[0.05] px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-white/46">{lastMessage.from}</span>
                                  <p className={`line-clamp-1 ${lastMessage.isAI ? "text-white/62" : "text-white/82"}`}>{lastMessage.text}</p>
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
                <Link href={`/project/chat?task=${encodeURIComponent(selectedTask.id)}`}
                  className="flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-[#a78bfa] to-[#34d399] px-5 py-3 text-[13px] font-semibold text-white shadow-[0_8px_24px_rgba(167,139,250,0.25)] transition hover:shadow-[0_12px_32px_rgba(167,139,250,0.35)] hover:brightness-110">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4"><path fillRule="evenodd" d="M2 10a.75.75 0 01.75-.75h12.59l-2.1-1.95a.75.75 0 111.02-1.1l3.5 3.25a.75.75 0 010 1.1l-3.5 3.25a.75.75 0 11-1.02-1.1l2.1-1.95H2.75A.75.75 0 012 10z" clipRule="evenodd" /></svg>
                  Start working on this task
                </Link>
                <Link href={`/project/chat?ask=${encodeURIComponent(selectedTask.id)}`}
                  className="flex items-center justify-center gap-2 rounded-full bg-white/[0.06] px-5 py-3 text-[13px] font-medium text-white/70 ring-1 ring-white/10 transition hover:bg-white/[0.1] hover:text-white">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4"><path fillRule="evenodd" d="M10 2c-2.236 0-4.43.18-6.57.524C1.993 2.755 1 4.014 1 5.426v5.148c0 1.413.993 2.67 2.43 2.902 1.168.188 2.352.327 3.55.414.28.02.521.18.642.413l1.713 3.293a.75.75 0 001.33 0l1.713-3.293a.783.783 0 01.642-.413 41.102 41.102 0 003.55-.414c1.437-.231 2.43-1.49 2.43-2.902V5.426c0-1.413-.993-2.67-2.43-2.902A41.289 41.289 0 0010 2z" clipRule="evenodd" /></svg>
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

