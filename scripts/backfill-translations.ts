/**
 * One-off script: backfill Chinese translations for existing posts using DeepSeek.
 * Run from Railway Shell: npx tsx scripts/backfill-translations.ts
 */

import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const DEEPSEEK_API_URL = "https://api.deepseek.com/chat/completions";

async function translate(text: string): Promise<string | null> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) return null;

  const chineseChars = (text.match(/[一-鿿]/g) || []).length;
  if (chineseChars > text.length * 0.3) return null;

  try {
    const res = await fetch(DEEPSEEK_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: [
          {
            role: "system",
            content:
              "你是一个金融推文翻译助手。将英文股票推文翻译成简洁的中文，保留 $TICKER 符号、数字和百分比不变。只输出翻译结果，不要加任何解释。",
          },
          { role: "user", content: text },
        ],
        temperature: 0.1,
        max_tokens: 2048,
      }),
    });

    if (!res.ok) return null;
    const data = await res.json();
    return data.choices?.[0]?.message?.content?.trim() || null;
  } catch {
    return null;
  }
}

async function main() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
  const prisma = new PrismaClient({ adapter });

  const posts = await prisma.post.findMany({
    where: { contentZh: null },
    orderBy: { postedAt: "desc" },
    take: 45,
  });

  console.log(`Found ${posts.length} posts without translation`);

  for (let i = 0; i < posts.length; i++) {
    const post = posts[i];
    try {
      const zh = await translate(post.content);
      if (zh) {
        await prisma.post.update({
          where: { id: post.id },
          data: { contentZh: zh },
        });
        console.log(`[${i + 1}/${posts.length}] OK @${post.id.slice(0, 8)}`);
      } else {
        console.log(`[${i + 1}/${posts.length}] SKIP (no translation)`);
      }
    } catch (e) {
      console.log(`[${i + 1}/${posts.length}] ERROR ${e}`);
    }
    // Rate limit: 1 sec between calls
    await new Promise((r) => setTimeout(r, 1000));
  }

  console.log("Done!");
  await prisma.$disconnect();
}

main().catch(console.error).finally(() => process.exit(0));
