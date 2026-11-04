import { NextResponse } from "next/server";
import { signup } from "@/server/auth/service";
import { signupSchema } from "@/server/validation/schemas";

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const parsed = signupSchema.safeParse(body);
  if (!parsed.success) {
    const first = parsed.error.issues[0]?.message ?? "Validation failed.";
    return NextResponse.json({ error: first }, { status: 400 });
  }

  try {
    const { user, emailSent } = await signup(parsed.data);
    return NextResponse.json(
      {
        ok: true,
        user: {
          id: user.id,
          email: user.email,
          displayName: user.displayName,
        },
        emailSent,
      },
      { status: 201 },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    if (message.includes("duplicate key")) {
      return NextResponse.json(
        { error: "An account with this email already exists." },
        { status: 409 },
      );
    }
    return NextResponse.json(
      { error: "Unable to create the account. Please try again." },
      { status: 500 },
    );
  }
}
