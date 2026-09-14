import { DashboardSidebar } from "@/components/dashboard/sidebar";

export default function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="min-h-screen bg-[#121212] text-zinc-100">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_top,_rgba(200,255,0,0.08),_transparent_42%)]" />
      <DashboardSidebar />
      <div className="relative lg:pl-72">{children}</div>
    </div>
  );
}
