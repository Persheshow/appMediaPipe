import { EXERCISES, SMOOTHING } from '../config/exercises';

// ── SMOOTHING ──────────────────────────────────────────────────────────────────

export function smoothAngle(prev, current) {
  if (prev === null) return current;
  return (current * SMOOTHING.alpha) + (prev * SMOOTHING.beta);
}

// ── CALCOLO ANGOLO ─────────────────────────────────────────────────────────────

export function calculateAngle(a, b, c) {
  const radians =
    Math.atan2(c.y - b.y, c.x - b.x) -
    Math.atan2(a.y - b.y, a.x - b.x);
  let angle = Math.abs((radians * 180.0) / Math.PI);
  if (angle > 180.0) angle = 360.0 - angle;
  return angle;
}

// ── STATO INIZIALE ─────────────────────────────────────────────────────────────

export function createInitialState() {
  return {
    movementState: 'STANDING',
    smoothedKnee: null,
    smoothedHip: null,
    lastAngle: 180,
    metrics: {
      faults: new Set(),
      startX: null,
      maxAscentAngle: 0,
      lockedAtStart: false,
      deepEnough: false,
      minWristY: 1.0,
    },
  };
}

// ── LOGICA SQUAT ───────────────────────────────────────────────────────────────

export function processSquat(state, landmarks) {
  const cfg = EXERCISES.SQUAT.thresholds;
  const { shoulder, hip, knee, ankle } = EXERCISES.SQUAT.landmarks;
  const lm = landmarks;

  if (lm[hip].visibility < 0.4 || lm[knee].visibility < 0.4 || lm[ankle].visibility < 0.4) {
    return { state, event: null };
  }

  const rawKnee = calculateAngle(lm[hip], lm[knee], lm[ankle]);
  state.smoothedKnee = smoothAngle(state.smoothedKnee, rawKnee);
  const kneeAngle = state.smoothedKnee;

  const m = state.metrics;
  let event = null;

  if (state.movementState === 'STANDING') {
    if (kneeAngle < cfg.bottomKnee) {
      state.movementState = 'DESCENDING';
      m.deepEnough = false;
    }
  }
  else if (state.movementState === 'DESCENDING') {
    // Controlla rottura del parallelo
    if (lm[hip].y > lm[knee].y && kneeAngle < cfg.bottomKnee) {
      m.deepEnough = true;
    }
    // Inizia risalita
    if (kneeAngle > state.lastAngle + 2) {
      state.movementState = 'ASCENDING';
    }
  }
  else if (state.movementState === 'ASCENDING') {
    if (kneeAngle > cfg.topKnee) {
      if (m.deepEnough) {
        event = { type: 'VALID_REP', faults: [] };
      } else {
        event = { type: 'NO_REP', faults: ['Mancato superamento del parallelo'] };
      }
      state.movementState = 'STANDING';
      m.deepEnough = false;
    }
  }

  state.lastAngle = kneeAngle;
  return { state, event, kneeAngle, hipAngle: state.smoothedHip };
}

// ── LOGICA DEADLIFT ────────────────────────────────────────────────────────────

export function processDeadlift(state, landmarks) {
  const cfg = EXERCISES.DEADLIFT.thresholds;
  const { shoulder, hip, knee, ankle, wrist } = EXERCISES.DEADLIFT.landmarks;
  const lm = landmarks;

  if (lm[hip].visibility < 0.4 || lm[knee].visibility < 0.4 || lm[shoulder].visibility < 0.4) {
    return { state, event: null };
  }

  const rawKnee = calculateAngle(lm[hip], lm[knee], lm[ankle]);
  const rawHip  = calculateAngle(lm[shoulder], lm[hip], lm[knee]);

  state.smoothedKnee = smoothAngle(state.smoothedKnee, rawKnee);
  state.smoothedHip  = smoothAngle(state.smoothedHip,  rawHip);

  const kneeAngle = state.smoothedKnee;
  const hipAngle  = state.smoothedHip;
  const m = state.metrics;

  const isErect = kneeAngle > cfg.erectKnee && hipAngle > cfg.erectHip;
  const wristVisible = lm[wrist].visibility > 0.4;

  let event = null;

  if (state.movementState === 'STANDING' || state.movementState === 'DROPPING') {
    // Atleta si abbassa — polso scende verso terra
    if (!isErect && wristVisible && lm[wrist].y > cfg.setupWristY) {
      state.movementState = 'SETUP';
      m.minWristY = lm[wrist].y;
    }
  }
  else if (state.movementState === 'SETUP') {
    // Aggiorna posizione più bassa del polso
    if (wristVisible) m.minWristY = Math.max(m.minWristY, lm[wrist].y);
    // Polso inizia a salire → trazione iniziata
    if (wristVisible && lm[wrist].y < m.minWristY - cfg.liftThreshold) {
      state.movementState = 'LIFTING';
    }
  }
  else if (state.movementState === 'LIFTING') {
    // Corpo eretto → rep completata
    if (isErect) {
      event = { type: 'VALID_REP', faults: [] };
      state.movementState = 'LOCKED';
    }
  }
  else if (state.movementState === 'LOCKED') {
    // Atleta abbassa il bilanciere → pronto per prossima rep
    if (!isErect && wristVisible && lm[wrist].y > m.minWristY + cfg.dropThreshold) {
      state.movementState = 'DROPPING';
    }
  }

  return { state, event, kneeAngle, hipAngle };
}

