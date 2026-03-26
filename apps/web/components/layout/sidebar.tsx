"use client";

import { CalendarClock, History, LayoutDashboard, Library, Link2, PenSquare, Settings } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@postport/ui";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/media", label: "Media Library", icon: Library },
  { href: "/drafts", label: "Drafts", icon: PenSquare },
  { href: "/calendar", label: "Calendar", icon: CalendarClock },
  { href: "/history", label: "Publish History", icon: History },
  { href: "/connections", label: "Connections", icon: Link2 },
  { href: "/settings", label: "Settings", icon: Settings }
];

interface SidebarProps {
  locale: string;
}

export const Sidebar = ({ locale }: SidebarProps) => {
  const pathname = usePathname();

  return (
    <aside className="hidden w-72 shrink-0 border-r border-slate-200 bg-white/80 p-4 backdrop-blur dark:border-slate-800 dark:bg-slate-950/70 lg:block">
      <div className="mb-8 rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900">
        <p className="text-xs uppercase tracking-[0.2em] text-slate-500">PostPort</p>
        <h1 className="mt-2 text-xl font-semibold text-slate-900 dark:text-slate-100">Publishing Ops</h1>
      </div>
      <nav className="space-y-1">
        {navItems.map((item) => {
          const href = `/${locale}${item.href}`;
          const active = pathname.startsWith(href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={href}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-brand-500 text-white shadow-lift"
                  : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
              )}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
};
