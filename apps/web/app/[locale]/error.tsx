"use client";

import { Button, Card, CardDescription, CardTitle } from "@postport/ui";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <div className="app-bg flex min-h-screen items-center justify-center p-6">
      <Card className="w-full max-w-xl space-y-4 text-center">
        <CardTitle>Something went wrong</CardTitle>
        <CardDescription>Unexpected errors are hidden in production and tracked via observability hooks.</CardDescription>
        <Button onClick={reset}>Try again</Button>
      </Card>
    </div>
  );
}
