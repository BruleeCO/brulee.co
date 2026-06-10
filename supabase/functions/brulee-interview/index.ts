import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

type TranscriptEntry = {
  role: "interviewer" | "participant";
  text: string;
};

const GEMINI_API_KEY =
  Deno.env.get("GEMINI_API_KEY") ||
  Deno.env.get("GCP_API_KEY") ||
  Deno.env.get("GOOGLE_API_KEY") ||
  "";

const GEMINI_MODEL = Deno.env.get("GEMINI_MODEL") || "gemini-2.5-flash";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function buildPrompt(transcript: TranscriptEntry[]): string {
  const conversation = transcript
    .slice(-18)
    .map((entry) => `${entry.role === "interviewer" ? "Interviewer" : "Participant"}: ${entry.text}`)
    .join("\n\n");

  return `You are conducting an oral-history interview for Brulee, a consent-centered Burning Man camp/community.

Your job is to ask one warm, specific follow-up question at a time. This must feel like an interview, not a form.

Interview goals:
- Elicit concrete memories and sensory details.
- Ask about belonging, play, care, consent, safety, participation, and what could improve.
- Respect boundaries. Do not pressure the participant to disclose trauma or identifying details.
- When the conversation has enough substance, return [[COMPLETE]].

Return ONLY the next question as plain text.
Do not include JSON.
Do not introduce the question with labels or commentary.
Do not say "Here is".

Completion guidance:
- Continue for at least 6 participant answers unless the participant wants to stop.
- Complete by 12 participant answers.
- If the participant says they are done, complete.

Conversation so far:
${conversation || "(new interview)"}`;
}

async function askGemini(transcript: TranscriptEntry[]) {
  if (!GEMINI_API_KEY) {
    return jsonResponse({ error: "Gemini API key is not configured" }, 500);
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: buildPrompt(transcript) }] }],
      generationConfig: {
        temperature: 0.72,
        maxOutputTokens: 220,
      },
    }),
  });

  if (!response.ok) {
    return jsonResponse({ error: `Gemini API error ${response.status}` }, 502);
  }

  const data = await response.json();
  const text = (data.candidates?.[0]?.content?.parts?.[0]?.text || "").trim();
  const complete = text.includes("[[COMPLETE]]");
  let question = text
    .replace(/\[\[COMPLETE\]\]/g, "")
    .replace(/^["']|["']$/g, "")
    .trim();

  if (
    !complete &&
    (!question ||
      question.length < 52 ||
      /^can you tell me (a little )?more\\??$/i.test(question) ||
      /\\bat\\?$/i.test(question))
  ) {
    question = "What did people do in that moment that made the welcome feel real?";
  } else if (!complete && question && !/[?.!]$/.test(question)) {
    question += "?";
  }

  return jsonResponse({
    question,
    hint: "",
    complete,
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    const body = await req.json();
    const transcript = Array.isArray(body.transcript) ? body.transcript : [];
    return await askGemini(transcript);
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "Unknown error" }, 400);
  }
});
