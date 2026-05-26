import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PATCH(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const numId = Number(id);
  if (Number.isNaN(numId)) {
    return NextResponse.json({ ok: false, error: "invalid id" }, { status: 400 });
  }

  const page = await prisma.pageVisit.findUnique({ where: { id: numId } });
  if (!page) {
    return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
  }

  const updated = await prisma.pageVisit.update({
    where: { id: numId },
    data: { favorited: !page.favorited },
  });

  return NextResponse.json({ ok: true, favorited: updated.favorited });
}
