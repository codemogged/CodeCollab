import type { Task } from "@/lib/mock-data";

const statusConfig: Record<string, { bg: string; label: string; text: string }> = {
  now: { bg: "bg-sun-light", label: "Now", text: "text-sun" },
  ai: { bg: "bg-violet-light", label: "Project Manager", text: "text-violet" },
  waiting: { bg: "bg-cream-deep", label: "Waiting", text: "text-ink-muted" },
  done: { bg: "bg-aqua-light", label: "Done", text: "text-aqua" },
};

const priorityDot: Record<string, string> = {
  high: "bg-coral",
  mid: "bg-sun",
  low: "bg-ink-muted/30",
};

export default function TaskRow({ task }: { task: Task }) {
  const s = statusConfig[task.status] ?? statusConfig.waiting;

  return (
    <div className={`card-flat flex items-center gap-3 px-4 py-3 ${task.status === "done" ? "opacity-50" : ""}`}>
      {task.priority && <span className={`h-2 w-2 shrink-0 rounded-full ${priorityDot[task.priority] ?? ""}`} />}
      {!task.priority && <span className="h-2 w-2 shrink-0" />}

      <span className={`flex-1 text-body-sm ${task.status === "done" ? "line-through text-ink-muted" : "text-ink"}`}>
        {task.title}
      </span>

      {task.assignee && (
        <span className="hidden text-label uppercase text-ink-muted sm:block">{task.assignee}</span>
      )}

      <span className={`pill ${s.bg} ${s.text} py-1 text-[10px] font-semibold`}>
        {s.label}
      </span>
    </div>
  );
}
