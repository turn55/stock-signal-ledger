import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const expected = process.env.CRON_SECRET;
  if (!expected || authHeader !== `Bearer ${expected}`) {
    // Also allow GET with secret query param
    const url = new URL(req.url);
    const secret = url.searchParams.get("secret");
    if (!secret || secret !== expected) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  // Return immediately; job runs in background
  runBackfill().catch(console.error);

  return NextResponse.json({ ok: true, status: "running" });
}

async function runBackfill() {
  const DEEPSEEK_API_URL = "https://api.deepseek.com/chat/completions";
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) { console.error("DEEPSEEK_API_KEY not set"); return; }

  async function translate(text: string): Promise<string | null> {
    const chineseChars = (text.match(/[一-鿿]/g) || []).length;
    if (chineseChars > text.length * 0.3) return null;
    try {
      const res = await fetch(DEEPSEEK_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: "deepseek-chat",
          messages: [
            { role: "system", content: "你是一个金融推文翻译助手。将英文股票推文翻译成简洁的中文，保留 $TICKER 符号、数字和百分比不变。只输出翻译结果，不要加任何解释。" },
            { role: "user", content: text }
          ],
          temperature: 0.1, max_tokens: 2048
        })
      });
      if (!res.ok) return null;
      const data = await res.json();
      return data.choices?.[0]?.message?.content?.trim() || null;
    } catch { return null; }
  }

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
      const zh = await translate(post.content);
      if (zh) {
        await prisma.post.update({ where: { id: post.id }, data: { contentZh: zh } });
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

// Support GET with ?secret= for easy browser trigger
export async function GET(req: NextRequest) {
  return POST(req);
}
