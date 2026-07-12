/**
 * @file repLogic.js
 */

import { EXERCISES, SMOOTHING } from '../config/exercises.js';

export function smoothAngle(prev, current) {
  if (prev === null) return current;
  return (current * SMOOTHING.alpha) + (prev * SMOOTHING.beta);
}

export function calculateAngle(a, b, c) {
  const ba = { x: a.x - b.x, y: a.y - b.y };
  const bc = { x: c.x - b.x, y: c.y - b.y };

  const dotProduct = (ba.x * bc.x) + (ba.y * bc.y);
  const magBA = Math.sqrt(ba.x * ba.x + ba.y * ba.y);
  const magBC = Math.sqrt(bc.x * bc.x + bc.y * bc.y);

  if (magBA === 0 || magBC === 0) return 0;

  let cosAngle = dotProduct / (magBA * magBC);
  cosAngle = Math.max(-1.0, Math.min(1.0, cosAngle));

  return (Math.acos(cosAngle) * 180.0) / Math.PI;
}

export function createInitialState() {
  return {
    movementState: 'STANDING',
    smoothedPrimary: null,
    smoothedSecondary: null,
    lastAngle: 180,
    lastAngleHistory: [],
    lastActiveTime: Date.now(),
    startTime: Date.now(),
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
      cooldownUntil: 0,
      repStartTime: 0,
      lowestKneeAngle: 180,
      lowestElbowAngle: 180,
      lowestHipAngle: 180,
    },
  };
}

function getShoulderLandmark(lm, primaryIdx, hip) {
  const oppositeIdx = primaryIdx === 11 ? 12 : 11;
  const primary = lm[primaryIdx];
  const opposite = lm[oppositeIdx];
  if (primary && primary.visibility > 0.15) return primary;
  if (opposite && opposite.visibility > 0.15) return { ...opposite, x: 1 - opposite.x };
  return { x: hip.x, y: hip.y - 0.25, visibility: 0.15 };
}

function getElbowLandmark(lm, primaryIdx, shoulder, wrist) {
  const oppositeIdx = primaryIdx === 13 ? 14 : 13;
  const primary = lm[primaryIdx];
  const opposite = lm[oppositeIdx];
  if (primary && primary.visibility > 0.15) return primary;
  if (opposite && opposite.visibility > 0.15) return { ...opposite, x: 1 - opposite.x };
  if (shoulder && wrist) {
    return { x: (shoulder.x + wrist.x) / 2, y: (shoulder.y + wrist.y) / 2, visibility: 0.15 };
  }
  return primary;
}

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
    state.metrics.lowestKneeAngle = 180;
    state.metrics.lowestElbowAngle = 180;
    state.metrics.lowestHipAngle = 180;
    state.lastAngleHistory = [];
    state.lastActiveTime = now;
  }
}

function checkAscent(state, currentAngle) {
  state.lastAngleHistory.push(currentAngle);
  if (state.lastAngleHistory.length > 5) {
    state.lastAngleHistory.shift();
  }
  if (state.lastAngleHistory.length < 5) return false;

  const oldestAngle = state.lastAngleHistory[0];
  return currentAngle > oldestAngle + 3.0;
}

function handleOcclusion(state) {
  if (!state.occludedSince) {
    state.occludedSince = Date.now();
    return { occluded: true, shouldReset: false };
  }
  if (Date.now() - state.occludedSince > 1000 && state.movementState !== 'STANDING') {
    return { occluded: true, shouldReset: true };
  }
  return { occluded: true, shouldReset: false };
}

