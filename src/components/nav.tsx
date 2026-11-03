"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { cn } from "@/utils/cn";

const LINK_GROUPS = [
  { href: "#hero", label: "Overview" },
  { href: "#problem", label: "The Problem" },
  { href: "#solution", label: "The Solution" },
  { href: "#dimensions", label: "Dimensions" },
  { href: "#digital-universe", label: "Digital Universe" },
  { href: "#agent-memory", label: "Agent Memory" },
  { href: "#knowledge-graph", label: "Knowledge Graph" },
  { href: "#privacy", label: "Privacy" },
];

export default function Nav() {
  const menuId = useId();
  const [open, setOpen] = useState(false);

  return (
    <motion.header
      initial={{ y: -24, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      className="fixed inset-x-0 top-0 z-40 px-4 pt-4"
    >
      <nav
        aria-label="Primary"
        className="glass mx-auto flex max-w-6xl items-center justify-between rounded-full py-2 pr-2 pl-5"
      >
        <Link
          href="#hero"
          className="flex items-center gap-2 text-sm font-semibold tracking-[0.18em] text-soft-white uppercase"
        >
          <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full bg-violet" />
          Mnemosyne
        </Link>

        <ul className="hidden items-center gap-1 lg:flex">
          {LINK_GROUPS.map((link) => (
            <li key={link.href}>
              <Link
                href={link.href}
                className="rounded-full px-3 py-2 text-sm text-slate transition-colors hover:bg-soft-white/5 hover:text-soft-white"
              >
                {link.label}
              </Link>
            </li>
          ))}
        </ul>

        <div className="flex items-center gap-2">
          <Link
            href="#final-cta"
            className="hidden rounded-full bg-violet px-4 py-2 text-sm font-medium text-soft-white transition-colors hover:bg-violet/85 sm:inline-flex"
          >
            Early access
          </Link>

          <button
            type="button"
            aria-expanded={open}
            aria-controls={menuId}
            aria-label={open ? "Close menu" : "Open menu"}
            onClick={() => setOpen((value) => !value)}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full text-soft-white transition-colors hover:bg-soft-white/5 lg:hidden"
          >
            <span aria-hidden="true" className="relative block h-3.5 w-5">
              <span
                className={cn(
                  "absolute left-0 block h-0.5 w-full bg-current transition-transform duration-300",
                  open && "top-1/2 -translate-y-1/2 rotate-45",
                )}
                style={{ top: open ? undefined : 0 }}
              />
              <span
                className={cn(
                  "absolute bottom-0 left-0 block h-0.5 w-full bg-current transition-transform duration-300",
                  open && "bottom-auto top-1/2 -translate-y-1/2 -rotate-45",
                )}
              />
            </span>
          </button>
        </div>
      </nav>

      <AnimatePresence>
        {open && (
          <motion.div
            id={menuId}
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25 }}
            className="glass mx-auto mt-3 max-w-6xl rounded-2xl p-3 lg:hidden"
          >
            <ul className="flex flex-col">
              {LINK_GROUPS.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    onClick={() => setOpen(false)}
                    className="block rounded-xl px-4 py-3 text-sm text-slate transition-colors hover:bg-soft-white/5 hover:text-soft-white"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
              <li>
                <Link
                  href="#final-cta"
                  onClick={() => setOpen(false)}
                  className="mt-2 block rounded-xl bg-violet px-4 py-3 text-center text-sm font-medium text-soft-white"
                >
                  Early access
                </Link>
              </li>
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.header>
  );
}
