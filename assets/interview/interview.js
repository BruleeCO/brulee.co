(function () {
  const STORAGE_KEY = "bruleeInterviewTranscript";
  const recipient = "daniel@brulee.co";
  const endpoint =
    document.querySelector('meta[name="brulee-interview-endpoint"]')?.content.trim() ||
    window.BRULEE_INTERVIEW_ENDPOINT ||
    "";

  const interviewPrompt = [
    "You are conducting an oral-history interview for Brulee, a consent-centered Burning Man camp/community.",
    "",
    "Your job is to ask one warm, specific follow-up question at a time. This must feel like an interview, not a form.",
    "",
    "Interview goals:",
    "- Start with a pleasant greeting.",
    "- Ask where the participant is from.",
    "- Ask how they found Brulee.",
    "- Ask what years they joined or which years feel most connected to their story.",
    "- Elicit concrete memories and sensory details.",
    "- Ask about belonging, play, care, consent, safety, participation, and what could improve.",
    "- If the participant shared an image, ask about the image directly and invite them to describe what it shows and why it matters.",
    "- Respect boundaries. Do not pressure the participant to disclose trauma or identifying details.",
    "- When the conversation has enough substance, return [[COMPLETE]].",
    "",
    "Return ONLY the next question as plain text.",
    "Do not include JSON.",
    "Do not introduce the question with labels or commentary.",
    "Do not say 'Here is'.",
    "Do not begin with an acknowledgement like 'That's great' or 'And'.",
    "Write one complete question only, ending with a question mark.",
    "",
    "Completion guidance:",
    "- Continue for at least 6 participant answers unless the participant wants to stop.",
    "- Complete by 12 participant answers.",
    "- If the participant says they are done, complete.",
    "- On the first participant reply, ask how they found Brulee.",
    "- On the second participant reply, ask what years they joined or which years feel most connected to their story.",
    "- After those openings, move into a specific memory, then a photo or link if they add one.",
    "- Ground each question in a concrete Brulee detail from the site or from the participant's answer.",
    "- Prefer questions that mention Brulee, the camp, Join, Facebook group, Radical Consent, Etiquette & Protocol, Consent Incident Report, or the 2024 pages."
  ].join("\n");

  function buildInterviewPrompt() {
    const participantAnswers = transcript.filter((entry) => entry.role === "participant").length;
    const latestAttachments = transcript.slice().reverse().find((entry) => entry.role === "participant")?.attachments?.length || 0;
    return [
      interviewPrompt,
      "",
      "Interview state:",
      `- Participant answers so far: ${participantAnswers}`,
      `- Attached images in the latest answer: ${latestAttachments}`,
      "",
      "Question map:",
      "- If this is the first participant reply, ask exactly: How did you first find Brulee?",
      "- If this is the second participant reply, ask exactly: What years did you join us, or which Brulee years feel most connected to your story?",
      "- If the latest participant answer included an image, ask exactly one question about the image before moving on."
    ].join("\n");
  }

  const fallbackPrompts = [
    "Hi, I'm glad you're here. What name should I use for you, and where are you joining us from?",
    "How did you first find Brulee?",
    "What years did you join us, or which Brulee years feel most connected to your story?",
    "Take me to a specific moment at Brulee. What was happening around you?",
    "If there is a photo or link that belongs with that memory, what does it show?",
    "What did that moment feel like in your body or mood?",
    "Was there a moment when Radical Consent, care, or safety was especially visible?",
    "What was complicated, hard, or worth improving about the camp experience?",
    "What do you hope Brulee remembers from your experience?",
    "If someone quoted from this interview later, what boundaries or attribution preferences should they honor?",
    "Is there anything I did not ask that you wish people understood about Brulee?"
  ];

  const messages = document.getElementById("messages");
  const input = document.getElementById("answer-input");
  const sendButton = document.getElementById("send-answer");
  const status = document.getElementById("interview-status");
  const hint = document.getElementById("composer-hint");
  const completeActions = document.getElementById("complete-actions");
  const emailLink = document.getElementById("email-transcript");
  const imageLinkInput = document.getElementById("image-link-input");
  const addImageLinkButton = document.getElementById("add-image-link");
  const uploadImageButton = document.getElementById("upload-image");
  const imageFileInput = document.getElementById("image-file-input");
  const pendingAttachments = document.getElementById("pending-attachments");

  let promptIndex = 0;
  let transcript = [];
  let draftAttachments = [];
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

  function attachmentLabel(attachment) {
    if (!attachment) return "image";
    if (attachment.source === "upload") {
      return attachment.name || "uploaded image";
    }
    if (attachment.url) {
      return attachment.name || attachment.url;
    }
    return attachment.name || "image";
  }

  function attachmentSummary(attachment) {
    if (!attachment) return "Image attachment";
    if (attachment.source === "upload") {
      return `Uploaded image: ${attachment.name || "image"}`;
    }
    return `Image link: ${attachment.url || attachment.name || "image"}`;
  }

  function addMessage(entry) {
    const node = document.createElement("div");
    node.className = `message ${entry.role === "interviewer" ? "bot" : "user"}`;

    const text = document.createElement("div");
    text.className = "message-text";
    text.textContent = entry.text;
    node.appendChild(text);

    if (Array.isArray(entry.attachments) && entry.attachments.length) {
      const attachments = document.createElement("div");
      attachments.className = "message-attachments";
      entry.attachments.forEach((attachment) => {
        const item = document.createElement("div");
        item.className = "message-attachment";

        const preview = document.createElement("div");
        preview.className = "message-attachment-preview";
        if (attachment.previewUrl || attachment.url) {
          const image = document.createElement("img");
          image.src = attachment.previewUrl || attachment.url;
          image.alt = attachmentLabel(attachment);
          preview.appendChild(image);
        } else {
          preview.style.display = "grid";
          preview.style.placeItems = "center";
          preview.textContent = "Image";
        }
        item.appendChild(preview);

        const link = document.createElement("a");
        link.className = "message-attachment-link";
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.href = attachment.previewUrl || attachment.url || "#";
        link.textContent = attachmentSummary(attachment);
        item.appendChild(link);

        attachments.appendChild(item);
      });
      node.appendChild(attachments);
    }

    messages.appendChild(node);
    messages.scrollTop = messages.scrollHeight;
  }

  function saveDraft() {
    storage.set(JSON.stringify({ promptIndex, transcript, draftAttachments, complete }));
  }

  function loadDraft() {
    try {
      const saved = JSON.parse(storage.get());
      if (!saved || !Array.isArray(saved.transcript)) return false;
      promptIndex = saved.promptIndex || 0;
      transcript = saved.transcript;
      draftAttachments = Array.isArray(saved.draftAttachments) ? saved.draftAttachments : [];
      complete = !!saved.complete;
      transcript.forEach((entry) => addMessage(entry));
      renderDraftAttachments();
      return transcript.length > 0;
    } catch (error) {
      return false;
    }
  }

  function setBusy(value) {
    busy = value;
    sendButton.disabled = value || complete;
    input.disabled = value || complete;
    imageLinkInput.disabled = value || complete;
    addImageLinkButton.disabled = value || complete;
    uploadImageButton.disabled = value || complete;
    imageFileInput.disabled = value || complete;
    status.textContent = value ? "Listening closely..." : complete ? "Complete" : "Interviewing";
  }

  function interviewerSays(text) {
    transcript.push({ role: "interviewer", text });
    addMessage({ role: "interviewer", text });
    saveDraft();
  }

  function participantSays(text, attachments = []) {
    transcript.push({ role: "participant", text, attachments: attachments.length ? attachments : undefined });
    addMessage({ role: "participant", text, attachments });
    saveDraft();
  }

  function transcriptText() {
    return transcript
      .filter((entry) => entry.id !== "closing")
      .map((entry) => {
        const label = entry.role === "interviewer" ? "Interviewer" : "Participant";
        const lines = [`${label}: ${entry.text}`];
        if (Array.isArray(entry.attachments) && entry.attachments.length) {
          entry.attachments.forEach((attachment, index) => {
            lines.push(`Attachment ${index + 1}: ${attachmentSummary(attachment)}`);
          });
        }
        return lines.join("\n");
      })
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
      addMessage({ role: "interviewer", text: closing });
    }
    updateEmailLink();
    saveDraft();
  }

  function renderDraftAttachments() {
    pendingAttachments.innerHTML = "";
    pendingAttachments.hidden = draftAttachments.length === 0;
    draftAttachments.forEach((attachment, index) => {
      const item = document.createElement("div");
      item.className = "pending-attachment";

      const thumb = document.createElement("div");
      thumb.className = "pending-attachment-thumb";
      if (attachment.previewUrl || attachment.url) {
        const image = document.createElement("img");
        image.src = attachment.previewUrl || attachment.url;
        image.alt = attachmentLabel(attachment);
        thumb.appendChild(image);
      } else {
        thumb.style.display = "grid";
        thumb.style.placeItems = "center";
        thumb.textContent = "Image";
      }
      item.appendChild(thumb);

      const meta = document.createElement("div");
      meta.className = "pending-attachment-meta";
      meta.textContent = attachmentSummary(attachment);
      item.appendChild(meta);

      const remove = document.createElement("button");
      remove.className = "pending-attachment-remove";
      remove.type = "button";
      remove.textContent = "Remove";
      remove.addEventListener("click", () => {
        draftAttachments.splice(index, 1);
        renderDraftAttachments();
        saveDraft();
      });
      item.appendChild(remove);

      pendingAttachments.appendChild(item);
    });
  }

  function addDraftAttachment(attachment) {
    draftAttachments = [...draftAttachments, attachment];
    renderDraftAttachments();
    saveDraft();
  }

  function clearDraftAttachments() {
    draftAttachments = [];
    imageLinkInput.value = "";
    imageFileInput.value = "";
    renderDraftAttachments();
  }

  function fallbackNextQuestion(lastAnswer, hasAttachments = false) {
    const lower = lastAnswer.toLowerCase();
    if (hasAttachments) {
      return "What does this image capture about your Brulee experience, and what should I notice in it?";
    }
    if (lastAnswer.length < 90 && promptIndex > 1 && promptIndex < fallbackPrompts.length - 1) {
      return "Can you stay with that a little longer and tie it back to Brulee?";
    }
    if (lower.includes("consent") || lower.includes("safe") || lower.includes("unsafe")) {
      return "What would you want organizers or campmates to learn from that about safety and consent?";
    }
    if (lower.includes("join") || lower.includes("facebook") || lower.includes("message")) {
      return "What did the Join process or Facebook-group step signal to you about the camp?";
    }
    if (lower.includes("photo") || lower.includes("image") || lower.includes("picture")) {
      return "What does that image show about Brulee, and why did you want to include it?";
    }
    if (lower.includes("2024") || lower.includes("event") || lower.includes("year")) {
      return "What did that 2024 moment tell you about what Brulee was becoming?";
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
      body: JSON.stringify({ prompt: buildInterviewPrompt(), transcript })
    });
    if (!response.ok) throw new Error(`Interview endpoint returned ${response.status}`);
    return response.json();
  }

  async function continueInterview(answer) {
    const attachmentsToSend = draftAttachments.slice();
    participantSays(answer, attachmentsToSend);
    const hasAttachments = attachmentsToSend.length > 0;
    clearDraftAttachments();
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
    interviewerSays(fallbackNextQuestion(answer, hasAttachments));
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
    draftAttachments = [];
    complete = false;
    messages.innerHTML = "";
    completeActions.hidden = true;
    input.disabled = false;
    sendButton.disabled = false;
    input.placeholder = "Answer in your own words...";
    hint.textContent = "Press Reply when you are ready.";
    imageLinkInput.value = "";
    imageFileInput.value = "";
    renderDraftAttachments();
    interviewerSays(fallbackPrompts[promptIndex]);
    promptIndex += 1;
    status.textContent = "Interviewing";
  });

  addImageLinkButton.addEventListener("click", () => {
    if (complete || busy) return;
    const raw = imageLinkInput.value.trim();
    if (!raw) {
      hint.textContent = "Paste an image link first.";
      return;
    }
    let url;
    try {
      url = new URL(raw);
    } catch (error) {
      hint.textContent = "That link does not look valid yet.";
      return;
    }
    if (!["http:", "https:"].includes(url.protocol)) {
      hint.textContent = "Please use an http or https image link.";
      return;
    }
    const name = decodeURIComponent(url.pathname.split("/").filter(Boolean).pop() || url.hostname);
    addDraftAttachment({
      kind: "image",
      source: "url",
      name,
      url: url.toString(),
      previewUrl: url.toString()
    });
    imageLinkInput.value = "";
    hint.textContent = "Image link added. Tell me what it shows.";
  });

  uploadImageButton.addEventListener("click", () => {
    if (complete || busy) return;
    imageFileInput.click();
  });

  imageFileInput.addEventListener("change", async () => {
    const file = imageFileInput.files?.[0];
    if (!file || complete || busy) return;
    if (!file.type.startsWith("image/")) {
      hint.textContent = "Please choose an image file.";
      imageFileInput.value = "";
      return;
    }

    const previewUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(reader.error || new Error("Unable to read image"));
      reader.readAsDataURL(file);
    });

    addDraftAttachment({
      kind: "image",
      source: "upload",
      name: file.name,
      previewUrl,
      url: previewUrl
    });
    imageFileInput.value = "";
    hint.textContent = "Image added. Tell me what it means to you.";
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
