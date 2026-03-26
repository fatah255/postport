import { notFound } from "next/navigation";
import { getMessages } from "next-intl/server";
import { AppProviders } from "@/components/providers/app-providers";
import { isRtl, locales } from "@/lib/locales";

interface LocaleLayoutProps {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}

export default async function LocaleLayout({ children, params }: LocaleLayoutProps) {
  const { locale } = await params;
  if (!locales.includes(locale as (typeof locales)[number])) {
    notFound();
  }
  const messages = await getMessages();
  const dir = isRtl(locale) ? "rtl" : "ltr";

  return (
    <div dir={dir}>
      <AppProviders locale={locale} messages={messages}>
        {children}
      </AppProviders>
    </div>
  );
}
