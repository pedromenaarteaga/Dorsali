import { DashboardSidebar } from "@/components/dashboard/sidebar";
import {
  NotificationsBell,
  NotificationsPanel,
  NotificationsProvider,
  TestNotificationButton,
} from "@/components/dashboard/notifications";

export default function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <NotificationsProvider>
      <div className="min-h-screen bg-[#121212] text-zinc-100">
        <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_top,_rgba(200,255,0,0.08),_transparent_42%)]" />
        <DashboardSidebar />
        <div className="relative lg:pl-72">
          <header className="sticky top-0 z-30 hidden items-center justify-end border-b border-white/10 bg-[#161616]/90 px-6 py-3 backdrop-blur lg:flex">
            <NotificationsBell />
          </header>
          {children}
        </div>
        <NotificationsPanel />
        <TestNotificationButton />
      </div>
    </NotificationsProvider>
  );
}
