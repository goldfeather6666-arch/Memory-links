import { z } from "zod";

export const emailSchema = z
  .string()
  .trim()
  .min(1, "Email is required")
  .max(254)
  .refine((v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), {
    message: "Enter a valid email address",
  });

export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(200);

export const displayNameSchema = z
  .string()
  .trim()
  .min(1, "Name is required")
  .max(100);

export const signupSchema = z.object({
  email: emailSchema,
  displayName: displayNameSchema,
  password: passwordSchema,
});

export const signinSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Password is required"),
});

export const forgotPasswordSchema = z.object({ email: emailSchema });

export const resetPasswordSchema = z.object({
  token: z.string().min(1),
  password: passwordSchema,
});

export const verifyEmailSchema = z.object({ token: z.string().min(1) });

export const workspaceSchema = z.object({
  name: z.string().trim().min(1, "Workspace name is required").max(100),
  description: z.string().trim().max(500).optional().nullable(),
  settings: z.record(z.string(), z.unknown()).optional().nullable(),
});

export const projectSchema = z.object({
  workspaceId: z.string().min(1),
  name: z.string().trim().min(1, "Project name is required").max(200),
  description: z.string().trim().max(1000).optional().nullable(),
  status: z.enum(["active", "archived", "planned"]).optional().default("active"),
  metadata: z.record(z.string(), z.unknown()).optional().nullable(),
});

export const memoryRecordSchema = z.object({
  workspaceId: z.string().min(1),
  memoryType: z.enum(["episodic", "semantic", "procedural", "associative"]),
  content: z.string().trim().min(1).max(100000),
  summary: z.string().trim().max(20000).optional().nullable(),
  sourceRef: z.string().optional().nullable(),
  confidence: z.number().min(0).max(1).optional().nullable(),
  importance: z.number().int().min(0).max(100).optional().default(0),
  validFrom: z.string().datetime().optional().nullable(),
  validUntil: z.string().datetime().optional().nullable(),
  privacyClassification: z.enum(["private", "workspace"]).optional().default("private"),
  metadata: z.record(z.string(), z.unknown()).optional().nullable(),
});