// ── SQUAT ──
export function processSquat(state, landmarks, side) {
  const cfg = EXERCISES.SQUAT.thresholds;
  const { hip, knee, ankle } = EXERCISES.SQUAT.landmarks[side];
  const lm = landmarks;
  const now = Date.now();

  const isVisible = lm[hip]?.visibility > 0.15 && lm[knee]?.visibility > 0.15 && lm[ankle]?.visibility > 0.15;

  if (!isVisible) {
    const { shouldReset } = handleOcclusion(state);
    if (shouldReset) return { state: createInitialState(), event: null, primaryAngle: null, secondaryAngle: null, isTarget: false };
    return { state, event: null, primaryAngle: null, secondaryAngle: null, isTarget: false };
  }
  state.occludedSince = null;
  checkTimeout(state);

  const rawKnee = calculateAngle(lm[hip], lm[knee], lm[ankle]);
  state.smoothedPrimary = smoothAngle(state.smoothedPrimary, rawKnee);
  const kneeAngle = state.smoothedPrimary;
  const m = state.metrics;
  let event = null;

  if (now - state.startTime < 1000) {
    state.lastAngle = kneeAngle;
    return { state, event: null, primaryAngle: kneeAngle, secondaryAngle: state.smoothedSecondary, isTarget: false };
  }

  if (now < m.cooldownUntil) {
    state.lastAngle = kneeAngle;
    return { state, event: null, primaryAngle: kneeAngle, secondaryAngle: state.smoothedSecondary, isTarget: m.deepEnough };
  }

  m.lowestKneeAngle = Math.min(m.lowestKneeAngle ?? 180, kneeAngle);

  const checkDepth = () => {
    if (kneeAngle <= cfg.bottomKnee) m.deepEnough = true;
  };

  if (state.movementState === 'STANDING') {
    if (kneeAngle < cfg.topKnee - 25) {
      state.movementState = 'DESCENDING';
      m.deepEnough = false;
      m.lowestKneeAngle = kneeAngle;
      m.repStartTime = now;
      state.lastAngleHistory = [];
    }
  }
  else if (state.movementState === 'DESCENDING') {
    checkDepth();
    if (checkAscent(state, kneeAngle)) state.movementState = 'ASCENDING';
  }
  else if (state.movementState === 'ASCENDING') {
    checkDepth();

    if (kneeAngle > cfg.topKnee) {
      const repDuration = now - m.repStartTime;

      if (m.lowestKneeAngle > 125 || repDuration < 800) {
        state.movementState = 'STANDING';
        m.deepEnough = false;
        m.lowestKneeAngle = 180;
        state.lastAngleHistory = [];
        return { state, event: null, primaryAngle: kneeAngle, secondaryAngle: state.smoothedSecondary, isTarget: false };
      }

      event = m.deepEnough
        ? { type: 'VALID_REP', faults: [] }
        : { type: 'NO_REP', faults: ['Mancato superamento del parallelo'] };

      state.movementState = 'STANDING';
      m.deepEnough = false;
      m.lowestKneeAngle = 180;
      state.lastAngleHistory = [];
      m.cooldownUntil = now + 2000;
    }
  }

  state.lastAngle = kneeAngle;
  return { state, event, primaryAngle: kneeAngle, secondaryAngle: state.smoothedSecondary, isTarget: m.deepEnough };
}

