(function () {
  const STORAGE_KEY = "bruleeInterviewTranscript";
  const recipient = "daniel@brulee.co";
  const endpoint =
    document.querySelector('meta[name="brulee-interview-endpoint"]')?.content.trim() ||
    window.BRULEE_INTERVIEW_ENDPOINT ||
    "";

  const fallbackPrompts = [
    "Before we get into the story, what name should I use for you, or would you rather stay anonymous?",
    "How did you first find your way into Brulee?",
    "Take me to a specific moment there. What was happening around you?",
    "What did that moment feel like in your body or mood?",
    "Was there a moment of care, consent, play, or trust that stands out?",
    "What was complicated, hard, or worth improving?",
    "What do you hope Brulee remembers from your experience?",
    "If someone quoted from this interview later, what boundaries or attribution preferences should they honor?",
    "Is there anything I did not ask that you wish people understood?"
  ];

  const messages = document.getElementById("messages");
  const input = document.getElementById("answer-input");
  const sendButton = document.getElementById("send-answer");
  const status = document.getElementById("interview-status");
  const hint = document.getElementById("composer-hint");
  const completeActions = document.getElementById("complete-actions");
  const emailLink = document.getElementById("email-transcript");

  let promptIndex = 0;
  let transcript = [];
  let complete = false;
  let busy = false;

  const storage = {
    get() {
      try {
        return window.localStorage?.getItem(STORAGE_KEY) || null;
      } catch (error) {
        return null;
      }
    },
    set(value) {
      try {
        window.localStorage?.setItem(STORAGE_KEY, value);
      } catch (error) {
        // Some embedded browsers disable localStorage. The interview still works.
      }
    },
    remove() {
      try {
        window.localStorage?.removeItem(STORAGE_KEY);
      } catch (error) {
        // Ignore unavailable storage.
      }
    }
  };

  function addMessage(role, text) {
    const node = document.createElement("div");
    node.className = `message ${role}`;
    node.textContent = text;
    messages.appendChild(node);
    messages.scrollTop = messages.scrollHeight;
  }

  function saveDraft() {
    storage.set(JSON.stringify({ promptIndex, transcript, complete }));
  }

  function loadDraft() {
    try {
      const saved = JSON.parse(storage.get());
      if (!saved || !Array.isArray(saved.transcript)) return false;
      promptIndex = saved.promptIndex || 0;
      transcript = saved.transcript;
      complete = !!saved.complete;
      transcript.forEach((entry) => addMessage(entry.role, entry.text));
      return transcript.length > 0;
    } catch (error) {
      return false;
    }
  }

  function setBusy(value) {
    busy = value;
    sendButton.disabled = value || complete;
    input.disabled = value || complete;
    status.textContent = value ? "Listening closely..." : complete ? "Complete" : "Interviewing";
  }

  function interviewerSays(text) {
    transcript.push({ role: "interviewer", text });
    addMessage("bot", text);
    saveDraft();
  }

  function participantSays(text) {
    transcript.push({ role: "participant", text });
    addMessage("user", text);
    saveDraft();
  }

  function transcriptText() {
    return transcript
      .filter((entry) => entry.id !== "closing")
      .map((entry) => `${entry.role === "interviewer" ? "Interviewer" : "Participant"}: ${entry.text}`)
      .join("\n\n");
  }

  function updateEmailLink() {
    const subject = encodeURIComponent("Brulee experience interview");
    const body = encodeURIComponent(transcriptText());
    emailLink.href = `mailto:${recipient}?subject=${subject}&body=${body}`;
  }

  function finishInterview() {
    complete = true;
    setBusy(false);
    input.value = "";
    input.placeholder = "Interview complete";
    hint.textContent = "Transcript ready.";
    completeActions.hidden = false;
    if (!transcript.some((entry) => entry.id === "closing")) {
      const closing = "Thank you. I have enough for a thoughtful transcript. You can copy, download, or email it now.";
      transcript.push({ role: "interviewer", id: "closing", text: closing });
      addMessage("bot", closing);
    }
    updateEmailLink();
    saveDraft();
  }

  function fallbackNextQuestion(lastAnswer) {
    const lower = lastAnswer.toLowerCase();
    if (lastAnswer.length < 90 && promptIndex > 1 && promptIndex < fallbackPrompts.length - 1) {
      return "Can you stay with that a little longer and tell me what made it matter?";
    }
    if (lower.includes("consent") || lower.includes("safe") || lower.includes("unsafe")) {
      return "What would you want organizers or campmates to learn from that?";
    }
    const next = fallbackPrompts[promptIndex];
    promptIndex += 1;
    return next;
  }

  async function aiNextQuestion() {
    if (!endpoint) return null;
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transcript })
    });
    if (!response.ok) throw new Error(`Interview endpoint returned ${response.status}`);
    return response.json();
  }

  async function continueInterview(answer) {
    participantSays(answer);
    setBusy(true);

    try {
      const ai = await aiNextQuestion();
      if (ai?.complete) {
        finishInterview();
        return;
      }
      if (ai?.question) {
        interviewerSays(ai.question);
        hint.textContent = ai.hint || "Take your time.";
        return;
      }
    } catch (error) {
      hint.textContent = "Using local interviewer while the AI endpoint is unavailable.";
    } finally {
      setBusy(false);
    }

    if (promptIndex >= fallbackPrompts.length) {
      finishInterview();
      return;
    }
    interviewerSays(fallbackNextQuestion(answer));
  }

  sendButton.addEventListener("click", () => {
    const answer = input.value.trim();
    if (!answer || busy || complete) return;
    input.value = "";
    continueInterview(answer);
  });

  input.addEventListener("keydown", (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      sendButton.click();
    }
  });

  document.getElementById("reset-interview").addEventListener("click", () => {
    if (!confirm("Start over and clear this interview draft?")) return;
    storage.remove();
    promptIndex = 0;
    transcript = [];
    complete = false;
    messages.innerHTML = "";
    completeActions.hidden = true;
    input.disabled = false;
    sendButton.disabled = false;
    input.placeholder = "Answer in your own words...";
    hint.textContent = "Press Reply when you are ready.";
    interviewerSays(fallbackPrompts[promptIndex]);
    promptIndex += 1;
    status.textContent = "Interviewing";
  });

  document.getElementById("copy-transcript").addEventListener("click", async () => {
    await navigator.clipboard.writeText(transcriptText());
    status.textContent = "Copied";
  });

  document.getElementById("download-transcript").addEventListener("click", () => {
    const blob = new Blob([transcriptText()], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "brulee-experience-interview.txt";
    link.click();
    URL.revokeObjectURL(url);
  });

  if (!loadDraft()) {
    interviewerSays(fallbackPrompts[promptIndex]);
    promptIndex += 1;
  }

  if (complete) {
    finishInterview();
  } else {
    status.textContent = endpoint ? "AI interviewer ready" : "Interviewing";
  }
})();
