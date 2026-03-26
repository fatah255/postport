"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { ThemeProvider } from "next-themes";
import { useState } from "react";

interface AppProvidersProps {
  children: React.ReactNode;
  locale: string;
  messages: Record<string, unknown>;
}

export const AppProviders = ({ children, locale, messages }: AppProvidersProps) => {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      </ThemeProvider>
    </NextIntlClientProvider>
  );
};
