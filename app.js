/* ═══════════════════════════════════════════════════
   PhinityX — app.js
   Screen transitions, onboarding flow, chat logic,
   document generation, Pulse Review, Voice Drift,
   PDF download, session sidebar, re-assessment.
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
  let activeChatContext = null;
  let toneLockDoc = null;

  // ── Init ──────────────────────────────────────────
  const init = () => {
    runParadigmLoader();
  };

  // ── Screen 1: Paradigm Loader ─────────────────────
  const runParadigmLoader = () => {
    showScreen('screen-paradigm', false);
    const bar = document.getElementById('paradigmProgress');
    let w = 0;
    const iv = setInterval(() => {
      w += 2.5;
      bar.style.width = w + '%';
      if (w >= 100) {
        clearInterval(iv);
        setTimeout(runPhinityLoader, 300);
      }
    }, 40);
  };

  // ── Screen 2: PhinityX Loader ─────────────────────
  const runPhinityLoader = () => {
    showScreen('screen-loader', false);
    const bar = document.getElementById('loaderProgress');
    let w = 0;
    const iv = setInterval(() => {
      w += 3;
      bar.style.width = w + '%';
      if (w >= 100) {
        clearInterval(iv);
        setTimeout(() => {
          const profile = PhinityCore.loadProfile();
          if (profile && profile.name) {
            showScreen('screen-login', false);
          } else {
            showScreen('screen-signup', false);
          }
        }, 400);
      }
    }, 30);
  };

  // ── Screen 2B: Login (Returning User) ────────────
  const initLogin = () => {
    document.getElementById('loginContinue').addEventListener('click', () => {
      const name = document.getElementById('li-name').value.trim().toLowerCase();
      const dob  = document.getElementById('li-dob').value;
      if (!name || !dob) {
        alert('Please enter your name and date of birth to sign in.');
        return;
      }
      const profile = PhinityCore.loadProfile();
      const profileName = (profile?.name || '').trim().toLowerCase();
      const profileDob  = profile?.dob || '';
      if (profileName === name && profileDob === dob) {
        loadHomeScreen();
      } else {
        alert('Those details don\'t match what we have on file. Please try again or create a new account.');
      }
    });

    document.getElementById('loginNewAccount').addEventListener('click', () => {
      showScreen('screen-signup', false);
    });
  };

  // ── Screen 3: Sign-up ─────────────────────────────
  const initSignup = () => {
    // Gender selector
    document.querySelectorAll('#genderSelector .seg-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#genderSelector .seg-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        pendingProfile.gender = btn.dataset.val;
      });
    });

    // Tier selector
    document.querySelectorAll('#tierSelector .tier-card').forEach(card => {
      card.addEventListener('click', () => {
        document.querySelectorAll('#tierSelector .tier-card').forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
        pendingProfile.tier = card.dataset.tier;
      });
    });

    document.getElementById('signupContinue').addEventListener('click', () => {
      const name = document.getElementById('su-name').value.trim();
      const dob  = document.getElementById('su-dob').value;
      const field = document.getElementById('su-field').value.trim();
      const inst  = document.getElementById('su-institution').value.trim();

      if (!name || !dob || !field || !inst) {
        alert('Please fill in all required fields.');
        return;
      }

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
    document.getElementById('btnSkip').addEventListener('click', () => {
      pendingProfile.onboardingComplete = false;
      PhinityCore.saveProfile(pendingProfile);
      loadHomeScreen();
    });
  };

  // ── Screen 5: Academic Profile ────────────────────
  const initAcademic = () => {
    document.querySelectorAll('#cgpaScaleSelector .seg-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#cgpaScaleSelector .seg-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        pendingProfile.cgpaScale = btn.dataset.val;
      });
    });
    // Default scale
    pendingProfile.cgpaScale = '4.0';

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
      pendingProfile.writingSample   = sample;
      pendingProfile.prevSubmission  = document.getElementById('ws-prev').value.trim();

      const tier = pendingProfile.tier || 'free';
      if (PhinityCore.TIER_LIMITS[tier].characterMapping) {
        showScreen('screen-personality');
      } else {
        showScreen('screen-style');
      }
    });
  };

  // ── Screen 7: Personality Mapping ────────────────
  const initPersonality = () => {
    document.getElementById('personalityNext').addEventListener('click', () => {
      const chars = Array.from(document.querySelectorAll('.char-input'))
        .map(i => i.value.trim())
        .filter(Boolean);
      pendingProfile.characters = chars;
      showScreen('screen-style');
    });
  };

  // ── Screen 8: Style Preferences ──────────────────
  const initStyle = () => {
    document.getElementById('styleNext').addEventListener('click', () => {
      pendingProfile.styleRhythm  = document.getElementById('sl-rhythm').value;
      pendingProfile.styleVocab   = document.getElementById('sl-vocab').value;
      pendingProfile.styleTone    = document.getElementById('sl-tone').value;
      pendingProfile.weakness     = document.getElementById('sl-weakness').value.trim();
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

    document.getElementById('contextNext').addEventListener('click', () => {
      pendingProfile.onboardingComplete = true;
      PhinityCore.saveProfile(pendingProfile);

      // Profile complete screen
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
  const loadHomeScreen = () => {
    showScreen('screen-home', false);
    screenStack.length = 0;
    renderSessionSidebar();
    populateProfileScreen();
    checkReassessment();
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
  const renderSessionSidebar = () => {
    const list = document.getElementById('sessionList');
    const sessions = PhinityCore.loadSessions();
    if (sessions.length === 0) {
      list.innerHTML = '<p class="no-sessions">No sessions yet. Start writing.</p>';
      return;
    }
    list.innerHTML = sessions.map(s => {
      const d = new Date(s.timestamp);
      const dateStr = d.toLocaleDateString('en-GB', { day:'numeric', month:'short' });
      return `<button class="session-item" data-id="${s.id}">
        <span class="session-item-title">${escapeHtml(s.topic)}</span>
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
  const startNewDocSession = (initialPrompt) => {
    if (!PhinityCore.canGenerateDoc() && initialPrompt) {
      showDocScreen();
      appendLimitNotice();
      return;
    }
    currentSessionId = null;
    currentDocumentText = null;
    currentPulseData = null;
    pendingAttachments = [];
    pendingImageFiles = [];
    activeChatContext = null;

    showDocScreen();
    clearChat();

    if (initialPrompt) {
      handleDocPrompt(initialPrompt);
    }
  };

  const showDocScreen = () => {
    const profile = PhinityCore.loadProfile();
    const name = profile ? profile.name || 'User' : 'User';
    document.getElementById('docTopbarName').textContent = name;
    showScreen('screen-doc');

    // Show incomplete warning if skipped onboarding
    if (profile && !profile.onboardingComplete) {
      document.getElementById('incompleteWarning').style.display = 'block';
    } else {
      document.getElementById('incompleteWarning').style.display = 'none';
    }
  };

  const restoreSession = (sessionId) => {
    const session = PhinityCore.getSession(sessionId);
    if (!session) return;
    currentSessionId = sessionId;
    currentDocumentText = session.document;
    currentPulseData = session.pulseReview;

    showDocScreen();
    clearChat();

    // Restore user prompt
    if (session.prompt) {
      appendUserMessage(session.prompt);
    }

    // Restore document if it exists
    if (session.document) {
      appendDocumentBlock(session.document, session.pulseReview, session.driftScore);
    }
  };

  // ── Doc Screen ────────────────────────────────────
  const initDocScreen = () => {
    document.getElementById('docBack').addEventListener('click', () => {
      showScreen('screen-home', false);
      screenStack.length = 0;
      renderSessionSidebar();
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
    if (!PhinityCore.canGenerateDoc()) {
      appendLimitNotice();
      return;
    }

    appendUserMessage(promptText);

    // Missing attachment warning
    if (pendingAttachments.length === 0 && pendingImageFiles.length === 0) {
      const continued = await showMissingAttachmentWarning();
      if (!continued) return;
    }

    // Create session
    const profile = PhinityCore.loadProfile();
    const ctx = profile ? profile.submissionContext || 'university' : 'university';
    const session = PhinityCore.createSession(null, promptText, ctx);
    currentSessionId = session.id;

    // Build attachment context text
    const attachmentContext = buildAttachmentContextString();

    // Show thinking state
    const thinkingEl = appendThinkingState();

    try {
      // Cycle status messages
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

      const docText = await PhinityCore.generateDocument(promptText, attachmentContext);
      clearInterval(statusIv);
      thinkingEl.remove();

      currentDocumentText = docText;
      PhinityCore.incrementSessionCount();

      // Run voice drift in background
      let driftResult = null;
      try {
        driftResult = await PhinityCore.runVoiceDrift(docText);
        PhinityCore.logDrift(currentSessionId, driftResult.score);
      } catch(e) {
        driftResult = { score: 'Moderate', reason: 'Drift analysis unavailable.' };
      }

      appendDocumentBlock(docText, null, driftResult);

      // Save to session
      PhinityCore.updateSession(currentSessionId, {
        document: docText,
        driftScore: driftResult,
        topic: promptText.substring(0, 60),
      });

      renderSessionSidebar();
      clearAttachments();

    } catch(err) {
      thinkingEl.remove();
      appendPhinityMessage(`Something went wrong generating your document: ${err.message}. Please try again.`);
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
        btn.textContent = 'Noted. Generating...';
        btn.disabled = true;
        resolve(true);
      });
      msgEl.querySelector('.chat-bubble').appendChild(btn);

      // Also allow attaching
      const attachBtn = document.createElement('button');
      attachBtn.className = 'inline-action';
      attachBtn.textContent = 'Attach notes';
      attachBtn.style.marginLeft = '0.5rem';
      attachBtn.addEventListener('click', () => {
        openAttachSheet();
        resolve(false);
      });
      msgEl.querySelector('.chat-bubble').appendChild(attachBtn);
    });
  };

  const buildAttachmentContextString = () => {
    if (pendingAttachments.length === 0) return null;
    return pendingAttachments.map(a => `[${a.name}]: ${a.content || '(binary file attached)'}`).join('\n\n');
  };

  // ── Chat UI ───────────────────────────────────────
  const clearChat = () => {
    document.getElementById('chatArea').innerHTML = '';
  };

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

    if (pulseData && pulseData.length > 0) {
      const pulseSection = buildPulseSection(pulseData, docText);
      blockEl.appendChild(pulseSection);
    }

    area.appendChild(blockEl);
    scrollChat();

    // Download
    blockEl.querySelector('#tb-download').addEventListener('click', () => downloadPDF(docText));

    // Pulse Review
    blockEl.querySelector('#tb-pulse').addEventListener('click', async () => {
      const btn = blockEl.querySelector('#tb-pulse');
      if (btn.dataset.loaded === 'true') return;
      btn.textContent = 'Auditing...';
      btn.disabled = true;
      try {
        const pulseFlags = await PhinityCore.runPulseReview(docText);
        currentPulseData = pulseFlags;
        if (currentSessionId) {
          PhinityCore.updateSession(currentSessionId, { pulseReview: pulseFlags });
        }
        const existing = blockEl.querySelector('.pulse-section');
        if (existing) existing.remove();
        if (pulseFlags.length > 0) {
          const pulseSection = buildPulseSection(pulseFlags, docText);
          blockEl.appendChild(pulseSection);
        } else {
          appendPhinityMessage('Pulse Review found no significant judgment calls to flag. The document reads cleanly.');
        }
        btn.textContent = 'Pulse Review ✓';
        btn.dataset.loaded = 'true';
      } catch(e) {
        btn.textContent = 'Pulse Review';
        btn.disabled = false;
        appendPhinityMessage('Pulse Review encountered an error. Please try again.');
      }
    });

    // Voice Drift
    blockEl.querySelector('#tb-drift').addEventListener('click', async () => {
      const reason = driftResult ? driftResult.reason : 'No drift data available.';
      const recalBtn = driftScore !== 'Strong'
        ? `<button class="inline-action" id="recalBtn">Recalibrate tone</button>`
        : '';
      appendPhinityMessage(`Voice Drift: ${driftScore}. ${reason} ${recalBtn}`, true);

      if (driftScore !== 'Strong') {
        setTimeout(() => {
          const rb = document.getElementById('recalBtn');
          if (rb) {
            rb.addEventListener('click', async () => {
              rb.textContent = 'Recalibrating...';
              rb.disabled = true;
              try {
                const recal = await PhinityCore.runSubmissionMode(docText);
                currentDocumentText = recal;
                blockEl.querySelector('#docContent').innerHTML = formatDocText(recal);
                if (currentSessionId) PhinityCore.updateSession(currentSessionId, { document: recal });
                rb.textContent = 'Done';
              } catch(e) {
                rb.textContent = 'Failed';
              }
            });
          }
        }, 100);
      }
    });
  };

  const formatDocText = (text) => {
    return text
      .split(/\n\n+/)
      .filter(p => p.trim())
      .map(p => `<p>${escapeHtml(p.trim())}</p>`)
      .join('');
  };

  const appendLimitNotice = () => {
    const profile = PhinityCore.loadProfile();
    const tier = profile ? profile.tier || 'free' : 'free';
    const area = document.getElementById('chatArea') || document.getElementById('homeMain');
    if (!area) return;
    const el = document.createElement('div');
    el.className = 'limit-notice';
    const nextTier = tier === 'free' ? 'Core' : 'Pro';
    el.innerHTML = `
      <p>You've reached your document limit for this month on the ${tier.charAt(0).toUpperCase()+tier.slice(1)} plan. Upgrade to ${nextTier} to keep writing.</p>
      <button class="btn-primary" onclick="document.getElementById('screen-profile').querySelector('[data-section=tier]').click()">View plans</button>
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
          btn.textContent = action === 'adjust' ? 'Adjusting...' : 'Rephrasing...';
          btn.disabled = true;
          try {
            const newText = await PhinityCore.regenerateSection(flag.excerpt, flag.explanation, currentDocumentText, action);
            // Replace in current doc
            currentDocumentText = currentDocumentText.replace(flag.excerpt, newText);
            if (currentSessionId) PhinityCore.updateSession(currentSessionId, { document: currentDocumentText });
            // Update display
            const docContent = document.getElementById('docContent');
            if (docContent) docContent.innerHTML = formatDocText(currentDocumentText);
            note.style.opacity = '0.4';
            note.style.pointerEvents = 'none';
            flag.excerpt = newText; // update in memory
          } catch(e) {
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
    const profile = PhinityCore.loadProfile();
    const tier = profile ? profile.tier || 'free' : 'free';
    const watermark = PhinityCore.TIER_LIMITS[tier].watermark;

    // Build a hidden printable div
    const printDiv = document.createElement('div');
    printDiv.style.cssText = `
      position: fixed;
      left: -9999px;
      top: 0;
      width: 794px;
      background: white;
      color: black;
      font-family: Georgia, serif;
      font-size: 12pt;
      line-height: 1.8;
      padding: 72px;
    `;
    printDiv.innerHTML = docText
      .split(/\n\n+/)
      .filter(p => p.trim())
      .map(p => `<p style="margin-bottom:1em">${escapeHtml(p.trim())}</p>`)
      .join('');

    if (watermark) {
      const wm = document.createElement('div');
      wm.style.cssText = `
        position: fixed;
        bottom: 24px;
        right: 24px;
        font-size: 8pt;
        color: #999;
        font-family: monospace;
        letter-spacing: 0.1em;
      `;
      wm.textContent = 'Generated with PhinityX Free';
      printDiv.appendChild(wm);
    }

    document.body.appendChild(printDiv);

    // Use print dialog as PDF fallback (universal, no library needed)
    const topic = currentSessionId
      ? (PhinityCore.getSession(currentSessionId)?.topic || 'document')
      : 'document';

    // Try html2canvas + jsPDF if available, else use print
    try {
      if (window.jspdf && window.html2canvas) {
        const canvas = await window.html2canvas(printDiv);
        const imgData = canvas.toDataURL('image/jpeg', 0.95);
        const pdf = new window.jspdf.jsPDF('p', 'mm', 'a4');
        const w = pdf.internal.pageSize.getWidth();
        const h = (canvas.height * w) / canvas.width;
        pdf.addImage(imgData, 'JPEG', 0, 0, w, h);
        const filename = `PhinityX_${sanitizeFilename(topic)}_${getDateStr()}.pdf`;
        pdf.save(filename);
      } else {
        // Fallback: open print dialog
        const printWindow = window.open('', '_blank');
        printWindow.document.write(`<!DOCTYPE html><html><body style="font-family:Georgia,serif;font-size:12pt;line-height:1.8;padding:72px;color:black;">`);
        printWindow.document.write(printDiv.innerHTML);
        printWindow.document.write(`</body></html>`);
        printWindow.document.close();
        printWindow.print();
      }
    } catch(e) {
      console.warn('PDF generation error:', e);
    } finally {
      document.body.removeChild(printDiv);
    }
  };

  const sanitizeFilename = (s) => s.replace(/[^a-z0-9]/gi, '_').toLowerCase().substring(0, 40);
  const getDateStr = () => {
    const d = new Date();
    return `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
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

    document.getElementById('attachImages').addEventListener('click', () => {
      const profile = PhinityCore.loadProfile();
      const tier = profile ? profile.tier || 'free' : 'free';
      if (!PhinityCore.TIER_LIMITS[tier].attachments) {
        closeAttachSheet();
        appendPhinityMessage('Attachments are available on Core and Pro plans. Upgrade to attach images and documents.');
        return;
      }
      document.getElementById('imageUpload').click();
    });

    document.getElementById('attachDocs').addEventListener('click', () => {
      const profile = PhinityCore.loadProfile();
      const tier = profile ? profile.tier || 'free' : 'free';
      if (!PhinityCore.TIER_LIMITS[tier].attachments) {
        closeAttachSheet();
        appendPhinityMessage('Attachments are available on Core and Pro plans. Upgrade to attach images and documents.');
        return;
      }
      document.getElementById('docUpload').click();
    });

    document.getElementById('imageUpload').addEventListener('change', handleImageUpload);
    document.getElementById('docUpload').addEventListener('change', handleDocUpload);
  };

  const handleImageUpload = (e) => {
    const files = Array.from(e.target.files);
    const remaining = 5 - pendingImageFiles.length;
    const toAdd = files.slice(0, remaining);
    pendingImageFiles.push(...toAdd);
    toAdd.forEach(f => {
      pendingAttachments.push({ name: f.name, type: 'image', content: null, file: f });
    });
    closeAttachSheet();
    renderAttachmentPills();
    e.target.value = '';
  };

  const handleDocUpload = async (e) => {
    const files = Array.from(e.target.files);
    for (const f of files) {
      const text = await readFileAsText(f).catch(() => null);
      pendingAttachments.push({ name: f.name, type: 'doc', content: text });
    }
    closeAttachSheet();
    renderAttachmentPills();
    e.target.value = '';
  };

  const readFileAsText = (file) => {
    return new Promise((res, rej) => {
      const reader = new FileReader();
      reader.onload = () => res(reader.result);
      reader.onerror = rej;
      reader.readAsText(file);
    });
  };

  const renderAttachmentPills = () => {
    let pills = document.getElementById('attachPills');
    if (!pills) {
      pills = document.createElement('div');
      pills.id = 'attachPills';
      pills.className = 'attachment-pills';
      document.querySelector('.doc-input-bar')?.before(pills);
    }
    if (pendingAttachments.length === 0) {
      pills.remove();
      return;
    }
    pills.innerHTML = pendingAttachments.map((a, i) => `
      <span class="attachment-pill">
        ${a.type === 'image' ? '🖼' : '📄'} ${escapeHtml(a.name)}
        <span class="pill-remove" data-idx="${i}">✕</span>
      </span>
    `).join('');
    pills.querySelectorAll('.pill-remove').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.idx);
        pendingAttachments.splice(idx, 1);
        renderAttachmentPills();
      });
    });
  };

  const clearAttachments = () => {
    pendingAttachments = [];
    pendingImageFiles = [];
    const pills = document.getElementById('attachPills');
    if (pills) pills.remove();
  };

  // ── Profile Screen ────────────────────────────────
  const openProfile = () => {
    populateProfileScreen();
    showScreen('screen-profile');
  };

  const populateProfileScreen = () => {
    const profile = PhinityCore.loadProfile();
    if (!profile) return;

    const standing = PhinityCore.getStanding(profile.cgpa || 0, profile.cgpaScale || 4.0);
    const firstName = (profile.name || '').split(' ')[0];

    document.getElementById('profileAvatar').textContent = firstName.charAt(0).toUpperCase() || '?';
    document.getElementById('profileName').textContent = profile.name || '—';
    document.getElementById('profileStanding').textContent = standing;
    document.getElementById('profileTierBadge').textContent = (profile.tier || 'free').charAt(0).toUpperCase() + (profile.tier || 'free').slice(1);

    document.getElementById('pf-name').textContent = profile.name || '—';
    document.getElementById('pf-dob').textContent = profile.dob || '—';
    document.getElementById('pf-gender').textContent = profile.gender || '—';
    document.getElementById('pf-institution').textContent = profile.institution || '—';
    document.getElementById('pf-fieldStudy').textContent = profile.fieldStudy || '—';
    document.getElementById('pf-occupation').textContent = profile.occupation || '—';

    document.getElementById('pf-cgpa').textContent = profile.cgpa || '—';
    document.getElementById('pf-targetCgpa').textContent = profile.targetCgpa || '—';
    document.getElementById('pf-scale').textContent = profile.cgpaScale ? profile.cgpaScale + ' scale' : '—';

    const chars = profile.characters || [];
    const charContainer = document.getElementById('pf-characters');
    charContainer.innerHTML = chars.length > 0
      ? chars.map(c => `<span class="pf-char-tag">${escapeHtml(c)}</span>`).join('')
      : '<span style="font-size:0.75rem;color:var(--text-3);padding:0.75rem 1rem;display:block;">No characters added</span>';

    const rhythmVal = parseInt(profile.styleRhythm || 50);
    document.getElementById('pf-rhythm').textContent = rhythmVal <= 33 ? 'Short & punchy' : rhythmVal <= 66 ? 'Balanced' : 'Long & flowing';
    const vocabVal = parseInt(profile.styleVocab || 50);
    document.getElementById('pf-vocab').textContent = vocabVal <= 33 ? 'Plain' : vocabVal <= 66 ? 'Moderate' : 'Technical';
    const toneVal = parseInt(profile.styleTone || 50);
    document.getElementById('pf-tone').textContent = toneVal <= 33 ? 'Conversational' : toneVal <= 66 ? 'Measured' : 'Formal-academic';
    document.getElementById('pf-weakness').textContent = profile.weakness || 'None specified';
    document.getElementById('pf-context').textContent = profile.submissionContext || 'university';

    const usage = PhinityCore.getDocsUsed();
    document.getElementById('pf-tier').textContent = (profile.tier || 'free').charAt(0).toUpperCase() + (profile.tier || 'free').slice(1);
    document.getElementById('pf-docsUsed').textContent = `${usage.count} this month`;
  };

  const initProfileScreen = () => {
    document.getElementById('profileBack').addEventListener('click', () => {
      goBack();
    });

    document.querySelectorAll('.edit-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const section = btn.dataset.section;
        handleProfileEdit(section);
      });
    });
  };

  const handleProfileEdit = (section) => {
    if (section === 'tier') {
      // Show tier modal (simplified inline prompt)
      const currentTier = PhinityCore.loadProfile()?.tier || 'free';
      const tiers = ['free', 'core', 'pro'];
      const prices = { free: '$0', core: '$8/mo', pro: '$16/mo' };
      const next = tiers.filter(t => t !== currentTier);
      const choice = confirm(`Upgrade plan?\n\nCurrent: ${currentTier}\n\nOptions:\n${next.map(t => `${t} (${prices[t]})`).join(', ')}\n\nIn a real deployment, this connects to a payment processor. For now, tap OK to switch to Core.`);
      if (choice) {
        const idx = tiers.indexOf(currentTier);
        const nextTier = tiers[Math.min(idx + 1, tiers.length - 1)];
        PhinityCore.updateProfileField('tier', nextTier);
        populateProfileScreen();
      }
    } else if (section === 'academic') {
      const newCgpa = prompt('Update your current CGPA:');
      if (newCgpa && !isNaN(parseFloat(newCgpa))) {
        PhinityCore.updateProfileField('cgpa', parseFloat(newCgpa));
        populateProfileScreen();
      }
    } else {
      // For other sections, in a full build these would open inline edit states
      alert(`Full inline editing for "${section}" coming in the next build. Profile data is stored and editable via the settings flow.`);
    }
  };

  // ── Re-assessment Modal ───────────────────────────
  const checkReassessment = () => {
    if (PhinityCore.shouldShowReassessment()) {
      document.getElementById('reassessOverlay').style.display = 'flex';
    }
  };

  const initReassessment = () => {
    document.getElementById('raUpdate').addEventListener('click', () => {
      const cgpa = document.getElementById('ra-cgpa').value;
      const sample = document.getElementById('ra-sample').value.trim();
      if (cgpa && !isNaN(parseFloat(cgpa))) {
        PhinityCore.updateProfileField('cgpa', parseFloat(cgpa));
      }
      if (sample) {
        PhinityCore.updateProfileField('writingSample', sample);
      }
      document.getElementById('reassessOverlay').style.display = 'none';
      populateProfileScreen();
    });
    document.getElementById('raDismiss').addEventListener('click', () => {
      document.getElementById('reassessOverlay').style.display = 'none';
    });
  };

  // ── Utilities ─────────────────────────────────────
  const scrollChat = () => {
    const area = document.getElementById('chatArea');
    if (area) setTimeout(() => { area.scrollTop = area.scrollHeight; }, 50);
  };

  const escapeHtml = (str) => {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
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
