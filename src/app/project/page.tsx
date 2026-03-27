"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
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

/* ─── page ─── */

export default function ProjectPage() {
  const { activeProject, canUseDesktopProject } = useActiveDesktopProject();
  const plan = (activeProject?.dashboard.plan ?? null) as ProjectPlan | null;
  const taskConversationThreads = (activeProject?.dashboard.taskThreads ?? []) as ProjectTaskThread[];
  const suggestedSubprojectOrder = plan?.buildOrder?.map((step) => step.subprojectId) ?? [];
  const suggestedTaskOrder = plan?.buildOrder?.flatMap((step) => step.taskIds) ?? [];
  const initialSubprojectOrder = [...new Set([...suggestedSubprojectOrder, ...(plan?.subprojects.map((sp) => sp.id) ?? [])])];
  const initialTaskOrder = [...new Set([...suggestedTaskOrder, ...(plan?.subprojects.flatMap((sp) => sp.tasks.map((task) => task.id)) ?? [])])];
  const currentUserName = "Cameron";
  const assignablePeople = [
    { name: currentUserName, initials: "CM" },
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

  useEffect(() => {
    setSubprojects(plan?.subprojects ?? []);
    setSubprojectOrder(initialSubprojectOrder);
    setTaskOrder(initialTaskOrder);
    setSelectedSubprojectId(plan?.subprojects[0]?.id ?? "");
    setSelectedTaskId(plan?.subprojects[0]?.tasks[0]?.id ?? "");
  }, [plan, activeProject?.id]);

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
    setSubprojects((cur) =>
      cur.map((sp) => ({
        ...sp,
        tasks: sp.tasks.map((t) =>
          t.id === taskId ? { ...t, status: newStatus } : t
        ),
      }))
    );
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
            <h1 className="display-font mt-2 text-[2.4rem] font-semibold leading-[0.96] tracking-tight theme-fg sm:text-[3rem]">
              {workspaceTitle}
            </h1>
            <p className="mt-3 text-[14px] leading-relaxed theme-soft">
              {subprojects.length} subprojects · {allTasks.length} tasks
            </p>
            <p className="mt-2 max-w-2xl text-[13px] leading-relaxed theme-muted">
              {workspaceSubtitle}
            </p>
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <Link href="/project/chat" className="btn-primary flex items-center gap-2 px-5 py-2.5 text-[13px]">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                  <path fillRule="evenodd" d="M10 2c-2.236 0-4.43.18-6.57.524C1.993 2.755 1 4.014 1 5.426v5.148c0 1.413.993 2.67 2.43 2.902 1.168.188 2.352.327 3.55.414.28.02.521.18.642.413l1.713 3.293a.75.75 0 001.33 0l1.713-3.293a.783.783 0 01.642-.413 41.102 41.102 0 003.55-.414c1.437-.231 2.43-1.49 2.43-2.902V5.426c0-1.413-.993-2.67-2.43-2.902A41.289 41.289 0 0010 2zM6.75 6a.75.75 0 000 1.5h6.5a.75.75 0 000-1.5h-6.5zm0 2.5a.75.75 0 000 1.5h3.5a.75.75 0 000-1.5h-3.5z" clipRule="evenodd" />
                </svg>
                Talk to Project Manager
              </Link>
            </div>
          </div>
          <ProgressRing progress={overallProgress} />
        </header>

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
