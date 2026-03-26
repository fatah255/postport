import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";

interface DashboardLayoutProps {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}

export default async function DashboardLayout({ children, params }: DashboardLayoutProps) {
  const { locale } = await params;
  const cookieStore = await cookies();
  const sessionCookieName = process.env.SESSION_COOKIE_NAME ?? "postport_session";

  if (!cookieStore.get(sessionCookieName)?.value) {
    redirect(`/${locale}/login`);
  }

  return <AppShell locale={locale}>{children}</AppShell>;
}
