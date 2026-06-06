const DEEPSEEK_API_URL = "https://api.deepseek.com/chat/completions";

/**
 * Translate English tweet content to Chinese using DeepSeek.
 * Falls back to empty string if API key missing or error.
 */
export async function translateToChinese(text: string): Promise<string | null> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) return null;

  // Skip if text is already mostly Chinese
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
        max_tokens: 1024,
      }),
    });

    if (!res.ok) return null;
    const data = await res.json();
    return data.choices?.[0]?.message?.content?.trim() || null;
  } catch {
    return null;
  }
}
