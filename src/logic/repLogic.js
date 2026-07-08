import { EXERCISES, SMOOTHING } from '../config/exercises.js';

// ── SMOOTHING ──────────────────────────────────────────────────────────────────
export function smoothAngle(prev, current) {
  if (prev === null) return current;
  return (current * SMOOTHING.alpha) + (prev * SMOOTHING.beta);
}

// ── CALCOLO ANGOLO 3D ──────────────────────────────────────────────────────────
export function calculateAngle(a, b, c) {
  const ba = { x: a.x - b.x, y: a.y - b.y, z: (a.z || 0) - (b.z || 0) };
  const bc = { x: c.x - b.x, y: c.y - b.y, z: (c.z || 0) - (b.z || 0) };
  const dotProduct = (ba.x * bc.x) + (ba.y * bc.y) + (ba.z * bc.z);
  const magBA = Math.sqrt(ba.x * ba.x + ba.y * ba.y + ba.z * ba.z);
  const magBC = Math.sqrt(bc.x * bc.x + bc.y * bc.y + bc.z * bc.z);
  if (magBA === 0 || magBC === 0) return 0;
  let cosAngle = dotProduct / (magBA * magBC);
  cosAngle = Math.max(-1.0, Math.min(1.0, cosAngle));
  return (Math.acos(cosAngle) * 180.0) / Math.PI;
}

// ── STATO INIZIALE ─────────────────────────────────────────────────────────────
export function createInitialState() {
  return {
    movementState: 'STANDING',
    smoothedPrimary: null,
    smoothedSecondary: null,
    lastAngle: 180,
    lastAngleHistory: [],
    lastActiveTime: Date.now(),
    occludedSince: null, // Tracciamento occlusione visiva
    metrics: {
      faults: new Set(),
      startX: null,
      maxAscentAngle: 0,
      lockedAtStart: false,
      deepEnough: false,
      minWristY: 1.0,
      maxWristYDuringLift: null,
      startKneeAngle: null,
    },
  };
}

// ── TIMEOUT HELPER ─────────────────────────────────────────────────────────────
function checkTimeout(state) {
  const now = Date.now();
  if (state.movementState === 'STANDING') {
    state.lastActiveTime = now;
    return;
  }
  if (now - state.lastActiveTime > 5000) {
    state.movementState = 'STANDING';
    state.metrics.deepEnough = false;
    state.metrics.faults = new Set();
    state.lastAngleHistory = [];
    state.lastActiveTime = now;
  }
}

// ── TRANSIZIONE DISCESA → RISALITA (5 frame) ──────────────────────────────────
function checkAscent(state, currentAngle) {
  state.lastAngleHistory.push(currentAngle);
  if (state.lastAngleHistory.length > 5) state.lastAngleHistory.shift();
  const oldestAngle = state.lastAngleHistory[0];
  return currentAngle > oldestAngle + 2;
}

// ── LOGICA SQUAT ───────────────────────────────────────────────────────────────
export function processSquat(state, landmarks, side) {
  const cfg = EXERCISES.SQUAT.thresholds;
  const { hip, knee, ankle } = EXERCISES.SQUAT.landmarks[side];
  const lm = landmarks;

  // GESTIONE OCCLUSIONE VISIVA
  const isVisible = lm[hip] && lm[knee] && lm[ankle] && lm[hip].visibility > 0.4 && lm[knee].visibility > 0.4 && lm[ankle].visibility > 0.4;
  if (!isVisible) {
    if (!state.occludedSince) {
      state.occludedSince = Date.now();
    } else if (Date.now() - state.occludedSince > 1000 && state.movementState !== 'STANDING') {
      const event = { type: 'NO_REP', faults: ['Tracking perso (Occlusione)'] };
      const newState = createInitialState();
      newState.lastActiveTime = Date.now();
      return { state: newState, event, primaryAngle: null, secondaryAngle: null, isTarget: false };
    }
    return { state, event: null };
  }
  state.occludedSince = null;
  checkTimeout(state);

  const rawKnee = calculateAngle(lm[hip], lm[knee], lm[ankle]);
  state.smoothedPrimary = smoothAngle(state.smoothedPrimary, rawKnee);
  const kneeAngle = state.smoothedPrimary;
  const m = state.metrics;
  let event = null;

  if (state.movementState === 'STANDING') {
    if (kneeAngle < cfg.topKnee - 25) {
      state.movementState = 'DESCENDING';
      m.deepEnough = false;
      state.lastAngleHistory = [];
    }
  } else if (state.movementState === 'DESCENDING') {
    if (lm[hip].y > lm[knee].y && kneeAngle < cfg.bottomKnee) m.deepEnough = true;
    if (checkAscent(state, kneeAngle)) state.movementState = 'ASCENDING';
  } else if (state.movementState === 'ASCENDING') {
    if (kneeAngle > cfg.topKnee) {
      event = m.deepEnough ? { type: 'VALID_REP', faults: [] } : { type: 'NO_REP', faults: ['Mancato superamento del parallelo'] };
      state.movementState = 'STANDING';
      m.deepEnough = false;
      state.lastAngleHistory = [];
    }
  }

  state.lastAngle = kneeAngle;
  return { state, event, primaryAngle: kneeAngle, secondaryAngle: state.smoothedSecondary, isTarget: m.deepEnough };
}

