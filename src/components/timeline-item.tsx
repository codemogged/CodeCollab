import type { TimelineEvent } from "@/lib/mock-data";

const typeStyles: Record<string, { dot: string; label: string }> = {
  ai: { dot: "bg-sun", label: "Project Manager" },
  human: { dot: "bg-aqua", label: "" },
  expert: { dot: "bg-violet", label: "Expert" },
  system: { dot: "bg-ink-muted/40", label: "System" },
};

export default function TimelineItem({ event }: { event: TimelineEvent }) {
  const style = typeStyles[event.type] ?? typeStyles.system;

  return (
    <div className="group relative flex gap-4 pb-8 last:pb-0">
      {/* vertical connector line */}
      <div className="relative flex flex-col items-center">
        <div className={`mt-1.5 h-2.5 w-2.5 rounded-full ${style.dot} ring-4 ring-cream`} />
        <div className="w-px flex-1 bg-black/[0.06] group-last:hidden" />
      </div>

      <div className="flex-1 pb-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-body-sm font-semibold text-ink">{event.title}</span>
          {style.label && (
            <span className="pill bg-cream-deep text-[10px] text-ink-muted">{style.label}</span>
          )}
        </div>
        <p className="mt-1 text-body-sm text-ink-muted leading-relaxed">{event.note}</p>
        <p className="mt-2 text-label uppercase text-ink-muted/60">{event.time}</p>
      </div>
    </div>
  );
}
