import { Navbar } from "@/components";

export default function PeopleLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Navbar />
      <main className="mx-auto max-w-2xl px-5 py-10">{children}</main>
    </>
  );
}
