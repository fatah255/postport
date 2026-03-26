import type { HTMLAttributes, PropsWithChildren } from "react";
import { cn } from "../lib/cn";

export const Card = ({ className, children, ...props }: PropsWithChildren<HTMLAttributes<HTMLDivElement>>) => {
  return (
    <div
      className={cn(
        "rounded-2xl border border-slate-200 bg-white/90 p-6 shadow-sm backdrop-blur dark:border-slate-800 dark:bg-slate-900/90",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
};

export const CardTitle = ({ className, children, ...props }: PropsWithChildren<HTMLAttributes<HTMLHeadingElement>>) => {
  return (
    <h3 className={cn("text-lg font-semibold tracking-tight text-slate-900 dark:text-slate-100", className)} {...props}>
      {children}
    </h3>
  );
};

export const CardDescription = ({
  className,
  children,
  ...props
}: PropsWithChildren<HTMLAttributes<HTMLParagraphElement>>) => {
  return (
    <p className={cn("text-sm text-slate-600 dark:text-slate-400", className)} {...props}>
      {children}
    </p>
  );
};
