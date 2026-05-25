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
    window._pxLoaderStarted = false;
    window.startPxLoader(async () => {
      try {
        const session = await PhinityCore.getSession();
        if (session) {
          await loadHomeScreen();
        } else {
          const cached = PhinityCore.loadProfileCached();
          showScreen(cached && cached.name ? 'screen-login' : 'screen-signup', false);
        }
      } catch (err) {
        console.error('Loader auth check failed:', err);
        // Fall through to login rather than hanging
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

    // Set user's first name in topbar
    const profile = PhinityCore.loadProfileCached();
    const firstName = profile ? (profile.name || '').split(' ')[0] || 'PhinityX' : 'PhinityX';
    const titleEl = document.getElementById('homeTopbarName');
    if (titleEl) titleEl.textContent = firstName;

    // Show incomplete warning if needed
    document.getElementById('incompleteWarning').style.display =
      (profile && !profile.onboardingComplete) ? 'block' : 'none';

    try {
      await renderSessionSidebar();
      await populateProfileScreen();
      await checkReassessment();
    } catch (err) {
      console.error('loadHomeScreen error:', err);
    }
  };

  // Unified — everything stays on home screen
  const showDocScreen = async () => {
    // Already on home screen; refresh name + warning only
    const profile = PhinityCore.loadProfileCached();
    const firstName = profile ? (profile.name || '').split(' ')[0] || 'PhinityX' : 'PhinityX';
    const titleEl = document.getElementById('homeTopbarName');
    if (titleEl) titleEl.textContent = firstName;
    document.getElementById('incompleteWarning').style.display =
      (profile && !profile.onboardingComplete) ? 'block' : 'none';
  };

  const initHome = () => {
    document.getElementById('hamburger').addEventListener('click', openSidebar);
    document.getElementById('sidebarClose').addEventListener('click', closeSidebar);
    document.getElementById('sidebarOverlay').addEventListener('click', closeSidebar);
    document.getElementById('homeSettings').addEventListener('click', openProfile);

    // New Chat — reset state, stay on home screen, show empty state
    document.getElementById('sidebarNewDoc').addEventListener('click', () => {
      closeSidebar();
      startNewDocSession();
    });

    document.getElementById('homeAttach').addEventListener('click', openAttachSheet);
    document.getElementById('homeSend').addEventListener('click', handleHomePromptSend);
    document.getElementById('homePrompt').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) handleHomePromptSend();
    });

    document.getElementById('completeProfileLink')?.addEventListener('click', (e) => {
      e.preventDefault();
      openProfile();
    });

    // ── Face toggle ──────────────────────────────
    const FACE_KEY  = 'px_face_on';
    const COUNT_KEY = 'px_face_counts';

    const getFacePref  = () => localStorage.getItem(FACE_KEY) === 'true';
    const saveFacePref = (val) => localStorage.setItem(FACE_KEY, val ? 'true' : 'false');
    const bumpFaceCount = (val) => {
      try {
        const raw = localStorage.getItem(COUNT_KEY);
        const counts = raw ? JSON.parse(raw) : { on: 0, off: 0 };
        if (val) counts.on = (counts.on || 0) + 1;
        else counts.off = (counts.off || 0) + 1;
        localStorage.setItem(COUNT_KEY, JSON.stringify(counts));
      } catch (_) {}
    };

    const applyFace = (on) => {
      const homeEmpty = document.getElementById('homeEmpty');
      const chatArea  = document.getElementById('chatArea');
      const btn = document.getElementById('faceToggleBtn');
      if (!btn) return;
      if (on) {
        if (homeEmpty) homeEmpty.classList.add('face-on');
        if (chatArea)  chatArea.classList.add('face-on');
        btn.classList.add('face-on');
      } else {
        if (homeEmpty) homeEmpty.classList.remove('face-on');
        if (chatArea)  chatArea.classList.remove('face-on');
        btn.classList.remove('face-on');
      }
    };

    applyFace(getFacePref());

    const faceBtn = document.getElementById('faceToggleBtn');
    if (faceBtn) {
      faceBtn.addEventListener('click', () => {
        const next = !getFacePref();
        saveFacePref(next);
        bumpFaceCount(next);
        applyFace(next);
      });
    }
  };

  const handleHomePromptSend = () => {
    const val = document.getElementById('homePrompt').value.trim();
    if (!val) return;
    document.getElementById('homePrompt').value = '';
    showChatState();
    handleDocPrompt(val);
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

    // Pinned sessions float to top
    const sorted = [...sessions].sort((a, b) => {
      const ap = a.pinned ? 0 : 1;
      const bp = b.pinned ? 0 : 1;
      return ap - bp;
    });

    list.innerHTML = sorted.map(s => {
      const d = new Date(s.created_at || s.timestamp);
      const dateStr = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
      const pinned  = !!s.pinned;
      return `<div class="session-item${pinned ? ' pinned' : ''}" data-id="${s.id}">
        <button class="session-item-body" data-id="${s.id}">
          <span class="session-item-title">${escapeHtml(s.topic || s.prompt || 'Untitled')}</span>
          <span class="session-item-meta">
            <span>${dateStr}</span>
            <span>${s.context || 'university'}</span>
          </span>
        </button>
        <div class="session-item-actions">
          <button class="session-action-btn pin-btn${pinned ? ' active' : ''}" data-id="${s.id}" data-pinned="${pinned}" title="Pin chat">
            <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="${pinned ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M15 4.5l-4 4l-4 1.5l-1.5 1.5l7 7l1.5 -1.5l1.5 -4l4 -4"/><path d="M9 15l-4.5 4.5"/><path d="M14.5 4l5.5 5.5"/></svg>
          </button>
          <button class="session-action-btn delete-btn" data-id="${s.id}" title="Delete chat">
            <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M4 7l16 0"/><path d="M10 11l0 6"/><path d="M14 11l0 6"/><path d="M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2 -2l1 -12"/><path d="M9 7v-3a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v3"/></svg>
          </button>
        </div>
      </div>`;
    }).join('');

    // Restore session on body click
    list.querySelectorAll('.session-item-body').forEach(btn => {
      btn.addEventListener('click', () => {
        closeSidebar();
        restoreSession(btn.dataset.id);
      });
    });

    // Pin toggle
    list.querySelectorAll('.pin-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        btn.disabled = true;
        btn.style.opacity = '0.4';
        try {
          const currentlyPinned = btn.dataset.pinned === 'true';
          await PhinityCore.togglePinSession(btn.dataset.id, currentlyPinned);
          await renderSessionSidebar();
        } catch (err) {
          console.error('Pin error:', err);
          btn.disabled = false;
          btn.style.opacity = '';
        }
      });
    });

    // Delete with confirmation
    list.querySelectorAll('.delete-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        showDeleteConfirm(btn.dataset.id);
      });
    });
  };

  // ── Delete confirmation ───────────────────────────
  const showDeleteConfirm = (sessionId) => {
    // Build confirm panel dynamically — deleteConfirmOverlay doesn't exist in HTML
    let overlay = document.getElementById('deleteConfirmOverlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'deleteConfirmOverlay';
      overlay.className = 'delete-confirm-overlay';
      overlay.innerHTML = `
        <div class="delete-confirm-box">
          <div class="delete-confirm-title">Delete this chat?</div>
          <div class="delete-confirm-sub">This can't be undone.</div>
          <div class="delete-confirm-actions">
            <button class="delete-confirm-btn cancel" id="deleteConfirmNo">Cancel</button>
            <button class="delete-confirm-btn danger" id="deleteConfirmYes">Delete</button>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);
    }

    const confirmBtn = overlay.querySelector('#deleteConfirmYes');
    const cancelBtn  = overlay.querySelector('#deleteConfirmNo');

    overlay.classList.add('visible');

    const cleanup = () => overlay.classList.remove('visible');

    const onConfirm = async () => {
      cleanup();
      confirmBtn.removeEventListener('click', onConfirm);
      cancelBtn.removeEventListener('click',  onCancel);
      if (currentSessionId === sessionId) {
        currentSessionId    = null;
        currentDocumentText = null;
        currentPulseData    = null;
        currentMessages     = [];
        clearChat();
        showEmptyState();
      }
      await PhinityCore.deleteSession(sessionId);
      await renderSessionSidebar();
    };

    const onCancel = () => {
      cleanup();
      confirmBtn.removeEventListener('click', onConfirm);
      cancelBtn.removeEventListener('click',  onCancel);
    };

    confirmBtn.addEventListener('click', onConfirm);
    cancelBtn.addEventListener('click',  onCancel);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) onCancel();
    }, { once: true });
  };

  // ── New Chat Session ──────────────────────────────
  const startNewDocSession = async (initialPrompt) => {
    const canGen = await PhinityCore.canGenerateDoc();
    if (!canGen && initialPrompt) {
      showChatState();
      await appendLimitNotice();
      return;
    }

    currentSessionId    = null;
    currentDocumentText = null;
    currentPulseData    = null;
    currentMessages     = [];
    pendingAttachments  = [];
    pendingImageFiles   = [];

    clearChat();
    showEmptyState(); // back to wordmark if no prompt yet

    if (initialPrompt) {
      showChatState();
      handleDocPrompt(initialPrompt);
    }
  };

  // Show the empty wordmark state
  const showEmptyState = () => {
    document.getElementById('homeEmpty').style.display = 'flex';
    document.getElementById('chatArea').style.display  = 'none';
  };

  // Show the chat state (hides wordmark, shows chat area)
  const showChatState = () => {
    document.getElementById('homeEmpty').style.display = 'none';
    document.getElementById('chatArea').style.display  = 'flex';
  };

  const restoreSession = async (sessionId) => {
    const session = await PhinityCore.getSessionById(sessionId);
    if (!session) return;

    currentSessionId    = sessionId;
    currentDocumentText = session.document;
    currentPulseData    = session.pulse_review;
    currentMessages     = session.messages || [];

    clearChat();
    showChatState();

    if (currentMessages.length > 0) {
      currentMessages.forEach(msg => {
        if (msg.role === 'user') {
          appendUserMessage(msg.text);
        } else if (msg.role === 'document') {
          appendDocumentBlock(msg.text, session.pulse_review, msg.drift);
        }
      });
    } else {
      if (session.prompt)   appendUserMessage(session.prompt);
      if (session.document) appendDocumentBlock(session.document, session.pulse_review, session.drift_score);
    }
  };

  const handleDocSendClick = () => {
    const val = document.getElementById('homePrompt').value.trim();
    if (!val) return;
    document.getElementById('homePrompt').value = '';
    showChatState();
    handleDocPrompt(val);
  };

  const handleDocPrompt = async (promptText) => {
    const canGen = await PhinityCore.canGenerateDoc();
    if (!canGen) { appendLimitNotice(); return; }

    // ── Prompt refinement — catch vague/short prompts ──
    const isVague = promptText.trim().split(/\s+/).length < 6;
    if (isVague) {
      const confirmed = await showPromptRefinementStep(promptText);
      if (!confirmed) return;
    }

    appendUserMessage(promptText);
    currentMessages.push({ role: 'user', text: promptText });

    // Missing attachment warning — only if NO attachments at all
    if (pendingAttachments.length === 0 && pendingImageFiles.length === 0) {
      const continued = await showMissingAttachmentWarning();
      if (!continued) return;
    }

    const attachmentContext = buildAttachmentContextString();

    // Build image payloads from stored base64
    const imagePayloads = pendingAttachments
      .filter(a => a.type === 'image' && a.base64)
      .map(a => ({ name: a.name, base64: a.base64, mediaType: a.mediaType }));

    // ── Detection risk warning ─────────────────────
    const profile = PhinityCore.loadProfileCached();
    const tone  = parseInt(profile?.styleTone  || profile?.style_tone  || 50);
    const vocab = parseInt(profile?.styleVocab || profile?.style_vocab || 50);
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
      const result = await PhinityCore.generateDocument(promptText, attachmentContext, imagePayloads);
      clearInterval(statusIv);
      thinkingEl.remove();

      currentDocumentText = result.document || result;
      if (result.sessionId) {
        currentSessionId = result.sessionId;
        const title = deriveSessionTitle(promptText);
        PhinityCore.db
          .from('sessions')
          .update({ topic: title })
          .eq('id', currentSessionId)
          .then(() => {})
          .catch(() => {});
      }

      let driftResult = null;
      try {
        driftResult = await PhinityCore.runVoiceDrift(currentDocumentText, currentSessionId);
      } catch (e) {
        driftResult = { score: 'Moderate', reason: 'Drift analysis unavailable.' };
      }

      appendDocumentBlock(currentDocumentText, null, driftResult);
      currentMessages.push({ role: 'document', text: currentDocumentText, drift: driftResult });

      if (currentSessionId) {
        PhinityCore.saveMessages(currentSessionId, currentMessages).catch(() => {});
      }

      await renderSessionSidebar();
      clearAttachments();
      PhinityCore.clearProfileOverride();

      // Show first-use Pulse hint
      showFeatureHint('pulse');

      try {
        const profile = PhinityCore.loadProfileCached();
        const newCount = (profile?.sessionCount || 0) + 1;
        await PhinityCore.updateProfileField('sessionCount', newCount);

        if (currentSessionId && driftResult) {
          await PhinityCore.db.from('drift_log').insert({
            user_id:    (await PhinityCore.getUser()).id,
            session_id: currentSessionId,
            score:      driftResult.score || 'Moderate',
            reason:     driftResult.reason || '',
            logged_at:  new Date().toISOString(),
          });
        }

        await checkReassessment();
      } catch (trackErr) {
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

  // ── Prompt Refinement — intercept vague/short prompts ──
  const showPromptRefinementStep = (promptText) => {
    return new Promise((resolve) => {
      const area = document.getElementById('chatArea');
      const el = document.createElement('div');
      el.className = 'chat-msg phinity refinement-msg';
      el.innerHTML = `
        <div class="chat-bubble refinement-bubble">
          <div class="refinement-header">
            <span class="refinement-icon">✦</span>
            <span>That's a short prompt. Want me to generate from this, or add more detail first?</span>
          </div>
          <div class="refinement-preview">"${escapeHtml(promptText)}"</div>
          <div class="refinement-actions">
            <button class="inline-action refinement-go">Generate now</button>
            <button class="inline-action refinement-edit" style="margin-left:0.5rem">Let me refine it</button>
          </div>
        </div>
      `;
      area.appendChild(el);
      scrollChat();

      el.querySelector('.refinement-go').addEventListener('click', () => {
        el.querySelector('.refinement-go').textContent = 'Got it. Generating…';
        el.querySelector('.refinement-go').disabled = true;
        el.querySelector('.refinement-edit').disabled = true;
        resolve(true);
      });

      el.querySelector('.refinement-edit').addEventListener('click', () => {
        // Put the text back in the prompt box for editing
        const promptBox = document.getElementById('homePrompt');
        if (promptBox) {
          promptBox.value = promptText;
          promptBox.focus();
          promptBox.setSelectionRange(promptBox.value.length, promptBox.value.length);
        }
        el.remove();
        resolve(false);
      });
    });
  };

  // ── Feature Hints — first-use tooltips ─────────────
  const HINT_KEY = 'phx_seen_hints';

  const getSeenHints = () => {
    try { return JSON.parse(localStorage.getItem(HINT_KEY) || '{}'); } catch { return {}; }
  };

  const markHintSeen = (key) => {
    const hints = getSeenHints();
    hints[key] = true;
    localStorage.setItem(HINT_KEY, JSON.stringify(hints));
  };

  const showFeatureHint = (key) => {
    const seen = getSeenHints();
    if (seen[key]) return;

    const hints = {
      pulse: {
        title: 'What is Pulse Review?',
        body: 'Pulse scans your document for moments that could raise flags — unusual phrasing, structural weak points, or tone inconsistencies. Tap any highlighted section in the Pulse screen to see what was flagged and why, then choose to keep, adjust, or rephrase it.',
      },
      drift: {
        title: 'What is Voice Drift?',
        body: 'This score measures how closely the generated output matches your writing fingerprint. "Strong" means your voice came through clearly. "Moderate" means some AI-generic patterns crept in. "Drifting" means the document sounds noticeably more generic than your usual writing style.',
      },
    };

    const hint = hints[key];
    if (!hint) return;

    const area = document.getElementById('chatArea');
    const el = document.createElement('div');
    el.className = 'feature-hint';
    el.innerHTML = `
      <div class="feature-hint-inner">
        <div class="feature-hint-header">
          <div class="feature-hint-title">${escapeHtml(hint.title)}</div>
          <button class="feature-hint-close" aria-label="Close">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </button>
        </div>
        <div class="feature-hint-body">${escapeHtml(hint.body)}</div>
      </div>
    `;
    area.appendChild(el);
    scrollChat();

    el.querySelector('.feature-hint-close').addEventListener('click', () => {
      markHintSeen(key);
      el.classList.add('hint-fade-out');
      setTimeout(() => el.remove(), 400);
    });
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
        reason = 'Your style is set to formal and sophisticated — which produces strong academic writing, but AI detectors are known to flag formal prose as AI-generated even when it isn\'t. This is a well-documented false positive problem.';
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
    const parts = pendingAttachments.map(a => {
      if (a.type === 'image') {
        return `[IMAGE: ${a.name}] — visual reference attached separately`;
      }
      if (a.content) {
        return `[DOCUMENT: ${a.name}]\n${a.content.slice(0, 8000)}${a.content.length > 8000 ? '\n...(truncated)' : ''}`;
      }
      return `[FILE: ${a.name}] — content unavailable`;
    });
    return parts.join('\n\n---\n\n');
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
        <div class="toolbar-btn-group">
          <button class="doc-tool-btn" id="tb-download">Download PDF</button>
          <button class="toolbar-info-btn" data-tip="download" aria-label="What is Download PDF?">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>
          </button>
        </div>
        <div class="toolbar-btn-group">
          <button class="doc-tool-btn" id="tb-pulse">${pulseLabel}</button>
          <button class="toolbar-info-btn" data-tip="pulse" aria-label="What is Pulse Review?">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>
          </button>
        </div>
        <div class="toolbar-btn-group">
          <button class="doc-tool-btn ${driftClass}" id="tb-drift">${driftScore}</button>
          <button class="toolbar-info-btn" data-tip="drift" aria-label="What is Voice Drift?">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>
          </button>
        </div>
      </div>
      <div class="doc-content" id="docContent">${formatDocText(docText)}</div>
    `;

    // ── Info popovers ─────────────────────────────
    const TIPS = {
      download: 'Exports your document as a formatted PDF you can save or submit.',
      pulse: 'Scans the document for flagged moments — tone issues, structural weak spots, or phrasing that could raise questions. Tap highlighted text to review and fix each one.',
      drift: 'Measures how closely this output matches your writing fingerprint. Strong = your voice. Moderate = some generic patterns. Drifting = reads more AI-generic than usual.',
    };

    blockEl.querySelectorAll('.toolbar-info-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const tip = TIPS[btn.dataset.tip];
        if (!tip) return;

        // Remove any existing popover
        document.querySelectorAll('.toolbar-tip-popover').forEach(p => p.remove());

        const pop = document.createElement('div');
        pop.className = 'toolbar-tip-popover';
        pop.innerHTML = `
          <div class="tip-popover-text">${escapeHtml(tip)}</div>
          <button class="tip-popover-close">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </button>
        `;

        // Append to body so it's never clipped by overflow:hidden parents
        document.body.appendChild(pop);

        // Position below the button, clamped within viewport
        const rect = btn.getBoundingClientRect();
        const popW = 230;
        let left = rect.left + rect.width / 2 - popW / 2;
        left = Math.max(12, Math.min(left, window.innerWidth - popW - 12));
        pop.style.left = left + 'px';
        pop.style.top  = (rect.bottom + 8) + 'px';

        pop.querySelector('.tip-popover-close').addEventListener('click', (e) => {
          e.stopPropagation();
          pop.remove();
        });

        const outsideClose = (e) => {
          if (!pop.contains(e.target)) { pop.remove(); document.removeEventListener('click', outsideClose); }
        };
        setTimeout(() => document.addEventListener('click', outsideClose), 10);
      });
    });

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

      // If already loaded, just open the pulse screen
      if (btn.dataset.loaded === 'true' && currentPulseData) {
        openPulseScreen(currentPulseData, currentDocumentText, limits, blockEl);
        return;
      }

      btn.textContent = 'Auditing…';
      btn.disabled = true;

      try {
        const allFlags  = await PhinityCore.runPulseReview(docText, currentSessionId);
        const cappedFlags = allFlags.slice(0, limits.pulseFlags);
        currentPulseData = cappedFlags;

        btn.innerHTML = 'Pulse Review ✓';
        btn.classList.add('active-check');
        btn.dataset.loaded = 'true';
        btn.disabled = false;

        if (cappedFlags.length > 0) {
          openPulseScreen(cappedFlags, docText, limits, blockEl);
        } else {
          appendPhinityMessage('Pulse Review found no significant judgment calls. The document reads cleanly.');
        }

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
      showFeatureHint('drift');
      showDriftPanel(driftResult, driftScore, limits, docText, blockEl);
    });
  };

  // ── Pulse Review Full Screen ───────────────────────
  const openPulseScreen = (flags, docText, limits, blockEl) => {
    // Use a fixed overlay panel — avoids messing with the screen stack
    let panel = document.getElementById('pulseFullPanel');
    if (!panel) {
      panel = document.createElement('div');
      panel.id = 'pulseFullPanel';
      panel.className = 'pulse-full-panel';
      document.body.appendChild(panel);
    }

    const totalFlags = flags.length;
    const integrityPct = Math.max(0, Math.round(100 - (totalFlags * (limits.pulseFlags === 1 ? 18 : 12))));
    const integrityLabel = integrityPct >= 85 ? 'Clean' : integrityPct >= 65 ? 'Needs attention' : 'Review carefully';
    const integrityColor = integrityPct >= 85 ? 'var(--drift-strong)' : integrityPct >= 65 ? 'var(--drift-moderate)' : 'var(--crimson)';

    panel.innerHTML = `
      <div class="pulse-screen-topbar">
        <button class="pulse-back-btn" id="pulseBackBtn">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/></svg>
          Back
        </button>
        <span class="pulse-screen-title">Pulse Review</span>
        <span></span>
      </div>

      <div class="pulse-integrity-bar-wrap">
        <div class="pulse-integrity-header">
          <span class="pulse-integrity-label">Voice Integrity</span>
          <span class="pulse-integrity-score" style="color:${integrityColor}">${integrityPct}% — ${integrityLabel}</span>
        </div>
        <div class="pulse-integrity-track">
          <div class="pulse-integrity-fill" style="width:0%;background:${integrityColor}" data-target="${integrityPct}"></div>
        </div>
        <div class="pulse-integrity-sub">${totalFlags} flag${totalFlags !== 1 ? 's' : ''} found · Tap any highlight to review</div>
      </div>

      <div class="pulse-doc-view" id="pulseDocView"></div>

      <div class="pulse-flag-drawer" id="pulseFlagDrawer">
        <div class="pulse-drawer-handle"></div>
        <div class="pulse-drawer-inner" id="pulseDrawerInner"></div>
      </div>
      <div class="pulse-drawer-overlay" id="pulseDrawerOverlay"></div>
    `;

    // Build highlighted doc
    const docView = panel.querySelector('#pulseDocView');
    let html = escapeHtml(docText);

    flags.forEach((flag, idx) => {
      if (!flag.excerpt) return;
      const escaped = escapeHtml(flag.excerpt);
      const typeClass = (flag.type || '').toLowerCase().replace(/\s+/g, '-');
      html = html.replace(
        escaped,
        `<mark class="pulse-highlight pulse-highlight-${typeClass}" data-flag="${idx}">${escaped}</mark>`
      );
    });

    const paragraphs = html.split(/\n\n+/).filter(p => p.trim());
    docView.innerHTML = paragraphs.map(p => `<p class="pulse-doc-para">${p}</p>`).join('');

    docView.querySelectorAll('.pulse-highlight').forEach(mark => {
      mark.addEventListener('click', () => {
        const idx = parseInt(mark.dataset.flag);
        openFlagDrawer(flags[idx], idx, flags.length, mark, limits, docText, blockEl, panel);
      });
    });

    // Animate integrity bar after paint
    requestAnimationFrame(() => {
      const fill = panel.querySelector('.pulse-integrity-fill');
      if (fill) {
        setTimeout(() => { fill.style.width = fill.dataset.target + '%'; }, 80);
      }
    });

    // Back button — just hide the panel, no screen stack change
    panel.querySelector('#pulseBackBtn').addEventListener('click', () => {
      panel.classList.remove('pulse-panel-visible');
    });

    panel.querySelector('#pulseDrawerOverlay').addEventListener('click', () => closeFlagDrawer(panel));

    // Show panel
    requestAnimationFrame(() => panel.classList.add('pulse-panel-visible'));
  };

  const openFlagDrawer = (flag, idx, total, markEl, limits, docText, blockEl, screen) => {
    const drawer = screen.querySelector('#pulseFlagDrawer');
    const overlay = screen.querySelector('#pulseDrawerOverlay');
    const inner = screen.querySelector('#pulseDrawerInner');

    const typeLabel = flag.type || 'Judgment call';
    const canAct = limits.pulseFlags > 1; // Core/Pro can act

    inner.innerHTML = `
      <div class="drawer-flag-meta">
        <span class="drawer-flag-type">${escapeHtml(typeLabel)}</span>
        <span class="drawer-flag-count">${idx + 1} of ${total}</span>
      </div>
      <div class="drawer-flag-excerpt">"${escapeHtml(flag.excerpt || '')}"</div>
      <div class="drawer-flag-explain">${escapeHtml(flag.explanation || '')}</div>
      <div class="drawer-flag-actions" id="drawerActions">
        <button class="pulse-btn keep" data-action="keep">Keep as is</button>
        ${canAct ? `
          <button class="pulse-btn adjust" data-action="adjust">Adjust tone</button>
          <button class="pulse-btn rephrase" data-action="rephrase">Rephrase</button>
        ` : `
          <div class="drawer-upgrade-note">Adjust & Rephrase available on Core &amp; Pro plans.</div>
        `}
      </div>
    `;

    inner.querySelector('[data-action="keep"]')?.addEventListener('click', () => {
      markEl.classList.add('pulse-resolved');
      closeFlagDrawer(screen);
    });

    if (canAct) {
      inner.querySelectorAll('[data-action="adjust"],[data-action="rephrase"]').forEach(btn => {
        btn.addEventListener('click', async () => {
          const action = btn.dataset.action;
          inner.querySelectorAll('.pulse-btn').forEach(b => b.disabled = true);
          btn.textContent = action === 'adjust' ? 'Adjusting…' : 'Rephrasing…';

          try {
            const newText = await PhinityCore.regenerateSection(
              flag.excerpt, flag.explanation, currentDocumentText, action
            );
            currentDocumentText = currentDocumentText.replace(flag.excerpt, newText);
            // Update doc block on the home screen too
            const docContent = document.getElementById('docContent');
            if (docContent) docContent.innerHTML = formatDocText(currentDocumentText);
            flag.excerpt = newText;
            markEl.classList.add('pulse-resolved');
            markEl.textContent = newText;
            closeFlagDrawer(screen);
          } catch (e) {
            inner.querySelectorAll('.pulse-btn').forEach(b => b.disabled = false);
            btn.textContent = action;
          }
        });
      });
    }

    drawer.style.display = 'block';
    overlay.style.display = 'block';
    requestAnimationFrame(() => {
      drawer.classList.add('drawer-open');
      overlay.classList.add('drawer-overlay-visible');
    });
  };

  const closeFlagDrawer = (screen) => {
    const drawer = screen.querySelector('#pulseFlagDrawer');
    const overlay = screen.querySelector('#pulseDrawerOverlay');
    drawer.classList.remove('drawer-open');
    overlay.classList.remove('drawer-overlay-visible');
    setTimeout(() => {
      drawer.style.display = 'none';
      overlay.style.display = 'none';
    }, 350);
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
    const files = Array.from(e.target.files).slice(0, 5 - pendingImageFiles.length);
    closeAttachSheet();
    e.target.value = '';

    files.forEach(f => {
      pendingImageFiles.push(f);
      // Read as base64 immediately so it's ready when generation fires
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = reader.result.split(',')[1];
        pendingAttachments.push({
          name: f.name,
          type: 'image',
          content: null,
          file: f,
          base64,
          mediaType: f.type || 'image/jpeg',
        });
        renderAttachmentPills();
      };
      reader.readAsDataURL(f);
    });
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

    // Show Evolution Log entry only for Pro
    const evoSection = document.getElementById('evolutionLogSection');
    if (evoSection) {
      evoSection.style.display = PhinityCore.TIER_LIMITS[profile.tier || 'free'].evolutionLog ? 'block' : 'none';
    }
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

    document.getElementById('openEvolutionLog')?.addEventListener('click', () => {
      openEvolutionLog();
    });
  };

  // ── Evolution Log ─────────────────────────────────
  const openEvolutionLog = async () => {
    const panel = document.getElementById('evolutionLogPanel');
    if (!panel) return;

    // Reset to loading state
    document.getElementById('evoList').innerHTML = '<div class="evo-loading">Loading…</div>';
    document.getElementById('evoTotalSessions').textContent = '—';
    document.getElementById('evoStrongCount').textContent   = '—';
    document.getElementById('evoModerateCount').textContent = '—';
    document.getElementById('evoDriftingCount').textContent = '—';

    panel.classList.add('evo-panel-visible');

    document.getElementById('evoBackBtn').onclick = () => {
      panel.classList.remove('evo-panel-visible');
    };

    try {
      const entries = await PhinityCore.getDriftLog(100);
      renderEvolutionLog(entries);
    } catch (e) {
      document.getElementById('evoList').innerHTML =
        '<div class="evo-loading">Could not load Evolution Log. Please try again.</div>';
    }
  };

  const renderEvolutionLog = (entries) => {
    const total    = entries.length;
    const strong   = entries.filter(e => e.score === 'Strong').length;
    const moderate = entries.filter(e => e.score === 'Moderate').length;
    const drifting = entries.filter(e => e.score === 'Drifting').length;

    document.getElementById('evoTotalSessions').textContent = total;
    document.getElementById('evoStrongCount').textContent   = strong;
    document.getElementById('evoModerateCount').textContent = moderate;
    document.getElementById('evoDriftingCount').textContent = drifting;

    // Trend chart — canvas sparkline, most recent 20 entries, oldest left
    const chartEntries = [...entries].reverse().slice(-20);
    drawEvoTrendChart(chartEntries);

    // Session list
    const list = document.getElementById('evoList');
    if (total === 0) {
      list.innerHTML = '<div class="evo-empty">No sessions recorded yet. Generate your first document to start tracking your voice.</div>';
      return;
    }

    list.innerHTML = entries.map(e => {
      const d = new Date(e.logged_at || e.created_at);
      const dateStr = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
      const scoreClass = e.score === 'Strong' ? 'evo-strong' : e.score === 'Drifting' ? 'evo-drifting' : 'evo-moderate';
      const dot = e.score === 'Strong' ? '●' : e.score === 'Drifting' ? '●' : '●';
      return `
        <div class="evo-entry">
          <div class="evo-entry-top">
            <span class="evo-entry-date">${dateStr}</span>
            <span class="evo-entry-score ${scoreClass}">${dot} ${e.score || 'Moderate'}</span>
          </div>
          ${e.reason ? `<div class="evo-entry-reason">${escapeHtml(e.reason)}</div>` : ''}
        </div>
      `;
    }).join('');
  };

  const drawEvoTrendChart = (entries) => {
    const canvas = document.getElementById('evoTrendChart');
    if (!canvas || !canvas.getContext) return;

    const dpr = window.devicePixelRatio || 1;
    const W   = canvas.offsetWidth  || canvas.parentElement.offsetWidth || 300;
    const H   = 90;
    canvas.width  = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width  = W + 'px';
    canvas.style.height = H + 'px';

    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, W, H);

    if (entries.length < 2) return;

    // Score → numeric: Strong=1, Moderate=0.5, Drifting=0
    const scoreVal = (s) => s === 'Strong' ? 1 : s === 'Drifting' ? 0 : 0.5;
    const vals = entries.map(e => scoreVal(e.score));

    const pad   = { l: 8, r: 8, t: 12, b: 8 };
    const chartW = W - pad.l - pad.r;
    const chartH = H - pad.t - pad.b;
    const step   = chartW / (vals.length - 1);

    // Subtle grid lines at Strong / Moderate / Drifting
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth   = 1;
    [0, 0.5, 1].forEach(v => {
      const y = pad.t + chartH * (1 - v);
      ctx.beginPath();
      ctx.moveTo(pad.l, y);
      ctx.lineTo(pad.l + chartW, y);
      ctx.stroke();
    });

    // Area fill
    const grad = ctx.createLinearGradient(0, pad.t, 0, pad.t + chartH);
    grad.addColorStop(0,   'rgba(52,211,153,0.25)');
    grad.addColorStop(1,   'rgba(52,211,153,0)');
    ctx.beginPath();
    vals.forEach((v, i) => {
      const x = pad.l + i * step;
      const y = pad.t + chartH * (1 - v);
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.lineTo(pad.l + (vals.length - 1) * step, pad.t + chartH);
    ctx.lineTo(pad.l, pad.t + chartH);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    // Line
    ctx.beginPath();
    ctx.strokeStyle = '#34d399';
    ctx.lineWidth   = 1.5;
    ctx.lineJoin    = 'round';
    ctx.lineCap     = 'round';
    vals.forEach((v, i) => {
      const x = pad.l + i * step;
      const y = pad.t + chartH * (1 - v);
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.stroke();

    // Dots for Drifting entries — highlight them in red
    vals.forEach((v, i) => {
      if (entries[i].score === 'Drifting') {
        const x = pad.l + i * step;
        const y = pad.t + chartH * (1 - v);
        ctx.beginPath();
        ctx.arc(x, y, 3, 0, Math.PI * 2);
        ctx.fillStyle = '#ef4444';
        ctx.fill();
      }
    });

    // Axis labels: first and last date
    const axisEl = document.getElementById('evoTrendAxis');
    if (axisEl && entries.length >= 2) {
      const fmt = (e) => new Date(e.logged_at || e.created_at)
        .toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
      axisEl.innerHTML = `<span>${fmt(entries[0])}</span><span>${fmt(entries[entries.length - 1])}</span>`;
    }
  };

  const PAYSTACK_PUBLIC_KEY = 'pk_live_REPLACE_WITH_YOUR_LIVE_PUBLIC_KEY';
  // ↑ When Paystack approves your account, swap this for your live public key.
  // For testing now use: 'pk_test_4e9d480d329b618c4b81...' (your test key from dashboard)

  const TIER_PRICES = {
    core: { label: 'Core', amount: 1500000, naira: '₦15,000' },
    pro:  { label: 'Pro',  amount: 2500000, naira: '₦25,000' },
  };

  // Opens the Paystack subscription popup for a given tier.
  // On success, calls our verify-payment Edge Function to confirm + upgrade tier.
  const openPaystackForTier = async (tier) => {
    const price   = TIER_PRICES[tier];
    const session = await PhinityCore.getSession();
    if (!session) { alert('Please sign in again.'); return; }

    // Step 1 — Ask our Edge Function to initialise the Paystack transaction
    // This keeps the plan code server-side and returns an access_code + reference
    const initRes = await fetch(
      `${PhinityCore.supabaseUrl}/functions/v1/create-subscription`,
      {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${session.access_token}`,
          'apikey':         PhinityCore.supabaseKey,
        },
        body: JSON.stringify({ tier }),
      }
    );

    const initData = await initRes.json();
    if (!initRes.ok || !initData.access_code) {
      alert(`Could not start payment: ${initData.error || 'Unknown error'}`);
      return;
    }

    // Step 2 — Open Paystack popup with the access_code
    const handler = PaystackPop.setup({
      key:         PAYSTACK_PUBLIC_KEY,
      access_code: initData.access_code,
      ref:         initData.reference,
      email:       session.user.email,

      onSuccess: async (transaction) => {
        // Step 3 — Verify server-side and upgrade tier
        try {
          const verifyRes = await fetch(
            `${PhinityCore.supabaseUrl}/functions/v1/verify-payment`,
            {
              method:  'POST',
              headers: {
                'Content-Type':  'application/json',
                'Authorization': `Bearer ${session.access_token}`,
                'apikey':         PhinityCore.supabaseKey,
              },
              body: JSON.stringify({ reference: transaction.reference, tier }),
            }
          );

          const verifyData = await verifyRes.json();
          if (verifyData.success) {
            await PhinityCore.loadProfile();
            await populateProfileScreen();
            alert(`You're now on the ${price.label} plan. Welcome! 🎉`);
          } else {
            alert(`Payment received but verification failed: ${verifyData.error}. Contact support.`);
          }
        } catch (e) {
          alert('Verification error. Your payment may have gone through — contact support.');
          console.error('verify-payment error:', e);
        }
      },

      onCancel: () => {
        console.log('Paystack popup closed by user.');
      },
    });

    handler.openIframe();
  };

  const handleProfileEdit = async (section) => {
    if (section === 'tier') {
      const profile     = PhinityCore.loadProfileCached();
      const currentTier = profile?.tier || 'free';

      // Build upgrade modal showing Core and Pro options
      const overlay = document.createElement('div');
      overlay.id    = 'upgradeOverlay';
      overlay.style.cssText = `
        position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:9999;
        display:flex;align-items:center;justify-content:center;padding:1.5rem;
      `;

      const tiers = ['core', 'pro'].filter(t => t !== currentTier && (currentTier === 'free' || t === 'pro'));

      overlay.innerHTML = `
        <div style="background:var(--surface-2,#1a1a1a);border-radius:1rem;padding:2rem;max-width:340px;width:100%;color:var(--text-1,#fff);">
          <div style="font-size:1.1rem;font-weight:600;margin-bottom:0.25rem;">Upgrade PhinityX</div>
          <div style="font-size:0.8rem;color:var(--text-3,#888);margin-bottom:1.5rem;">Current plan: <strong>${currentTier}</strong></div>
          ${tiers.map(t => `
            <button data-tier="${t}" style="
              display:block;width:100%;text-align:left;background:var(--surface-3,#222);
              border:1px solid var(--border,#333);border-radius:0.75rem;padding:1rem;
              margin-bottom:0.75rem;cursor:pointer;color:inherit;
            ">
              <div style="font-weight:600;font-size:0.95rem;">${TIER_PRICES[t].label} — ${TIER_PRICES[t].naira}/mo</div>
              <div style="font-size:0.75rem;color:var(--text-3,#888);margin-top:0.25rem;">
                ${t === 'core' ? '20 docs/month · No watermark · Attachments · Voice drift' : 'Unlimited docs · All features · Priority generation · Docx export'}
              </div>
            </button>
          `).join('')}
          <button id="upgradeClose" style="
            width:100%;margin-top:0.25rem;padding:0.65rem;background:transparent;
            border:none;color:var(--text-3,#888);cursor:pointer;font-size:0.85rem;
          ">Cancel</button>
        </div>
      `;

      document.body.appendChild(overlay);

      overlay.querySelector('#upgradeClose').addEventListener('click', () => overlay.remove());
      overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

      overlay.querySelectorAll('[data-tier]').forEach(btn => {
        btn.addEventListener('click', async () => {
          overlay.remove();
          await openPaystackForTier(btn.dataset.tier);
        });
      });

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
    initAttachSheet();
    initProfileScreen();
    initReassessment();
    init();
  });

})();
