"use client";

import { useState } from "react";
import { createProjectAction } from "@/server/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function NewProjectForm({ workspaceId }: { workspaceId: string }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [created, setCreated] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await createProjectAction({ workspaceId, name, description });
    setLoading(false);
    if (!res.ok) {
      setError(res.error ?? "Could not create project.");
      return;
    }
    setName("");
    setDescription("");
    setCreated(true);
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div>
        <Label htmlFor="project-name">Project name</Label>
        <Input id="project-name" required value={name} onChange={(e) => setName(e.target.value)} placeholder="New project" />
      </div>
      <div>
        <Label htmlFor="project-desc">Description (optional)</Label>
        <Input id="project-desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What is this project about?" />
      </div>
      {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
      {created && <p className="text-sm text-emerald-400">Project created.</p>}
      <Button type="submit" loading={loading}>
        {loading ? "Creating…" : "Create project"}
      </Button>
    </form>
  );
}
