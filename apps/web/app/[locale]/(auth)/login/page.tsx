"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button, Card, CardDescription, CardTitle, Input } from "@postport/ui";
import { apiRequest, ApiError } from "@/lib/api-client";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8)
});

type LoginForm = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const router = useRouter();
  const params = useParams<{ locale: string }>();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting }
  } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: ""
    }
  });

  const onSubmit = async (values: LoginForm) => {
    setErrorMessage(null);
    try {
      await apiRequest("/auth/login", {
        method: "POST",
        body: JSON.stringify(values)
      });
      router.push(`/${params.locale ?? "en"}/dashboard`);
      router.refresh();
    } catch (error) {
      if (error instanceof ApiError) {
        setErrorMessage(error.message);
        return;
      }
      setErrorMessage("Unable to sign in. Please try again.");
    }
  };

  return (
    <Card className="space-y-5 border-slate-200 bg-white/95 shadow-lift dark:border-slate-800 dark:bg-slate-950/95">
      <div className="space-y-2">
        <p className="text-xs uppercase tracking-[0.2em] text-slate-500">PostPort</p>
        <CardTitle>Welcome back</CardTitle>
        <CardDescription>Sign in to manage media, schedules, and publish jobs.</CardDescription>
      </div>
      <form className="space-y-4" onSubmit={handleSubmit(onSubmit)}>
        <div className="space-y-2">
          <label htmlFor="email" className="text-sm font-medium">
            Email
          </label>
          <Input id="email" placeholder="you@company.com" {...register("email")} />
          {errors.email ? <p className="text-xs text-rose-600">{errors.email.message}</p> : null}
        </div>
        <div className="space-y-2">
          <label htmlFor="password" className="text-sm font-medium">
            Password
          </label>
          <Input id="password" type="password" placeholder="********" {...register("password")} />
          {errors.password ? <p className="text-xs text-rose-600">{errors.password.message}</p> : null}
        </div>
        <Button className="w-full" type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Signing in..." : "Sign in"}
        </Button>
        {errorMessage ? <p className="text-xs text-rose-600">{errorMessage}</p> : null}
      </form>
      <p className="text-sm text-slate-600 dark:text-slate-300">
        New here?{" "}
        <Link href="../register" className="font-medium text-brand-600">
          Create an account
        </Link>
      </p>
    </Card>
  );
}
