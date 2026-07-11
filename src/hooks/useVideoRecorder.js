/**
 * @file useVideoRecorder.js
 * @description Hook per la cattura e la codifica del flusso Canvas in un file video.
 */
import { useRef, useCallback } from 'react';

export function useVideoRecorder(canvasRef, setIsRecording) {
    const mediaRecorderRef = useRef(null);
    const chunksRef = useRef([]);
    // Nuovo riferimento per decidere se esportare o scartare il file a fine registrazione
    const shouldSaveRef = useRef(true);

    const startRecording = useCallback(() => {
        if (!canvasRef.current) return;

        const stream = canvasRef.current.captureStream(30);
        const options = { mimeType: 'video/webm; codecs=vp9' };

        try {
            mediaRecorderRef.current = new MediaRecorder(stream, options);
        } catch (e) {
            mediaRecorderRef.current = new MediaRecorder(stream);
        }

        mediaRecorderRef.current.ondataavailable = (e) => {
            if (e.data && e.data.size > 0) {
                chunksRef.current.push(e.data);
            }
        };

        mediaRecorderRef.current.onstop = () => {
            // Controllo condizionale: genera il file scaricabile solo se richiesto esplicitamente
            if (shouldSaveRef.current) {
                const blob = new Blob(chunksRef.current, { type: 'video/webm' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.style.display = 'none';
                a.href = url;
                a.download = `analisi_cinematica_${new Date().toISOString().slice(0, 10)}.webm`;

                document.body.appendChild(a);
                a.click();

                setTimeout(() => {
                    document.body.removeChild(a);
                    window.URL.revokeObjectURL(url);
                }, 100);
            }
            // Svuotamento della memoria (garbage collection) indipendente dal salvataggio
            chunksRef.current = [];
        };

        mediaRecorderRef.current.start();
        setIsRecording(true);
    }, [canvasRef, setIsRecording]);

    /**
     * Ferma l'acquisizione del flusso video.
     * @param {boolean} saveVideo - Se false, interrompe il MediaRecorder distruggendo i frame acquisiti.
     */
    const stopRecording = useCallback((saveVideo = true) => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
            shouldSaveRef.current = saveVideo; // Passaggio dello stato all'evento onstop
            mediaRecorderRef.current.stop();
            setIsRecording(false);
        }
    }, [setIsRecording]);

    return { startRecording, stopRecording };
}