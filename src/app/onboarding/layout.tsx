import { MonolithPanel } from "@/components";

export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return (
    <MonolithPanel>
      {children}
    </MonolithPanel>
  );
}
