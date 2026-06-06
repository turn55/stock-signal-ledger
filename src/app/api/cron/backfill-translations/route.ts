import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { translateToChinese } from "@/lib/translate";

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const expected = process.env.CRON_SECRET;
  if (!expected || authHeader !== `Bearer ${expected}`) {
    const url = new URL(req.url);
    const secret = url.searchParams.get("secret");
    if (!secret || secret !== expected) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  runBackfill().catch(console.error);
  return NextResponse.json({ ok: true, status: "running" });
}

export async function GET(req: NextRequest) {
  return POST(req);
}

async function runBackfill() {
  const posts = await prisma.post.findMany({
    where: { contentZh: null },
    orderBy: { postedAt: "desc" },
    take: 50,
    select: { id: true, content: true },
  });

  console.log(`Backfill: ${posts.length} posts without translation`);

  for (let i = 0; i < posts.length; i++) {
    const post = posts[i];
    try {
      const zh = await translateToChinese(post.content);
      if (zh) {
        await prisma.post.update({
          where: { id: post.id },
          data: { contentZh: zh },
        });
        console.log(`[${i + 1}/${posts.length}] OK`);
      } else {
        console.log(`[${i + 1}/${posts.length}] SKIP`);
      }
    } catch (e) {
      console.log(`[${i + 1}/${posts.length}] ERROR ${e}`);
    }
    await new Promise((r) => setTimeout(r, 1200));
  }
  console.log("Backfill done!");
}
