/**
 * @file repLogic.js
 * @description Modulo matematico e logico per l'analisi biomeccanica delle alzate.
 * Implementa Macchine a Stati Finiti (FSM) specifiche per ogni esercizio, elaborando
 * le coordinate 3D fornite da MediaPipe per determinare la validità del movimento
 * secondo i regolamenti del Powerlifting (IPF).
 */

import { EXERCISES, SMOOTHING } from '../config/exercises.js';

// ── FILTRAGGIO DEL SEGNALE (SMOOTHING) ─────────────────────────────────────────
/**
 * Applica un filtro passa-basso (Exponential Moving Average - EMA) ai dati angolari.
 * Necessario per mitigare il "jittering" (rumore ad alta frequenza) tipico 
 * dei sistemi di pose estimation frame-by-frame, restituendo una curva di movimento fluida.
 * * @param {number|null} prev - Il valore dell'angolo calcolato nel frame precedente.
 * @param {number} current - Il valore grezzo dell'angolo nel frame attuale.
 * @returns {number} Il valore angolare smussato.
 */
export function smoothAngle(prev, current) {
  if (prev === null) return current;
  return (current * SMOOTHING.alpha) + (prev * SMOOTHING.beta);
}

// ── CALCOLO VETTORIALE 3D ──────────────────────────────────────────────────────
/**
 * Calcola l'angolo convesso formato da tre punti (landmark) nello spazio tridimensionale
 * utilizzando il teorema del prodotto scalare tra vettori.
 * Formula: θ = arccos( (v1 • v2) / (|v1| * |v2|) )
 * * @param {Object} a - Coordinate del primo punto (es. Anca).
 * @param {Object} b - Coordinate del vertice (es. Ginocchio).
 * @param {Object} c - Coordinate del terzo punto (es. Caviglia).
 * @returns {number} Angolo in gradi (0° - 180°).
 */
export function calculateAngle(a, b, c) {
  // Definizione dei vettori direzionali BA e BC originanti nel vertice b
  const ba = { x: a.x - b.x, y: a.y - b.y, z: (a.z || 0) - (b.z || 0) };
  const bc = { x: c.x - b.x, y: c.y - b.y, z: (c.z || 0) - (b.z || 0) };

  const dotProduct = (ba.x * bc.x) + (ba.y * bc.y) + (ba.z * bc.z);
  const magBA = Math.sqrt(ba.x * ba.x + ba.y * ba.y + ba.z * ba.z);
  const magBC = Math.sqrt(bc.x * bc.x + bc.y * bc.y + bc.z * bc.z);

  if (magBA === 0 || magBC === 0) return 0; // Prevenzione divisione per zero

  let cosAngle = dotProduct / (magBA * magBC);
  // Clamping del coseno tra -1.0 e 1.0 per compensare imprecisioni di floating-point
  cosAngle = Math.max(-1.0, Math.min(1.0, cosAngle));

  return (Math.acos(cosAngle) * 180.0) / Math.PI; // Conversione radianti -> gradi
}

// ── MACCHINA A STATI: INIZIALIZZAZIONE ─────────────────────────────────────────
/**
 * Inizializza o resetta il contesto della Macchina a Stati Finiti (FSM)
 * e il buffer metrico utilizzato per validare la ripetizione corrente.
 * * @returns {Object} Struttura dati dello stato iniziale.
 */
export function createInitialState() {
  return {
    movementState: 'STANDING', // Fasi: STANDING, DESCENDING, ASCENDING, DROPPING, SETUP, LIFTING, LOCKED
    smoothedPrimary: null,     // Angolo principale smussato (es. Ginocchio per Squat)
    smoothedSecondary: null,   // Angolo secondario smussato (es. Schiena per OHP)
    lastAngle: 180,
    lastAngleHistory: [],      // Buffer circolare per l'analisi delle derivate (inversione di moto)
    lastActiveTime: Date.now(),
    occludedSince: null,
    metrics: {
      faults: new Set(),       // Criteri di invalidazione registrati
      startX: null,
      maxAscentAngle: 0,
      lockedAtStart: false,
      deepEnough: false,       // Flag per rottura del parallelo (Squat/OHP)
      minWristY: 1.0,
      maxWristYDuringLift: null,
      startKneeAngle: null,
    },
  };
}

// ── EURISTICHE DI COMPENSAZIONE (OCCLUSIONE SPAZIALE) ──────────────────────────
/**
 * Euristica per il recupero della coordinata della spalla.
 * Compensa i casi in cui l'arto in primo piano viene occluso dal bilanciere
 * o dai dischi durante l'esecuzione dell'alzata.
 */
