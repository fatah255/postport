import type { InputHTMLAttributes } from "react";
import { cn } from "../lib/cn";

export const Input = ({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) => {
  return (
    <input
      className={cn(
        "h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus:border-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-slate-500",
        className
      )}
      {...props}
    />
  );
};
