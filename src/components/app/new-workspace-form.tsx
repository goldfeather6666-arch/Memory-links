"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createWorkspaceAction } from "@/server/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function NewWorkspaceForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await createWorkspaceAction({ name, description });
    setLoading(false);
    if (!res.ok) {
      setError(res.error ?? "Could not create workspace.");
      return;
    }
    router.push(`/app?ws=${res.id}`);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div>
        <Label htmlFor="ws-name">Workspace name</Label>
        <Input
          id="ws-name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="My workspace"
        />
      </div>
      <div>
        <Label htmlFor="ws-desc">Description (optional)</Label>
        <Input
          id="ws-desc"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What is this workspace for?"
        />
      </div>
      {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
      <Button type="submit" loading={loading}>
        {loading ? "Creating…" : "Create workspace"}
      </Button>
    </form>
  );
}
