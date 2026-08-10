import { DashboardShell } from '@/components/mobile/DashboardShell';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <DashboardShell>{children}</DashboardShell>;
}
