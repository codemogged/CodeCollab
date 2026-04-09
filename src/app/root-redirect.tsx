"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function RootRedirect() {
  const router = useRouter();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    async function checkFirstRun() {
      try {
        if (typeof window !== "undefined" && window.electronAPI) {
          const isFirstRun = await window.electronAPI.settings.isFirstRun();
          if (isFirstRun) {
            router.replace("/onboarding");
          } else {
            router.replace("/home");
          }
        } else {
          // Not in Electron — go straight to home
          router.replace("/home");
        }
      } catch {
        router.replace("/home");
      }
      setChecked(true);
    }
    checkFirstRun();
  }, [router]);

  if (checked) return null;

  // Brief loading state while checking
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-950 via-indigo-950 to-violet-950">
      <div className="flex h-14 w-14 animate-pulse items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-500 text-sm font-bold text-white shadow-lg">
        CB
      </div>
    </div>
  );
}
