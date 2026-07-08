import { useEffect, useRef, useState } from 'react';
import { PoseLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import { processFrame, createInitialState } from '../logic/repLogic';
import { EXERCISES } from '../config/exercises';

// Aggiunto facingMode come quarto parametro
export function usePose(exercise, isActive, cameraSide, facingMode) {
  // ── REFS ──────────────────────────────────────────────────────────────────
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const landmarkerRef = useRef(null);
  const animFrameRef = useRef(null);
  const repStateRef = useRef(createInitialState());
  const isLoadingRef = useRef(true);
  const prevAnglesRef = useRef({ primary: null, secondary: null });
  const noLandmarkFrames = useRef(0);
  const lastVideoTimeRef = useRef(-1); // Evita inferenze ridondanti

  // ── STATE ─────────────────────────────────────────────────────────────────
  const [isLoading, setIsLoading] = useState(true);
  const [loadingMsg, setLoadingMsg] = useState('Caricamento modello...');
  const [error, setError] = useState(null);
  const [validReps, setValidReps] = useState(0);
  const [noReps, setNoReps] = useState(0);
  const [faults, setFaults] = useState([]);
  const [angles, setAngles] = useState({ primary: null, secondary: null });
  const [sessionLogs, setSessionLogs] = useState([]); // LOG ESPORTAZIONE DATI

  // ── RESET ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    repStateRef.current = createInitialState();
    prevAnglesRef.current = { primary: null, secondary: null };
    noLandmarkFrames.current = 0;
    setValidReps(0);
    setNoReps(0);
    setFaults([]);
    setAngles({ primary: null, secondary: null });
    setSessionLogs([]); // Svuota i log al cambio esercizio, lato o fotocamera
  }, [exercise, isActive, cameraSide, facingMode]); // Aggiunto facingMode

  // ── CARICA MODELLO ────────────────────────────────────────────────────────
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

  // ── AVVIA CAMERA ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isActive) return;
    const videoElement = videoRef.current;
    async function startCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: facingMode, // Usa il parametro dinamico passato da App.jsx
            width: { ideal: 720 },
            height: { ideal: 1280 },
          },
          audio: false,
        });
        if (videoElement) {
          videoElement.srcObject = stream;
          videoElement.onloadedmetadata = () => videoElement.play();
        }
      } catch (err) {
        setError('Impossibile accedere alla fotocamera: ' + err.message);
      }
    }
    startCamera();
    return () => {
      if (videoElement?.srcObject) {
        videoElement.srcObject.getTracks().forEach(t => t.stop());
        videoElement.srcObject = null;
      }
    };
  }, [isActive, facingMode]); // Aggiunto facingMode come dipendenza

  // ── LOOP PRINCIPALE ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!isActive) return;

    function drawSkeleton(ctx, landmarks, w, h, isTargetReached, side, ex) {
      const color = isTargetReached ? '#00ff88' : '#c084fc';
      ctx.lineWidth = 5;
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

      const allNodes = Object.values(lmConfig).filter(v => typeof v === 'number');
      allNodes.forEach(idx => {
        const p = landmarks[idx];
        if (p && p.visibility > 0.4) {
          ctx.beginPath();
          ctx.fillStyle = isTargetReached ? '#00ff88' : '#ffffff';
          ctx.arc(p.x * w, p.y * h, 6, 0, 2 * Math.PI); ctx.fill();
        }
      });
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

        if (results.landmarks?.length > 0) {
          noLandmarkFrames.current = 0;
          if (isLoadingRef.current) {
            setIsLoading(false); setLoadingMsg('Caricamento modello...'); isLoadingRef.current = false;
          }

          const lms = results.landmarks[0];

          const { state, event, primaryAngle, secondaryAngle, isTarget } = processFrame(
            exercise, repStateRef.current, lms, cameraSide
          );
          repStateRef.current = state;

          if (
            Math.abs((primaryAngle ?? 0) - (prevAnglesRef.current.primary ?? 0)) > 1 ||
            Math.abs((secondaryAngle ?? 0) - (prevAnglesRef.current.secondary ?? 0)) > 1
          ) {
            setAngles({ primary: primaryAngle, secondary: secondaryAngle });
            prevAnglesRef.current = { primary: primaryAngle, secondary: secondaryAngle };
          }

          // REGISTRAZIONE EVENTI E LOG CSV
          if (event?.type === 'VALID_REP' || event?.type === 'NO_REP') {
            const isValida = event.type === 'VALID_REP';
            if (isValida) { setValidReps(prev => prev + 1); setFaults([]); }
            else { setNoReps(prev => prev + 1); setFaults(event.faults); }

            const timestamp = new Date();
            setSessionLogs(prev => [
              ...prev,
              {
                timestamp: timestamp.toISOString(),
                time: timestamp.toLocaleTimeString('it-IT', { hour12: false }),
                ex: exercise,
                side: cameraSide,
                esito: event.type,
                primaryAngle: primaryAngle === null ? '' : Math.round(primaryAngle),
                secondaryAngle: secondaryAngle === null ? '' : Math.round(secondaryAngle),
                finalState: state.movementState,
                errori: event.faults?.length ? event.faults.join(' - ') : 'Nessuno',
              }
            ]);
          }

          drawSkeleton(ctx, lms, canvas.width, canvas.height, isTarget, cameraSide, exercise);

        } else {
          noLandmarkFrames.current++;
          if (noLandmarkFrames.current > 30 && !isLoadingRef.current) {
            setIsLoading(true); setLoadingMsg('Corpo non rilevato - inquadra tutto il corpo'); isLoadingRef.current = true;
          }
        }
      }
      animFrameRef.current = requestAnimationFrame(loop);
    }
    animFrameRef.current = requestAnimationFrame(loop);
    return () => { if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current); };
  }, [exercise, isActive, cameraSide, facingMode]); // Aggiunto facingMode

  function reset() {
    repStateRef.current = createInitialState();
    prevAnglesRef.current = { primary: null, secondary: null };
    noLandmarkFrames.current = 0;
    setValidReps(0);
    setNoReps(0);
    setFaults([]);
    setAngles({ primary: null, secondary: null });
    setSessionLogs([]); // Svuota i log al reset
  }

  return { videoRef, canvasRef, isLoading, loadingMsg, error, validReps, noReps, faults, angles, sessionLogs, reset };
}