// ── LOGICA DEADLIFT ────────────────────────────────────────────────────────────
export function processDeadlift(state, landmarks, side) {
  const cfg = EXERCISES.DEADLIFT.thresholds;
  const { shoulder, hip, knee, ankle, wrist } = EXERCISES.DEADLIFT.landmarks[side];
  const lm = landmarks;

  // GESTIONE OCCLUSIONE VISIVA
  const isVisible = lm[hip] && lm[knee] && lm[shoulder] && lm[hip].visibility > 0.4 && lm[knee].visibility > 0.4 && lm[shoulder].visibility > 0.4;
  if (!isVisible) {
    if (!state.occludedSince) {
      state.occludedSince = Date.now();
    } else if (Date.now() - state.occludedSince > 1000 && state.movementState !== 'STANDING') {
      const event = { type: 'NO_REP', faults: ['Tracking perso (Occlusione)'] };
      const newState = createInitialState();
      newState.lastActiveTime = Date.now();
      return { state: newState, event, primaryAngle: null, secondaryAngle: null, isTarget: false };
    }
    return { state, event: null };
  }
  state.occludedSince = null;
  checkTimeout(state);

  const rawKnee = calculateAngle(lm[hip], lm[knee], lm[ankle]);
  const rawHip = calculateAngle(lm[shoulder], lm[hip], lm[knee]);
  state.smoothedPrimary = smoothAngle(state.smoothedPrimary, rawHip);
  state.smoothedSecondary = smoothAngle(state.smoothedSecondary, rawKnee);
  const hipAngle = state.smoothedPrimary;
  const kneeAngle = state.smoothedSecondary;
  const m = state.metrics;
  const isErect = kneeAngle > cfg.erectKnee && hipAngle > cfg.erectHip;
  const wristVisible = lm[wrist] && lm[wrist].visibility > 0.4;
  const wristY = wristVisible ? lm[wrist].y : lm[hip].y + 0.3;
  let event = null;

  if (state.movementState === 'STANDING' || state.movementState === 'DROPPING') {
    if (!isErect && wristY > cfg.setupWristY) { state.movementState = 'SETUP'; m.minWristY = wristY; }
  } else if (state.movementState === 'SETUP') {
    m.minWristY = Math.max(m.minWristY, wristY);
    if (wristY < m.minWristY - cfg.liftThreshold) {
      state.movementState = 'LIFTING';
      m.maxWristYDuringLift = wristY;
      state.lastAngleHistory = [];
    }
  } else if (state.movementState === 'LIFTING') {
    if (m.maxWristYDuringLift !== null && wristY > m.maxWristYDuringLift + cfg.maxWristDropDuringLift) {
      event = { type: 'NO_REP', faults: ['Discesa del bilanciere durante la tirata'] };
      const newState = createInitialState();
      newState.lastActiveTime = Date.now();
      return { state: newState, event, primaryAngle: hipAngle, secondaryAngle: kneeAngle, isTarget: false };
    }
    m.maxWristYDuringLift = Math.min(m.maxWristYDuringLift ?? wristY, wristY);
    if (isErect) {
      event = { type: 'VALID_REP', faults: [] };
      state.movementState = 'LOCKED';
      m.maxWristYDuringLift = null;
    }
  } else if (state.movementState === 'LOCKED') {
    if (!isErect && wristY > m.minWristY + cfg.dropThreshold) state.movementState = 'DROPPING';
  }

  state.lastAngle = hipAngle;
  return { state, event, primaryAngle: hipAngle, secondaryAngle: kneeAngle, isTarget: isErect };
}

