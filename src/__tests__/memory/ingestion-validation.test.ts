import { describe, expect, it } from "vitest";
import { requireValidIngestionInput } from "@/server/memory/ingestion";
import { ValidationError } from "@/server/memory/errors";
import type { IngestionInput } from "@/server/memory/types";

const valid: IngestionInput = {
  workspaceId: "6a7e2b9e-3f9a-4c5d-8f1a-2b3c4d5e6f70",
  sourceType: "text",
  content: "Hello",
};

describe("requireValidIngestionInput", () => {
  it("accepts a valid input", () => {
    expect(() => requireValidIngestionInput(valid)).not.toThrow();
  });

  it("rejects a missing workspaceId", () => {
    expect(() => requireValidIngestionInput({ ...valid, workspaceId: "" })).toThrow(ValidationError);
    expect(() => requireValidIngestionInput({ ...valid, workspaceId: undefined as never })).toThrow(ValidationError);
  });

  it("rejects unsupported source types", () => {
    expect(() => requireValidIngestionInput({ ...valid, sourceType: "csv" as never })).toThrow(ValidationError);
    expect(() => requireValidIngestionInput({ ...valid, sourceType: undefined as never })).toThrow(ValidationError);
  });
});
