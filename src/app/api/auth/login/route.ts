import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { getServiceSupabase } from "@/lib/supabase";
import { sessionCookieHeader, signSession } from "@/lib/auth";

const loginSchema = z
  .object({
    email: z.string().email().optional(),
    phone: z.string().min(7).max(20).optional(),
    password: z.string().min(1, "Password is required"),
  })
  .refine((v) => v.email || v.phone, {
    message: "Provide email or phone",
    path: ["email"],
  });

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }

  const { email, phone, password } = parsed.data;
  const supabase = getServiceSupabase();

  // Users table has separate unique phone / email columns — match either.
  let query = supabase.from("users").select("id, name, role, password_hash");
  if (email) query = query.eq("email", email.toLowerCase().trim());
  else query = query.eq("phone", phone!.trim());

  const { data: user, error } = await query.maybeSingle();
  if (error || !user) {
    return NextResponse.json(
      { error: "Invalid credentials" },
      { status: 401 }
    );
  }

  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) {
    return NextResponse.json(
      { error: "Invalid credentials" },
      { status: 401 }
    );
  }

  const token = await signSession({
    sub: user.id,
    role: user.role,
    name: user.name,
  });

  const res = NextResponse.json({
    user: { id: user.id, name: user.name, role: user.role },
  });
  // httpOnly session cookie — never readable from JS.
  res.headers.set("Set-Cookie", sessionCookieHeader(token));
  return res;
}
