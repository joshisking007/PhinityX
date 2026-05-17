/* ═══════════════════════════════════════════════════════════
   PhinityX — core.js (Supabase Edition)
   All storage now goes through Supabase.
   All AI calls go through the Edge Function (API key stays server-side).
   localStorage is used only as a fast local cache, never as source of truth.
════════════════════════════════════════════════════════════ */

'use strict';

const PhinityCore = (() => {

  // ── Supabase client ────────────────────────────────────
  // Replace these two values with your actual project credentials.
  // These are the PUBLIC anon key and project URL — safe to expose in frontend.
  const SUPABASE_URL     = 'https://efwybidnclwkfznlrrlc.supabase.co';
  const SUPABASE_ANON_KEY = 'YOUR_ANON_KEY';

  // Supabase JS v2 loaded via CDN in index.html:
  // <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js"></script>
  const { createClient } = window.supabase;
  const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  // Edge function base URL
  const EDGE_BASE = `${SUPABASE_URL}/functions/v1/generate`;

  // ── Local cache keys (speed only, not source of truth) ─
  const CACHE = {
    PROFILE:     'phx_profile_cache',
    FINGERPRINT: 'phx_fingerprint_cache',
    SESSIONS:    'phx_sessions_cache',
  };

  // ── Tier Limits (mirrored from edge function) ──────────
  const TIER_LIMITS = {
    free: {
      docsPerMonth: 3, sessionHistory: 0, pulseFlags: 1,
      attachments: false, watermark: true, characterMapping: false,
      voiceDriftRecal: false, submissionMode: false,
      referenceInjection: false, fingerprintVault: 0,
      toneLock: false, docxExport: false, evolutionLog: false,
      collaboratorMode: false, priorityGen: false, reassessment: false,
    },
    core: {
      docsPerMonth: 20, sessionHistory: 30, pulseFlags: 3,
      attachments: true, watermark: false, characterMapping: true,
      voiceDriftRecal: true, submissionMode: true,
      referenceInjection: true, fingerprintVault: 2,
      toneLock: false, docxExport: false, evolutionLog: false,
      collaboratorMode: false, priorityGen: false, reassessment: true,
    },
    pro: {
      docsPerMonth: Infinity, sessionHistory: Infinity, pulseFlags: 3,
      attachments: true, watermark: false, characterMapping: true,
      voiceDriftRecal: true, submissionMode: true,
      referenceInjection: true, fingerprintVault: Infinity,
      toneLock: true, docxExport: true, evolutionLog: true,
      collaboratorMode: true, priorityGen: true, reassessment: true,
    },
  };

  // ── Academic Standing ──────────────────────────────────
  const getStanding = (cgpa, scale) => {
    const pct = parseFloat(cgpa) / parseFloat(scale);
    if (pct >= 0.9)  return 'Distinguished';
    if (pct >= 0.78) return 'Advanced';
    if (pct >= 0.65) return 'Intermediate';
    if (pct >= 0.5)  return 'Developing';
    return 'Freshman';
  };

  // ── Auth helpers ───────────────────────────────────────
  const getSession = async () => {
    const { data: { session } } = await db.auth.getSession();
    return session;
  };

  const getUser = async () => {
    const { data: { user } } = await db.auth.getUser();
    return user;
  };

  const signUp = async (email, password) => {
    const { data, error } = await db.auth.signUp({ email, password });
    if (error) throw error;
    return data;
  };

  const signIn = async (email, password) => {
    const { data, error } = await db.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  };

  const signOut = async () => {
    localStorage.removeItem(CACHE.PROFILE);
    localStorage.removeItem(CACHE.FINGERPRINT);
    localStorage.removeItem(CACHE.SESSIONS);
    const { error } = await db.auth.signOut();
    if (error) throw error;
  };

  const onAuthStateChange = (callback) => {
    return db.auth.onAuthStateChange(callback);
  };

  // ── Profile — load from Supabase, cache locally ────────
  const loadProfile = async () => {
    try {
      const user = await getUser();
      if (!user) return null;

      const { data, error } = await db
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      if (error) throw error;

      // Map snake_case DB columns to camelCase for app compatibility
      const profile = mapProfileFromDB(data);
      localStorage.setItem(CACHE.PROFILE, JSON.stringify(profile));
      return profile;
    } catch (e) {
      // Fall back to cache if offline
      const cached = localStorage.getItem(CACHE.PROFILE);
      return cached ? JSON.parse(cached) : null;
    }
  };

  // Load from cache immediately (for fast UI paint), then reconcile
  const loadProfileCached = () => {
    const cached = localStorage.getItem(CACHE.PROFILE);
    return cached ? JSON.parse(cached) : null;
  };

  // ── Profile — save to Supabase ─────────────────────────
  const saveProfile = async (profileData) => {
    try {
      const user = await getUser();
      if (!user) throw new Error('Not authenticated');

      const dbRow = mapProfileToDB(profileData);
      const { error } = await db
        .from('profiles')
        .update(dbRow)
        .eq('id', user.id);

      if (error) throw error;

      // Update local cache
      localStorage.setItem(CACHE.PROFILE, JSON.stringify(profileData));
      // Rebuild fingerprint cache
      const fp = buildFingerprint(profileData);
      localStorage.setItem(CACHE.FINGERPRINT, JSON.stringify(fp));
      return true;
    } catch (e) {
      console.error('saveProfile error:', e);
      throw e;
    }
  };

  // Update a single profile field
  const updateProfileField = async (key, value) => {
    try {
      const user = await getUser();
      if (!user) throw new Error('Not authenticated');

      // Map camelCase key to snake_case DB column
      const dbKey = camelToSnake(key);
      const { error } = await db
        .from('profiles')
        .update({ [dbKey]: value })
        .eq('id', user.id);

      if (error) throw error;

      // Update local cache
      const cached = loadProfileCached();
      if (cached) {
        cached[key] = value;
        localStorage.setItem(CACHE.PROFILE, JSON.stringify(cached));
        const fp = buildFingerprint(cached);
        localStorage.setItem(CACHE.FINGERPRINT, JSON.stringify(fp));
      }
    } catch (e) {
      console.error('updateProfileField error:', e);
      throw e;
    }
  };

  // ── Column mapping helpers ─────────────────────────────
  const camelToSnake = (str) =>
    str.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);

  const mapProfileFromDB = (row) => ({
    id:                row.id,
    name:              row.name,
    dob:               row.dob,
    gender:            row.gender,
    fieldStudy:        row.field_study,
    institution:       row.institution,
    occupation:        row.occupation,
    cgpa:              row.cgpa,
    targetCgpa:        row.target_cgpa,
    cgpaScale:         row.cgpa_scale,
    writingSample:     row.writing_sample,
    prevSubmission:    row.prev_submission,
    characters:        row.characters || [],
    styleRhythm:       row.style_rhythm,
    styleVocab:        row.style_vocab,
    styleTone:         row.style_tone,
    weakness:          row.weakness,
    submissionContext: row.submission_context,
    tier:              row.tier,
    onboardingComplete: row.onboarding_complete,
    onboardingStep:    row.onboarding_step,
    docsUsedCount:     row.docs_used_count,
    docsUsedMonth:     row.docs_used_month,
    sessionCount:      row.session_count,
    createdAt:         row.created_at,
    updatedAt:         row.updated_at,
  });

  const mapProfileToDB = (p) => ({
    name:              p.name,
    dob:               p.dob,
    gender:            p.gender,
    field_study:       p.fieldStudy,
    institution:       p.institution,
    occupation:        p.occupation,
    cgpa:              p.cgpa,
    target_cgpa:       p.targetCgpa,
    cgpa_scale:        p.cgpaScale,
    writing_sample:    p.writingSample,
    prev_submission:   p.prevSubmission,
    characters:        p.characters || [],
    style_rhythm:      p.styleRhythm,
    style_vocab:       p.styleVocab,
    style_tone:        p.styleTone,
    weakness:          p.weakness,
    submission_context: p.submissionContext,
    tier:              p.tier,
    onboarding_complete: p.onboardingComplete,
    onboarding_step:   p.onboardingStep,
  });

  // ── Fingerprint ────────────────────────────────────────
  const rhythmDesc = (val) => {
    if (val <= 25) return 'short, direct, punchy sentences';
    if (val <= 50) return 'a balanced mix of short and medium sentences';
    if (val <= 75) return 'longer, developed sentences with structured flow';
    return 'expansive, flowing prose with extended sentence architecture';
  };
  const vocabDesc = (val) => {
    if (val <= 25) return 'plain, accessible language';
    if (val <= 50) return 'moderately technical vocabulary suitable for an educated general audience';
    if (val <= 75) return 'field-specific terminology used with confidence';
    return 'advanced technical and domain-specific vocabulary throughout';
  };
  const toneDesc = (val) => {
    if (val <= 25) return 'conversational yet professional';
    if (val <= 50) return 'measured and clear, leaning academic without losing personality';
    if (val <= 75) return 'formal academic with a composed personal voice';
    return 'strictly formal-academic, precise, and impersonal';
  };

  const buildFingerprint = (profile) => {
    const tier    = profile.tier || 'free';
    const limits  = TIER_LIMITS[tier];
    const cgpa    = parseFloat(profile.cgpa) || 2.0;
    const target  = parseFloat(profile.targetCgpa) || cgpa + 0.5;
    const scale   = parseFloat(profile.cgpaScale) || 4.0;
    return {
      tier,
      name:              profile.name || 'Student',
      field:             profile.fieldStudy || 'General Studies',
      institution:       profile.institution || '',
      cgpa, targetCgpa: target, scale,
      standing:          getStanding(cgpa, scale),
      cgpaRatio:         cgpa / scale,
      targetRatio:       target / scale,
      rhythm:            profile.styleRhythm != null ? parseInt(profile.styleRhythm) : 50,
      vocab:             profile.styleVocab  != null ? parseInt(profile.styleVocab)  : 50,
      tone:              profile.styleTone   != null ? parseInt(profile.styleTone)   : 50,
      weakness:          profile.weakness || null,
      characters:        limits.characterMapping ? (profile.characters || []).filter(Boolean) : [],
      writingSample:     profile.writingSample || null,
      prevSubmission:    profile.prevSubmission || null,
      context:           profile.submissionContext || 'university',
      rhythmDesc:        rhythmDesc(profile.styleRhythm || 50),
      vocabDesc:         vocabDesc(profile.styleVocab || 50),
      toneDesc:          toneDesc(profile.styleTone || 50),
      onboardingComplete: profile.onboardingComplete || false,
    };
  };

  const loadFingerprint = () => {
    const cached = localStorage.getItem(CACHE.FINGERPRINT);
    if (cached) return JSON.parse(cached);
    const profile = loadProfileCached();
    if (!profile) return null;
    const fp = buildFingerprint(profile);
    localStorage.setItem(CACHE.FINGERPRINT, JSON.stringify(fp));
    return fp;
  };

  // ── Sessions ───────────────────────────────────────────
  const loadSessions = async (limit = 30) => {
    try {
      const user = await getUser();
      if (!user) return [];

      const { data, error } = await db
        .from('session_list') // uses the view — no full document text
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) throw error;

      localStorage.setItem(CACHE.SESSIONS, JSON.stringify(data || []));
      return data || [];
    } catch (e) {
      const cached = localStorage.getItem(CACHE.SESSIONS);
      return cached ? JSON.parse(cached) : [];
    }
  };

  const getSessionById = async (sessionId) => {
    const user = await getUser();
    if (!user) return null;
    const { data, error } = await db
      .from('sessions')
      .select('*')
      .eq('id', sessionId)
      .eq('user_id', user.id)
      .single();
    if (error) return null;
    return data;
  };

  const deleteSession = async (sessionId) => {
    const user = await getUser();
    if (!user) return;
    await db.from('sessions').delete().eq('id', sessionId).eq('user_id', user.id);
  };

  // ── Usage / doc limits ─────────────────────────────────
  const canGenerateDoc = async () => {
    const profile = await loadProfile();
    if (!profile) return false;
    const tier  = profile.tier || 'free';
    const limit = TIER_LIMITS[tier].docsPerMonth;
    if (limit === Infinity) return true;
    const thisMonth = getCurrentMonth();
    const count = profile.docsUsedMonth === thisMonth ? profile.docsUsedCount : 0;
    return count < limit;
  };

  const getCurrentMonth = () => {
    const d = new Date();
    return `${d.getFullYear()}-${d.getMonth()}`;
  };

  // ── Re-assessment ──────────────────────────────────────
  const shouldShowReassessment = async () => {
    const profile = await loadProfile();
    if (!profile) return false;
    const tier = profile.tier || 'free';
    if (!TIER_LIMITS[tier].reassessment) return false;
    const count = profile.sessionCount || 0;
    return count > 0 && count % 5 === 0;
  };

  // ── Drift log ──────────────────────────────────────────
  const getDriftLog = async (limit = 50) => {
    const user = await getUser();
    if (!user) return [];
    const { data } = await db
      .from('drift_log')
      .select('*')
      .eq('user_id', user.id)
      .order('logged_at', { ascending: false })
      .limit(limit);
    return data || [];
  };

  // ── Edge function caller ───────────────────────────────
  const callEdge = async (payload) => {
    const session = await getSession();
    if (!session) throw new Error('Not authenticated');

    const res = await fetch(EDGE_BASE, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${session.access_token}`,
        'apikey':         SUPABASE_ANON_KEY,
      },
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    if (!res.ok) {
      const err = new Error(data.error || data.message || `Edge error ${res.status}`);
      err.code = data.error;
      throw err;
    }
    return data;
  };

  // ── Generate document ──────────────────────────────────
  const generateDocument = async (userPrompt, attachmentContext, attachments) => {
    const ok = await canGenerateDoc();
    if (!ok) throw Object.assign(new Error('Monthly document limit reached for your plan.'), { code: 'limit_reached' });

    const result = await callEdge({
      action: 'generate',
      prompt: userPrompt,
      attachmentContext: attachmentContext || null,
      attachments: attachments || [],
    });

    // Refresh profile cache (updated counters)
    await loadProfile();

    return { document: result.document, sessionId: result.session_id };
  };

  // ── Pulse Review ───────────────────────────────────────
  const runPulseReview = async (documentText, sessionId) => {
    const result = await callEdge({ action: 'pulse_review', documentText, sessionId });
    return result.flags || [];
  };

  // ── Voice Drift ────────────────────────────────────────
  const runVoiceDrift = async (documentText, sessionId) => {
    const result = await callEdge({ action: 'voice_drift', documentText, sessionId });
    return result;
  };

  // ── Regenerate section ─────────────────────────────────
  const regenerateSection = async (excerpt, instruction, documentText, mode) => {
    const result = await callEdge({ action: 'regenerate_section', excerpt, instruction, documentText, mode });
    return result.result || '';
  };

  // ── Submission mode ────────────────────────────────────
  const runSubmissionMode = async (documentText) => {
    const result = await callEdge({ action: 'submission_mode', documentText });
    return result.result || documentText;
  };

  // ── Profile summary for Profile Complete screen ────────
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

  // ── Public API ─────────────────────────────────────────
  return {
    db,
    TIER_LIMITS,
    getStanding,

    // Auth
    signUp,
    signIn,
    signOut,
    getUser,
    getSession,
    onAuthStateChange,

    // Profile
    loadProfile,
    loadProfileCached,
    saveProfile,
    updateProfileField,
    buildFingerprint,
    loadFingerprint,
    buildProfileSummary,

    // Sessions
    loadSessions,
    getSessionById,
    deleteSession,

    // Usage
    canGenerateDoc,
    shouldShowReassessment,

    // Drift
    getDriftLog,

    // AI (all routed through edge function)
    generateDocument,
    runPulseReview,
    runVoiceDrift,
    runSubmissionMode,
    regenerateSection,
  };

})();
