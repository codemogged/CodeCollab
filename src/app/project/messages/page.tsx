"use client";

import { useEffect, useState } from "react";
import { Avatar } from "@/components";
import ProjectSidebar from "@/components/project-sidebar";
import { useActiveDesktopProject } from "@/hooks/use-active-desktop-project";

type MessageView = "team" | "direct";

type ProjectChannel = {
  id: string;
  name: string;
  description: string;
  memberCount: number;
  updatedAgo: string;
  messages: Array<{
    id: string;
    from: string;
    initials: string;
    text: string;
    time: string;
    isMine?: boolean;
  }>;
};

type DirectThread = {
  id: string;
  name: string;
  initials: string;
  role: string;
  online: boolean;
  updatedAgo: string;
  preview: string;
  messages: Array<{
    id: string;
    from: string;
    initials: string;
    text: string;
    time: string;
    isMine?: boolean;
  }>;
};

export default function ProjectMessagesPage() {
  const { activeProject, canUseDesktopProject } = useActiveDesktopProject();
  const [view, setView] = useState<MessageView>("team");
  const channels = (activeProject?.dashboard.channels ?? []) as ProjectChannel[];
  const directMessages = (activeProject?.dashboard.directMessages ?? []) as DirectThread[];
  const [selectedChannelId, setSelectedChannelId] = useState("");
  const [selectedDmId, setSelectedDmId] = useState("");

  useEffect(() => {
    setSelectedChannelId((current) => (channels.some((channel) => channel.id === current) ? current : (channels[0]?.id ?? "")));
  }, [channels]);

  useEffect(() => {
    setSelectedDmId((current) => (directMessages.some((thread) => thread.id === current) ? current : (directMessages[0]?.id ?? "")));
  }, [directMessages]);

  const selectedChannel = channels.find((channel) => channel.id === selectedChannelId) ?? channels[0] ?? null;
  const selectedDm = directMessages.find((thread) => thread.id === selectedDmId) ?? directMessages[0] ?? null;
  const isEmpty = view === "team" ? channels.length === 0 : directMessages.length === 0;

  if (canUseDesktopProject && !activeProject) {
    return (
      <div className="flex min-h-screen bg-[linear-gradient(180deg,var(--gradient-page-start)_0%,var(--gradient-page-end)_100%)] text-ink dark:text-[var(--fg)]">
        <ProjectSidebar />

        <div className="flex min-w-0 flex-1 items-center justify-center px-6 pt-[5.6rem]">
          <div className="app-surface max-w-2xl rounded-[1.8rem] p-8 text-center">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] theme-muted">Project messages</p>
            <h1 className="display-font mt-4 text-[2rem] font-semibold tracking-tight theme-fg">No active real project</h1>
            <p className="mt-4 text-[14px] leading-relaxed theme-soft">
              This tab no longer falls back to demo threads in desktop mode. Open or create a real project first.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-[linear-gradient(180deg,var(--gradient-page-start)_0%,var(--gradient-page-end)_100%)] text-ink dark:text-[var(--fg)]">
      <ProjectSidebar />

      <div className="min-w-0 flex-1 px-5 pb-20 pt-[5.6rem] sm:px-6 xl:px-8">
        <div className="mx-auto flex w-full max-w-[1160px] flex-col gap-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] theme-muted">Project messages</p>
              <h1 className="display-font mt-2 text-[2rem] font-semibold tracking-tight theme-fg">Talk with the team</h1>
              <p className="mt-2 text-[13px] theme-muted">
                {activeProject
                  ? `Messages for ${activeProject.name} now come from the real project dashboard.`
                  : "Open a real project to load channels and direct messages."}
              </p>
            </div>

            <div className="app-control-rail inline-flex rounded-full p-1">
              <button
                type="button"
                onClick={() => setView("team")}
                className={`rounded-full px-4 py-2 text-[12px] font-semibold transition ${view === "team" ? "app-control-active" : "app-control-idle"}`}
              >
                Team chat
              </button>
              <button
                type="button"
                onClick={() => setView("direct")}
                className={`rounded-full px-4 py-2 text-[12px] font-semibold transition ${view === "direct" ? "app-control-active" : "app-control-idle"}`}
              >
                Direct messages
              </button>
            </div>
          </div>

          <div className="grid gap-5 lg:grid-cols-[300px_minmax(0,1fr)]">
            <aside className="app-surface rounded-[1.8rem] p-4">
              <div className="border-b border-black/[0.06] px-2 pb-4 dark:border-white/[0.08]">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] theme-muted">
                  {view === "team" ? "Channels" : "People"}
                </p>
              </div>

              <div className="mt-3 space-y-2">
                {view === "team"
                  ? channels.map((channel) => {
                    const active = channel.id === selectedChannel?.id;

                    return (
                      <button
                        key={channel.id}
                        type="button"
                        onClick={() => setSelectedChannelId(channel.id)}
                        className={`w-full rounded-[1.1rem] border px-4 py-3 text-left transition ${active ? "border-black/[0.08] bg-black/[0.03] shadow-[0_10px_22px_rgba(0,0,0,0.04)] dark:border-white/[0.12] dark:bg-white/[0.05] dark:shadow-none" : "border-transparent hover:border-black/[0.06] hover:bg-black/[0.02] dark:hover:border-white/[0.08] dark:hover:bg-white/[0.03]"}`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-[13px] font-semibold theme-fg">#{channel.name}</p>
                          <span className="rounded-full bg-black/[0.04] px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.14em] theme-muted dark:bg-white/[0.06]">
                            {channel.memberCount}
                          </span>
                        </div>
                        <p className="mt-1 line-clamp-2 text-[12px] leading-relaxed theme-soft">{channel.description}</p>
                        <p className="mt-2 text-[10px] uppercase tracking-[0.12em] theme-muted">{channel.updatedAgo}</p>
                      </button>
                    );
                  })
                  : directMessages.map((thread) => {
                    const active = thread.id === selectedDm?.id;

                    return (
                      <button
                        key={thread.id}
                        type="button"
                        onClick={() => setSelectedDmId(thread.id)}
                        className={`w-full rounded-[1.1rem] border px-4 py-3 text-left transition ${active ? "border-black/[0.08] bg-black/[0.03] shadow-[0_10px_22px_rgba(0,0,0,0.04)] dark:border-white/[0.12] dark:bg-white/[0.05] dark:shadow-none" : "border-transparent hover:border-black/[0.06] hover:bg-black/[0.02] dark:hover:border-white/[0.08] dark:hover:bg-white/[0.03]"}`}
                      >
                        <div className="flex items-center gap-3">
                          <Avatar initials={thread.initials} online={thread.online} />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-[13px] font-semibold theme-fg">{thread.name}</p>
                              <p className="text-[10px] uppercase tracking-[0.12em] theme-muted">{thread.updatedAgo}</p>
                            </div>
                            <p className="text-[11px] theme-muted">{thread.role}</p>
                            <p className="mt-1 line-clamp-2 text-[12px] leading-relaxed theme-soft">{thread.preview}</p>
                          </div>
                        </div>
                      </button>
                    );
                  })}

                {isEmpty ? (
                  <div className="rounded-[1.1rem] border border-dashed border-black/[0.08] px-4 py-6 text-center text-[12px] theme-muted dark:border-white/[0.1]">
                    {view === "team"
                      ? "No team channels exist for this project yet."
                      : "No direct-message threads exist for this project yet."}
                  </div>
                ) : null}
              </div>
            </aside>

            <section className="app-surface flex min-h-[680px] flex-col overflow-hidden rounded-[1.9rem]">
              {view === "team" && selectedChannel && (
                <>
                  <div className="border-b border-black/[0.06] px-6 py-5 dark:border-white/[0.08]">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] theme-muted">Team channel</p>
                        <h2 className="display-font mt-2 text-[1.45rem] font-semibold tracking-tight theme-fg">#{selectedChannel.name}</h2>
                      </div>
                      <div className="rounded-[1rem] bg-black/[0.03] px-3 py-2 text-right dark:bg-white/[0.05]">
                        <p className="text-[10px] uppercase tracking-[0.14em] theme-muted">Members</p>
                        <p className="mt-1 text-[13px] font-semibold theme-fg">{selectedChannel.memberCount} active</p>
                      </div>
                    </div>
                  </div>

                  <div className="custom-scroll flex-1 space-y-4 overflow-y-auto px-6 py-6">
                    {selectedChannel.messages.map((message) => (
                      <div key={message.id} className={`flex ${message.isMine ? "justify-end" : "justify-start"}`}>
                        <div className={`max-w-[680px] rounded-[1.15rem] px-4 py-3 ${message.isMine ? "bg-[#f4eee3] text-[#17181b] shadow-[0_12px_28px_rgba(0,0,0,0.06)] dark:bg-[#f3efe8] dark:text-[#141414]" : "border border-black/[0.05] bg-white/55 text-ink shadow-[0_8px_20px_rgba(0,0,0,0.03)] dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-[var(--fg)] dark:shadow-none"}`}>
                          <div className={`mb-1 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.14em] ${message.isMine ? "text-[#5f5a52]/70 dark:text-[#4d463c]/70" : "theme-muted"}`}>
                            <span>{message.from}</span>
                            <span>{message.time}</span>
                          </div>
                          <p className="text-[14px] leading-relaxed">{message.text}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {view === "direct" && selectedDm && (
                <>
                  <div className="border-b border-black/[0.06] px-6 py-5 dark:border-white/[0.08]">
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <Avatar initials={selectedDm.initials} size="lg" online={selectedDm.online} ring />
                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] theme-muted">Direct message</p>
                          <h2 className="display-font mt-1 text-[1.45rem] font-semibold tracking-tight theme-fg">{selectedDm.name}</h2>
                          <p className="mt-1 text-[13px] theme-soft">{selectedDm.role}</p>
                        </div>
                      </div>
                      <p className="text-[10px] uppercase tracking-[0.12em] theme-muted">{selectedDm.updatedAgo}</p>
                    </div>
                  </div>

                  <div className="custom-scroll flex-1 space-y-4 overflow-y-auto px-6 py-6">
                    {selectedDm.messages.map((message) => (
                      <div key={message.id} className={`flex ${message.isMine ? "justify-end" : "justify-start"}`}>
                        <div className={`max-w-[620px] rounded-[1.15rem] px-4 py-3 ${message.isMine ? "bg-[#f4eee3] text-[#17181b] shadow-[0_12px_28px_rgba(0,0,0,0.06)] dark:bg-[#f3efe8] dark:text-[#141414]" : "border border-black/[0.05] bg-white/55 text-ink shadow-[0_8px_20px_rgba(0,0,0,0.03)] dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-[var(--fg)] dark:shadow-none"}`}>
                          <div className={`mb-1 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.14em] ${message.isMine ? "text-[#5f5a52]/70 dark:text-[#4d463c]/70" : "theme-muted"}`}>
                            <span>{message.from}</span>
                            <span>{message.time}</span>
                          </div>
                          <p className="text-[14px] leading-relaxed">{message.text}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {!selectedChannel && !selectedDm ? (
                <div className="flex flex-1 items-center justify-center px-6 py-10 text-center">
                  <div className="max-w-md">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.16em] theme-muted">Empty</p>
                    <h2 className="display-font mt-3 text-[1.8rem] font-semibold tracking-tight theme-fg">No messages yet</h2>
                    <p className="mt-3 text-[14px] leading-relaxed theme-soft">
                      This screen now stays empty until the active project has real persisted message threads.
                    </p>
                  </div>
                </div>
              ) : null}

              <div className="border-t border-black/[0.06] px-5 py-4 dark:border-white/[0.08]">
                <div className="app-surface-strong rounded-[1.5rem] px-4 py-3">
                  <textarea
                    rows={2}
                    placeholder={view === "team" ? "Message the team" : "Send a direct message"}
                    disabled
                    className="w-full resize-none bg-transparent text-[14px] leading-relaxed text-ink placeholder:text-ink-muted/45 outline-none disabled:cursor-not-allowed disabled:opacity-60 dark:text-[var(--fg)] dark:placeholder:text-[var(--muted)]"
                  />
                  <div className="mt-3 flex items-center justify-between gap-3">
                    <p className="text-[12px] theme-muted">Message sending is not wired yet. This view now reflects only real project state.</p>
                    <button className="rounded-full bg-ink px-4 py-2 text-[12px] font-semibold text-cream opacity-50 dark:bg-white dark:text-[#141414]" disabled>
                      Send
                    </button>
                  </div>
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}