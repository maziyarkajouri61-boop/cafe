import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM = `You are a bilingual reservation assistant for a cafe/restaurant. 
You speak Turkish and English. Be friendly and concise.
Today's date context will be provided in each message.

Your job:
1. Collect: name, date (YYYY-MM-DD), time (HH:MM), number of guests
2. Once you have all info, respond ONLY with valid JSON like:
   {"action":"reserve","name":"...","date":"YYYY-MM-DD","time":"HH:MM","guests":2}
3. If user wants to cancel: {"action":"cancel","reservationId":"..."}
4. If user asks about the menu/hours/location, answer helpfully and stay in character.
5. If info is missing, ask for it naturally in the same language the user uses.
6. For dates like "tomorrow" or "bugün", calculate based on TODAY provided.
7. Valid times are between 09:00 and 22:00.

Always respond in the same language the user writes in (Turkish or English).`;

export async function extractReservation(messages, todayStr) {
  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 400,
    system: SYSTEM,
    messages: [
      { role: "user", content: `TODAY is ${todayStr}.\n\n${messages[0].content}` },
      ...messages.slice(1),
    ],
  });

  const text = response.content[0].text.trim();

  // Try to parse JSON action
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      return { type: "action", data: JSON.parse(jsonMatch[0]) };
    } catch {
      // not valid JSON, treat as message
    }
  }

  return { type: "message", text };
}
