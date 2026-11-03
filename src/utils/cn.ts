type ClassValue =
  | string
  | number
  | null
  | undefined
  | boolean
  | ClassValue[]
  | { [key: string]: boolean | null | undefined };

function resolveClassValue(value: ClassValue): string {
  if (!value) {
    return "";
  }
  if (typeof value === "string" || typeof value === "number") {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value.map(resolveClassValue).filter(Boolean).join(" ");
  }
  if (value && typeof value === "object") {
    return Object.entries(value)
      .filter(([, active]) => active)
      .map(([key]) => key)
      .join(" ");
  }
  return "";
}

export function cn(...inputs: ClassValue[]): string {
  return inputs.map(resolveClassValue).filter(Boolean).join(" ");
}
