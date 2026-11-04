import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "@/utils/cn";

type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  invalid?: boolean;
};

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, invalid, id, ...props },
  ref,
) {
  return (
    <input
      ref={ref}
      id={id}
      aria-invalid={invalid || undefined}
      className={cn(
        "h-11 w-full rounded-xl border border-soft-white/15 bg-midnight/60 px-4 text-sm text-soft-white placeholder:text-slate transition-colors",
        "focus:border-violet focus:outline-none",
        invalid && "border-red-500/70",
        className,
      )}
      {...props}
    />
  );
});