// ── LOGICA OVERHEAD PRESS ────────────────────────────────────────────────────────────

export function processOverheadPress(state, landmarks) {
  const cfg = EXERCISES.OVERHEAD_PRESS.thresholds;
  const { shoulder, elbow, wrist, hip } = EXERCISES.OVERHEAD_PRESS.landmarks;
  const lm = landmarks;

  if (lm[shoulder].visibility < 0.4 || lm[elbow].visibility < 0.4 || lm[wrist].visibility < 0.4) {
    return { state, event: null };
  }

  // Angolo gomito — movimento principale
  const rawElbow = calculateAngle(lm[shoulder], lm[elbow], lm[wrist]);
  state.smoothedKnee = smoothAngle(state.smoothedKnee, rawElbow);
  const elbowAngle = state.smoothedKnee;

  // Angolo tronco — controllo iperlordosi
  // Usiamo un punto virtuale sopra la spalla come riferimento verticale
  const vertical = { x: lm[shoulder].x, y: lm[shoulder].y - 0.1 };
  const rawTrunk = calculateAngle(vertical, lm[shoulder], lm[hip]);
  state.smoothedHip = smoothAngle(state.smoothedHip, rawTrunk);
  const trunkAngle = state.smoothedHip;

  const m = state.metrics;
  let event = null;

  if (state.movementState === 'STANDING') {
    // Braccia distese in partenza
    if (elbowAngle > cfg.topElbow) {
      m.lockedAtStart = true;
    }
    // Inizia discesa
    if (elbowAngle < 140) {
      state.movementState = 'DESCENDING';
      m.deepEnough = false;
      m.faults = new Set();
    }
  }
  else if (state.movementState === 'DESCENDING') {
    // Bottom raggiunto
    if (elbowAngle < cfg.bottomElbow) {
      m.deepEnough = true;
    }
    // Controlla iperlordosi durante la discesa
    if (trunkAngle > cfg.maxTrunkLean) {
      m.faults.add('Iperlordosi lombare');
    }
    // Inizia risalita
    if (elbowAngle > state.lastAngle + 2) {
      state.movementState = 'ASCENDING';
    }
  }
  else if (state.movementState === 'ASCENDING') {
    // Controlla iperlordosi anche in salita
    if (trunkAngle > cfg.maxTrunkLean) {
      m.faults.add('Iperlordosi lombare');
    }
    // Lockout raggiunto
    if (elbowAngle > cfg.topElbow) {
      if (!m.deepEnough) m.faults.add('Range di movimento incompleto');

      if (m.faults.size === 0) {
        event = { type: 'VALID_REP', faults: [] };
      } else {
        event = { type: 'NO_REP', faults: Array.from(m.faults) };
      }

      state.movementState = 'STANDING';
      m.deepEnough = false;
      m.faults = new Set();
    }
  }

  state.lastAngle = elbowAngle;
  return { state, event, kneeAngle: elbowAngle, hipAngle: trunkAngle };
}

// ── DISPATCHER ─────────────────────────────────────────────────────────────────

export function processFrame(exercise, state, landmarks) {
  if (exercise === 'SQUAT')          return processSquat(state, landmarks);
  if (exercise === 'DEADLIFT')       return processDeadlift(state, landmarks);
  if (exercise === 'OVERHEAD_PRESS') return processOverheadPress(state, landmarks);
  return { state, event: null };
}