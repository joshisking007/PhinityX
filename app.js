/* ═══════════════════════════════════════════════════
   PhinityX — app.js  (Supabase Edition)
   All PhinityCore calls are async. Auth is real
   Supabase email/password. localStorage is cache only.
════════════════════════════════════════════════════ */

'use strict';

(() => {

  // ── Screen Stack ─────────────────────────────────
  const screenStack = [];
  let currentScreen = null;

  const showScreen = (id, pushHistory = true) => {
    if (currentScreen) {
      const el = document.getElementById(currentScreen);
      if (el) {
        el.classList.remove('active');
        el.classList.add('exit');
        setTimeout(() => el.classList.remove('exit'), 400);
      }
      if (pushHistory) screenStack.push(currentScreen);
    }
    const next = document.getElementById(id);
    if (next) {
      next.classList.add('active');
      next.scrollTop = 0;
    }
    currentScreen = id;
  };

  window.goBack = () => {
    if (screenStack.length === 0) return;
    const prev = screenStack.pop();
    const cur = document.getElementById(currentScreen);
    if (cur) {
      cur.classList.remove('active');
      cur.classList.add('exit');
      setTimeout(() => cur.classList.remove('exit'), 400);
    }
    const el = document.getElementById(prev);
    if (el) el.classList.add('active');
    currentScreen = prev;
  };

  // ── State ─────────────────────────────────────────
  let pendingProfile = {};
  let currentSessionId = null;
  let currentDocumentText = null;
  let currentPulseData = null;
  let currentMessages = []; // tracks chat history for persistence
  let pendingAttachments = [];
  let pendingImageFiles = [];

  // ── Helpers ───────────────────────────────────────
  const escapeHtml = (str) => {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  };

  // Turns a raw prompt into a short readable session title (max ~50 chars)
  const deriveSessionTitle = (prompt) => {
    if (!prompt) return 'Untitled';
    // Strip common filler prefixes people type
    let t = prompt
      .replace(/^(write|generate|create|draft|help me (write|with)|can you write|i need|make me|produce)\s+/i, '')
      .replace(/^(a|an|the)\s+/i, '')
      .trim();
    // Capitalise first letter
    t = t.charAt(0).toUpperCase() + t.slice(1);
    // Truncate at word boundary around 50 chars
    if (t.length > 52) {
      t = t.slice(0, 50).replace(/\s+\S*$/, '') + '…';
    }
    return t || 'Untitled';
  };

  const scrollChat = () => {
    const area = document.getElementById('chatArea');
    if (area) setTimeout(() => { area.scrollTop = area.scrollHeight; }, 50);
  };

  // ── Init ──────────────────────────────────────────
  const init = () => {
    runParadigmLoader();
  };

  // ── Screen 1: Paradigm Loader ─────────────────────
  // Pure CSS animation — hold for 3s then hand off.
  const runParadigmLoader = () => {
    showScreen('screen-paradigm', false);
    setTimeout(runPhinityLoader, 3000);
  };

  // ── Screen 2: PhinityX Loader ─────────────────────
  // Kicks off the chain-forge animation via the inlined
  // startPxLoader() function. onComplete fires when bar hits 100%.
  const runPhinityLoader = () => {
    showScreen('screen-loader', false);
    window.startPxLoader(async () => {
      const session = await PhinityCore.getSession();
      if (session) {
        await loadHomeScreen();
      } else {
        const cached = PhinityCore.loadProfileCached();
        showScreen(cached && cached.name ? 'screen-login' : 'screen-signup', false);
      }
    });
  };

  // ── Screen 2B: Login ─────────────────────────────
  const initLogin = () => {
    document.getElementById('loginContinue').addEventListener('click', async () => {
      const email    = document.getElementById('li-email').value.trim();
      const password = document.getElementById('li-password').value;

      if (!email || !password) {
        alert('Please enter your email and password.');
        return;
      }

      const btn = document.getElementById('loginContinue');
      btn.textContent = 'Signing in…';
      btn.disabled = true;

      try {
        await PhinityCore.signIn(email, password);
        await loadHomeScreen();
      } catch (err) {
        btn.textContent = 'Sign in';
        btn.disabled = false;
        alert('Incorrect email or password. Please try again.');
      }
    });

    document.getElementById('loginNewAccount').addEventListener('click', () => {
      showScreen('screen-signup', false);
    });
  };

  // ── Screen 3: Sign-up ─────────────────────────────
  const initSignup = () => {
    document.getElementById('signupBack').addEventListener('click', () => {
      showScreen('screen-login', false);
    });
    document.querySelectorAll('#genderSelector .seg-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#genderSelector .seg-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        pendingProfile.gender = btn.dataset.val;
      });
    });

    document.querySelectorAll('#tierSelector .tier-card').forEach(card => {
      card.addEventListener('click', () => {
        document.querySelectorAll('#tierSelector .tier-card').forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
        pendingProfile.tier = card.dataset.tier;
      });
    });

    document.getElementById('signupContinue').addEventListener('click', async () => {
      const name     = document.getElementById('su-name').value.trim();
      const dob      = document.getElementById('su-dob').value;
      const email    = document.getElementById('su-email').value.trim();
      const password = document.getElementById('su-password').value;
      const field    = document.getElementById('su-field').value.trim();
      const inst     = document.getElementById('su-institution').value.trim();

      if (!name || !dob || !email || !password || !field || !inst) {
        alert('Please fill in all required fields.');
        return;
      }
      if (password.length < 8) {
        alert('Password must be at least 8 characters.');
        return;
      }

      const btn = document.getElementById('signupContinue');
      btn.textContent = 'Creating account…';
      btn.disabled = true;

      try {
        await PhinityCore.signUp(email, password);
        await PhinityCore.signIn(email, password);
      } catch (err) {
        // Already registered → just sign in
        if (err.message?.includes('already') || err.message?.includes('registered')) {
          try {
            await PhinityCore.signIn(email, password);
          } catch (signInErr) {
            btn.textContent = 'Continue';
            btn.disabled = false;
            alert('An account with this email already exists. Please sign in instead.');
            return;
          }
        } else {
          btn.textContent = 'Continue';
          btn.disabled = false;
          alert(`Sign-up failed: ${err.message}`);
          return;
        }
      }

      btn.textContent = 'Continue';
      btn.disabled = false;

      pendingProfile.name        = name;
      pendingProfile.dob         = dob;
      pendingProfile.fieldStudy  = field;
      pendingProfile.institution = inst;
      pendingProfile.occupation  = document.getElementById('su-occupation').value.trim();
      if (!pendingProfile.tier) pendingProfile.tier = 'free';

      document.getElementById('welcomeName').textContent = name.split(' ')[0];
      showScreen('screen-welcome');
    });
  };

  // ── Screen 4: Welcome ─────────────────────────────
  const initWelcome = () => {
    document.getElementById('btnGetToKnow').addEventListener('click', () => {
      showScreen('screen-academic');
    });
    document.getElementById('btnSkip').addEventListener('click', async () => {
      pendingProfile.onboardingComplete = false;
      await PhinityCore.saveProfile(pendingProfile);
      await loadHomeScreen();
    });
  };

  // ── Screen 5: Academic Profile ────────────────────
  const initAcademic = () => {
    pendingProfile.cgpaScale = '4.0';

    document.querySelectorAll('#cgpaScaleSelector .seg-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#cgpaScaleSelector .seg-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        pendingProfile.cgpaScale = btn.dataset.val;
      });
    });

    document.getElementById('academicNext').addEventListener('click', () => {
      const cur = document.getElementById('ac-current').value;
      const tar = document.getElementById('ac-target').value;
      if (!cur) { alert('Please enter your current CGPA.'); return; }
      pendingProfile.cgpa = cur;
      pendingProfile.targetCgpa = tar || cur;
      showScreen('screen-writing');
    });
  };

  // ── Screen 6: Writing Sample ──────────────────────
  const initWriting = () => {
    const textarea = document.getElementById('ws-sample');
    const counter  = document.getElementById('paraCounter');

    textarea.addEventListener('input', () => {
      const paras = textarea.value.split(/\n\s*\n/).filter(p => p.trim().length > 20);
      counter.textContent = `${paras.length} paragraph${paras.length !== 1 ? 's' : ''}`;
      counter.style.color = paras.length >= 5 ? 'var(--crimson)' : 'var(--text-3)';
    });

    document.getElementById('writingNext').addEventListener('click', () => {
      const sample = textarea.value.trim();
      const paras  = sample.split(/\n\s*\n/).filter(p => p.trim().length > 20);
      if (paras.length < 3) {
        alert('Please write at least a few paragraphs. Phinity needs enough text to understand your voice.');
        return;
      }
      pendingProfile.writingSample  = sample;
      pendingProfile.prevSubmission = document.getElementById('ws-prev').value.trim();

      const tier = pendingProfile.tier || 'free';
      showScreen(PhinityCore.TIER_LIMITS[tier].characterMapping ? 'screen-personality' : 'screen-style');
    });
  };

  // ── Screen 7: Personality Mapping ────────────────
  const initPersonality = () => {
    document.getElementById('personalityNext').addEventListener('click', () => {
      pendingProfile.characters = Array.from(document.querySelectorAll('.char-input'))
        .map(i => i.value.trim()).filter(Boolean);
      showScreen('screen-style');
    });
  };

  // ── Screen 8: Style Preferences ──────────────────
  const initStyle = () => {
    document.getElementById('styleNext').addEventListener('click', () => {
      pendingProfile.styleRhythm = document.getElementById('sl-rhythm').value;
      pendingProfile.styleVocab  = document.getElementById('sl-vocab').value;
      pendingProfile.styleTone   = document.getElementById('sl-tone').value;
      pendingProfile.weakness    = document.getElementById('sl-weakness').value.trim();
      showScreen('screen-context');
    });
  };

  // ── Screen 9: Submission Context ─────────────────
  const initContext = () => {
    pendingProfile.submissionContext = 'university';

    document.querySelectorAll('.context-card').forEach(card => {
      card.addEventListener('click', () => {
        document.querySelectorAll('.context-card').forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
        pendingProfile.submissionContext = card.dataset.ctx;
      });
    });

    document.getElementById('contextNext').addEventListener('click', async () => {
      pendingProfile.onboardingComplete = true;

      const btn = document.getElementById('contextNext');
      btn.textContent = 'Saving…';
      btn.disabled = true;

      try {
        await PhinityCore.saveProfile(pendingProfile);
      } catch (e) {
        console.error('saveProfile error:', e);
      }

      btn.textContent = 'Finish Setup';
      btn.disabled = false;

      document.getElementById('completeName').textContent = pendingProfile.name.split(' ')[0];
      document.getElementById('completeSummary').textContent = PhinityCore.buildProfileSummary(pendingProfile);
      showScreen('screen-complete');
    });
  };

  // ── Screen 10: Profile Complete ───────────────────
  const initComplete = () => {
    document.getElementById('btnStartWriting').addEventListener('click', () => {
      loadHomeScreen();
    });
  };

  // ── Home Screen ───────────────────────────────────
  const loadHomeScreen = async () => {
    showScreen('screen-home', false);
    screenStack.length = 0;
    await renderSessionSidebar();
    await populateProfileScreen();
    await checkReassessment();
  };

  const initHome = () => {
    document.getElementById('hamburger').addEventListener('click', openSidebar);
    document.getElementById('sidebarClose').addEventListener('click', closeSidebar);
    document.getElementById('sidebarOverlay').addEventListener('click', closeSidebar);
    document.getElementById('homeSettings').addEventListener('click', openProfile);
    document.getElementById('sidebarNewDoc').addEventListener('click', () => {
      closeSidebar();
      startNewDocSession();
    });
    document.getElementById('homeAttach').addEventListener('click', openAttachSheet);
    document.getElementById('homeSend').addEventListener('click', handleHomePromptSend);
    document.getElementById('homePrompt').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) handleHomePromptSend();
    });
  };

  const handleHomePromptSend = () => {
    const val = document.getElementById('homePrompt').value.trim();
    if (!val) return;
    document.getElementById('homePrompt').value = '';
    startNewDocSession(val);
  };

  const openSidebar = () => {
    document.getElementById('sidebar').classList.add('open');
    document.getElementById('sidebarOverlay').classList.add('visible');
  };

  const closeSidebar = () => {
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('sidebarOverlay').classList.remove('visible');
  };

  // ── Session Sidebar ───────────────────────────────
  const renderSessionSidebar = async () => {
    const list = document.getElementById('sessionList');
    list.innerHTML = '<p class="no-sessions">Loading…</p>';

    const sessions = await PhinityCore.loadSessions();
    if (!sessions || sessions.length === 0) {
      list.innerHTML = '<p class="no-sessions">No sessions yet. Start writing.</p>';
      return;
    }

    list.innerHTML = sessions.map(s => {
      const d = new Date(s.created_at || s.timestamp);
      const dateStr = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
      return `<button class="session-item" data-id="${s.id}">
        <span class="session-item-title">${escapeHtml(s.topic || s.prompt || 'Untitled')}</span>
        <span class="session-item-meta">
          <span>${dateStr}</span>
          <span>${s.context || 'university'}</span>
        </span>
      </button>`;
    }).join('');

    list.querySelectorAll('.session-item').forEach(btn => {
      btn.addEventListener('click', () => {
        closeSidebar();
        restoreSession(btn.dataset.id);
      });
    });
  };

  // ── New Doc Session ───────────────────────────────
  const startNewDocSession = async (initialPrompt) => {
    const canGen = await PhinityCore.canGenerateDoc();
    if (!canGen && initialPrompt) {
      await showDocScreen();
      await appendLimitNotice();
      return;
    }

    currentSessionId = null;
    currentDocumentText = null;
    currentPulseData = null;
    currentMessages = [];
    pendingAttachments = [];
    pendingImageFiles = [];

    await showDocScreen();
    clearChat();

    if (initialPrompt) handleDocPrompt(initialPrompt);
  };

  const showDocScreen = async () => {
    const profile = PhinityCore.loadProfileCached();
    const name = profile ? profile.name || 'User' : 'User';
    document.getElementById('docTopbarName').textContent = name;
    showScreen('screen-doc');
    document.getElementById('incompleteWarning').style.display =
      (profile && !profile.onboardingComplete) ? 'block' : 'none';
  };

  const restoreSession = async (sessionId) => {
    const session = await PhinityCore.getSessionById(sessionId);
    if (!session) return;

    currentSessionId    = sessionId;
    currentDocumentText = session.document;
    currentPulseData    = session.pulse_review;
    currentMessages     = session.messages || [];

    await showDocScreen();
    clearChat();

    // Replay from saved messages array if available
    if (currentMessages.length > 0) {
      currentMessages.forEach(msg => {
        if (msg.role === 'user') {
          appendUserMessage(msg.text);
        } else if (msg.role === 'document') {
          appendDocumentBlock(msg.text, session.pulse_review, msg.drift);
        }
      });
    } else {
      // Fallback for old sessions saved before messages column existed
      if (session.prompt)   appendUserMessage(session.prompt);
      if (session.document) appendDocumentBlock(session.document, session.pulse_review, session.drift_score);
    }
  };

  // ── Doc Screen ────────────────────────────────────
  const initDocScreen = () => {
    document.getElementById('docBack').addEventListener('click', async () => {
      showScreen('screen-home', false);
      screenStack.length = 0;
      await renderSessionSidebar();
    });
    document.getElementById('docSettings').addEventListener('click', openProfile);
    document.getElementById('docAttach').addEventListener('click', openAttachSheet);
    document.getElementById('docSend').addEventListener('click', handleDocSendClick);
    document.getElementById('docPrompt').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) handleDocSendClick();
    });
    document.getElementById('completeProfileLink')?.addEventListener('click', (e) => {
      e.preventDefault();
      openProfile();
    });
  };

  const handleDocSendClick = () => {
    const val = document.getElementById('docPrompt').value.trim();
    if (!val) return;
    document.getElementById('docPrompt').value = '';
    handleDocPrompt(val);
  };

  const handleDocPrompt = async (promptText) => {
    const canGen = await PhinityCore.canGenerateDoc();
    if (!canGen) { appendLimitNotice(); return; }

    appendUserMessage(promptText);
    currentMessages.push({ role: 'user', text: promptText });

    if (pendingAttachments.length === 0 && pendingImageFiles.length === 0) {
      const continued = await showMissingAttachmentWarning();
      if (!continued) return;
    }

    const attachmentContext = buildAttachmentContextString();

    // ── Detection risk warning ─────────────────────
    const profile = PhinityCore.loadProfileCached();
    const tone  = parseInt(profile?.style_tone  || 50);
    const vocab = parseInt(profile?.style_vocab || 50);
    if (tone >= 66 || vocab >= 66) {
      const proceed = await showDetectionRiskWarning(tone, vocab);
      if (!proceed) return;
    }

    const thinkingEl = appendThinkingState();

    const statuses = [
      'Reading your profile',
      'Calibrating to your voice',
      'Constructing argument structure',
      'Applying your fingerprint',
    ];
    let si = 0;
    const statusEl = thinkingEl.querySelector('.thinking-status');
    const statusIv = setInterval(() => {
      si = (si + 1) % statuses.length;
      if (statusEl) statusEl.textContent = statuses[si];
    }, 1800);

    try {
      const result = await PhinityCore.generateDocument(promptText, attachmentContext, pendingImageFiles);
      clearInterval(statusIv);
      thinkingEl.remove();

      // generateDocument returns { document, sessionId }
      currentDocumentText = result.document || result;
      if (result.sessionId) {
        currentSessionId = result.sessionId;
        // Patch the topic so the sidebar shows a meaningful title
        const title = deriveSessionTitle(promptText);
        PhinityCore.db
          .from('sessions')
          .update({ topic: title })
          .eq('id', currentSessionId)
          .then(() => {})
          .catch(() => {}); // non-blocking, best-effort
      }

      let driftResult = null;
      try {
        driftResult = await PhinityCore.runVoiceDrift(currentDocumentText, currentSessionId);
      } catch (e) {
        driftResult = { score: 'Moderate', reason: 'Drift analysis unavailable.' };
      }

      appendDocumentBlock(currentDocumentText, null, driftResult);
      currentMessages.push({ role: 'document', text: currentDocumentText, drift: driftResult });

      // Save chat history to Supabase so it survives refresh
      if (currentSessionId) {
        PhinityCore.saveMessages(currentSessionId, currentMessages).catch(() => {});
      }

      await renderSessionSidebar();
      clearAttachments();
      PhinityCore.clearProfileOverride();

      // ── Passive tracking ───────────────────────
      // Increment session count and log drift for fingerprint evolution
      try {
        const profile = PhinityCore.loadProfileCached();
        const newCount = (profile?.sessionCount || 0) + 1;
        await PhinityCore.updateProfileField('sessionCount', newCount);

        // Log drift score to drift_log table for fingerprint evolution
        if (currentSessionId && driftResult) {
          await PhinityCore.db.from('drift_log').insert({
            user_id:    (await PhinityCore.getUser()).id,
            session_id: currentSessionId,
            score:      driftResult.score || 'Moderate',
            reason:     driftResult.reason || '',
            logged_at:  new Date().toISOString(),
          });
        }

        // 5-session re-assessment check (Core + Pro only)
        await checkReassessment();
      } catch (trackErr) {
        // Non-blocking — tracking errors never surface to user
        console.warn('Passive tracking error:', trackErr);
      }

    } catch (err) {
      clearInterval(statusIv);
      thinkingEl.remove();
      PhinityCore.clearProfileOverride();
      if (err.code === 'limit_reached') {
        appendLimitNotice();
      } else {
        appendPhinityMessage(`Something went wrong: ${err.message}. Please try again.`);
      }
    }
  };

  const showMissingAttachmentWarning = () => {
    return new Promise((resolve) => {
      const msgEl = appendPhinityMessage(
        'I noticed you didn\'t attach any lecture notes. These help me align the output with your course material. If that wasn\'t a mistake, tap Continue.',
        true
      );
      const btn = document.createElement('button');
      btn.className = 'inline-action';
      btn.textContent = 'Continue';
      btn.addEventListener('click', () => {
        btn.textContent = 'Noted. Generating…';
        btn.disabled = true;
        resolve(true);
      });
      msgEl.querySelector('.chat-bubble').appendChild(btn);

      const attachBtn = document.createElement('button');
      attachBtn.className = 'inline-action';
      attachBtn.textContent = 'Attach notes';
      attachBtn.style.marginLeft = '0.5rem';
      attachBtn.addEventListener('click', () => { openAttachSheet(); resolve(false); });
      msgEl.querySelector('.chat-bubble').appendChild(attachBtn);
    });
  };

  // ── Detection risk warning ──────────────────────
  const showDetectionRiskWarning = (tone, vocab) => {
    return new Promise((resolve) => {
      const isFormal       = tone  >= 66;
      const isSophisticated = vocab >= 66;

      let reason = '';
      if (isFormal && isSophisticated)
        reason = 'Your style is set to formal and sophisticated — which produces strong academic writing, but AI detectors are known to flag formal prose as AI-generated even when it isn't. This is a well-documented false positive problem.';
      else if (isFormal)
        reason = 'Your tone is set to formal-academic. AI detectors frequently misclassify formal writing styles, including genuine human work, as AI-generated.';
      else
        reason = 'Your vocabulary is set to sophisticated. AI detectors can incorrectly flag advanced vocabulary, even in authentic human writing.';

      const msgEl = appendPhinityMessage(
        `Heads up — ${reason} If you're concerned about false positives, I can slightly reduce the formality for this document. Note: always ensure your use of this tool aligns with your institution's academic integrity policy.`,
        true
      );

      const bubble = msgEl.querySelector('.chat-bubble');

      const keepBtn = document.createElement('button');
      keepBtn.className = 'inline-action';
      keepBtn.textContent = 'Keep my style';
      keepBtn.addEventListener('click', () => {
        keepBtn.textContent = 'Got it. Generating…';
        keepBtn.disabled = true;
        adjustBtn.disabled = true;
        resolve(true);
      });

      const adjustBtn = document.createElement('button');
      adjustBtn.className = 'inline-action';
      adjustBtn.style.marginLeft = '0.5rem';
      adjustBtn.textContent = 'Reduce false positive risk';
      adjustBtn.addEventListener('click', () => {
        const cached = PhinityCore.loadProfileCached();
        if (cached) {
          cached._detectionOverride = true;
          cached.style_tone  = Math.min(parseInt(cached.style_tone  || 50), 55);
          cached.style_vocab = Math.min(parseInt(cached.style_vocab || 50), 45);
          PhinityCore.patchProfileCache(cached);
        }
        adjustBtn.textContent = 'Adjusting style…';
        adjustBtn.disabled = true;
        keepBtn.disabled = true;
        resolve(true);
      });

      bubble.appendChild(keepBtn);
      bubble.appendChild(adjustBtn);
    });
  };

  const buildAttachmentContextString = () => {
    if (pendingAttachments.length === 0) return null;
    return pendingAttachments.map(a => `[${a.name}]: ${a.content || '(binary file attached)'}`).join('\n\n');
  };

  // ── Chat UI ───────────────────────────────────────
  const clearChat = () => { document.getElementById('chatArea').innerHTML = ''; };

  const appendUserMessage = (text) => {
    const area = document.getElementById('chatArea');
    const el = document.createElement('div');
    el.className = 'chat-msg user';
    el.innerHTML = `<div class="chat-bubble">${escapeHtml(text)}</div>`;
    area.appendChild(el);
    scrollChat();
    return el;
  };

  const appendPhinityMessage = (text, html = false) => {
    const area = document.getElementById('chatArea');
    const el = document.createElement('div');
    el.className = 'chat-msg phinity';
    el.innerHTML = `<div class="chat-bubble">${html ? text : escapeHtml(text)}</div>`;
    area.appendChild(el);
    scrollChat();
    return el;
  };

  const appendThinkingState = () => {
    const area = document.getElementById('chatArea');
    const el = document.createElement('div');
    el.className = 'thinking-state';
    el.innerHTML = `
      <div class="thinking-line"></div>
      <div class="thinking-dots"><span></span><span></span><span></span></div>
      <div class="thinking-status">Reading your profile</div>
    `;
    area.appendChild(el);
    scrollChat();
    return el;
  };

  const appendDocumentBlock = (docText, pulseData, driftResult) => {
    const area = document.getElementById('chatArea');
    const profile   = PhinityCore.loadProfileCached();
    const tier      = profile ? profile.tier || 'free' : 'free';
    const limits    = PhinityCore.TIER_LIMITS[tier];

    const driftScore = driftResult ? (driftResult.score || 'Moderate') : 'Moderate';
    const driftClass = driftScore === 'Strong'   ? 'drift-strong'
                     : driftScore === 'Drifting' ? 'drift-drifting'
                     : 'drift-moderate';

    // Pulse button label — show tier badge if limited
    const pulseLabel = limits.pulseFlags === 1
      ? `Pulse Review <span class="tier-gate-badge">1 flag</span>`
      : 'Pulse Review';

    const blockEl = document.createElement('div');
    blockEl.className = 'doc-block';
    blockEl.innerHTML = `
      <div class="doc-block-toolbar">
        <button class="doc-tool-btn" id="tb-download">Download PDF</button>
        <button class="doc-tool-btn" id="tb-pulse">${pulseLabel}</button>
        <button class="doc-tool-btn ${driftClass}" id="tb-drift">${driftScore}</button>
      </div>
      <div class="doc-content" id="docContent">${formatDocText(docText)}</div>
    `;

    // Restore pulse section if we have saved data (session restore)
    if (pulseData && pulseData.length > 0) {
      const capped = pulseData.slice(0, limits.pulseFlags);
      blockEl.appendChild(buildPulseSection(capped, docText));
      const pb = blockEl.querySelector('#tb-pulse');
      if (pb) { pb.innerHTML = 'Pulse Review ✓'; pb.dataset.loaded = 'true'; pb.classList.add('active-check'); }
    }

    area.appendChild(blockEl);
    scrollChat();

    // ── Download PDF ──────────────────────────────
    blockEl.querySelector('#tb-download').addEventListener('click', () => downloadPDF(docText));

    // ── Pulse Review ──────────────────────────────
    blockEl.querySelector('#tb-pulse').addEventListener('click', async () => {
      const btn = blockEl.querySelector('#tb-pulse');
      if (btn.dataset.loaded === 'true') return;

      btn.textContent = 'Auditing…';
      btn.disabled = true;

      try {
        const allFlags  = await PhinityCore.runPulseReview(docText, currentSessionId);
        const cappedFlags = allFlags.slice(0, limits.pulseFlags);
        currentPulseData = cappedFlags;

        blockEl.querySelector('.pulse-section')?.remove();

        if (cappedFlags.length > 0) {
          blockEl.appendChild(buildPulseSection(cappedFlags, docText));
        } else {
          appendPhinityMessage('Pulse Review found no significant judgment calls. The document reads cleanly.');
        }

        btn.innerHTML = 'Pulse Review ✓';
        btn.classList.add('active-check');
        btn.dataset.loaded = 'true';
        btn.disabled = false;

        // Free tier nudge if more flags were found but capped
        if (tier === 'free' && allFlags.length > 1) {
          appendUpgradeNudge('Pulse Review flagged more moments, but the Free plan shows 1. Upgrade to Core or Pro to see all flags and use Adjust / Rephrase.');
        }

      } catch (e) {
        btn.innerHTML = pulseLabel;
        btn.disabled = false;
        appendPhinityMessage('Pulse Review encountered an error. Please try again.');
      }
    });

    // ── Voice Drift ───────────────────────────────
    blockEl.querySelector('#tb-drift').addEventListener('click', () => {
      showDriftPanel(driftResult, driftScore, limits, docText, blockEl);
    });
  };

  const formatDocText = (text) => {
    if (!text) return '';
    return text.split(/\n\n+/).filter(p => p.trim())
      .map(p => `<p>${escapeHtml(p.trim())}</p>`).join('');
  };

  const appendLimitNotice = () => {
    const profile = PhinityCore.loadProfileCached();
    const tier = profile ? profile.tier || 'free' : 'free';
    const area = document.getElementById('chatArea');
    if (!area) return;
    const el = document.createElement('div');
    el.className = 'limit-notice';
    const nextTier = tier === 'free' ? 'Core' : 'Pro';
    el.innerHTML = `
      <p>You've reached your document limit for this month on the ${tier.charAt(0).toUpperCase() + tier.slice(1)} plan. Upgrade to ${nextTier} to keep writing.</p>
      <button class="btn-primary" onclick="document.querySelector('[data-section=tier]').click()">View plans</button>
    `;
    area.appendChild(el);
    scrollChat();
  };

  // ── Voice Drift Panel ─────────────────────────────
  const showDriftPanel = (driftResult, driftScore, limits, docText, blockEl) => {
    const reason = driftResult ? (driftResult.reason || 'No drift analysis available.') : 'No drift analysis available.';
    const labelClass = driftScore === 'Strong' ? 'strong' : driftScore === 'Drifting' ? 'drifting' : 'moderate';
    const canRecal = limits.voiceDriftRecal && driftScore !== 'Strong';

    const panel = document.createElement('div');
    panel.className = 'drift-panel';
    panel.innerHTML = `
      <div class="drift-panel-label ${labelClass}">Voice Drift — ${driftScore}</div>
      <div class="drift-panel-reason">${escapeHtml(reason)}</div>
      ${canRecal ? `<button class="drift-recal-btn" id="driftRecalBtn">Recalibrate tone</button>` : ''}
      ${!limits.voiceDriftRecal ? `<div class="drift-locked-note">Tone recalibration available on Core &amp; Pro plans.</div>` : ''}
    `;
    document.getElementById('chatArea').appendChild(panel);
    scrollChat();

    if (canRecal) {
      panel.querySelector('#driftRecalBtn').addEventListener('click', async (e) => {
        const btn = e.currentTarget;
        btn.textContent = 'Recalibrating…';
        btn.disabled = true;
        try {
          const recal = await PhinityCore.runSubmissionMode(docText);
          currentDocumentText = recal;
          blockEl.querySelector('#docContent').innerHTML = formatDocText(recal);
          btn.textContent = 'Done ✓';
          btn.classList.add('active-check');
        } catch (err) {
          btn.textContent = 'Failed — try again';
          btn.disabled = false;
        }
      });
    }
  };

  // ── Upgrade Nudge ─────────────────────────────────
  const appendUpgradeNudge = (message) => {
    const area = document.getElementById('chatArea');
    const el = document.createElement('div');
    el.className = 'upgrade-nudge';
    el.innerHTML = `
      <span class="upgrade-nudge-icon">⚡</span>
      <span class="upgrade-nudge-text">${escapeHtml(message)}</span>
      <button class="upgrade-nudge-btn" onclick="document.querySelector('[data-section=tier]')?.click()">Upgrade</button>
    `;
    area.appendChild(el);
    scrollChat();
  };

  // ── Pulse Review Section ──────────────────────────
  const buildPulseSection = (flags, docText) => {
    const section = document.createElement('div');
    section.className = 'pulse-section';

    const header = document.createElement('div');
    header.className = 'pulse-section-header';
    header.textContent = `Pulse Review — ${flags.length} flag${flags.length !== 1 ? 's' : ''}`;
    section.appendChild(header);

    flags.forEach((flag, idx) => {
      const note = document.createElement('div');
      note.className = 'pulse-note';
      note.innerHTML = `
        <div class="pulse-note-type">${escapeHtml(flag.type || 'judgment call')} · ${idx + 1} of ${flags.length}</div>
        <div class="pulse-note-excerpt">"${escapeHtml(flag.excerpt || '')}"</div>
        <div class="pulse-note-explain">${escapeHtml(flag.explanation || '')}</div>
        <div class="pulse-actions">
          <button class="pulse-btn keep"    data-action="keep"    data-idx="${idx}">Keep</button>
          <button class="pulse-btn adjust"  data-action="adjust"  data-idx="${idx}">Adjust</button>
          <button class="pulse-btn rephrase" data-action="rephrase" data-idx="${idx}">Rephrase</button>
        </div>
      `;
      section.appendChild(note);

      note.querySelectorAll('.pulse-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          const action = btn.dataset.action;

          if (action === 'keep') {
            note.classList.add('resolved');
            return;
          }

          note.querySelectorAll('.pulse-btn').forEach(b => b.disabled = true);
          btn.textContent = action === 'adjust' ? 'Adjusting…' : 'Rephrasing…';

          try {
            const newText = await PhinityCore.regenerateSection(
              flag.excerpt, flag.explanation, currentDocumentText, action
            );
            currentDocumentText = currentDocumentText.replace(flag.excerpt, newText);
            const docContent = document.getElementById('docContent');
            if (docContent) docContent.innerHTML = formatDocText(currentDocumentText);
            flag.excerpt = newText;
            note.classList.add('resolved');
          } catch (e) {
            note.querySelectorAll('.pulse-btn').forEach(b => b.disabled = false);
            btn.textContent = action;
          }
        });
      });
    });

    return section;
  };

  // ── PDF Download ──────────────────────────────────
  const downloadPDF = async (docText) => {
    const profile   = PhinityCore.loadProfileCached();
    const tier      = profile ? profile.tier || 'free' : 'free';
    const watermark = PhinityCore.TIER_LIMITS[tier].watermark;

    // Auto-name: first 5 words of doc + date
    const firstWords = docText.trim().split(/\s+/).slice(0, 5).join('_').replace(/[^a-zA-Z0-9_]/g, '');
    const fileName = `PhinityX_${firstWords}_${getDateStr()}.pdf`;

    const printDiv = document.createElement('div');
    printDiv.style.cssText = `
      position: fixed; left: -9999px; top: 0;
      width: 794px; background: white; color: #111;
      font-family: Georgia, serif; font-size: 12pt;
      line-height: 1.85; padding: 80px 72px;
      box-sizing: border-box;
    `;
    printDiv.innerHTML = docText.split(/\n\n+/).filter(p => p.trim())
      .map(p => `<p style="margin-bottom:1.1em">${escapeHtml(p.trim())}</p>`).join('');

    if (watermark) {
      const wm = document.createElement('div');
      wm.style.cssText = `
        margin-top: 3rem; padding-top: 1rem;
        border-top: 1px solid #ddd;
        font-size: 8pt; color: #aaa;
        font-family: monospace; letter-spacing: 0.08em;
        text-align: right;
      `;
      wm.textContent = 'Generated with PhinityX Free · phinityx.pages.dev';
      printDiv.appendChild(wm);
    }

    document.body.appendChild(printDiv);

    try {
      if (window.jspdf?.jsPDF && window.html2canvas) {
        // Best path: jsPDF + html2canvas → multi-page aware
        const canvas  = await window.html2canvas(printDiv, { scale: 2, useCORS: true });
        const pdf     = new window.jspdf.jsPDF('p', 'mm', 'a4');
        const pageW   = pdf.internal.pageSize.getWidth();
        const pageH   = pdf.internal.pageSize.getHeight();
        const imgData = canvas.toDataURL('image/jpeg', 0.92);
        const imgH    = (canvas.height * pageW) / canvas.width;
        let yPos = 0;

        while (yPos < imgH) {
          if (yPos > 0) pdf.addPage();
          pdf.addImage(imgData, 'JPEG', 0, -yPos, pageW, imgH);
          yPos += pageH;
        }
        pdf.save(fileName);

      } else {
        // Fallback: print dialog
        const pw = window.open('', '_blank');
        if (pw) {
          pw.document.write(`<!DOCTYPE html><html><head><title>${fileName}</title>
            <style>body{font-family:Georgia,serif;font-size:12pt;line-height:1.85;padding:80px 72px;color:#111;}p{margin-bottom:1.1em;}</style>
            </head><body>${printDiv.innerHTML}</body></html>`);
          pw.document.close();
          setTimeout(() => pw.print(), 400);
        }
      }
    } catch (e) {
      console.warn('PDF error:', e);
      appendPhinityMessage('PDF generation failed. Try again or use the print dialog.');
    } finally {
      document.body.removeChild(printDiv);
    }
  };

  const getDateStr = () => {
    const d = new Date();
    return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  };

  // ── Attachment Sheet ──────────────────────────────
  const openAttachSheet = () => {
    document.getElementById('attachSheet').classList.add('open');
    document.getElementById('attachOverlay').classList.add('visible');
  };

  const closeAttachSheet = () => {
    document.getElementById('attachSheet').classList.remove('open');
    document.getElementById('attachOverlay').classList.remove('visible');
  };

  const initAttachSheet = () => {
    document.getElementById('attachCancel').addEventListener('click', closeAttachSheet);
    document.getElementById('attachOverlay').addEventListener('click', closeAttachSheet);

    const checkTierAndOpen = (fileInputId) => {
      const profile = PhinityCore.loadProfileCached();
      const tier = profile ? profile.tier || 'free' : 'free';
      if (!PhinityCore.TIER_LIMITS[tier].attachments) {
        closeAttachSheet();
        appendPhinityMessage('Attachments are available on Core and Pro plans. Upgrade to attach files.');
        return;
      }
      document.getElementById(fileInputId).click();
    };

    document.getElementById('attachImages').addEventListener('click', () => checkTierAndOpen('imageUpload'));
    document.getElementById('attachDocs').addEventListener('click', () => checkTierAndOpen('docUpload'));
    document.getElementById('imageUpload').addEventListener('change', handleImageUpload);
    document.getElementById('docUpload').addEventListener('change', handleDocUpload);
  };

  const handleImageUpload = (e) => {
    const toAdd = Array.from(e.target.files).slice(0, 5 - pendingImageFiles.length);
    pendingImageFiles.push(...toAdd);
    toAdd.forEach(f => pendingAttachments.push({ name: f.name, type: 'image', content: null, file: f }));
    closeAttachSheet();
    renderAttachmentPills();
    e.target.value = '';
  };

  const handleDocUpload = async (e) => {
    for (const f of Array.from(e.target.files)) {
      const text = await new Promise((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(r.result);
        r.onerror = rej;
        r.readAsText(f);
      }).catch(() => null);
      pendingAttachments.push({ name: f.name, type: 'doc', content: text });
    }
    closeAttachSheet();
    renderAttachmentPills();
    e.target.value = '';
  };

  const renderAttachmentPills = () => {
    let pills = document.getElementById('attachPills');
    if (!pills) {
      pills = document.createElement('div');
      pills.id = 'attachPills';
      pills.className = 'attachment-pills';
      document.querySelector('.doc-input-bar')?.before(pills);
    }
    if (pendingAttachments.length === 0) { pills.remove(); return; }
    pills.innerHTML = pendingAttachments.map((a, i) => `
      <span class="attachment-pill">
        ${a.type === 'image' ? '🖼' : '📄'} ${escapeHtml(a.name)}
        <span class="pill-remove" data-idx="${i}">✕</span>
      </span>
    `).join('');
    pills.querySelectorAll('.pill-remove').forEach(btn => {
      btn.addEventListener('click', () => {
        pendingAttachments.splice(parseInt(btn.dataset.idx), 1);
        renderAttachmentPills();
      });
    });
  };

  const clearAttachments = () => {
    pendingAttachments = [];
    pendingImageFiles  = [];
    document.getElementById('attachPills')?.remove();
  };

  // ── Profile Screen ────────────────────────────────
  const openProfile = async () => {
    await populateProfileScreen();
    showScreen('screen-profile');
  };

  const populateProfileScreen = async () => {
    // Paint instantly from cache, reconcile with DB in background
    const cached = PhinityCore.loadProfileCached();
    if (cached) renderProfileData(cached);

    PhinityCore.loadProfile().then(fresh => {
      if (fresh) renderProfileData(fresh);
    }).catch(() => {});
  };

  const renderProfileData = (profile) => {
    const standing  = PhinityCore.getStanding(profile.cgpa || 0, profile.cgpaScale || 4.0);
    const firstName = (profile.name || '').split(' ')[0];
    const cap       = (s) => s.charAt(0).toUpperCase() + s.slice(1);

    document.getElementById('profileAvatar').textContent    = firstName.charAt(0).toUpperCase() || '?';
    document.getElementById('profileName').textContent      = profile.name || '—';
    document.getElementById('profileStanding').textContent  = standing;
    document.getElementById('profileTierBadge').textContent = cap(profile.tier || 'free');

    document.getElementById('pf-name').textContent        = profile.name || '—';
    document.getElementById('pf-dob').textContent         = profile.dob || '—';
    document.getElementById('pf-gender').textContent      = profile.gender || '—';
    document.getElementById('pf-institution').textContent = profile.institution || '—';
    document.getElementById('pf-fieldStudy').textContent  = profile.fieldStudy || '—';
    document.getElementById('pf-occupation').textContent  = profile.occupation || '—';
    document.getElementById('pf-cgpa').textContent        = profile.cgpa || '—';
    document.getElementById('pf-targetCgpa').textContent  = profile.targetCgpa || '—';
    document.getElementById('pf-scale').textContent       = profile.cgpaScale ? profile.cgpaScale + ' scale' : '—';

    const chars = profile.characters || [];
    document.getElementById('pf-characters').innerHTML = chars.length > 0
      ? chars.map(c => `<span class="pf-char-tag">${escapeHtml(c)}</span>`).join('')
      : '<span style="font-size:0.75rem;color:var(--text-3);padding:0.75rem 1rem;display:block;">No characters added</span>';

    const rv = parseInt(profile.styleRhythm || 50);
    document.getElementById('pf-rhythm').textContent   = rv <= 33 ? 'Short & punchy' : rv <= 66 ? 'Balanced' : 'Long & flowing';
    const vv = parseInt(profile.styleVocab || 50);
    document.getElementById('pf-vocab').textContent    = vv <= 33 ? 'Plain' : vv <= 66 ? 'Moderate' : 'Technical';
    const tv = parseInt(profile.styleTone || 50);
    document.getElementById('pf-tone').textContent     = tv <= 33 ? 'Conversational' : tv <= 66 ? 'Measured' : 'Formal-academic';
    document.getElementById('pf-weakness').textContent = profile.weakness || 'None specified';
    document.getElementById('pf-context').textContent  = profile.submissionContext || 'university';
    document.getElementById('pf-tier').textContent     = cap(profile.tier || 'free');
    document.getElementById('pf-docsUsed').textContent = profile.docsUsedCount != null
      ? `${profile.docsUsedCount} this month` : '—';
  };

  const initProfileScreen = () => {
    document.getElementById('profileBack').addEventListener('click', () => goBack());

    document.querySelectorAll('.edit-btn').forEach(btn => {
      btn.addEventListener('click', () => handleProfileEdit(btn.dataset.section));
    });

    document.getElementById('signOutBtn').addEventListener('click', async () => {
      if (!confirm('Sign out of PhinityX?')) return;
      try { await PhinityCore.signOut(); } catch (e) { /* ignore */ }
      showScreen('screen-login', false);
      screenStack.length = 0;
    });
  };

  const handleProfileEdit = async (section) => {
    if (section === 'tier') {
      const profile = PhinityCore.loadProfileCached();
      const currentTier = profile?.tier || 'free';
      const tiers  = ['free', 'core', 'pro'];
      const prices = { free: '$0', core: '$8/mo', pro: '$16/mo' };
      const next   = tiers.filter(t => t !== currentTier);
      const choice = confirm(
        `Upgrade plan?\n\nCurrent: ${currentTier}\n\nOptions:\n${next.map(t => `${t} (${prices[t]})`).join(', ')}\n\nThis connects to a payment processor in production. Tap OK to upgrade to the next tier.`
      );
      if (choice) {
        const nextTier = tiers[Math.min(tiers.indexOf(currentTier) + 1, tiers.length - 1)];
        await PhinityCore.updateProfileField('tier', nextTier);
        await populateProfileScreen();
      }
    } else if (section === 'academic') {
      const newCgpa = prompt('Update your current CGPA:');
      if (newCgpa && !isNaN(parseFloat(newCgpa))) {
        await PhinityCore.updateProfileField('cgpa', parseFloat(newCgpa));
        await populateProfileScreen();
      }
    } else {
      alert(`Full inline editing for "${section}" coming in the next build.`);
    }
  };

  // ── Re-assessment Modal ───────────────────────────
  const checkReassessment = async () => {
    const should = await PhinityCore.shouldShowReassessment();
    if (should) document.getElementById('reassessOverlay').style.display = 'flex';
  };

  const initReassessment = () => {
    document.getElementById('raUpdate').addEventListener('click', async () => {
      const cgpa   = document.getElementById('ra-cgpa').value;
      const sample = document.getElementById('ra-sample').value.trim();
      if (cgpa && !isNaN(parseFloat(cgpa))) await PhinityCore.updateProfileField('cgpa', parseFloat(cgpa));
      if (sample) await PhinityCore.updateProfileField('writingSample', sample);
      document.getElementById('reassessOverlay').style.display = 'none';
      await populateProfileScreen();
    });
    document.getElementById('raDismiss').addEventListener('click', () => {
      document.getElementById('reassessOverlay').style.display = 'none';
    });
  };

  // ── Bootstrap ─────────────────────────────────────
  document.addEventListener('DOMContentLoaded', () => {
    initLogin();
    initSignup();
    initWelcome();
    initAcademic();
    initWriting();
    initPersonality();
    initStyle();
    initContext();
    initComplete();
    initHome();
    initDocScreen();
    initAttachSheet();
    initProfileScreen();
    initReassessment();
    init();
  });

})();
