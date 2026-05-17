/* ═══════════════════════════════════════════════════
   PhinityX — core.js
   Profile storage, fingerprint builder, prompt construction,
   session management, anti-AI-ism rules, local storage ops.
════════════════════════════════════════════════════ */

'use strict';

const PhinityCore = (() => {

  // ── Storage Keys ──────────────────────────────────
  const KEYS = {
    PROFILE:      'phx_profile',
    FINGERPRINT:  'phx_fingerprint',
    SESSIONS:     'phx_sessions',
    DOC_STORE:    'phx_docs',
    DRIFT_LOG:    'phx_drift',
    SESSION_COUNT:'phx_session_count',
    DOCS_USED:    'phx_docs_used',
  };

  // ── Tier Limits ───────────────────────────────────
  const TIER_LIMITS = {
    free: {
      docsPerMonth: 3,
      sessionHistory: 0,
      pulseFlags: 1,
      attachments: false,
      watermark: true,
      characterMapping: false,
      voiceDriftRecal: false,
      submissionMode: false,
      referenceInjection: false,
      fingerprintVault: 0,
      toneLock: false,
      docxExport: false,
      evolutionLog: false,
      collaboratorMode: false,
      priorityGen: false,
      reassessment: false,
    },
    core: {
      docsPerMonth: 20,
      sessionHistory: 30,
      pulseFlags: 3,
      attachments: true,
      watermark: false,
      characterMapping: true,
      voiceDriftRecal: true,
      submissionMode: true,
      referenceInjection: true,
      fingerprintVault: 2,
      toneLock: false,
      docxExport: false,
      evolutionLog: false,
      collaboratorMode: false,
      priorityGen: false,
      reassessment: true,
    },
    pro: {
      docsPerMonth: Infinity,
      sessionHistory: Infinity,
      pulseFlags: 3,
      attachments: true,
      watermark: false,
      characterMapping: true,
      voiceDriftRecal: true,
      submissionMode: true,
      referenceInjection: true,
      fingerprintVault: Infinity,
      toneLock: true,
      docxExport: true,
      evolutionLog: true,
      collaboratorMode: true,
      priorityGen: true,
      reassessment: true,
    }
  };

  // ── Academic Standing ─────────────────────────────
  const getStanding = (cgpa, scale) => {
    const pct = parseFloat(cgpa) / parseFloat(scale);
    if (pct >= 0.9)       return 'Distinguished';
    if (pct >= 0.78)      return 'Advanced';
    if (pct >= 0.65)      return 'Intermediate';
    if (pct >= 0.5)       return 'Developing';
    return 'Freshman';
  };

  // ── Rhythm descriptor ─────────────────────────────
  const rhythmDesc = (val) => {
    if (val <= 25)  return 'short, direct, punchy sentences';
    if (val <= 50)  return 'a balanced mix of short and medium sentences';
    if (val <= 75)  return 'longer, developed sentences with structured flow';
    return 'expansive, flowing prose with extended sentence architecture';
  };

  const vocabDesc = (val) => {
    if (val <= 25)  return 'plain, accessible language';
    if (val <= 50)  return 'moderately technical vocabulary suitable for an educated general audience';
    if (val <= 75)  return 'field-specific terminology used with confidence';
    return 'advanced technical and domain-specific vocabulary throughout';
  };

  const toneDesc = (val) => {
    if (val <= 25)  return 'conversational yet professional';
    if (val <= 50)  return 'measured and clear, leaning academic without losing personality';
    if (val <= 75)  return 'formal academic with a composed personal voice';
    return 'strictly formal-academic, precise, and impersonal';
  };

  const contextDesc = (ctx) => {
    const map = {
      university: 'a school or university academic submission',
      personal:   'a personal project document',
      online:     'a piece to be published online',
      editorial:  'a newspaper or editorial submission',
    };
    return map[ctx] || 'an academic submission';
  };

  // ── Build Fingerprint Object ───────────────────────
  const buildFingerprint = (profile) => {
    const tier = profile.tier || 'free';
    const limits = TIER_LIMITS[tier];
    const cgpa = parseFloat(profile.cgpa) || 2.0;
    const targetCgpa = parseFloat(profile.targetCgpa) || cgpa + 0.5;
    const scale = parseFloat(profile.cgpaScale) || 4.0;

    const fingerprint = {
      tier,
      name: profile.name || 'Student',
      field: profile.fieldStudy || 'General Studies',
      institution: profile.institution || '',
      cgpa,
      targetCgpa,
      scale,
      standing: getStanding(cgpa, scale),
      cgpaRatio: cgpa / scale,
      targetRatio: targetCgpa / scale,
      rhythm: profile.styleRhythm != null ? parseInt(profile.styleRhythm) : 50,
      vocab: profile.styleVocab != null ? parseInt(profile.styleVocab) : 50,
      tone: profile.styleTone != null ? parseInt(profile.styleTone) : 50,
      weakness: profile.weakness || null,
      characters: limits.characterMapping ? (profile.characters || []).filter(Boolean) : [],
      writingSample: profile.writingSample || null,
      prevSubmission: profile.prevSubmission || null,
      context: profile.submissionContext || 'university',
      rhythmDesc: rhythmDesc(profile.styleRhythm || 50),
      vocabDesc: vocabDesc(profile.styleVocab || 50),
      toneDesc: toneDesc(profile.styleTone || 50),
      contextDesc: contextDesc(profile.submissionContext || 'university'),
      onboardingComplete: profile.onboardingComplete || false,
    };

    return fingerprint;
  };

  // ── Anti-AI-ism Rules Block ────────────────────────
  const ANTI_AI_BLOCK = `
ABSOLUTE WRITING RULES — violating any of these invalidates the output:
1. No bold text of any kind. Do not use ** or __ or any markdown emphasis.
2. Em dashes are completely banned. Use commas or semicolons in their place.
3. No adverbs where a stronger verb or adjective serves better. If an adverb can be cut or replaced, cut or replace it.
4. No bullet points, numbered lists, or any list formatting in the prose output.
5. Never use these words or phrases: delve, crucial, tapestry, leverage, nuanced, "it's worth noting", "in conclusion", "furthermore", "moreover", "in summary", "it is important to", "at the end of the day", "game-changer", "groundbreaking", "comprehensive", "multifaceted".
6. Never write a sentence in the pattern "X is not Y, it is Z." That pattern is forbidden entirely.
7. Paragraph transitions must arise naturally from the argument. No mechanical connector phrases.
8. The output must read as if a real person wrote it on their best day — not a language model.
`;

  // ── Build System Prompt ───────────────────────────
  const buildSystemPrompt = (fingerprint, attachmentContext) => {
    const cgpaCeiling = fingerprint.cgpaRatio;
    const cgpaTarget  = fingerprint.targetRatio;

    // Calibrate prose complexity to cgpa level
    let complexityNote = '';
    if (cgpaCeiling < 0.55) {
      complexityNote = `The user is at a ${fingerprint.standing} academic level (CGPA ${fingerprint.cgpa}/${fingerprint.scale}). The prose should be clear, organised, and confident but should not exceed the vocabulary sophistication or argument depth of a strong lower-division student. Do not overcorrect upward. Write like a noticeably better version of them, not like a senior academic.`;
    } else if (cgpaCeiling < 0.72) {
      complexityNote = `The user is at an ${fingerprint.standing} level (CGPA ${fingerprint.cgpa}/${fingerprint.scale}). The writing should reflect mid-level academic competence: clear thesis development, structured argumentation, and field-appropriate vocabulary. Aim toward their target CGPA of ${fingerprint.targetCgpa} without overshooting into territory that would read as inauthentic.`;
    } else {
      complexityNote = `The user is at an ${fingerprint.standing} level (CGPA ${fingerprint.cgpa}/${fingerprint.scale}). The output can achieve high academic polish: sophisticated sentence architecture, strong argumentative structure, and precise technical vocabulary. Match the quality of advanced academic writing in the field of ${fingerprint.field}.`;
    }

    // Voice profile from characters
    let voiceNote = '';
    if (fingerprint.characters.length > 0) {
      voiceNote = `Personality fingerprint (fictional characters the user identifies with): ${fingerprint.characters.join(', ')}. Use these to inform the personality behind the prose. Not the style of fiction these characters exist in, but the underlying temperament: their confidence, their precision, their emotional register.`;
    }

    // Writing sample note
    let sampleNote = '';
    if (fingerprint.writingSample) {
      sampleNote = `The following is a raw writing sample from the user. Study it carefully: sentence rhythm, word choices, how they build an idea, where they are weakest. Mirror their authentic voice but correct the weaknesses listed below.\n\nWRITING SAMPLE:\n${fingerprint.writingSample.substring(0, 1200)}`;
    }

    // Weakness compensation
    let weaknessNote = '';
    if (fingerprint.weakness) {
      weaknessNote = `The user has identified their main writing weakness as: "${fingerprint.weakness}". Actively compensate for this in the output. Do not mention it or draw attention to it; simply produce writing that does not exhibit this flaw.`;
    }

    // Attachment context
    let attachNote = '';
    if (attachmentContext && attachmentContext.length > 0) {
      attachNote = `The user has provided the following reference material. Align the document's content with this material where relevant:\n${attachmentContext}`;
    }

    return `You are PhinityX, an AI writing assistant embedded in an academic writing tool. Your sole purpose is to produce a complete, well-structured document that sounds exactly like the user wrote it on their best day.

USER PROFILE:
- Name: ${fingerprint.name}
- Field of Study: ${fingerprint.field}
- Institution: ${fingerprint.institution || 'Not specified'}
- Submission type: ${fingerprint.contextDesc}

ACADEMIC CALIBRATION:
${complexityNote}

VOICE & STYLE PROFILE:
- Sentence rhythm: ${fingerprint.rhythmDesc}
- Vocabulary: ${fingerprint.vocabDesc}
- Tone: ${fingerprint.toneDesc}
${voiceNote}
${sampleNote}
${weaknessNote}

${attachNote}

${ANTI_AI_BLOCK}

OUTPUT REQUIREMENTS:
- Produce only the document itself. No preamble, no explanation, no commentary before or after.
- Structure the document appropriately for ${fingerprint.contextDesc}: title if needed, coherent sections, well-developed paragraphs.
- Every paragraph must earn its place. No filler, no padding.
- The writing must feel like a real person produced it, not a system.`;
  };

  // ── Build Pulse Review Prompt ─────────────────────
  const buildPulsePrompt = (documentText, numFlags) => {
    return `You are PhinityX performing a self-audit on a document you just generated. You must identify exactly ${numFlags} moment(s) in the document where a judgment call was made that the user might want to review.

A "judgment call" is: a structural choice (ordering of arguments), a tonal decision (how direct or how formal a specific passage is), a phrasing decision where an alternative reading could be equally valid, or any place where you made an assumption about the user's intent.

Return your response as a JSON array with exactly ${numFlags} object(s). Each object must have these fields:
- "excerpt": the exact phrase or sentence from the document (keep it short, under 20 words)
- "explanation": one sentence explaining the judgment call made (plain language, no jargon)
- "type": one of "structure", "tone", "phrasing", "assumption"

Return ONLY the JSON array. No markdown, no backticks, no commentary before or after.

DOCUMENT:
${documentText}`;
  };

  // ── Build Voice Drift Prompt ──────────────────────
  const buildDriftPrompt = (documentText, fingerprint) => {
    return `You are PhinityX evaluating whether the document you generated matches the user's voice fingerprint.

USER VOICE FINGERPRINT SUMMARY:
- Rhythm: ${fingerprint.rhythmDesc}
- Vocabulary: ${fingerprint.vocabDesc}
- Tone: ${fingerprint.toneDesc}
- Weakness to avoid: ${fingerprint.weakness || 'none specified'}
- Characters they identify with: ${fingerprint.characters.join(', ') || 'not provided'}

Assess whether the document matches this fingerprint. Return a JSON object with:
- "score": one of "Strong", "Moderate", or "Drifting"
- "reason": one sentence explaining what caused any drift, or confirming alignment if Strong

Return ONLY the JSON object. No markdown, no backticks.

DOCUMENT:
${documentText.substring(0, 2000)}`;
  };

  // ── Build Submission Mode Prompt ──────────────────
  const buildSubmissionPrompt = (documentText) => {
    return `You are PhinityX performing a final pre-submission audit on a document. Your job is to identify and silently correct any remaining issues before the user downloads it.

Check for and fix:
1. Any accidental AI-ism phrases (delve, crucial, leverage, nuanced, "it's worth noting", etc.)
2. Any em dashes (replace with commas or semicolons)
3. Any bold or markdown formatting artifacts
4. Any construction of the form "X is not Y, it is Z"
5. Any adverbs that can be replaced with stronger verbs or adjectives
6. Any bullet points or list formatting that slipped through

Return ONLY the corrected document text. No explanation, no commentary, no markdown.

DOCUMENT:
${documentText}`;
  };

  // ── localStorage Operations ───────────────────────
  const saveProfile = (profile) => {
    try {
      localStorage.setItem(KEYS.PROFILE, JSON.stringify(profile));
      const fingerprint = buildFingerprint(profile);
      localStorage.setItem(KEYS.FINGERPRINT, JSON.stringify(fingerprint));
      return fingerprint;
    } catch(e) {
      console.error('PhinityX: profile save failed', e);
      return null;
    }
  };

  const loadProfile = () => {
    try {
      const raw = localStorage.getItem(KEYS.PROFILE);
      return raw ? JSON.parse(raw) : null;
    } catch(e) { return null; }
  };

  const loadFingerprint = () => {
    try {
      const raw = localStorage.getItem(KEYS.FINGERPRINT);
      return raw ? JSON.parse(raw) : null;
    } catch(e) { return null; }
  };

  const updateProfileField = (key, value) => {
    const profile = loadProfile() || {};
    profile[key] = value;
    return saveProfile(profile);
  };

  // ── Session Management ────────────────────────────
  const generateId = () => `phx_${Date.now()}_${Math.random().toString(36).substr(2,6)}`;

  const createSession = (topic, prompt, context) => {
    const id = generateId();
    const session = {
      id,
      topic: topic || prompt.substring(0, 60),
      prompt,
      timestamp: Date.now(),
      context: context || 'university',
      attachments: [],
      document: null,
      pulseReview: null,
      driftScore: null,
    };
    const sessions = loadSessions();
    sessions.unshift(session);
    // Trim to tier limit
    const profile = loadProfile();
    const tier = profile ? profile.tier || 'free' : 'free';
    const limit = TIER_LIMITS[tier].sessionHistory;
    if (limit !== Infinity && sessions.length > limit) {
      sessions.splice(limit);
    }
    saveSessions(sessions);
    return session;
  };

  const updateSession = (id, updates) => {
    const sessions = loadSessions();
    const idx = sessions.findIndex(s => s.id === id);
    if (idx !== -1) {
      sessions[idx] = { ...sessions[idx], ...updates };
      saveSessions(sessions);
      return sessions[idx];
    }
    return null;
  };

  const loadSessions = () => {
    try {
      const raw = localStorage.getItem(KEYS.SESSIONS);
      return raw ? JSON.parse(raw) : [];
    } catch(e) { return []; }
  };

  const saveSessions = (sessions) => {
    try {
      localStorage.setItem(KEYS.SESSIONS, JSON.stringify(sessions));
    } catch(e) { console.error('PhinityX: session save failed', e); }
  };

  const getSession = (id) => {
    return loadSessions().find(s => s.id === id) || null;
  };

  // ── Docs Used Counter ─────────────────────────────
  const getDocsUsed = () => {
    const data = localStorage.getItem(KEYS.DOCS_USED);
    if (!data) return { count: 0, month: getCurrentMonth() };
    try { return JSON.parse(data); } catch(e) { return { count: 0, month: getCurrentMonth() }; }
  };

  const incrementDocsUsed = () => {
    let data = getDocsUsed();
    const thisMonth = getCurrentMonth();
    if (data.month !== thisMonth) {
      data = { count: 0, month: thisMonth };
    }
    data.count++;
    localStorage.setItem(KEYS.DOCS_USED, JSON.stringify(data));
    return data.count;
  };

  const getCurrentMonth = () => {
    const d = new Date();
    return `${d.getFullYear()}-${d.getMonth()}`;
  };

  const canGenerateDoc = () => {
    const profile = loadProfile();
    const tier = profile ? profile.tier || 'free' : 'free';
    const limit = TIER_LIMITS[tier].docsPerMonth;
    if (limit === Infinity) return true;
    const usage = getDocsUsed();
    const thisMonth = getCurrentMonth();
    const count = usage.month === thisMonth ? usage.count : 0;
    return count < limit;
  };

  // ── Session Count (for re-assessment) ────────────
  const getSessionCount = () => {
    return parseInt(localStorage.getItem(KEYS.SESSION_COUNT) || '0');
  };

  const incrementSessionCount = () => {
    const count = getSessionCount() + 1;
    localStorage.setItem(KEYS.SESSION_COUNT, count.toString());
    return count;
  };

  const shouldShowReassessment = () => {
    const profile = loadProfile();
    const tier = profile ? profile.tier || 'free' : 'free';
    if (!TIER_LIMITS[tier].reassessment) return false;
    const count = getSessionCount();
    return count > 0 && count % 5 === 0;
  };

  // ── Drift Log ─────────────────────────────────────
  const logDrift = (sessionId, score) => {
    try {
      const raw = localStorage.getItem(KEYS.DRIFT_LOG);
      const log = raw ? JSON.parse(raw) : [];
      log.push({ sessionId, score, timestamp: Date.now() });
      if (log.length > 50) log.shift();
      localStorage.setItem(KEYS.DRIFT_LOG, JSON.stringify(log));
    } catch(e) {}
  };

  const getDriftLog = () => {
    try {
      const raw = localStorage.getItem(KEYS.DRIFT_LOG);
      return raw ? JSON.parse(raw) : [];
    } catch(e) { return []; }
  };

  // ── Anthropic API Call ────────────────────────────
  const callAPI = async (messages, systemPrompt, maxTokens = 1000) => {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: maxTokens,
        system: systemPrompt,
        messages,
      }),
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error?.message || `API error ${response.status}`);
    }
    const data = await response.json();
    return data.content?.[0]?.text || '';
  };

  // ── Generate Document ─────────────────────────────
  const generateDocument = async (userPrompt, attachmentContext) => {
    const fingerprint = loadFingerprint();
    if (!fingerprint) throw new Error('No fingerprint found. Please complete your profile.');
    const systemPrompt = buildSystemPrompt(fingerprint, attachmentContext);
    const text = await callAPI(
      [{ role: 'user', content: `Write the following document for me:\n\n${userPrompt}` }],
      systemPrompt,
      2000
    );
    incrementDocsUsed();
    return text;
  };

  // ── Run Pulse Review ──────────────────────────────
  const runPulseReview = async (documentText) => {
    const profile = loadProfile();
    const tier = profile ? profile.tier || 'free' : 'free';
    const numFlags = TIER_LIMITS[tier].pulseFlags;
    const prompt = buildPulsePrompt(documentText, numFlags);
    const raw = await callAPI(
      [{ role: 'user', content: prompt }],
      'You are a precise self-auditing AI. Return only valid JSON arrays. No markdown, no commentary.',
      600
    );
    try {
      const clean = raw.replace(/```json|```/g, '').trim();
      return JSON.parse(clean);
    } catch(e) {
      console.warn('Pulse Review parse failed, raw:', raw);
      return [];
    }
  };

  // ── Run Voice Drift ───────────────────────────────
  const runVoiceDrift = async (documentText) => {
    const fingerprint = loadFingerprint();
    if (!fingerprint) return { score: 'Moderate', reason: 'No fingerprint to compare against.' };
    const prompt = buildDriftPrompt(documentText, fingerprint);
    const raw = await callAPI(
      [{ role: 'user', content: prompt }],
      'You are a precise voice analysis AI. Return only valid JSON objects. No markdown, no commentary.',
      200
    );
    try {
      const clean = raw.replace(/```json|```/g, '').trim();
      return JSON.parse(clean);
    } catch(e) {
      return { score: 'Moderate', reason: 'Could not parse drift analysis.' };
    }
  };

  // ── Run Submission Mode ───────────────────────────
  const runSubmissionMode = async (documentText) => {
    const prompt = buildSubmissionPrompt(documentText);
    return await callAPI(
      [{ role: 'user', content: prompt }],
      'You are a precise text editor. Return only the corrected document text. Nothing else.',
      2000
    );
  };

  // ── Regenerate Section ────────────────────────────
  const regenerateSection = async (excerpt, instruction, fullDocument, mode) => {
    const fingerprint = loadFingerprint();
    const systemPrompt = fingerprint
      ? buildSystemPrompt(fingerprint, null)
      : 'You are a precise academic writing assistant. Return only the replacement text, nothing else.';
    const modeText = mode === 'adjust'
      ? 'Adjust the following excerpt to improve its effectiveness while keeping the core argument.'
      : 'Rephrase the following excerpt with a notably different sentence structure and word choices, preserving the meaning.';
    const text = await callAPI(
      [{
        role: 'user',
        content: `${modeText}\n\nEXCERPT TO REPLACE:\n"${excerpt}"\n\nFULL DOCUMENT CONTEXT (do not reproduce this, just use it for context):\n${fullDocument.substring(0, 800)}\n\nReturn only the replacement text for the excerpt. No preamble, no quotes around it.`
      }],
      systemPrompt,
      400
    );
    return text.trim();
  };

  // ── Summary for Profile Complete screen ──────────
  const buildProfileSummary = (profile) => {
    const fp = buildFingerprint(profile);
    const charList = fp.characters.length > 0
      ? ` Your personality is mapped through ${fp.characters.slice(0,3).join(', ')}${fp.characters.length > 3 ? ', and others' : ''}.`
      : '';
    const weakness = fp.weakness
      ? ` Phinity will actively compensate for your stated tendency to ${fp.weakness}.`
      : '';
    return `Phinity has your profile. You are a ${fp.standing} student in ${fp.field} at a ${fp.toneDesc} register, writing with ${fp.rhythmDesc}.${charList} All output will be calibrated to your current CGPA of ${fp.cgpa} and aimed toward ${fp.targetCgpa}.${weakness}`;
  };

  // ── Public API ────────────────────────────────────
  return {
    TIER_LIMITS,
    saveProfile,
    loadProfile,
    loadFingerprint,
    updateProfileField,
    buildFingerprint,
    buildProfileSummary,
    getStanding,
    createSession,
    updateSession,
    loadSessions,
    getSession,
    getDocsUsed,
    incrementDocsUsed,
    canGenerateDoc,
    getSessionCount,
    incrementSessionCount,
    shouldShowReassessment,
    logDrift,
    getDriftLog,
    generateDocument,
    runPulseReview,
    runVoiceDrift,
    runSubmissionMode,
    regenerateSection,
    callAPI,
  };

})();
