import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";

interface AppShellProps {
  locale: string;
  children: React.ReactNode;
}

export const AppShell = ({ locale, children }: AppShellProps) => {
  return (
    <div className="app-bg min-h-screen lg:flex">
      <Sidebar locale={locale} />
      <div className="min-h-screen flex-1">
        <Topbar />
        <main className="p-4 lg:p-8">{children}</main>
      </div>
    </div>
  );
};
