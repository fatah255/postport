"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button, Card, CardDescription, CardTitle, Input } from "@postport/ui";
import { apiRequest, ApiError } from "@/lib/api-client";

const registerSchema = z
  .object({
    fullName: z.string().min(2),
    email: z.string().email(),
    password: z.string().min(8),
    confirmPassword: z.string().min(8)
  })
  .refine((value) => value.password === value.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords must match"
  });

type RegisterForm = z.infer<typeof registerSchema>;

export default function RegisterPage() {
  const router = useRouter();
  const params = useParams<{ locale: string }>();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting }
  } = useForm<RegisterForm>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      fullName: "",
      email: "",
      password: "",
      confirmPassword: ""
    }
  });

  const onSubmit = async (values: RegisterForm) => {
    setErrorMessage(null);
    try {
      await apiRequest("/auth/register", {
        method: "POST",
        body: JSON.stringify({
          fullName: values.fullName,
          email: values.email,
          password: values.password,
          locale: "EN"
        })
      });
      router.push(`/${params.locale ?? "en"}/dashboard`);
      router.refresh();
    } catch (error) {
      if (error instanceof ApiError) {
        setErrorMessage(error.message);
        return;
      }
      setErrorMessage("Unable to create account. Please try again.");
    }
  };

  return (
    <Card className="space-y-5 border-slate-200 bg-white/95 shadow-lift dark:border-slate-800 dark:bg-slate-950/95">
      <div className="space-y-2">
        <p className="text-xs uppercase tracking-[0.2em] text-slate-500">PostPort</p>
        <CardTitle>Create account</CardTitle>
        <CardDescription>Set up your workspace and connect publishing targets.</CardDescription>
      </div>
      <form className="space-y-4" onSubmit={handleSubmit(onSubmit)}>
        <div className="space-y-2">
          <label htmlFor="fullName" className="text-sm font-medium">
            Full name
          </label>
          <Input id="fullName" {...register("fullName")} />
          {errors.fullName ? <p className="text-xs text-rose-600">{errors.fullName.message}</p> : null}
        </div>
        <div className="space-y-2">
          <label htmlFor="email" className="text-sm font-medium">
            Email
          </label>
          <Input id="email" type="email" {...register("email")} />
          {errors.email ? <p className="text-xs text-rose-600">{errors.email.message}</p> : null}
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <label htmlFor="password" className="text-sm font-medium">
              Password
            </label>
            <Input id="password" type="password" {...register("password")} />
            {errors.password ? <p className="text-xs text-rose-600">{errors.password.message}</p> : null}
          </div>
          <div className="space-y-2">
            <label htmlFor="confirmPassword" className="text-sm font-medium">
              Confirm
            </label>
            <Input id="confirmPassword" type="password" {...register("confirmPassword")} />
            {errors.confirmPassword ? (
              <p className="text-xs text-rose-600">{errors.confirmPassword.message}</p>
            ) : null}
          </div>
        </div>
        <Button className="w-full" type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Creating..." : "Create account"}
        </Button>
        {errorMessage ? <p className="text-xs text-rose-600">{errorMessage}</p> : null}
      </form>
      <p className="text-sm text-slate-600 dark:text-slate-300">
        Already have an account?{" "}
        <Link href="../login" className="font-medium text-brand-600">
          Sign in
        </Link>
      </p>
    </Card>
  );
}
