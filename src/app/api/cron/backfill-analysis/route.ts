import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyCronAuth } from "@/lib/cron-auth";
import { generateStockAnalysis } from "@/lib/kimi";
import type { StockProfile } from "@/lib/yahoo";

async function doBackfill() {
  const stocks = await prisma.stock.findMany({
    where: { analysis: null, profileData: { not: null } },
    select: { id: true, ticker: true, profileData: true },
    take: 5,
  });

  console.log(`Analysis backfill: ${stocks.length} stocks without analysis`);

  for (const stock of stocks) {
    try {
      const content = await generateStockAnalysis(
        stock.ticker,
        stock.profileData as unknown as StockProfile
      );
      if (content) {
        await prisma.stockAnalysis.create({
          data: { stockId: stock.id, content },
        });
        console.log(`[analysis] OK ${stock.ticker}`);
      } else {
        console.log(`[analysis] SKIP ${stock.ticker} (empty)`);
      }
    } catch (e) {
      console.log(`[analysis] ERROR ${stock.ticker}: ${e}`);
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  console.log("Analysis backfill done!");
}

async function handler(req: NextRequest) {
  const secretParam = req.nextUrl.searchParams.get("secret");
  if (secretParam) {
    const expected = process.env.CRON_SECRET;
    if (!expected || secretParam !== expected) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  } else {
    const authError = verifyCronAuth(req);
    if (authError) return authError;
  }

  doBackfill().catch(console.error);
  return NextResponse.json({ ok: true, status: "running" });
}

export const GET = handler;
export const POST = handler;
