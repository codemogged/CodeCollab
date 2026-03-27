import { Avatar } from "@/components";

export default function SettingsPage() {
  return (
    <div className="text-ink dark:text-[var(--fg)]">
      <div className="mx-auto flex w-full max-w-[1180px] justify-center">
        <div className="w-full max-w-[760px] space-y-8">
          <div className="text-center sm:text-left">
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] theme-muted">Account</p>
            <h1 className="display-font mt-2 text-[2rem] font-semibold tracking-tight theme-fg">User settings</h1>
            <p className="mt-2 text-[14px] theme-soft">Manage your profile and account details.</p>
          </div>

          <div className="app-surface overflow-hidden rounded-[1.6rem] p-6 shadow-[0_14px_40px_rgba(15,23,42,0.06)] dark:shadow-[0_16px_40px_rgba(0,0,0,0.22)]">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-4">
                <Avatar initials="CM" size="lg" online ring />
                <div>
                  <p className="display-font text-[1.7rem] font-semibold tracking-tight theme-fg">Cameron</p>
                  <p className="mt-1 text-[14px] theme-muted">cameron@codebuddy.app</p>
                </div>
              </div>
              <span className="inline-flex rounded-full bg-black/[0.04] px-3 py-1.5 text-[11px] font-semibold theme-muted dark:bg-white/[0.06]">
                Owner
              </span>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {[
              { label: "Name", value: "Cameron" },
              { label: "Email", value: "cameron@codebuddy.app" },
            ].map((field) => (
              <div key={field.label} className="app-surface rounded-[1.4rem] p-5 shadow-[0_12px_30px_rgba(15,23,42,0.05)] dark:shadow-[0_14px_32px_rgba(0,0,0,0.18)]">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] theme-muted">{field.label}</p>
                <p className="mt-3 break-words text-[15px] font-medium theme-fg">{field.value}</p>
              </div>
            ))}
          </div>

          <div className="app-surface rounded-[1.4rem] p-5 shadow-[0_12px_30px_rgba(15,23,42,0.05)] dark:shadow-[0_14px_32px_rgba(0,0,0,0.18)]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] theme-muted">Workspace defaults</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="app-surface-soft rounded-[1rem] p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] theme-muted">Theme</p>
                <p className="mt-2 text-[14px] font-medium theme-fg">Sync with system</p>
              </div>
              <div className="app-surface-soft rounded-[1rem] p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] theme-muted">Notifications</p>
                <p className="mt-2 text-[14px] font-medium theme-fg">Mentions and task updates</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
