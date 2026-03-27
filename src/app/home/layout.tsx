import { Navbar } from "@/components";

export default function HomeLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Navbar />
      <main className="w-full px-0 py-10">{children}</main>
    </>
  );
}
