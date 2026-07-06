import { useEffect, useRef, useState } from 'react';
import { PoseLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import { processFrame, createInitialState } from '../logic/repLogic';

export function usePose(exercise, isActive) {
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

  // Reset automatico quando cambia esercizio o si ferma/avvia la fotocamera
  useEffect(() => {
    repStateRef.current = createInitialState();
    setValidReps(0);
    setNoReps(0);
    setFaults([]);
    setAngles({ primary: null, secondary: null });
  }, [exercise, isActive]);

  // ── CARICA MEDIAPIPE (OFFLINE MODE) ───────────────────────────────────────
  useEffect(() => {
    if (!isActive) return;

    let isMounted = true;
    setIsLoading(true);
    setError(null);

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

        if (isMounted) {
          landmarkerRef.current = landmarker;
        } else {
          landmarker.close();
        }
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
  }, [isActive]);

  // ── AVVIA CAMERA ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isActive) return;

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

    return () => {
      if (videoRef.current?.srcObject) {
        videoRef.current.srcObject.getTracks().forEach(t => t.stop());
        videoRef.current.srcObject = null;
      }
    };
  }, [isActive]);

  // ── LOOP PRINCIPALE ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!isActive) return;

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

        if (canvas.width !== video.videoWidth) {
          canvas.width  = video.videoWidth;
          canvas.height = video.videoHeight;
        }

        const results = landmarker.detectForVideo(video, performance.now());
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        if (results.landmarks?.length > 0) {
          const lms = results.landmarks[0];

          const { state, event, primaryAngle, secondaryAngle } = processFrame(
            exercise,
            repStateRef.current,
            lms
          );
          repStateRef.current = state;

          setAngles({ primary: primaryAngle, secondary: secondaryAngle });

          if (event?.type === 'VALID_REP') {
            setValidReps(prev => prev + 1);
            setFaults([]);
          } else if (event?.type === 'NO_REP') {
            setNoReps(prev => prev + 1);
            setFaults(event.faults);
          }

          const isTarget = exercise === 'SQUAT'
            ? primaryAngle > 160
            : exercise === 'DEADLIFT' 
              ? primaryAngle > 165 && secondaryAngle > 165
              : primaryAngle > 155; 

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
  }, [exercise, isActive]);

  function reset() {
    repStateRef.current = createInitialState();
    setValidReps(0);
    setNoReps(0);
    setFaults([]);
    setAngles({ primary: null, secondary: null });
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