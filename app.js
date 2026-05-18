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

    await showDocScreen();
    clearChat();

    if (session.prompt)   appendUserMessage(session.prompt);
    if (session.document) appendDocumentBlock(session.document, session.pulse_review, session.drift_score);
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

    if (pendingAttachments.length === 0 && pendingImageFiles.length === 0) {
      const continued = await showMissingAttachmentWarning();
      if (!continued) return;
    }

    const attachmentContext = buildAttachmentContextString();
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
      if (result.sessionId) currentSessionId = result.sessionId;

      let driftResult = null;
      try {
        driftResult = await PhinityCore.runVoiceDrift(currentDocumentText, currentSessionId);
      } catch (e) {
        driftResult = { score: 'Moderate', reason: 'Drift analysis unavailable.' };
      }

      appendDocumentBlock(currentDocumentText, null, driftResult);
      await renderSessionSidebar();
      clearAttachments();

    } catch (err) {
      clearInterval(statusIv);
      thinkingEl.remove();
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
      <div class="thinking-dots"><span></span><span></span><span></span></div>
      <div class="thinking-status">Reading your profile</div>
    `;
    area.appendChild(el);
    scrollChat();
    return el;
  };

  const appendDocumentBlock = (docText, pulseData, driftResult) => {
    const area = document.getElementById('chatArea');
    const driftScore = driftResult ? driftResult.score : 'Moderate';
    const driftClass = driftScore === 'Strong' ? 'drift-strong'
                     : driftScore === 'Drifting' ? 'drift-drifting'
                     : 'drift-moderate';

    const blockEl = document.createElement('div');
    blockEl.className = 'doc-block';
    blockEl.innerHTML = `
      <div class="doc-block-toolbar">
        <button class="doc-tool-btn" id="tb-download">Download PDF</button>
        <button class="doc-tool-btn" id="tb-pulse">Pulse Review</button>
        <button class="doc-tool-btn ${driftClass}" id="tb-drift">${driftScore}</button>
      </div>
      <div class="doc-content" id="docContent">${formatDocText(docText)}</div>
    `;

    if (pulseData && pulseData.length > 0) blockEl.appendChild(buildPulseSection(pulseData, docText));
    area.appendChild(blockEl);
    scrollChat();

    blockEl.querySelector('#tb-download').addEventListener('click', () => downloadPDF(docText));

    blockEl.querySelector('#tb-pulse').addEventListener('click', async () => {
      const btn = blockEl.querySelector('#tb-pulse');
      if (btn.dataset.loaded === 'true') return;
      btn.textContent = 'Auditing…';
      btn.disabled = true;
      try {
        const pulseFlags = await PhinityCore.runPulseReview(docText, currentSessionId);
        currentPulseData = pulseFlags;
        blockEl.querySelector('.pulse-section')?.remove();
        if (pulseFlags.length > 0) {
          blockEl.appendChild(buildPulseSection(pulseFlags, docText));
        } else {
          appendPhinityMessage('Pulse Review found no significant judgment calls to flag. The document reads cleanly.');
        }
        btn.textContent = 'Pulse Review ✓';
        btn.dataset.loaded = 'true';
      } catch (e) {
        btn.textContent = 'Pulse Review';
        btn.disabled = false;
        appendPhinityMessage('Pulse Review encountered an error. Please try again.');
      }
    });

    blockEl.querySelector('#tb-drift').addEventListener('click', async () => {
      const reason = driftResult ? driftResult.reason : 'No drift data available.';
      const recalBtn = driftScore !== 'Strong'
        ? `<button class="inline-action" id="recalBtn">Recalibrate tone</button>` : '';
      appendPhinityMessage(`Voice Drift: ${driftScore}. ${reason} ${recalBtn}`, true);

      if (driftScore !== 'Strong') {
        setTimeout(() => {
          document.getElementById('recalBtn')?.addEventListener('click', async (e) => {
            const rb = e.currentTarget;
            rb.textContent = 'Recalibrating…';
            rb.disabled = true;
            try {
              const recal = await PhinityCore.runSubmissionMode(docText);
              currentDocumentText = recal;
              blockEl.querySelector('#docContent').innerHTML = formatDocText(recal);
              rb.textContent = 'Done';
            } catch (err) {
              rb.textContent = 'Failed';
            }
          });
        }, 100);
      }
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

  // ── Pulse Review Section ──────────────────────────
  const buildPulseSection = (flags, docText) => {
    const section = document.createElement('div');
    section.className = 'pulse-section';
    section.style.cssText = 'padding: 0 1rem 1rem;';

    flags.forEach((flag, idx) => {
      const note = document.createElement('div');
      note.className = 'pulse-note';
      note.innerHTML = `
        <p style="font-size:0.75rem;color:var(--text-3);font-family:var(--font-mono);text-transform:uppercase;letter-spacing:0.1em;margin-bottom:0.3rem">${flag.type || 'judgment call'} · Flag ${idx + 1}</p>
        <p style="margin-bottom:0.5rem;">"${escapeHtml(flag.excerpt || '')}"</p>
        <p style="color:var(--text-3);font-size:0.78rem;">${escapeHtml(flag.explanation || '')}</p>
        <div class="pulse-actions">
          <button class="pulse-btn keep" data-action="keep" data-idx="${idx}">Keep</button>
          <button class="pulse-btn adjust" data-action="adjust" data-idx="${idx}">Adjust</button>
          <button class="pulse-btn rephrase" data-action="rephrase" data-idx="${idx}">Rephrase</button>
        </div>
      `;
      section.appendChild(note);

      note.querySelectorAll('.pulse-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          const action = btn.dataset.action;
          if (action === 'keep') {
            note.style.opacity = '0.4';
            note.style.pointerEvents = 'none';
            return;
          }
          btn.textContent = action === 'adjust' ? 'Adjusting…' : 'Rephrasing…';
          btn.disabled = true;
          try {
            const newText = await PhinityCore.regenerateSection(flag.excerpt, flag.explanation, currentDocumentText, action);
            currentDocumentText = currentDocumentText.replace(flag.excerpt, newText);
            const docContent = document.getElementById('docContent');
            if (docContent) docContent.innerHTML = formatDocText(currentDocumentText);
            note.style.opacity = '0.4';
            note.style.pointerEvents = 'none';
            flag.excerpt = newText;
          } catch (e) {
            btn.textContent = action;
            btn.disabled = false;
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

    const printDiv = document.createElement('div');
    printDiv.style.cssText = `position:fixed;left:-9999px;top:0;width:794px;background:white;color:black;font-family:Georgia,serif;font-size:12pt;line-height:1.8;padding:72px;`;
    printDiv.innerHTML = docText.split(/\n\n+/).filter(p => p.trim())
      .map(p => `<p style="margin-bottom:1em">${escapeHtml(p.trim())}</p>`).join('');

    if (watermark) {
      const wm = document.createElement('div');
      wm.style.cssText = `position:fixed;bottom:24px;right:24px;font-size:8pt;color:#999;font-family:monospace;letter-spacing:0.1em;`;
      wm.textContent = 'Generated with PhinityX Free';
      printDiv.appendChild(wm);
    }

    document.body.appendChild(printDiv);
    try {
      if (window.jspdf && window.html2canvas) {
        const canvas = await window.html2canvas(printDiv);
        const pdf = new window.jspdf.jsPDF('p', 'mm', 'a4');
        const w = pdf.internal.pageSize.getWidth();
        pdf.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, w, (canvas.height * w) / canvas.width);
        pdf.save(`PhinityX_${getDateStr()}.pdf`);
      } else {
        const pw = window.open('', '_blank');
        pw.document.write(`<!DOCTYPE html><html><body style="font-family:Georgia,serif;font-size:12pt;line-height:1.8;padding:72px;color:black;">${printDiv.innerHTML}</body></html>`);
        pw.document.close();
        pw.print();
      }
    } catch (e) {
      console.warn('PDF error:', e);
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
