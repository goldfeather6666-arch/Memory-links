import { NextResponse } from "next/server";
import { destroySession } from "@/server/auth/session";
import { SESSION_COOKIE } from "@/server/auth/constants";

export async function POST(req: Request) {
  const cookieStore = req.headers.get("cookie") ?? "";
  const token = cookieStore
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${SESSION_COOKIE}=`))
    ?.split("=")
    .slice(1)
    .join("=");

  await destroySession(token);

  const response = NextResponse.json({ ok: true });
  response.cookies.set({
    name: SESSION_COOKIE,
    value: "",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: new Date(0),
  });
  return response;
}
