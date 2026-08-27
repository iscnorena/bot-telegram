import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Healthcheck: confirma que el deploy responde y que la DB está accesible. */
export async function GET(): Promise<Response> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ ok: true, db: "up" });
  } catch (err) {
    return NextResponse.json(
      { ok: false, db: "down", error: (err as Error).message },
      { status: 503 },
    );
  }
}
