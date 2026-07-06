import { useEffect, useRef, useState } from 'react';
import { PoseLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import { processFrame, createInitialState } from '../logic/repLogic';

export function usePose(exercise, isActive, cameraSide) {
  const videoRef         = useRef(null);
  const canvasRef        = useRef(null);
  const landmarkerRef    = useRef(null);
  const animFrameRef     = useRef(null);
  const repStateRef      = useRef(createInitialState());

  const [isLoading, setIsLoading]   = useState(false);
  const [error, setError]           = useState(null);
  const [validReps, setValidReps]   = useState(0);
  const [noReps, setNoReps]         = useState(0);
  const [faults, setFaults]         = useState([]);
  const [angles, setAngles]         = useState({ primary: null, secondary: null });

  useEffect(() => {
    repStateRef.current = createInitialState();
    setValidReps(0);
    setNoReps(0);
    setFaults([]);
    setAngles({ primary: null, secondary: null });
  }, [exercise, isActive, cameraSide]);

  useEffect(() => {
    if (!isActive) return;
    let isMounted = true;
    setIsLoading(true);
    setError(null);

    async function loadModel() {
      try {
        const vision = await FilesetResolver.forVisionTasks('/wasm');
        const landmarker = await PoseLandmarker.createFromOptions(vision, {
          baseOptions: { modelAssetPath: '/models/pose_landmarker_lite.task', delegate: 'GPU' },
          runningMode: 'VIDEO',
          numPoses: 1,
        });
        if (isMounted) landmarkerRef.current = landmarker;
        else landmarker.close();
      } catch (err) {
        if (isMounted) setError('Errore caricamento modello: ' + err.message);
      }
    }
    loadModel();

    return () => {
      isMounted = false;
      if (landmarkerRef.current) { landmarkerRef.current.close(); landmarkerRef.current = null; }
    };
  }, [isActive]);

  useEffect(() => {
    if (!isActive) return;
    async function startCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }, audio: false,
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.onloadedmetadata = () => videoRef.current.play();
        }
      } catch (err) { setError('Impossibile accedere alla fotocamera: ' + err.message); }
    }
    startCamera();
    return () => {
      if (videoRef.current?.srcObject) {
        videoRef.current.srcObject.getTracks().forEach(t => t.stop());
        videoRef.current.srcObject = null;
      }
    };
  }, [isActive]);

  useEffect(() => {
    if (!isActive) return;

    function drawSkeleton(ctx, landmarks, w, h, isTargetReached, side, ex) {
      const color = isTargetReached ? '#00ff88' : '#c084fc';
      ctx.lineWidth = 5;
      ctx.strokeStyle = color;

      // Offset magico: 0 per sinistra, 1 per destra.
      const o = side === 'LEFT' ? 0 : 1;
      
      const connections = [
        [11 + o, 23 + o], // Spalla -> Anca
        [23 + o, 25 + o], // Anca -> Ginocchio
        [25 + o, 27 + o]  // Ginocchio -> Caviglia
      ];

      // Aggiungi le braccia per gli esercizi superiori
      if (ex === 'OVERHEAD_PRESS' || ex === 'DEADLIFT') {
        connections.push([11 + o, 13 + o]); // Spalla -> Gomito
        connections.push([13 + o, 15 + o]); // Gomito -> Polso
      }

      connections.forEach(([s, e]) => {
        const p1 = landmarks[s], p2 = landmarks[e];
        if (p1 && p2 && p1.visibility > 0.4 && p2.visibility > 0.4) {
          ctx.beginPath(); ctx.moveTo(p1.x * w, p1.y * h); ctx.lineTo(p2.x * w, p2.y * h); ctx.stroke();
        }
      });

      const nodes = [11+o, 23+o, 25+o, 27+o, 31+o];
      if (ex === 'OVERHEAD_PRESS' || ex === 'DEADLIFT') nodes.push(13+o, 15+o);

      nodes.forEach(idx => {
        const p = landmarks[idx];
        if (p && p.visibility > 0.4) {
          ctx.beginPath();
          ctx.fillStyle = isTargetReached ? '#00ff88' : '#ffffff';
          ctx.arc(p.x * w, p.y * h, 6, 0, 2 * Math.PI);
          ctx.fill();
        }
      });
    }

    function loop() {
      const video = videoRef.current, canvas = canvasRef.current, landmarker = landmarkerRef.current;

      if (video && canvas && landmarker && video.readyState >= 2) {
        const ctx = canvas.getContext('2d');
        if (canvas.width !== video.videoWidth) { canvas.width = video.videoWidth; canvas.height = video.videoHeight; }

        const results = landmarker.detectForVideo(video, performance.now());
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        if (results.landmarks?.length > 0) {
          const lms = results.landmarks[0];
          
          // Passiamo il cameraSide alla logica per i calcoli angolari
          const { state, event, primaryAngle, secondaryAngle } = processFrame(exercise, repStateRef.current, lms, cameraSide);
          repStateRef.current = state;
          setAngles({ primary: primaryAngle, secondary: secondaryAngle });

          if (event?.type === 'VALID_REP') { setValidReps(prev => prev + 1); setFaults([]); } 
          else if (event?.type === 'NO_REP') { setNoReps(prev => prev + 1); setFaults(event.faults); }

          const isTarget = exercise === 'SQUAT' ? primaryAngle > 160 : exercise === 'DEADLIFT' ? primaryAngle > 165 && secondaryAngle > 165 : primaryAngle > 155; 
          setIsLoading(false);

          // Passiamo il cameraSide al canvas per il disegno
          drawSkeleton(ctx, lms, canvas.width, canvas.height, isTarget, cameraSide, exercise);
        }
      }
      animFrameRef.current = requestAnimationFrame(loop);
    }
    animFrameRef.current = requestAnimationFrame(loop);
    return () => { if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current); };
  }, [exercise, isActive, cameraSide]);

  function reset() {
    repStateRef.current = createInitialState();
    setValidReps(0); setNoReps(0); setFaults([]); setAngles({ primary: null, secondary: null });
  }

  return { videoRef, canvasRef, isLoading, error, validReps, noReps, faults, angles, reset };
}