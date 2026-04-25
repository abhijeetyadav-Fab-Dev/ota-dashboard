import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import bcrypt from "bcryptjs";
import crypto from "crypto";

interface UserRow {
  id: string; username: string; name: string; role: string;
  ota: string | null; teamLead: string | null; active: boolean; createdAt: string;
}

export async function GET() {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  const rows = await db.users.findMany({
    select: { id: true, username: true, name: true, role: true, ota: true, teamLead: true, active: true, createdAt: true },
    orderBy: [{ role: "asc" }, { name: "asc" }],
  }) as UserRow[];
  return Response.json({ users: rows });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const { username, password, name, role, ota, teamLead } = await req.json();
  if (!username || !password || !name || !role) {
    return Response.json({ error: "Missing required fields" }, { status: 400 });
  }

  const hash = bcrypt.hashSync(password, 10);
  const id   = "user_" + crypto.randomBytes(8).toString("hex");

  try {
    await db.users.create({
      data: {
        id, username, passwordHash: hash, name, role,
        ota: ota ?? null, teamLead: teamLead ?? null,
        active: true, createdAt: new Date().toISOString(),
      },
    });
  } catch {
    return Response.json({ error: "Username already exists" }, { status: 409 });
  }

  return Response.json({ ok: true, id });
}

export async function PATCH(req: Request) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id, password, name, role, ota, teamLead, active } = await req.json();
  if (!id) return Response.json({ error: "User id required" }, { status: 400 });

  if (password) {
    const hash = bcrypt.hashSync(password, 10);
    await db.users.update({ where: { id }, data: { passwordHash: hash } });
  }
  if (name     !== undefined) await db.users.update({ where: { id }, data: { name } });
  if (role     !== undefined) await db.users.update({ where: { id }, data: { role } });
  if (ota      !== undefined) await db.users.update({ where: { id }, data: { ota: ota ?? null } });
  if (teamLead !== undefined) await db.users.update({ where: { id }, data: { teamLead: teamLead ?? null } });
  if (active   !== undefined) await db.users.update({ where: { id }, data: { active: !!active } });

  return Response.json({ ok: true });
}
