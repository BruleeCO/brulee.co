import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

type TranscriptAttachment = {
  kind?: string;
  source?: "url" | "upload";
  name?: string;
  url?: string;
  previewUrl?: string;
};

type TranscriptEntry = {
  role: "interviewer" | "participant";
  text: string;
  attachments?: TranscriptAttachment[];
};

const DEFAULT_PROMPT = `You are conducting an oral-history interview for Brulee, a consent-centered Burning Man camp/community.

Your job is to ask one warm, specific follow-up question at a time. This must feel like an interview, not a form.

Interview goals:
- Start with a pleasant greeting.
- Ask where the participant is from.
- Ask how they found Brulee.
- Ask what years they joined or which years feel most connected to their story.
- Elicit concrete memories and sensory details.
- Ask about belonging, play, care, consent, safety, participation, and what could improve.
- If the participant shared an image, ask about the image directly and invite them to describe what it shows and why it matters.
- Respect boundaries. Do not pressure the participant to disclose trauma or identifying details.
- When the conversation has enough substance, return [[COMPLETE]].

Return ONLY the next question as plain text.
Do not include JSON.
Do not introduce the question with labels or commentary.
Do not say "Here is".
Do not begin with an acknowledgement like "That's great" or "And".
Write one complete question only, ending with a question mark.

Completion guidance:
- Continue for at least 6 participant answers unless the participant wants to stop.
- Complete by 12 participant answers.
- If the participant says they are done, complete.
- On the first participant reply, ask how they found Brulee.
- On the second participant reply, ask what years they joined or which years feel most connected to their story.
- After those openings, move into a specific memory, then a photo or link if they add one.
- Ground each question in a concrete Brulee detail from the site or from the participant's answer.
- Prefer questions that mention Brulee, the camp, Join, Facebook group, Radical Consent, Etiquette & Protocol, Consent Incident Report, or the 2024 pages.`;

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

function attachmentSummary(attachment: TranscriptAttachment): string {
  if (attachment.source === "upload") {
    return `uploaded image ${attachment.name || "image"}`;
  }
  if (attachment.url) {
    return `image link ${attachment.url}`;
  }
  return attachment.name || "image";
}

function buildPrompt(basePrompt: string, transcript: TranscriptEntry[]): string {
  const conversation = transcript
    .slice(-18)
    .flatMap((entry) => {
      const blocks = [`${entry.role === "interviewer" ? "Brulee interviewer" : "Participant"}: ${entry.text}`];
      if (Array.isArray(entry.attachments) && entry.attachments.length) {
        blocks.push(
          ...entry.attachments.map((attachment, index) => `Attachment ${index + 1}: ${attachmentSummary(attachment)}`)
        );
      }
      return blocks;
    })
    .join("\n\n");

  return `${basePrompt.trim()}

Conversation so far:
${conversation || "(new interview)"}`;
}

async function askGemini(prompt: string, transcript: TranscriptEntry[]) {
  if (!GEMINI_API_KEY) {
    return jsonResponse({ error: "Gemini API key is not configured" }, 500);
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: buildPrompt(prompt || DEFAULT_PROMPT, transcript) }] }],
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
  const text = String(data.candidates?.[0]?.content?.parts?.[0]?.text || "").trim();
  const complete = text.includes("[[COMPLETE]]");
  const question = text.replace(/\[\[COMPLETE\]\]/g, "").replace(/^["']|["']$/g, "").trim();

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
    const prompt = typeof body.prompt === "string" ? body.prompt : DEFAULT_PROMPT;
    return await askGemini(prompt, transcript);
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "Unknown error" }, 400);
  }
});
