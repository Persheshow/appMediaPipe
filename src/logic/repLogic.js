import { EXERCISES, SMOOTHING } from '../config/exercises';

export function smoothAngle(prev, current) {
  if (prev === null) return current;
  return (current * SMOOTHING.alpha) + (prev * SMOOTHING.beta);
}

// Calcolo Angolo Spaziale 3D tramite Prodotto Scalare
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

export function createInitialState() {
  return {
    movementState: 'STANDING', smoothedKnee: null, smoothedHip: null, lastAngle: 180,
    metrics: { faults: new Set(), startX: null, maxAscentAngle: 0, lockedAtStart: false, deepEnough: false, minWristY: 1.0 },
  };
}

export function processSquat(state, landmarks, side) {
  const cfg = EXERCISES.SQUAT.thresholds;
  const { shoulder, hip, knee, ankle } = EXERCISES.SQUAT.landmarks[side];
  const lm = landmarks;

  if (!lm[hip] || !lm[knee] || !lm[ankle] || lm[hip].visibility < 0.4 || lm[knee].visibility < 0.4 || lm[ankle].visibility < 0.4) return { state, event: null };

  const rawKnee = calculateAngle(lm[hip], lm[knee], lm[ankle]);
  state.smoothedKnee = smoothAngle(state.smoothedKnee, rawKnee);
  const kneeAngle = state.smoothedKnee;
  const m = state.metrics;
  let event = null;

  if (state.movementState === 'STANDING') {
    if (kneeAngle < cfg.bottomKnee) { state.movementState = 'DESCENDING'; m.deepEnough = false; }
  } else if (state.movementState === 'DESCENDING') {
    if (lm[hip].y > lm[knee].y && kneeAngle < cfg.bottomKnee) m.deepEnough = true;
    if (kneeAngle > state.lastAngle + 2) state.movementState = 'ASCENDING';
  } else if (state.movementState === 'ASCENDING') {
    if (kneeAngle > cfg.topKnee) {
      event = m.deepEnough ? { type: 'VALID_REP', faults: [] } : { type: 'NO_REP', faults: ['Mancato superamento del parallelo'] };
      state.movementState = 'STANDING';
      m.deepEnough = false;
    }
  }
  state.lastAngle = kneeAngle;
  return { state, event, primaryAngle: kneeAngle, secondaryAngle: state.smoothedHip };
}

export function processDeadlift(state, landmarks, side) {
  const cfg = EXERCISES.DEADLIFT.thresholds;
  const { shoulder, hip, knee, ankle, wrist } = EXERCISES.DEADLIFT.landmarks[side];
  const lm = landmarks;

  if (!lm[hip] || !lm[knee] || !lm[shoulder] || lm[hip].visibility < 0.4 || lm[knee].visibility < 0.4 || lm[shoulder].visibility < 0.4) return { state, event: null };

  const rawKnee = calculateAngle(lm[hip], lm[knee], lm[ankle]);
  const rawHip  = calculateAngle(lm[shoulder], lm[hip], lm[knee]);
  state.smoothedKnee = smoothAngle(state.smoothedKnee, rawKnee);
  state.smoothedHip  = smoothAngle(state.smoothedHip,  rawHip);

  const kneeAngle = state.smoothedKnee;
  const hipAngle  = state.smoothedHip;
  const m = state.metrics;

  const isErect = kneeAngle > cfg.erectKnee && hipAngle > cfg.erectHip;
  const wristVisible = lm[wrist] && lm[wrist].visibility > 0.4;
  let event = null;

  if (state.movementState === 'STANDING' || state.movementState === 'DROPPING') {
    if (!isErect && wristVisible && lm[wrist].y > cfg.setupWristY) { state.movementState = 'SETUP'; m.minWristY = lm[wrist].y; }
  } else if (state.movementState === 'SETUP') {
    if (wristVisible) m.minWristY = Math.max(m.minWristY, lm[wrist].y);
    if (wristVisible && lm[wrist].y < m.minWristY - cfg.liftThreshold) state.movementState = 'LIFTING';
  } else if (state.movementState === 'LIFTING') {
    if (isErect) { event = { type: 'VALID_REP', faults: [] }; state.movementState = 'LOCKED'; }
  } else if (state.movementState === 'LOCKED') {
    if (!isErect && wristVisible && lm[wrist].y > m.minWristY + cfg.dropThreshold) state.movementState = 'DROPPING';
  }
  return { state, event, primaryAngle: hipAngle, secondaryAngle: kneeAngle };
}

export function processOverheadPress(state, landmarks, side) {
  const cfg = EXERCISES.OVERHEAD_PRESS.thresholds;
  const { shoulder, elbow, wrist, hip } = EXERCISES.OVERHEAD_PRESS.landmarks[side];
  const lm = landmarks;

  if (!lm[shoulder] || !lm[elbow] || !lm[wrist] || lm[shoulder].visibility < 0.4 || lm[elbow].visibility < 0.4 || lm[wrist].visibility < 0.4) return { state, event: null };

  const rawElbow = calculateAngle(lm[shoulder], lm[elbow], lm[wrist]);
  state.smoothedKnee = smoothAngle(state.smoothedKnee, rawElbow);
  const elbowAngle = state.smoothedKnee;

  const vertical = { x: lm[shoulder].x, y: lm[shoulder].y - 0.1, z: lm[shoulder].z };
  const rawTrunk = calculateAngle(vertical, lm[shoulder], lm[hip]);
  state.smoothedHip = smoothAngle(state.smoothedHip, rawTrunk);
  const trunkAngle = state.smoothedHip;

  const m = state.metrics;
  let event = null;

  if (state.movementState === 'STANDING') {
    if (elbowAngle > cfg.topElbow) m.lockedAtStart = true;
    if (elbowAngle < 140) { state.movementState = 'DESCENDING'; m.deepEnough = false; m.faults = new Set(); }
  } else if (state.movementState === 'DESCENDING') {
    if (elbowAngle < cfg.bottomElbow) m.deepEnough = true;
    if (trunkAngle > cfg.maxTrunkLean) m.faults.add('Iperlordosi lombare');
    if (elbowAngle > state.lastAngle + 2) state.movementState = 'ASCENDING';
  } else if (state.movementState === 'ASCENDING') {
    if (trunkAngle > cfg.maxTrunkLean) m.faults.add('Iperlordosi lombare');
    if (elbowAngle > cfg.topElbow) {
      if (!m.deepEnough) m.faults.add('Range di movimento incompleto');
      event = m.faults.size === 0 ? { type: 'VALID_REP', faults: [] } : { type: 'NO_REP', faults: Array.from(m.faults) };
      state.movementState = 'STANDING';
      m.deepEnough = false;
      m.faults = new Set();
    }
  }
  state.lastAngle = elbowAngle;
  return { state, event, primaryAngle: elbowAngle, secondaryAngle: trunkAngle };
}

export function processFrame(exercise, state, landmarks, side) {
  if (exercise === 'SQUAT')          return processSquat(state, landmarks, side);
  if (exercise === 'DEADLIFT')       return processDeadlift(state, landmarks, side);
  if (exercise === 'OVERHEAD_PRESS') return processOverheadPress(state, landmarks, side);
  return { state, event: null };
}