// ── LOGICA OVERHEAD PRESS ──────────────────────────────────────────────────────
export function processOverheadPress(state, landmarks, side) {
  const cfg = EXERCISES.OVERHEAD_PRESS.thresholds;
  const { shoulder, elbow, wrist, hip, knee, ankle } = EXERCISES.OVERHEAD_PRESS.landmarks[side];
  const lm = landmarks;

  // GESTIONE OCCLUSIONE VISIVA
  const isVisible = lm[shoulder] && lm[elbow] && lm[wrist] && lm[hip] && lm[knee] && lm[ankle]
    && lm[shoulder].visibility > 0.4 && lm[elbow].visibility > 0.4 && lm[wrist].visibility > 0.4
    && lm[hip].visibility > 0.4 && lm[knee].visibility > 0.4 && lm[ankle].visibility > 0.4;
  if (!isVisible) {
    if (!state.occludedSince) {
      state.occludedSince = Date.now();
    } else if (Date.now() - state.occludedSince > 1000 && state.movementState !== 'STANDING') {
      const event = { type: 'NO_REP', faults: ['Tracking perso (Occlusione)'] };
      const newState = createInitialState();
      newState.lastActiveTime = Date.now();
      return { state: newState, event, primaryAngle: null, secondaryAngle: null, isTarget: false };
    }
    return { state, event: null };
  }
  state.occludedSince = null;
  checkTimeout(state);

  const rawElbow = calculateAngle(lm[shoulder], lm[elbow], lm[wrist]);
  const rawKnee = calculateAngle(lm[hip], lm[knee], lm[ankle]);
  state.smoothedPrimary = smoothAngle(state.smoothedPrimary, rawElbow);
  const elbowAngle = state.smoothedPrimary;
  const vertical = { x: lm[shoulder].x, y: lm[shoulder].y - 0.1, z: lm[shoulder].z || 0 };
  const rawTrunk = calculateAngle(vertical, lm[shoulder], lm[hip]);
  state.smoothedSecondary = smoothAngle(state.smoothedSecondary, rawTrunk);
  const trunkAngle = state.smoothedSecondary;
  const m = state.metrics;
  const kneeBend = m.startKneeAngle === null ? 0 : m.startKneeAngle - rawKnee;
  let event = null;

  if (state.movementState === 'STANDING') {
    if (elbowAngle > cfg.topElbow) m.lockedAtStart = true;
    if (m.startKneeAngle === null || elbowAngle > cfg.topElbow) m.startKneeAngle = rawKnee;
    if (elbowAngle < 140) {
      state.movementState = 'DESCENDING';
      m.deepEnough = false;
      m.faults = new Set();
      state.lastAngleHistory = [];
    }
  } else if (state.movementState === 'DESCENDING') {
    if (elbowAngle < cfg.bottomElbow) m.deepEnough = true;
    if (trunkAngle > cfg.maxTrunkLean) m.faults.add('Iperlordosi lombare');
    if (kneeBend > cfg.maxKneeBend) m.faults.add('Uso delle gambe');
    if (checkAscent(state, elbowAngle)) state.movementState = 'ASCENDING';
  } else if (state.movementState === 'ASCENDING') {
    if (trunkAngle > cfg.maxTrunkLean) m.faults.add('Iperlordosi lombare');
    if (kneeBend > cfg.maxKneeBend) m.faults.add('Uso delle gambe');
    if (elbowAngle > cfg.topElbow) {
      if (!m.deepEnough) m.faults.add('Range di movimento incompleto');
      event = m.faults.size === 0 ? { type: 'VALID_REP', faults: [] } : { type: 'NO_REP', faults: Array.from(m.faults) };
      state.movementState = 'STANDING';
      m.deepEnough = false;
      m.faults = new Set();
      m.startKneeAngle = rawKnee;
      state.lastAngleHistory = [];
    }
  }

  state.lastAngle = elbowAngle;
  return { state, event, primaryAngle: elbowAngle, secondaryAngle: trunkAngle, isTarget: elbowAngle > cfg.topElbow };
}

// ── DISPATCHER ─────────────────────────────────────────────────────────────────
export function processFrame(exercise, state, landmarks, side) {
  if (exercise === 'SQUAT') return processSquat(state, landmarks, side);
  if (exercise === 'DEADLIFT') return processDeadlift(state, landmarks, side);
  if (exercise === 'OVERHEAD_PRESS') return processOverheadPress(state, landmarks, side);
  return { state, event: null };
}
