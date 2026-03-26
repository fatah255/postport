import { cookies } from "next/headers";
import { redirect } from "next/navigation";

interface LocaleIndexPageProps {
  params: Promise<{ locale: string }>;
}

export default async function LocaleIndexPage({ params }: LocaleIndexPageProps) {
  const { locale } = await params;
  const cookieStore = await cookies();
  const sessionCookieName = process.env.SESSION_COOKIE_NAME ?? "postport_session";
  const destination = cookieStore.get(sessionCookieName)?.value ? `/${locale}/dashboard` : `/${locale}/login`;
  redirect(destination);
}
