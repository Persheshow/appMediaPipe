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
    occludedSince: null,
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

// ── HELPER: SPALLA CON FALLBACK ───────────────────────────────────────────────
// Se la spalla primaria è occlusa dal bilanciere, usa quella opposta
// o stima la posizione dall'anca
function getShoulderLandmark(lm, primaryIdx, hip) {
  const oppositeIdx = primaryIdx === 11 ? 12 : 11;
  const primary = lm[primaryIdx];
  const opposite = lm[oppositeIdx];

  // Soglia bassa (0.25) per tollerare occlusione parziale del bilanciere
  if (primary && primary.visibility > 0.25) return primary;

  // Fallback 1: spalla opposta (specchiata sull'asse x)
  if (opposite && opposite.visibility > 0.25) {
    return { ...opposite, x: 1 - opposite.x };
  }

  // Fallback 2: stima geometrica dall'anca
  return {
    x: hip.x,
    y: hip.y - 0.25,
    z: hip.z || 0,
    visibility: 0.2,
  };
}

// ── HELPER: GOMITO CON FALLBACK ───────────────────────────────────────────────
// Per l'overhead press il bilanciere può occludere il gomito nella fase di discesa
function getElbowLandmark(lm, primaryIdx, shoulder, wrist) {
  const oppositeIdx = primaryIdx === 13 ? 14 : 13;
  const primary = lm[primaryIdx];
  const opposite = lm[oppositeIdx];

  if (primary && primary.visibility > 0.25) return primary;

  // Fallback 1: gomito opposto specchiato
  if (opposite && opposite.visibility > 0.25) {
    return { ...opposite, x: 1 - opposite.x };
  }

  // Fallback 2: stima geometrica come punto medio spalla-polso
  if (shoulder && wrist) {
    return {
      x: (shoulder.x + wrist.x) / 2,
      y: (shoulder.y + wrist.y) / 2,
      z: ((shoulder.z || 0) + (wrist.z || 0)) / 2,
      visibility: 0.2,
    };
  }

  return primary;
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

// ── TRANSIZIONE DISCESA → RISALITA (media mobile 3 frame) ─────────────────────
function checkAscent(state, currentAngle) {
  state.lastAngleHistory.push(currentAngle);
  if (state.lastAngleHistory.length > 3) state.lastAngleHistory.shift();
  const avg = state.lastAngleHistory.reduce((a, b) => a + b, 0) / state.lastAngleHistory.length;
  return avg > state.lastAngle + 5;
}

// ── GESTIONE OCCLUSIONE ────────────────────────────────────────────────────────
function handleOcclusion(state, exercise) {
  if (!state.occludedSince) {
    state.occludedSince = Date.now();
    return { occluded: true, shouldReset: false };
  }
  // Dopo 1 secondo di occlusione fuori da STANDING → no-rep
  if (Date.now() - state.occludedSince > 1000 && state.movementState !== 'STANDING') {
    return { occluded: true, shouldReset: true };
  }
  return { occluded: true, shouldReset: false };
}

// ── LOGICA SQUAT ───────────────────────────────────────────────────────────────
export function processSquat(state, landmarks, side) {
  const cfg = EXERCISES.SQUAT.thresholds;
  const { hip, knee, ankle } = EXERCISES.SQUAT.landmarks[side];
  const lm = landmarks;

  const isVisible =
    lm[hip] && lm[hip].visibility > 0.3 &&
    lm[knee] && lm[knee].visibility > 0.3 &&
    lm[ankle] && lm[ankle].visibility > 0.3;

  if (!isVisible) {
    const { shouldReset } = handleOcclusion(state, 'SQUAT');
    if (shouldReset) {
      return {
        state: createInitialState(),
        event: null, // Reset silenzioso: non conta come no-rep
        primaryAngle: null, secondaryAngle: null, isTarget: false,
      };
    }
    return { state, event: null, primaryAngle: null, secondaryAngle: null, isTarget: false };
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
  }
  else if (state.movementState === 'DESCENDING') {
    if (lm[hip].y > lm[knee].y && kneeAngle < cfg.bottomKnee) m.deepEnough = true;
    if (checkAscent(state, kneeAngle)) state.movementState = 'ASCENDING';
  }
  else if (state.movementState === 'ASCENDING') {
    if (kneeAngle > cfg.topKnee) {
      event = m.deepEnough
        ? { type: 'VALID_REP', faults: [] }
        : { type: 'NO_REP', faults: ['Mancato superamento del parallelo'] };
      state.movementState = 'STANDING';
      m.deepEnough = false;
      state.lastAngleHistory = [];
    }
  }

  state.lastAngle = kneeAngle;
  return {
    state, event,
    primaryAngle: kneeAngle,
    secondaryAngle: state.smoothedSecondary,
    isTarget: m.deepEnough,
  };
}

// ── LOGICA DEADLIFT ────────────────────────────────────────────────────────────
export function processDeadlift(state, landmarks, side) {
  const cfg = EXERCISES.DEADLIFT.thresholds;
  const { shoulder: shoulderIdx, hip, knee, ankle, wrist } = EXERCISES.DEADLIFT.landmarks[side];
  const lm = landmarks;

  const isVisible =
    lm[hip] && lm[hip].visibility > 0.3 &&
    lm[knee] && lm[knee].visibility > 0.3;

  if (!isVisible) {
    const { shouldReset } = handleOcclusion(state, 'DEADLIFT');
    if (shouldReset) {
      return {
        state: createInitialState(),
        event: null, // Reset silenzioso
        primaryAngle: null, secondaryAngle: null, isTarget: false,
      };
    }
    return { state, event: null, primaryAngle: null, secondaryAngle: null, isTarget: false };
  }
  state.occludedSince = null;
  checkTimeout(state);

  const shoulderLm = getShoulderLandmark(lm, shoulderIdx, lm[hip]);
  const rawKnee = calculateAngle(lm[hip], lm[knee], lm[ankle]);
  const rawHip = calculateAngle(shoulderLm, lm[hip], lm[knee]);

  state.smoothedPrimary = smoothAngle(state.smoothedPrimary, rawHip);
  state.smoothedSecondary = smoothAngle(state.smoothedSecondary, rawKnee);

  const hipAngle = state.smoothedPrimary;
  const kneeAngle = state.smoothedSecondary;
  const m = state.metrics;

  const isErect = kneeAngle > cfg.erectKnee && hipAngle > cfg.erectHip;
  const wristVisible = lm[wrist] && lm[wrist].visibility > 0.25;
  const wristY = wristVisible ? lm[wrist].y : lm[hip].y + 0.3;

  let event = null;

  if (state.movementState === 'STANDING' || state.movementState === 'DROPPING') {
    if (!isErect && wristY > cfg.setupWristY) {
      state.movementState = 'SETUP';
      m.minWristY = wristY;
    }
  }
  else if (state.movementState === 'SETUP') {
    m.minWristY = Math.max(m.minWristY, wristY);
    if (wristY < m.minWristY - cfg.liftThreshold) {
      state.movementState = 'LIFTING';
      m.maxWristYDuringLift = wristY;
      state.lastAngleHistory = [];
    }
  }
  else if (state.movementState === 'LIFTING') {
    if (
      m.maxWristYDuringLift !== null &&
      wristY > m.maxWristYDuringLift + cfg.maxWristDropDuringLift
    ) {
      return {
        state: createInitialState(),
        event: { type: 'NO_REP', faults: ['Discesa del bilanciere durante la tirata'] },
        primaryAngle: hipAngle, secondaryAngle: kneeAngle, isTarget: false,
      };
    }
    m.maxWristYDuringLift = Math.min(m.maxWristYDuringLift ?? wristY, wristY);
    if (isErect) {
      event = { type: 'VALID_REP', faults: [] };
      state.movementState = 'LOCKED';
      m.maxWristYDuringLift = null;
    }
  }
  else if (state.movementState === 'LOCKED') {
    if (!isErect && wristY > m.minWristY + cfg.dropThreshold) {
      state.movementState = 'DROPPING';
    }
  }

  state.lastAngle = hipAngle;
  return {
    state, event,
    primaryAngle: hipAngle,
    secondaryAngle: kneeAngle,
    isTarget: isErect,
  };
}

// ── LOGICA OVERHEAD PRESS ──────────────────────────────────────────────────────
export function processOverheadPress(state, landmarks, side) {
  const cfg = EXERCISES.OVERHEAD_PRESS.thresholds;
  const {
    shoulder: shoulderIdx,
    elbow: elbowIdx,
    wrist,
    hip, knee, ankle,
  } = EXERCISES.OVERHEAD_PRESS.landmarks[side];
  const lm = landmarks;

  const isVisible =
    lm[shoulderIdx] && lm[shoulderIdx].visibility > 0.25 &&
    lm[hip] && lm[hip].visibility > 0.3 &&
    lm[knee] && lm[knee].visibility > 0.3 &&
    lm[ankle] && lm[ankle].visibility > 0.3;

  if (!isVisible) {
    const { shouldReset } = handleOcclusion(state, 'OVERHEAD_PRESS');
    if (shouldReset) {
      return {
        state: createInitialState(),
        event: null, // Reset silenzioso
        primaryAngle: null, secondaryAngle: null, isTarget: false,
      };
    }
    return { state, event: null, primaryAngle: null, secondaryAngle: null, isTarget: false };
  }
  state.occludedSince = null;
  checkTimeout(state);

  const elbowLm = getElbowLandmark(lm, elbowIdx, lm[shoulderIdx], lm[wrist]);
  const rawElbow = calculateAngle(lm[shoulderIdx], elbowLm, lm[wrist]);
  state.smoothedPrimary = smoothAngle(state.smoothedPrimary, rawElbow);
  const elbowAngle = state.smoothedPrimary;

  const vertical = {
    x: lm[shoulderIdx].x,
    y: lm[shoulderIdx].y - 0.1,
    z: lm[shoulderIdx].z || 0,
  };
  const rawTrunk = calculateAngle(vertical, lm[shoulderIdx], lm[hip]);
  state.smoothedSecondary = smoothAngle(state.smoothedSecondary, rawTrunk);
  const trunkAngle = state.smoothedSecondary;

  const rawKnee = calculateAngle(lm[hip], lm[knee], lm[ankle]);
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
  }
  else if (state.movementState === 'DESCENDING') {
    if (elbowAngle < cfg.bottomElbow) m.deepEnough = true;
    if (trunkAngle > cfg.maxTrunkLean) m.faults.add('Iperlordosi lombare');
    if (kneeBend > cfg.maxKneeBend) m.faults.add('Uso delle gambe (push press)');
    if (checkAscent(state, elbowAngle)) state.movementState = 'ASCENDING';
  }
  else if (state.movementState === 'ASCENDING') {
    if (trunkAngle > cfg.maxTrunkLean) m.faults.add('Iperlordosi lombare');
    if (kneeBend > cfg.maxKneeBend) m.faults.add('Uso delle gambe (push press)');
    if (elbowAngle > cfg.topElbow) {
      if (!m.deepEnough) m.faults.add('Range di movimento incompleto');
      event = m.faults.size === 0
        ? { type: 'VALID_REP', faults: [] }
        : { type: 'NO_REP', faults: Array.from(m.faults) };
      state.movementState = 'STANDING';
      m.deepEnough = false;
      m.faults = new Set();
      m.startKneeAngle = rawKnee;
      state.lastAngleHistory = [];
    }
  }

  state.lastAngle = elbowAngle;
  return {
    state, event,
    primaryAngle: elbowAngle,
    secondaryAngle: trunkAngle,
    isTarget: elbowAngle > cfg.topElbow,
  };
}

// ── DISPATCHER ─────────────────────────────────────────────────────────────────
export function processFrame(exercise, state, landmarks, side) {
  if (exercise === 'SQUAT') return processSquat(state, landmarks, side);
  if (exercise === 'DEADLIFT') return processDeadlift(state, landmarks, side);
  if (exercise === 'OVERHEAD_PRESS') return processOverheadPress(state, landmarks, side);
  return { state, event: null };
}