function getShoulderLandmark(lm, primaryIdx, hip) {
  const oppositeIdx = primaryIdx === 11 ? 12 : 11;
  const primary = lm[primaryIdx];
  const opposite = lm[oppositeIdx];

  // Tolleranza abbassata a 0.25: si accetta il dato se la spalla è anche parzialmente visibile
  if (primary && primary.visibility > 0.25) return primary;

  // Fallback 1: Mirroring dell'arto controlaterale (assumendo simmetria corporea)
  if (opposite && opposite.visibility > 0.25) {
    return { ...opposite, x: 1 - opposite.x };
  }

  // Fallback 2: Stima geometrica statica basata sulla posizione dell'anca
  return {
    x: hip.x,
    y: hip.y - 0.25, // Offset medio standard torso umano
    z: hip.z || 0,
    visibility: 0.2,
  };
}

/**
 * Euristica per la stima della posizione del gomito.
 * Critica nella fase eccentrica dell'Overhead Press dove i dischi nascondono l'articolazione.
 */
function getElbowLandmark(lm, primaryIdx, shoulder, wrist) {
  const oppositeIdx = primaryIdx === 13 ? 14 : 13;
  const primary = lm[primaryIdx];
  const opposite = lm[oppositeIdx];

  if (primary && primary.visibility > 0.25) return primary;

  if (opposite && opposite.visibility > 0.25) {
    return { ...opposite, x: 1 - opposite.x };
  }

  // Fallback geometrico: calcolo del punto medio sul vettore spalla-polso
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

// ── GESTIONE EVENTI TEMPORALI (TIMEOUT) ────────────────────────────────────────
/**
 * Azzera forzatamente la Macchina a Stati in caso di stallo prolungato.
 * Interviene se l'atleta interrompe la ripetizione a metà senza completarla
 * per più di 5 secondi, evitando "deadlock" logici.
 */
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

// ── RILEVAMENTO INVERSIONE CINEMATICA ──────────────────────────────────────────
/**
 * Rileva il punto di flesso della curva cinematica (transizione Eccentrica -> Concentrica).
 * Utilizza un buffer logico a finestra temporale per assorbire micro-movimenti 
 * e individuare la reale spinta attiva.
 * * @param {Object} state - Lo stato corrente contenente la history degli angoli.
 * @param {number} currentAngle - Angolo al frame attuale.
 * @returns {boolean} True se l'angolo sta aumentando stabilmente.
 */
function checkAscent(state, currentAngle) {
  state.lastAngleHistory.push(currentAngle);

  // Mantenimento degli ultimi 5 frame (memoria di circa 80-150ms a 30-60fps)
  if (state.lastAngleHistory.length > 5) {
    state.lastAngleHistory.shift();
  }

  const oldestAngle = state.lastAngleHistory[0];

  // La transizione in risalita è confermata solo se il delta è superiore a +2°
  return currentAngle > oldestAngle + 2;
}

/**
 * Gestore dell'occlusione visiva prolungata.
 * Permette tolleranza a brevi blackout (es. persone che passano davanti al sensore),
 * ma forza il reset (NO_REP) se il blackout dura più di 1 secondo durante un'alzata attiva.
 */
function handleOcclusion(state, exercise) {
  if (!state.occludedSince) {
    state.occludedSince = Date.now();
    return { occluded: true, shouldReset: false };
  }
  if (Date.now() - state.occludedSince > 1000 && state.movementState !== 'STANDING') {
    return { occluded: true, shouldReset: true };
  }
  return { occluded: true, shouldReset: false };
}

// ── MOTORI DI INFERENZA: SQUAT ─────────────────────────────────────────────────
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
        event: null, // Scelta UX: Errore logico invalidante, ma non conteggiato come fallo dell'atleta
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

  /**
   * Validazione IPFsul parallelo: la piega dell'anca (hip) deve superare
   * il piano orizzontale passante per la sommità del ginocchio (knee).
   * Viene tollerato l'offset geometrico del marker MediaPipe (0.005 su asse Y).
   */
  const checkDepth = () => {
    if (lm[hip].y > lm[knee].y + 0.005 || kneeAngle < cfg.bottomKnee - 2) {
      m.deepEnough = true;
    }
  };

  // Evoluzione Macchina a Stati (FSM)
  if (state.movementState === 'STANDING') {
    if (kneeAngle < cfg.topKnee - 25) {
      state.movementState = 'DESCENDING';
      m.deepEnough = false;
      state.lastAngleHistory = [];
    }
  }
  else if (state.movementState === 'DESCENDING') {
    checkDepth(); // Monitoraggio della profondità
    if (checkAscent(state, kneeAngle)) state.movementState = 'ASCENDING';
  }
  else if (state.movementState === 'ASCENDING') {
    checkDepth(); // Intercettazione del "rimbalzo in buca"

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

// ── MOTORI DI INFERENZA: STACCO DA TERRA (DEADLIFT) ────────────────────────────
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
        event: null,
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

  const isErect = kneeAngle > cfg.erectKnee && hipAngle > cfg.erectHip; // Posizione di chiusura (Lockout)
  const wristVisible = lm[wrist] && lm[wrist].visibility > 0.25;
  const wristY = wristVisible ? lm[wrist].y : lm[hip].y + 0.3; // Stima se il bilanciere nasconde il polso

  let event = null;

  // Evoluzione FSM Deadlift
  if (state.movementState === 'STANDING' || state.movementState === 'DROPPING') {
    if (!isErect && wristY > cfg.setupWristY) {
      state.movementState = 'SETUP';
      m.minWristY = wristY;
    }
  }
  else if (state.movementState === 'SETUP') {
    m.minWristY = Math.max(m.minWristY, wristY); // Tracciamento dinamico del punto più basso prima della tirata
    if (wristY < m.minWristY - cfg.liftThreshold) {
      state.movementState = 'LIFTING';
      m.maxWristYDuringLift = wristY;
      state.lastAngleHistory = [];
    }
  }
  else if (state.movementState === 'LIFTING') {
    // Controllo invalidazione: Il bilanciere non deve mai abbassarsi durante la salita (IPF rule)
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

    // Aggiornamento della Y minima (più alta nello spazio) raggiunta dal bilanciere
    m.maxWristYDuringLift = Math.min(m.maxWristYDuringLift ?? wristY, wristY);

    if (isErect) {
      event = { type: 'VALID_REP', faults: [] };
      state.movementState = 'LOCKED';
      m.maxWristYDuringLift = null;
    }
  }
  else if (state.movementState === 'LOCKED') {
    // Il peso viene riaccompagnato a terra
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

// ── MOTORI DI INFERENZA: MILITARY PRESS (OVERHEAD PRESS) ───────────────────────
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
        event: null,
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

  // Costruzione vettore verticale ideale per l'analisi del tilt lombare (Lean)
  const vertical = {
    x: lm[shoulderIdx].x,
    y: lm[shoulderIdx].y - 0.1, // Offset di proiezione asse Y
    z: lm[shoulderIdx].z || 0,
  };
  const rawTrunk = calculateAngle(vertical, lm[shoulderIdx], lm[hip]);
  state.smoothedSecondary = smoothAngle(state.smoothedSecondary, rawTrunk);
  const trunkAngle = state.smoothedSecondary;

  const rawKnee = calculateAngle(lm[hip], lm[knee], lm[ankle]);
  const m = state.metrics;

  // Calcolo delta per rilevazione cheating di spinta con arti inferiori
  const kneeBend = m.startKneeAngle === null ? 0 : m.startKneeAngle - rawKnee;

  let event = null;

  // Evoluzione FSM OHP
  if (state.movementState === 'STANDING') {
    if (elbowAngle > cfg.topElbow) m.lockedAtStart = true;

    // Taratura angolare di partenza del ginocchio per rilevamento falli
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

    // Analisi compensi biomeccanici
    if (trunkAngle > cfg.maxTrunkLean) m.faults.add('Iperlordosi lombare');
    if (kneeBend > cfg.maxKneeBend) m.faults.add('Uso delle gambe (Push press)');

    if (checkAscent(state, elbowAngle)) state.movementState = 'ASCENDING';
  }
  else if (state.movementState === 'ASCENDING') {
    if (trunkAngle > cfg.maxTrunkLean) m.faults.add('Iperlordosi lombare');
    if (kneeBend > cfg.maxKneeBend) m.faults.add('Uso delle gambe (Push press)');

    // Raggiungimento lockout dell'omero
    if (elbowAngle > cfg.topElbow) {
      if (!m.deepEnough) m.faults.add('Range di movimento incompleto');

      event = m.faults.size === 0
        ? { type: 'VALID_REP', faults: [] }
        : { type: 'NO_REP', faults: Array.from(m.faults) };

      state.movementState = 'STANDING';
      m.deepEnough = false;
      m.faults = new Set();
      m.startKneeAngle = rawKnee; // Retaratura ginocchia per la rip successiva
      state.lastAngleHistory = [];
    }
  }

  state.lastAngle = elbowAngle;
  return {
    state, event,
    primaryAngle: elbowAngle,
    secondaryAngle: trunkAngle,
    isTarget: elbowAngle > cfg.topElbow, // Cambia il colore del marker a lockout raggiunto
  };
}

// ── DISPATCHER CENTRALE ────────────────────────────────────────────────────────
/**
 * Instrada il pacchetto di coordinate generato da MediaPipe al motore di 
 * inferenza corretto in base all'esercizio selezionato dall'utente.
 * * @param {string} exercise - Nome dell'esercizio in esecuzione.
 * @param {Object} state - Stato logico corrente della Macchina.
 * @param {Array} landmarks - Vettore dati grezzi (x,y,z) del frame corrente.
 * @param {string} side - 'LEFT' o 'RIGHT' (lato di acquisizione).
 * @returns {Object} Struttura di risposta contenente stato aggiornato ed eventuali trigger d'evento.
 */
export function processFrame(exercise, state, landmarks, side) {
  if (exercise === 'SQUAT') return processSquat(state, landmarks, side);
  if (exercise === 'DEADLIFT') return processDeadlift(state, landmarks, side);
  if (exercise === 'OVERHEAD_PRESS') return processOverheadPress(state, landmarks, side);

  // Ritorno di sicurezza
  return { state, event: null };
}