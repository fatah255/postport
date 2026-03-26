export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-bg flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-lg">{children}</div>
    </div>
  );
}
