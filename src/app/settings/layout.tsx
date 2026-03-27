import { Navbar } from "@/components";

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Navbar />
      <main className="min-h-screen w-full bg-[linear-gradient(180deg,var(--gradient-page-start)_0%,var(--gradient-page-end)_100%)] px-6 pb-16 pt-28 sm:px-8 xl:px-10">
        {children}
      </main>
    </>
  );
}
