import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const numId = Number(id);
  if (Number.isNaN(numId)) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }

  const body = await request.json();
  const data: Record<string, unknown> = {};

  if (typeof body.favorited === "boolean") {
    data.favorited = body.favorited;
  }
  if (Array.isArray(body.topics)) {
    data.topics = JSON.stringify(body.topics);
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "nothing to update" }, { status: 400 });
  }

  const updated = await prisma.pageVisit.update({
    where: { id: numId },
    data,
  });

  return NextResponse.json({ ok: true, page: updated });
}
