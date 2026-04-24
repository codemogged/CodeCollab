import { LeftRail, MonolithPanel } from "@/components";

export default function ProjectLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden">
      <LeftRail />
      <MonolithPanel>
        <main className="flex-1 overflow-y-auto">{children}</main>
      </MonolithPanel>
    </div>
  );
}
