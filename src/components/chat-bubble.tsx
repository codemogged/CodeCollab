import type { BuildArtifact, Message } from "@/lib/mock-data";

interface ChatBubbleProps {
  msg: Message;
  artifact?: BuildArtifact;
  isSelected?: boolean;
  isSplitView?: boolean;
  onOpenBuild?: (artifactId: string, tab?: "details" | "preview" | "code" | "files") => void;
}

export default function ChatBubble({
  msg,
  artifact,
  isSelected = false,
  isSplitView = false,
  onOpenBuild,
}: ChatBubbleProps) {
  const mine = msg.isMine;
  const ai = msg.isAI;
  const userBubbleWidth = isSplitView ? "max-w-[92%] xl:max-w-[90%]" : "max-w-[78%] xl:max-w-[74%]";
  const assistantBubbleWidth = isSplitView ? "max-w-[95%] xl:max-w-[92%]" : "max-w-[82%] xl:max-w-[76%]";

  if (mine) {
    return (
      <div className="flex justify-end">
        <div className={userBubbleWidth}>
          <div className="mb-1.5 flex justify-end">
            <p className="text-[11px] font-medium theme-muted">{msg.from}</p>
          </div>
          <div className="rounded-[1.65rem] rounded-br-md border border-black/[0.08] bg-[#2d2b29] px-5 py-3 text-white shadow-[0_12px_28px_rgba(32,24,18,0.16)] dark:border-white/[0.08] dark:bg-[#25272b] dark:shadow-[0_16px_36px_rgba(0,0,0,0.28)]">
            <p className="text-[14px] leading-[1.55] text-white/96">{msg.text}</p>
          </div>
        </div>
      </div>
    );
  }

  if (ai) {
    return (
      <div className="flex items-start gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[linear-gradient(135deg,#5d8bff,#7c5cfc)] text-[11px] font-bold text-white shadow-[0_8px_24px_rgba(93,139,255,0.24)]">
          ✦
        </div>
        <div className={assistantBubbleWidth}>
          <div className="mb-1.5 flex items-center gap-2">
            <p className="text-[11px] font-medium theme-fg">Project Manager</p>
            <span className="text-[11px] theme-muted">building live</span>
          </div>
          <div className="rounded-[1.15rem] px-0 py-0 theme-fg">
            <p className="text-[15px] leading-[1.72] theme-fg">{msg.text}</p>

            {artifact && onOpenBuild && (
              <div
                className={`mt-4 w-full rounded-[1.25rem] border px-4 py-3 text-left transition ${
                  isSelected
                    ? "border-[#5d8bff]/35 bg-[#edf3ff] shadow-[0_10px_26px_rgba(93,139,255,0.12)] dark:bg-[#1a2233] dark:shadow-[0_0_0_1px_rgba(93,139,255,0.14)]"
                    : "app-surface hover:bg-[var(--surface-strong)]"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-medium theme-muted">New build</p>
                    <p className="mt-1 text-[15px] font-semibold theme-fg">{artifact.title}</p>
                  </div>
                  <span className="text-[12px] font-medium theme-soft">Ready</span>
                </div>

                <p className="mt-2 text-[13px] leading-[1.6] theme-soft">
                  {artifact.description}
                </p>

                <p className="mt-3 text-[12px] leading-relaxed theme-muted">{artifact.changes.join(" • ")}</p>

                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => onOpenBuild(artifact.id, "details")}
                    className="rounded-full bg-black/[0.05] px-3 py-1.5 text-[11px] font-semibold theme-fg transition hover:bg-black/[0.08] dark:bg-white/[0.08] dark:hover:bg-white/[0.12]"
                  >
                    Details
                  </button>
                  <button
                    type="button"
                    onClick={() => onOpenBuild(artifact.id, "preview")}
                    className="rounded-full bg-black/[0.05] px-3 py-1.5 text-[11px] font-semibold theme-fg transition hover:bg-black/[0.08] dark:bg-white/[0.08] dark:hover:bg-white/[0.12]"
                  >
                    Preview
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-3">
      <div className="app-avatar flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[10px] font-bold shadow-[0_4px_10px_rgba(0,0,0,0.08)]">
        {msg.initials}
      </div>
      <div className={assistantBubbleWidth}>
        <p className="mb-1.5 text-[10px] font-semibold theme-muted">{msg.from}</p>
        <div className="app-surface rounded-[1.3rem] rounded-tl-md px-5 py-3 shadow-[0_10px_24px_rgba(0,0,0,0.05)] dark:shadow-[0_14px_28px_rgba(0,0,0,0.20)]">
          <p className="text-[14px] leading-[1.58] theme-fg">{msg.text}</p>
        </div>
      </div>
    </div>
  );
}
