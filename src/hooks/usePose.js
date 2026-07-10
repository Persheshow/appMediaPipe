/**
 * @file usePose.js
 * @description Hook custom React per l'integrazione del modello di Computer Vision MediaPipe.
 */

import { useEffect, useRef, useState } from 'react';
import { PoseLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import { processFrame, createInitialState } from '../logic/repLogic';
import { drawSkeleton, drawSquatOverlays } from '../utils/canvasRenderer';
import { EXERCISES } from '../config/exercises';

export function usePose(exercise, isActive, facingMode, onNewLog) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const landmarkerRef = useRef(null);
  const animFrameRef = useRef(null);
  const repStateRef = useRef(createInitialState());
  const isLoadingRef = useRef(true);
  const prevAnglesRef = useRef({ primary: null, secondary: null });
  const noLandmarkFrames = useRef(0);
  const lastVideoTimeRef = useRef(-1);
  const smoothedKneeYRef = useRef(null);

  const [isLoading, setIsLoading] = useState(true);
  const [isTrackingLost, setIsTrackingLost] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState('Inizializzazione Modello...');
  const [error, setError] = useState(null);
  const [validReps, setValidReps] = useState(0);
  const [noReps, setNoReps] = useState(0);
  const [faults, setFaults] = useState([]);
  const [angles, setAngles] = useState({ primary: null, secondary: null });

  useEffect(() => {
    repStateRef.current = createInitialState();
    prevAnglesRef.current = { primary: null, secondary: null };
    noLandmarkFrames.current = 0;
    smoothedKneeYRef.current = null;
    setValidReps(0);
    setNoReps(0);
    setFaults([]);
    setAngles({ primary: null, secondary: null });
    setIsTrackingLost(false);
  }, [exercise, isActive, facingMode]);

  useEffect(() => {
    let isMounted = true;
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
      if (landmarkerRef.current) {
        landmarkerRef.current.close();
        landmarkerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!isActive) return;
    const videoElement = videoRef.current;
    async function startCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: facingMode }, audio: false });
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

          // Estrazione aggiuntiva di targetProgress
          const { state, event, primaryAngle, secondaryAngle, isTarget, progress, targetProgress } = processFrame(
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

          drawSkeleton(ctx, lms, canvas.width, canvas.height, isTarget, dynamicSide, exercise, repStateRef.current.metrics.faults?.size);

          if (exercise === 'SQUAT') {
            const kneePoint = lms[EXERCISES.SQUAT.landmarks[dynamicSide].knee];
            // Passaggio di targetProgress al renderer per la tacca verde
            drawSquatOverlays(ctx, canvas.width, canvas.height, kneePoint, progress, targetProgress, isTarget, smoothedKneeYRef);
          }

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
    smoothedKneeYRef.current = null;
    setValidReps(0);
    setNoReps(0);
    setFaults([]);
    setAngles({ primary: null, secondary: null });
    setIsTrackingLost(false);
  }

  return { videoRef, canvasRef, isLoading, isTrackingLost, loadingMsg, error, validReps, noReps, faults, angles, reset };
}