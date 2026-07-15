import { ESERCIZI, SMOOTHING } from '../config/exercises.js';

export function smoothAngle(prev, current) {
  if (prev === null) return current;
  return (current * SMOOTHING.alpha) + (prev * SMOOTHING.beta);
}

export function calculateAngle(a, b, c) {
  const vettoreBA = { x: a.x - b.x, y: a.y - b.y };
  const vettoreBC = { x: c.x - b.x, y: c.y - b.y };

  const prodottoScalare = (vettoreBA.x * vettoreBC.x) + (vettoreBA.y * vettoreBC.y);
  const lunghezzaBA = Math.sqrt(vettoreBA.x * vettoreBA.x + vettoreBA.y * vettoreBA.y);
  const lunghezzaBC = Math.sqrt(vettoreBC.x * vettoreBC.x + vettoreBC.y * vettoreBC.y);

  if (lunghezzaBA === 0 || lunghezzaBC === 0) return 0;

  let cosAngolo = prodottoScalare / (lunghezzaBA * lunghezzaBC);
  cosAngolo = Math.max(-1.0, Math.min(1.0, cosAngolo));

  return (Math.acos(cosAngolo) * 180.0) / Math.PI;
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

function getShoulderLandmark(lm, idxPrincipale, anca) {
  const idxOpposto = idxPrincipale === 11 ? 12 : 11;
  const principale = lm[idxPrincipale];
  const opposto = lm[idxOpposto];
  if (principale && principale.visibility > 0.15) return principale;
  if (opposto && opposto.visibility > 0.15) return { ...opposto, x: 1 - opposto.x };
  return { x: anca.x, y: anca.y - 0.25, visibility: 0.15 };
}

function getElbowLandmark(lm, idxPrincipale, spalla, polso) {
  const idxOpposto = idxPrincipale === 13 ? 14 : 13;
  const principale = lm[idxPrincipale];
  const opposto = lm[idxOpposto];
  if (principale && principale.visibility > 0.15) return principale;
  if (opposto && opposto.visibility > 0.15) return { ...opposto, x: 1 - opposto.x };
  if (spalla && polso) {
    return { x: (spalla.x + polso.x) / 2, y: (spalla.y + polso.y) / 2, visibility: 0.15 };
  }
  return principale;
}

function checkTimeout(stato) {
  const adesso = Date.now();
  if (stato.movementState === 'STANDING') {
    stato.lastActiveTime = adesso;
    return;
  }
  if (adesso - stato.lastActiveTime > 5000) {
    stato.movementState = 'STANDING';
    stato.metrics.deepEnough = false;
    stato.metrics.faults = new Set();
    stato.metrics.lowestKneeAngle = 180;
    stato.metrics.lowestElbowAngle = 180;
    stato.metrics.lowestHipAngle = 180;
    stato.lastAngleHistory = [];
    stato.lastActiveTime = adesso;
  }
}

function checkAscent(stato, angoloAttuale) {
  stato.lastAngleHistory.push(angoloAttuale);
  if (stato.lastAngleHistory.length > 5) {
    stato.lastAngleHistory.shift();
  }
  if (stato.lastAngleHistory.length < 3) return false;

  const angoloPiuVecchio = stato.lastAngleHistory[0];
  return angoloAttuale > angoloPiuVecchio + 3.0;
}

function handleOcclusion(stato) {
  if (!stato.occludedSince) {
    stato.occludedSince = Date.now();
    return { occluded: true, shouldReset: false };
  }
  if (Date.now() - stato.occludedSince > 1000 && stato.movementState !== 'STANDING') {
    return { occluded: true, shouldReset: true };
  }
  return { occluded: true, shouldReset: false };
}

export function processSquat(stato, landmarks, lato) {
  const cfg = ESERCIZI.SQUAT.thresholds;
  const { hip, knee, ankle } = ESERCIZI.SQUAT.landmarks[lato];
  const lm = landmarks;
  const adesso = Date.now();

  const visibile = lm[hip]?.visibility > 0.15 && lm[knee]?.visibility > 0.15 && lm[ankle]?.visibility > 0.15;

  if (!visibile) {
    const { shouldReset } = handleOcclusion(stato);
    if (shouldReset) return { state: createInitialState(), event: null, primaryAngle: null, secondaryAngle: null, isTarget: false };
    return { state: stato, event: null, primaryAngle: null, secondaryAngle: null, isTarget: false };
  }
  stato.occludedSince = null;
  checkTimeout(stato);

  const ginocchioGrezzo = calculateAngle(lm[hip], lm[knee], lm[ankle]);
  stato.smoothedPrimary = smoothAngle(stato.smoothedPrimary, ginocchioGrezzo);
  const angoloGinocchio = stato.smoothedPrimary;
  const m = stato.metrics;
  let evento = null;

  if (adesso - stato.startTime < 1000) {
    stato.lastAngle = angoloGinocchio;
    return { state: stato, event: null, primaryAngle: angoloGinocchio, secondaryAngle: stato.smoothedSecondary, isTarget: false };
  }

  if (adesso < m.cooldownUntil) {
    stato.lastAngle = angoloGinocchio;
    return { state: stato, event: null, primaryAngle: angoloGinocchio, secondaryAngle: stato.smoothedSecondary, isTarget: m.deepEnough };
  }

  m.lowestKneeAngle = Math.min(m.lowestKneeAngle ?? 180, angoloGinocchio);

  const controllaProfondita = () => {
    if (angoloGinocchio <= cfg.bottomKnee) m.deepEnough = true;
  };

  if (stato.movementState === 'STANDING') {
    if (angoloGinocchio < cfg.topKnee - 25) {
      stato.movementState = 'DESCENDING';
      m.deepEnough = false;
      m.lowestKneeAngle = angoloGinocchio;
      m.repStartTime = adesso;
      stato.lastAngleHistory = [];
    }
  }
  else if (stato.movementState === 'DESCENDING') {
    controllaProfondita();
    if (checkAscent(stato, angoloGinocchio)) stato.movementState = 'ASCENDING';
  }
  else if (stato.movementState === 'ASCENDING') {
    controllaProfondita();

    if (angoloGinocchio > cfg.topKnee) {
      const durataRep = adesso - m.repStartTime;

      if (m.lowestKneeAngle > cfg.minAttemptKnee || durataRep < 800) {
        stato.movementState = 'STANDING';
        m.deepEnough = false;
        m.lowestKneeAngle = 180;
        stato.lastAngleHistory = [];
        return { state: stato, event: null, primaryAngle: angoloGinocchio, secondaryAngle: stato.smoothedSecondary, isTarget: false };
      }

      evento = m.deepEnough
        ? { type: 'VALID_REP', faults: [] }
        : { type: 'NO_REP', faults: ['Mancato superamento del parallelo'] };

      stato.movementState = 'STANDING';
      m.deepEnough = false;
      m.lowestKneeAngle = 180;
      stato.lastAngleHistory = [];
      m.cooldownUntil = adesso + 2000;
    }
  }

  stato.lastAngle = angoloGinocchio;
  return { state: stato, event: evento, primaryAngle: angoloGinocchio, secondaryAngle: stato.smoothedSecondary, isTarget: m.deepEnough };
}

export function processDeadlift(stato, landmarks, lato) {
  const cfg = ESERCIZI.DEADLIFT.thresholds;
  const { shoulder: idxSpalla, hip, knee, ankle, wrist } = ESERCIZI.DEADLIFT.landmarks[lato];
  const lm = landmarks;
  const adesso = Date.now();

  const visibile = lm[hip]?.visibility > 0.15 && lm[knee]?.visibility > 0.15;

  if (!visibile) {
    const { shouldReset } = handleOcclusion(stato);
    if (shouldReset) return { state: createInitialState(), event: null, primaryAngle: null, secondaryAngle: null, isTarget: false };
    return { state: stato, event: null, primaryAngle: null, secondaryAngle: null, isTarget: false };
  }
  stato.occludedSince = null;
  checkTimeout(stato);

  const spallaLm = getShoulderLandmark(lm, idxSpalla, lm[hip]);
  const ginocchioGrezzo = calculateAngle(lm[hip], lm[knee], lm[ankle]);
  const ancaGrezza = calculateAngle(spallaLm, lm[hip], lm[knee]);

  stato.smoothedPrimary = smoothAngle(stato.smoothedPrimary, ancaGrezza);
  stato.smoothedSecondary = smoothAngle(stato.smoothedSecondary, ginocchioGrezzo);

  const angoloAnca = stato.smoothedPrimary;
  const angoloGinocchio = stato.smoothedSecondary;
  const m = stato.metrics;

  const eretto = angoloGinocchio > cfg.erectKnee && angoloAnca > cfg.erectHip;
  const polsoVisibile = lm[wrist] && lm[wrist].visibility > 0.15;
  const yPolso = polsoVisibile ? lm[wrist].y : lm[hip].y + 0.3;

  let evento = null;

  if (adesso - stato.startTime < 1000) {
    stato.lastAngle = angoloAnca;
    return { state: stato, event: null, primaryAngle: angoloAnca, secondaryAngle: angoloGinocchio, isTarget: eretto };
  }

  if (adesso < m.cooldownUntil) {
    stato.lastAngle = angoloAnca;
    return { state: stato, event: null, primaryAngle: angoloAnca, secondaryAngle: angoloGinocchio, isTarget: eretto };
  }

  m.lowestHipAngle = Math.min(m.lowestHipAngle ?? 180, angoloAnca);

  if (stato.movementState === 'STANDING' || stato.movementState === 'DROPPING') {
    if (!eretto && yPolso > cfg.setupWristY) {
      stato.movementState = 'SETUP';
      m.minWristY = yPolso;
      m.lowestHipAngle = angoloAnca;
      m.repStartTime = adesso;
    }
  }
  else if (stato.movementState === 'SETUP') {
    m.minWristY = Math.max(m.minWristY, yPolso);
    if (yPolso < m.minWristY - cfg.liftThreshold) {
      stato.movementState = 'LIFTING';
      m.maxWristYDuringLift = yPolso;
      stato.lastAngleHistory = [];
    }
  }
  else if (stato.movementState === 'LIFTING') {
    if (m.maxWristYDuringLift !== null && yPolso > m.maxWristYDuringLift + cfg.maxWristDropDuringLift) {
      const statoNuovo = createInitialState();
      statoNuovo.metrics.cooldownUntil = adesso + 2000;
      return {
        state: statoNuovo,
        event: { type: 'NO_REP', faults: ['Discesa del bilanciere durante la tirata'] },
        primaryAngle: angoloAnca, secondaryAngle: angoloGinocchio, isTarget: false,
      };
    }

    m.maxWristYDuringLift = Math.min(m.maxWristYDuringLift ?? yPolso, yPolso);

    if (eretto) {
      const durataRep = adesso - m.repStartTime;

      if (m.lowestHipAngle > cfg.minAttemptHip || durataRep < 800) {
        stato.movementState = 'STANDING';
        m.lowestHipAngle = 180;
        m.maxWristYDuringLift = null;
        return { state: stato, event: null, primaryAngle: angoloAnca, secondaryAngle: angoloGinocchio, isTarget: eretto };
      }

      evento = { type: 'VALID_REP', faults: [] };
      stato.movementState = 'LOCKED';
      m.maxWristYDuringLift = null;
      m.lowestHipAngle = 180;
      m.cooldownUntil = adesso + 2000;
    }
  }
  else if (stato.movementState === 'LOCKED') {
    if (!eretto && yPolso > m.minWristY + cfg.dropThreshold) {
      stato.movementState = 'DROPPING';
    }
  }

  stato.lastAngle = angoloAnca;
  return { state: stato, event: evento, primaryAngle: angoloAnca, secondaryAngle: angoloGinocchio, isTarget: eretto };
}

export function processOverheadPress(stato, landmarks, lato) {
  const cfg = ESERCIZI.OVERHEAD_PRESS.thresholds;
  const { shoulder: idxSpalla, elbow: idxGomito, wrist, hip, knee, ankle } = ESERCIZI.OVERHEAD_PRESS.landmarks[lato];
  const lm = landmarks;
  const adesso = Date.now();

  const visibile = lm[idxSpalla]?.visibility > 0.15 && lm[hip]?.visibility > 0.15 && lm[knee]?.visibility > 0.15 && lm[ankle]?.visibility > 0.15;

  if (!visibile) {
    const { shouldReset } = handleOcclusion(stato);
    if (shouldReset) return { state: createInitialState(), event: null, primaryAngle: null, secondaryAngle: null, isTarget: false };
    return { state: stato, event: null, primaryAngle: null, secondaryAngle: null, isTarget: false };
  }
  stato.occludedSince = null;
  checkTimeout(stato);

  const gomitoLm = getElbowLandmark(lm, idxGomito, lm[idxSpalla], lm[wrist]);
  const gomitoGrezzo = calculateAngle(lm[idxSpalla], gomitoLm, lm[wrist]);
  stato.smoothedPrimary = smoothAngle(stato.smoothedPrimary, gomitoGrezzo);
  const angoloGomito = stato.smoothedPrimary;

  const verticale = { x: lm[idxSpalla].x, y: lm[idxSpalla].y - 0.1 };
  const troncoGrezzo = calculateAngle(verticale, lm[idxSpalla], lm[hip]);
  stato.smoothedSecondary = smoothAngle(stato.smoothedSecondary, troncoGrezzo);
  const angoloTronco = stato.smoothedSecondary;

  const ginocchioGrezzo = calculateAngle(lm[hip], lm[knee], lm[ankle]);
  const m = stato.metrics;

  const piegaGinocchio = m.startKneeAngle === null ? 0 : m.startKneeAngle - ginocchioGrezzo;
  let evento = null;

  if (adesso - stato.startTime < 1000) {
    stato.lastAngle = angoloGomito;
    return { state: stato, event: null, primaryAngle: angoloGomito, secondaryAngle: angoloTronco, isTarget: false };
  }

  if (adesso < m.cooldownUntil) {
    stato.lastAngle = angoloGomito;
    return { state: stato, event: null, primaryAngle: angoloGomito, secondaryAngle: angoloTronco, isTarget: angoloGomito > cfg.topElbow };
  }

  m.lowestElbowAngle = Math.min(m.lowestElbowAngle ?? 180, angoloGomito);

  if (stato.movementState === 'STANDING') {
    if (angoloGomito > cfg.topElbow) m.lockedAtStart = true;
    if (m.startKneeAngle === null || angoloGomito > cfg.topElbow) m.startKneeAngle = ginocchioGrezzo;

    if (angoloGomito < 140) {
      stato.movementState = 'DESCENDING';
      m.deepEnough = false;
      m.faults = new Set();
      m.lowestElbowAngle = angoloGomito;
      m.repStartTime = adesso;
      stato.lastAngleHistory = [];
    }
  }
  else if (stato.movementState === 'DESCENDING') {
    if (angoloGomito < cfg.bottomElbow) m.deepEnough = true;

    if (angoloTronco > cfg.maxTrunkLean) m.faults.add('Iperlordosi lombare');
    if (piegaGinocchio > cfg.maxKneeBend) m.faults.add('Uso delle gambe (Push press)');

    if (checkAscent(stato, angoloGomito)) stato.movementState = 'ASCENDING';
  }
  else if (stato.movementState === 'ASCENDING') {
    if (angoloTronco > cfg.maxTrunkLean) m.faults.add('Iperlordosi lombare');
    if (piegaGinocchio > cfg.maxKneeBend) m.faults.add('Uso delle gambe (Push press)');

    if (angoloGomito > cfg.topElbow) {
      const durataRep = adesso - m.repStartTime;

      if (m.lowestElbowAngle > cfg.minAttemptElbow || durataRep < 800) {
        stato.movementState = 'STANDING';
        m.deepEnough = false;
        m.faults = new Set();
        m.startKneeAngle = ginocchioGrezzo;
        m.lowestElbowAngle = 180;
        stato.lastAngleHistory = [];
        return { state: stato, event: null, primaryAngle: angoloGomito, secondaryAngle: angoloTronco, isTarget: false };
      }

      if (!m.deepEnough) m.faults.add('Range di movimento incompleto');

      evento = m.faults.size === 0
        ? { type: 'VALID_REP', faults: [] }
        : { type: 'NO_REP', faults: Array.from(m.faults) };

      stato.movementState = 'STANDING';
      m.deepEnough = false;
      m.faults = new Set();
      m.startKneeAngle = ginocchioGrezzo;
      m.lowestElbowAngle = 180;
      stato.lastAngleHistory = [];
      m.cooldownUntil = adesso + 2000;
    }
  }

  stato.lastAngle = angoloGomito;
  return { state: stato, event: evento, primaryAngle: angoloGomito, secondaryAngle: angoloTronco, isTarget: angoloGomito > cfg.topElbow };
}

export function processFrame(esercizio, stato, landmarks, lato) {
  if (esercizio === 'SQUAT') return processSquat(stato, landmarks, lato);
  if (esercizio === 'DEADLIFT') return processDeadlift(stato, landmarks, lato);
  if (esercizio === 'OVERHEAD_PRESS') return processOverheadPress(stato, landmarks, lato);
  return { state: stato, event: null };
}