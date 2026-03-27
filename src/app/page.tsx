import Link from "next/link";

export default function Home() {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-6">
      {/* Soft ambient glow */}
      <div className="orb left-1/2 top-1/2 h-[600px] w-[600px] -translate-x-1/2 -translate-y-1/2 bg-sun opacity-20" aria-hidden />

      <div className="relative z-10 flex flex-col items-center text-center">
        {/* Logo */}
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-ink text-sm font-bold text-cream shadow-card">
          cb
        </div>

        {/* One line. That&rsquo;s it. */}
        <h1 className="display-font mt-8 max-w-lg text-display-lg leading-[1.05] text-ink sm:text-[3.5rem]">
          Describe your idea.<br />We&rsquo;ll build it.
        </h1>

        <p className="mt-5 max-w-sm text-body-lg text-ink-muted">
          You and your friends talk. Project Manager turns it into a real app. No coding needed.
        </p>

        <Link
          href="/home"
          className="btn-primary mt-10 px-10 py-4 text-[15px]"
        >
          Get started — it&rsquo;s free
        </Link>

        <p className="mt-6 text-body-sm text-ink-muted/60">
          No credit card. No setup. Just start talking.
        </p>
      </div>

      {/* Footer */}
      <footer className="absolute bottom-6 text-body-sm text-ink-muted/40">
        CodeBuddy
      </footer>
    </div>
  );
}
