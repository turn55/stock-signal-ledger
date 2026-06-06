const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
const apiKey = process.env.DEEPSEEK_API_KEY;
if (!apiKey) { console.error('DEEPSEEK_API_KEY not set'); process.exit(1); }

async function translate(text) {
  const chineseChars = (text.match(/[一-鿿]/g) || []).length;
  if (chineseChars > text.length * 0.3) return null;
  try {
    const res = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: '你是一个金融推文翻译助手。将英文股票推文翻译成简洁的中文，保留 $TICKER 符号、数字和百分比不变。只输出翻译结果，不要加任何解释。' },
          { role: 'user', content: text }
        ],
        temperature: 0.1, max_tokens: 2048
      })
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.choices?.[0]?.message?.content?.trim() || null;
  } catch { return null; }
}

async function main() {
  const { rows } = await pool.query("SELECT id, content FROM posts WHERE content_zh IS NULL ORDER BY posted_at DESC LIMIT 45");
  console.log(`Found ${rows.length} posts without translation`);

  for (let i = 0; i < rows.length; i++) {
    const { id, content } = rows[i];
    try {
      const zh = await translate(content);
      if (zh) {
        await pool.query("UPDATE posts SET content_zh = $1 WHERE id = $2", [zh, id]);
        console.log(`[${i + 1}/${rows.length}] OK`);
      } else {
        console.log(`[${i + 1}/${rows.length}] SKIP`);
      }
    } catch (e) {
      console.log(`[${i + 1}/${rows.length}] ERROR ${e.message}`);
    }
    await new Promise(r => setTimeout(r, 1000));
  }

  console.log('Done!');
  await pool.end();
}

main();
