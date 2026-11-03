"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { cn } from "@/utils/cn";
import { useReducedMotion } from "@/lib/hooks/use-reduced-motion";

export default function ScrollIndicator({ className }: { className?: string }) {
  const reducedMotion = useReducedMotion();

  return (
    <Link
      href="#problem"
      aria-label="Scroll to the problem section"
      className={cn(
        "group inline-flex flex-col items-center gap-2 text-slate transition-colors hover:text-soft-white",
        className,
      )}
    >
      <span className="text-xs tracking-[0.25em] uppercase">Scroll</span>
      <span className="flex h-12 w-7 items-start justify-center rounded-full border border-slate/40 pt-2">
        <motion.span
          aria-hidden="true"
          className="block h-2 w-1 rounded-full bg-violet"
          animate={reducedMotion ? undefined : { y: [0, 12, 0], opacity: [1, 0.4, 1] }}
          transition={
            reducedMotion
              ? undefined
              : { duration: 1.6, ease: "easeInOut", repeat: Infinity }
          }
        />
      </span>
    </Link>
  );
}
