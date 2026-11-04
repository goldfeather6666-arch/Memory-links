"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";
import { Icon } from "@/components/app/icons";

export function WorkspaceSwitcher({
  workspaces,
  current,
}: {
  workspaces: { id: string; name: string }[];
  current: string;
}) {
  const router = useRouter();
  const params = useSearchParams();

  const onChange = useCallback(
    (value: string) => {
      const next = new URLSearchParams(params.toString());
      next.set("ws", value);
      router.push(`/app?${next.toString()}`);
    },
    [params, router],
  );

  return (
    <label className="flex items-center gap-2 text-sm">
      <Icon name="layers" size={16} className="text-slate" />
      <span className="sr-only">Workspace</span>
      <select
        value={current}
        onChange={(e) => onChange(e.target.value)}
        aria-label="Active workspace"
        className="h-9 rounded-xl border border-soft-white/15 bg-midnight/60 px-3 text-sm text-soft-white focus:border-violet focus:outline-none"
      >
        {workspaces.map((w) => (
          <option key={w.id} value={w.id}>
            {w.name}
          </option>
        ))}
      </select>
    </label>
  );
}
