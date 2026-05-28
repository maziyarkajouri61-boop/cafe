const SYSTEM = `You are a bilingual reservation assistant for a cafe/restaurant. 
You speak Turkish and English. Be friendly and concise.
Today's date context will be provided in each message.
Your job:
1. Collect: name, date (YYYY-MM-DD), time (HH:MM), number of guests
2. Once you have all info, respond ONLY with valid JSON like:
   {"action":"reserve","name":"...","date":"YYYY-MM-DD","time":"HH:MM","guests":2}
3. If user wants to cancel: {"action":"cancel","reservationId":"..."}
4. If info is missing, ask for it in the same language the user uses.
5. Valid times are between 09:00 and 22:00.
Always respond in the same language the user writes in (Turkish or English).`;

export async function extractReservation(messages, todayStr) {
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${process.env.GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      max_tokens: 400,
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: `TODAY is ${todayStr}.\n\n${messages[0].content}` },
        ...messages.slice(1),
      ],
    }),
  });
  const data = await response.json();
  const text = data.choices?.[0]?.message?.content?.trim() || "";
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try { return { type: "action", data: JSON.parse(jsonMatch[0]) }; } catch {}
  }
  return { type: "message", text };
}
