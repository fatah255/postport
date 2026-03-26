import type { ButtonHTMLAttributes, PropsWithChildren } from "react";
import { cn } from "../lib/cn";

type ButtonVariant = "default" | "secondary" | "ghost" | "danger";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

const variantClasses: Record<ButtonVariant, string> = {
  default: "bg-slate-900 text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white",
  secondary: "bg-slate-100 text-slate-900 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700",
  ghost: "bg-transparent text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800",
  danger: "bg-rose-600 text-white hover:bg-rose-700"
};

export const Button = ({
  variant = "default",
  className,
  children,
  ...props
}: PropsWithChildren<ButtonProps>) => {
  return (
    <button
      className={cn(
        "inline-flex h-10 items-center justify-center rounded-xl px-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-60",
        variantClasses[variant],
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
};
