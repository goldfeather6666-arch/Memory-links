"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useReducedMotion } from "@/lib/hooks/use-reduced-motion";

export default function IntroLoader() {
  const reducedMotion = useReducedMotion();
  const [visible, setVisible] = useState(() => !reducedMotion);

  useEffect(() => {
    if (reducedMotion) return;

    const timer = window.setTimeout(() => setVisible(false), 1600);
    return () => window.clearTimeout(timer);
  }, [reducedMotion]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className="fixed inset-0 z-50 grid place-items-center bg-obsidian"
          exit={{ opacity: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          aria-hidden="true"
        >
          <div className="text-center">
            <motion.span
              initial={{ opacity: 0, letterSpacing: "0.35em" }}
              animate={{ opacity: 1, letterSpacing: "0.12em" }}
              transition={{ duration: 0.8, ease: "easeOut" }}
              className="block text-2xl font-medium tracking-[0.35em] text-soft-white uppercase sm:text-3xl"
            >
              Mnemosyne
            </motion.span>
            <motion.span
              initial={{ opacity: 0, scaleX: 0.2 }}
              animate={{ opacity: 1, scaleX: 1 }}
              transition={{ delay: 0.5, duration: 0.6 }}
              className="mt-4 block h-px w-24 origin-center bg-violet"
            />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
