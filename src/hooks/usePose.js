import { useEffect, useRef, useState } from 'react';
import { PoseLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import { processFrame, createInitialState } from '../logic/repLogic';

export function usePose(exercise) {
  // ── REFS ──────────────────────────────────────────────────────────────────
  const videoRef         = useRef(null);
  const canvasRef        = useRef(null);
  const landmarkerRef    = useRef(null);
  const animFrameRef     = useRef(null);
  const repStateRef      = useRef(createInitialState());

  // ── STATE ─────────────────────────────────────────────────────────────────
  const [isLoading, setIsLoading]   = useState(true);
  const [error, setError]           = useState(null);
  const [validReps, setValidReps]   = useState(0);
  const [noReps, setNoReps]         = useState(0);
  const [faults, setFaults]         = useState([]);
  const [angles, setAngles]         = useState({ knee: null, hip: null });

  // ── RESET quando cambia esercizio ─────────────────────────────────────────
  useEffect(() => {
    repStateRef.current = createInitialState();
    setValidReps(0);
    setNoReps(0);
    setFaults([]);
    setAngles({ knee: null, hip: null });
  }, [exercise]);

  // ── CARICA MEDIAPIPE ──────────────────────────────────────────────────────
  useEffect(() => {
    async function loadModel() {
      try {
        const vision = await FilesetResolver.forVisionTasks(
          'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm'
        );
        const landmarker = await PoseLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath:
              'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
            delegate: 'GPU',
          },
          runningMode: 'VIDEO',
          numPoses: 1,
        });
        landmarkerRef.current = landmarker;
      } catch (err) {
        setError('Errore caricamento modello: ' + err.message);
      }
    }
    loadModel();
  }, []);

  // ── AVVIA CAMERA ──────────────────────────────────────────────────────────
  useEffect(() => {
    async function startCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'user',
            width:  { ideal: 640 },
            height: { ideal: 480 },
          },
          audio: false,
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.onloadedmetadata = () => {
            videoRef.current.play();
          };
        }
      } catch (err) {
        setError('Impossibile accedere alla fotocamera: ' + err.message);
      }
    }
    startCamera();

    // Cleanup: ferma la camera quando il componente viene smontato
    return () => {
      if (videoRef.current?.srcObject) {
        videoRef.current.srcObject.getTracks().forEach(t => t.stop());
      }
    };
  }, []);

  // ── LOOP PRINCIPALE ───────────────────────────────────────────────────────
  useEffect(() => {
    function drawSkeleton(ctx, landmarks, w, h, isTargetReached) {
      const color = isTargetReached ? '#00ff88' : '#c084fc';
      const connections = [[11, 23], [23, 25], [25, 27], [27, 31]];

      ctx.lineWidth = 5;
      ctx.strokeStyle = color;

      connections.forEach(([s, e]) => {
        const p1 = landmarks[s];
        const p2 = landmarks[e];
        if (p1.visibility > 0.4 && p2.visibility > 0.4) {
          ctx.beginPath();
          ctx.moveTo(p1.x * w, p1.y * h);
          ctx.lineTo(p2.x * w, p2.y * h);
          ctx.stroke();
        }
      });

      [11, 23, 25, 27, 31].forEach(idx => {
        const p = landmarks[idx];
        if (p.visibility > 0.4) {
          ctx.beginPath();
          ctx.fillStyle = isTargetReached ? '#00ff88' : '#ffffff';
          ctx.arc(p.x * w, p.y * h, 6, 0, 2 * Math.PI);
          ctx.fill();
        }
      });
    }

    function loop() {
      const video    = videoRef.current;
      const canvas   = canvasRef.current;
      const landmarker = landmarkerRef.current;

      if (video && canvas && landmarker && video.readyState >= 2) {
        const ctx = canvas.getContext('2d');

        // Sincronizza dimensioni canvas con video
        if (canvas.width !== video.videoWidth) {
          canvas.width  = video.videoWidth;
          canvas.height = video.videoHeight;
        }

        const results = landmarker.detectForVideo(video, performance.now());
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        if (results.landmarks?.length > 0) {
          const lms = results.landmarks[0];

          // Processa la logica rep
          const { state, event, kneeAngle, hipAngle } = processFrame(
            exercise,
            repStateRef.current,
            lms
          );
          repStateRef.current = state;

          // Aggiorna angoli per l'HUD (throttled — non ad ogni frame)
          setAngles({ knee: kneeAngle, hip: hipAngle });

          // Gestisci evento rep
          if (event?.type === 'VALID_REP') {
            setValidReps(prev => prev + 1);
            setFaults([]);
          } else if (event?.type === 'NO_REP') {
            setNoReps(prev => prev + 1);
            setFaults(event.faults);
          }

          // Determina se la posizione target è raggiunta
          const isTarget = exercise === 'SQUAT'
            ? kneeAngle > 160
            : kneeAngle > 165 && hipAngle > 165;

          // Loading completato al primo frame rilevato
          setIsLoading(false);

          drawSkeleton(ctx, lms, canvas.width, canvas.height, isTarget);
        }
      }

      animFrameRef.current = requestAnimationFrame(loop);
    }

    animFrameRef.current = requestAnimationFrame(loop);

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [exercise]);

  // ── RESET MANUALE ─────────────────────────────────────────────────────────
  function reset() {
    repStateRef.current = createInitialState();
    setValidReps(0);
    setNoReps(0);
    setFaults([]);
    setAngles({ knee: null, hip: null });
  }

  return {
    videoRef,
    canvasRef,
    isLoading,
    error,
    validReps,
    noReps,
    faults,
    angles,
    reset,
  };
}