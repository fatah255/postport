import Link from "next/link";
import { Button, Card, CardDescription, CardTitle } from "@postport/ui";

export default function NotFoundPage() {
  return (
    <div className="app-bg flex min-h-screen items-center justify-center p-6">
      <Card className="w-full max-w-xl space-y-4 text-center">
        <CardTitle>Page not found</CardTitle>
        <CardDescription>The page may have moved or does not exist in this locale.</CardDescription>
        <Link href="/en/dashboard">
          <Button>Back to dashboard</Button>
        </Link>
      </Card>
    </div>
  );
}