// ── STACCO DA TERRA ──
export function processDeadlift(state, landmarks, side) {
  const cfg = EXERCISES.DEADLIFT.thresholds;
  const { shoulder: shoulderIdx, hip, knee, ankle, wrist } = EXERCISES.DEADLIFT.landmarks[side];
  const lm = landmarks;
  const now = Date.now();

  const isVisible = lm[hip]?.visibility > 0.15 && lm[knee]?.visibility > 0.15;

  if (!isVisible) {
    const { shouldReset } = handleOcclusion(state);
    if (shouldReset) return { state: createInitialState(), event: null, primaryAngle: null, secondaryAngle: null, isTarget: false };
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
  const wristVisible = lm[wrist] && lm[wrist].visibility > 0.15;
  const wristY = wristVisible ? lm[wrist].y : lm[hip].y + 0.3;

  let event = null;

  if (now - state.startTime < 1000) {
    state.lastAngle = hipAngle;
    return { state, event: null, primaryAngle: hipAngle, secondaryAngle: kneeAngle, isTarget: isErect };
  }

  if (now < m.cooldownUntil) {
    state.lastAngle = hipAngle;
    return { state, event: null, primaryAngle: hipAngle, secondaryAngle: kneeAngle, isTarget: isErect };
  }

  m.lowestHipAngle = Math.min(m.lowestHipAngle ?? 180, hipAngle);

  if (state.movementState === 'STANDING' || state.movementState === 'DROPPING') {
    if (!isErect && wristY > cfg.setupWristY) {
      state.movementState = 'SETUP';
      m.minWristY = wristY;
      m.lowestHipAngle = hipAngle;
      m.repStartTime = now;
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
    if (m.maxWristYDuringLift !== null && wristY > m.maxWristYDuringLift + cfg.maxWristDropDuringLift) {
      const resetState = createInitialState();
      resetState.metrics.cooldownUntil = now + 2000;
      return {
        state: resetState,
        event: { type: 'NO_REP', faults: ['Discesa del bilanciere durante la tirata'] },
        primaryAngle: hipAngle, secondaryAngle: kneeAngle, isTarget: false,
      };
    }

    m.maxWristYDuringLift = Math.min(m.maxWristYDuringLift ?? wristY, wristY);

    if (isErect) {
      const repDuration = now - m.repStartTime;

      if (m.lowestHipAngle > 125 || repDuration < 800) {
        state.movementState = 'STANDING';
        m.lowestHipAngle = 180;
        m.maxWristYDuringLift = null;
        return { state, event: null, primaryAngle: hipAngle, secondaryAngle: kneeAngle, isTarget: isErect };
      }

      event = { type: 'VALID_REP', faults: [] };
      state.movementState = 'LOCKED';
      m.maxWristYDuringLift = null;
      m.lowestHipAngle = 180;
      m.cooldownUntil = now + 2000;
    }
  }
  else if (state.movementState === 'LOCKED') {
    if (!isErect && wristY > m.minWristY + cfg.dropThreshold) {
      state.movementState = 'DROPPING';
    }
  }

  state.lastAngle = hipAngle;
  return { state, event, primaryAngle: hipAngle, secondaryAngle: kneeAngle, isTarget: isErect };
}

// ── PRESSA MILITARE ──
export function processOverheadPress(state, landmarks, side) {
  const cfg = EXERCISES.OVERHEAD_PRESS.thresholds;
  const { shoulder: shoulderIdx, elbow: elbowIdx, wrist, hip, knee, ankle } = EXERCISES.OVERHEAD_PRESS.landmarks[side];
  const lm = landmarks;
  const now = Date.now();

  const isVisible = lm[shoulderIdx]?.visibility > 0.15 && lm[hip]?.visibility > 0.15 && lm[knee]?.visibility > 0.15 && lm[ankle]?.visibility > 0.15;

  if (!isVisible) {
    const { shouldReset } = handleOcclusion(state);
    if (shouldReset) return { state: createInitialState(), event: null, primaryAngle: null, secondaryAngle: null, isTarget: false };
    return { state, event: null, primaryAngle: null, secondaryAngle: null, isTarget: false };
  }
  state.occludedSince = null;
  checkTimeout(state);

  const elbowLm = getElbowLandmark(lm, elbowIdx, lm[shoulderIdx], lm[wrist]);
  const rawElbow = calculateAngle(lm[shoulderIdx], elbowLm, lm[wrist]);
  state.smoothedPrimary = smoothAngle(state.smoothedPrimary, rawElbow);
  const elbowAngle = state.smoothedPrimary;

  const vertical = { x: lm[shoulderIdx].x, y: lm[shoulderIdx].y - 0.1 };
  const rawTrunk = calculateAngle(vertical, lm[shoulderIdx], lm[hip]);
  state.smoothedSecondary = smoothAngle(state.smoothedSecondary, rawTrunk);
  const trunkAngle = state.smoothedSecondary;

  const rawKnee = calculateAngle(lm[hip], lm[knee], lm[ankle]);
  const m = state.metrics;

  const kneeBend = m.startKneeAngle === null ? 0 : m.startKneeAngle - rawKnee;
  let event = null;

  if (now - state.startTime < 1000) {
    state.lastAngle = elbowAngle;
    return { state, event: null, primaryAngle: elbowAngle, secondaryAngle: trunkAngle, isTarget: false };
  }

  if (now < m.cooldownUntil) {
    state.lastAngle = elbowAngle;
    return { state, event: null, primaryAngle: elbowAngle, secondaryAngle: trunkAngle, isTarget: elbowAngle > cfg.topElbow };
  }

  m.lowestElbowAngle = Math.min(m.lowestElbowAngle ?? 180, elbowAngle);

  if (state.movementState === 'STANDING') {
    if (elbowAngle > cfg.topElbow) m.lockedAtStart = true;
    if (m.startKneeAngle === null || elbowAngle > cfg.topElbow) m.startKneeAngle = rawKnee;

    if (elbowAngle < 140) {
      state.movementState = 'DESCENDING';
      m.deepEnough = false;
      m.faults = new Set();
      m.lowestElbowAngle = elbowAngle;
      m.repStartTime = now;
      state.lastAngleHistory = [];
    }
  }
  else if (state.movementState === 'DESCENDING') {
    if (elbowAngle < cfg.bottomElbow) m.deepEnough = true;

    if (trunkAngle > cfg.maxTrunkLean) m.faults.add('Iperlordosi lombare');
    if (kneeBend > cfg.maxKneeBend) m.faults.add('Uso delle gambe (Push press)');

    if (checkAscent(state, elbowAngle)) state.movementState = 'ASCENDING';
  }
  else if (state.movementState === 'ASCENDING') {
    if (trunkAngle > cfg.maxTrunkLean) m.faults.add('Iperlordosi lombare');
    if (kneeBend > cfg.maxKneeBend) m.faults.add('Uso delle gambe (Push press)');

    if (elbowAngle > cfg.topElbow) {
      const repDuration = now - m.repStartTime;

      if (m.lowestElbowAngle > 125 || repDuration < 800) {
        state.movementState = 'STANDING';
        m.deepEnough = false;
        m.faults = new Set();
        m.startKneeAngle = rawKnee;
        m.lowestElbowAngle = 180;
        state.lastAngleHistory = [];
        return { state, event: null, primaryAngle: elbowAngle, secondaryAngle: trunkAngle, isTarget: false };
      }

      if (!m.deepEnough) m.faults.add('Range di movimento incompleto');

      event = m.faults.size === 0
        ? { type: 'VALID_REP', faults: [] }
        : { type: 'NO_REP', faults: Array.from(m.faults) };

      state.movementState = 'STANDING';
      m.deepEnough = false;
      m.faults = new Set();
      m.startKneeAngle = rawKnee;
      m.lowestElbowAngle = 180;
      state.lastAngleHistory = [];
      m.cooldownUntil = now + 2000;
    }
  }

  state.lastAngle = elbowAngle;
  return { state, event, primaryAngle: elbowAngle, secondaryAngle: trunkAngle, isTarget: elbowAngle > cfg.topElbow };
}

export function processFrame(exercise, state, landmarks, side) {
  if (exercise === 'SQUAT') return processSquat(state, landmarks, side);
  if (exercise === 'DEADLIFT') return processDeadlift(state, landmarks, side);
  if (exercise === 'OVERHEAD_PRESS') return processOverheadPress(state, landmarks, side);
  return { state, event: null };
}