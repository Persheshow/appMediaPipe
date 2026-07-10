/**
 * @file usePose.js
 * @description Hook custom React per l'integrazione del modello di Computer Vision MediaPipe.
 * Gestisce l'acquisizione del flusso video, l'allocazione in memoria della rete neurale (WASM),
 * l'elaborazione frame-by-frame (inferenza) con auto-rilevamento del lato corporeo,
 * e la sincronizzazione con la logica di validazione cinematica.
 */

import { useEffect, useRef, useState } from 'react';
import { PoseLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import { processFrame, createInitialState } from '../logic/repLogic';
import { EXERCISES, SKELETON_COLORS } from '../config/exercises';

export function usePose(exercise, isActive, facingMode, onNewLog) {
  // ── RIFERIMENTI MUTABILI (REFS) ────────────────────────────────────────────
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const landmarkerRef = useRef(null);
  const animFrameRef = useRef(null);
  const repStateRef = useRef(createInitialState());
  const isLoadingRef = useRef(true);
  const prevAnglesRef = useRef({ primary: null, secondary: null });
  const noLandmarkFrames = useRef(0);
  const lastVideoTimeRef = useRef(-1);

  // ── STATO REATTIVO DELL'INTERFACCIA (STATE) ─────────────────────────────────
  const [isLoading, setIsLoading] = useState(true);
  const [isTrackingLost, setIsTrackingLost] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState('Inizializzazione Modello...');
  const [error, setError] = useState(null);
  const [validReps, setValidReps] = useState(0);
  const [noReps, setNoReps] = useState(0);
  const [faults, setFaults] = useState([]);
  const [angles, setAngles] = useState({ primary: null, secondary: null });

  // ── RESET DEI CONTATORI LOCALI ──────────────────────────────────────────────
  useEffect(() => {
    repStateRef.current = createInitialState();
    prevAnglesRef.current = { primary: null, secondary: null };
    noLandmarkFrames.current = 0;
    setValidReps(0);
    setNoReps(0);
    setFaults([]);
    setAngles({ primary: null, secondary: null });
    setIsTrackingLost(false);
  }, [exercise, isActive, facingMode]);

  // ── INIZIALIZZAZIONE DELLA RETE NEURALE ─────────────────────────────────────
  useEffect(() => {
    let isMounted = true;
    async function loadModel() {
      try {
        const vision = await FilesetResolver.forVisionTasks('/wasm');
        const landmarker = await PoseLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: '/models/pose_landmarker_lite.task',
            delegate: 'GPU',
          },
          runningMode: 'VIDEO',
          numPoses: 1,
        });
        if (isMounted) { landmarkerRef.current = landmarker; }
        else { landmarker.close(); }
      } catch (err) {
        if (isMounted) setError('Errore caricamento modello: ' + err.message);
      }
    }
    loadModel();
    return () => {
      isMounted = false;
      if (landmarkerRef.current) {
        landmarkerRef.current.close();
        landmarkerRef.current = null;
      }
    };
  }, []);

  // ── ACQUISIZIONE FLUSSO VIDEO ───────────────────────────────────────────────
  useEffect(() => {
    if (!isActive) return;
    const videoElement = videoRef.current;
    async function startCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: facingMode },
          audio: false,
        });
        if (videoElement) {
          videoElement.srcObject = stream;
          videoElement.onloadedmetadata = () => videoElement.play();
        }
      } catch (err) {
        setError('Impossibile accedere al sensore ottico: ' + err.message);
      }
    }
    startCamera();

    return () => {
      if (videoElement?.srcObject) {
        videoElement.srcObject.getTracks().forEach(t => t.stop());
        videoElement.srcObject = null;
      }
    };
  }, [isActive, facingMode]);

  // ── PIPELINE DI ELABORAZIONE (MAIN LOOP) ────────────────────────────────────
  useEffect(() => {
    if (!isActive) return;

    function detectCameraSide(landmarks) {
      const leftVis = landmarks[11].visibility + landmarks[23].visibility + landmarks[25].visibility;
      const rightVis = landmarks[12].visibility + landmarks[24].visibility + landmarks[26].visibility;
      const leftZ = landmarks[11].z + landmarks[23].z + landmarks[25].z;
      const rightZ = landmarks[12].z + landmarks[24].z + landmarks[26].z;

      if (leftVis > rightVis + 0.2 && leftZ < rightZ) return 'LEFT';
      if (rightVis > leftVis + 0.2 && rightZ < leftZ) return 'RIGHT';
      return leftVis >= rightVis ? 'LEFT' : 'RIGHT';
    }

    /**
     * @function drawSkeleton
     * @description Renderizza gli overlay di tracciamento sul canvas HTML.
     * Accetta la "progress" per il rendering in tempo reale della profondità dello squat.
     */
    function drawSkeleton(ctx, landmarks, w, h, isTargetReached, side, ex, progress) {
      let color = SKELETON_COLORS.active;

      if (repStateRef.current.metrics.faults?.size > 0) {
        color = SKELETON_COLORS.warning;
      } else if (isTargetReached) {
        color = SKELETON_COLORS.target;
      }

      // 1. Spessore linee dell'esoscheletro assottigliato (da 5 a 2)
      ctx.lineWidth = 2;
      ctx.strokeStyle = color;

      const lmConfig = EXERCISES[ex]?.landmarks[side];
      if (!lmConfig) return;

      const baseConnections = [[lmConfig.shoulder, lmConfig.hip], [lmConfig.hip, lmConfig.knee], [lmConfig.knee, lmConfig.ankle]];
      const armConnections = (ex === 'OVERHEAD_PRESS' || ex === 'DEADLIFT') && lmConfig.elbow
        ? [[lmConfig.shoulder, lmConfig.elbow], [lmConfig.elbow, lmConfig.wrist]] : [];

      [...baseConnections, ...armConnections].forEach(([s, e]) => {
        if (s === undefined || e === undefined) return;
        const p1 = landmarks[s], p2 = landmarks[e];
        if (p1 && p2 && p1.visibility > 0.4 && p2.visibility > 0.4) {
          ctx.beginPath(); ctx.moveTo(p1.x * w, p1.y * h); ctx.lineTo(p2.x * w, p2.y * h); ctx.stroke();
        }
      });

      // 2. Disegno ESCLUSIVO del punto all'anca (hip) rosso -> verde
      const hipPoint = landmarks[lmConfig.hip];
      if (hipPoint && hipPoint.visibility > 0.4) {
        ctx.beginPath();
        // Colore rosso puro di base (non raggiunto), Verde brillante (00ff88) se sotto il parallelo
        ctx.fillStyle = isTargetReached ? '#00ff88' : '#ef4444';
        ctx.arc(hipPoint.x * w, hipPoint.y * h, 6, 0, 2 * Math.PI);
        ctx.fill();
        // Bordo bianco per risaltare sul corpo
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#ffffff';
        ctx.stroke();
      }

      // Overlays specifici per lo SQUAT
      if (ex === 'SQUAT') {
        const kneePoint = landmarks[lmConfig.knee];

        // 3. Linea tratteggiata verde in corrispondenza del ginocchio (Il Parallelo)
        if (kneePoint && kneePoint.visibility > 0.4) {
          const kneeY = kneePoint.y * h;
          ctx.beginPath();
          ctx.setLineDash([8, 6]); // Attiva tratteggio
          ctx.moveTo(0, kneeY);
          ctx.lineTo(w, kneeY);
          ctx.lineWidth = 2;
          ctx.strokeStyle = '#00ff88'; // Verde acceso per evidenziare il limite
          ctx.stroke();
          ctx.setLineDash([]); // Ripristina tratto continuo per i frame successivi
        }

        // 4. Barra laterale di progressione (Profondità)
        if (progress !== undefined) {
          const barW = 10;
          const barH = h * 0.3; // La barra occupa il 30% dell'altezza verticale
          const barX = w - barW - 15; // 15px di margine dal bordo destro
          const barY = (h - barH) / 2; // Centrata in altezza

          // Costruzione del container della barra
          ctx.fillStyle = 'rgba(255, 255, 255, 0.2)'; // Semitrasparente
          ctx.fillRect(barX, barY, barW, barH);
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 1;
          ctx.strokeRect(barX, barY, barW, barH);

          // Calcolo e riempimento del livello (cresce verso l'alto simulando il superamento della soglia)
          const fillH = (progress / 100) * barH;
          ctx.fillStyle = isTargetReached ? '#00ff88' : '#ef4444';
          ctx.fillRect(barX, barY + barH - fillH, barW, fillH);
        }
      }
    }

    function loop() {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const landmarker = landmarkerRef.current;

      if (video && canvas && landmarker && video.readyState >= 2) {

        if (video.currentTime === lastVideoTimeRef.current) {
          animFrameRef.current = requestAnimationFrame(loop);
          return;
        }
        lastVideoTimeRef.current = video.currentTime;

        const ctx = canvas.getContext('2d');
        if (canvas.width !== video.videoWidth) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
        }

        const results = landmarker.detectForVideo(video, performance.now());
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        if (isLoadingRef.current) {
          setIsLoading(false); isLoadingRef.current = false;
        }

        if (results.landmarks?.length > 0) {
          noLandmarkFrames.current = 0;
          setIsTrackingLost(prev => { if (prev) return false; return prev; });

          const lms = results.landmarks[0];
          const dynamicSide = detectCameraSide(lms);

          // Estrazione della 'progress' dal processo di analisi matematica
          const { state, event, primaryAngle, secondaryAngle, isTarget, progress } = processFrame(
            exercise, repStateRef.current, lms, dynamicSide
          );
          repStateRef.current = state;

          if (
            Math.abs((primaryAngle ?? 0) - (prevAnglesRef.current.primary ?? 0)) > 1 ||
            Math.abs((secondaryAngle ?? 0) - (prevAnglesRef.current.secondary ?? 0)) > 1
          ) {
            setAngles({ primary: primaryAngle, secondary: secondaryAngle });
            prevAnglesRef.current = { primary: primaryAngle, secondary: secondaryAngle };
          }

          if (event?.type === 'VALID_REP' || event?.type === 'NO_REP') {
            const isValida = event.type === 'VALID_REP';

            if (isValida) { setValidReps(prev => prev + 1); setFaults([]); }
            else { setNoReps(prev => prev + 1); setFaults(event.faults); }

            const timestamp = new Date();

            if (onNewLog) {
              onNewLog({
                timestamp: timestamp.toISOString(),
                time: timestamp.toLocaleTimeString('it-IT', { hour12: false }),
                ex: exercise,
                side: dynamicSide,
                esito: event.type,
                primaryAngle: primaryAngle === null ? '' : Math.round(primaryAngle),
                finalState: state.movementState,
                errori: event.faults?.length ? event.faults.join(' - ') : 'Nessuno',
              });
            }
          }

          // Passaggio della progress calcolata alla pipeline grafica
          drawSkeleton(ctx, lms, canvas.width, canvas.height, isTarget, dynamicSide, exercise, progress);

        } else {
          noLandmarkFrames.current++;
          if (noLandmarkFrames.current > 30) {
            setIsTrackingLost(prev => { if (!prev) return true; return prev; });
          }
        }
      }
      animFrameRef.current = requestAnimationFrame(loop);
    }

    animFrameRef.current = requestAnimationFrame(loop);
    return () => { if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current); };
  }, [exercise, isActive, facingMode]);

  function reset() {
    repStateRef.current = createInitialState();
    prevAnglesRef.current = { primary: null, secondary: null };
    noLandmarkFrames.current = 0;
    setValidReps(0);
    setNoReps(0);
    setFaults([]);
    setAngles({ primary: null, secondary: null });
    setIsTrackingLost(false);
  }

  return { videoRef, canvasRef, isLoading, isTrackingLost, loadingMsg, error, validReps, noReps, faults, angles, reset };
}