import { useRef, useCallback } from 'react';

export function useVideoRecorder(canvasRef, setIsRecording) {
    const registratoreRef = useRef(null);
    const pezziVideoRef = useRef([]);
    const vuoleSalvareRef = useRef(true);

    const startRecording = useCallback(() => {
        if (!canvasRef.current) return;

        const flusso = canvasRef.current.captureStream(30);
        const opzioni = { mimeType: 'video/webm; codecs=vp9' };

        try {
            registratoreRef.current = new MediaRecorder(flusso, opzioni);
        } catch (e) {
            registratoreRef.current = new MediaRecorder(flusso);
        }

        registratoreRef.current.ondataavailable = (e) => {
            if (e.data && e.data.size > 0) {
                pezziVideoRef.current.push(e.data);
            }
        };

        registratoreRef.current.onstop = () => {
            if (vuoleSalvareRef.current && pezziVideoRef.current.length > 0) {

                const utenteConferma = window.confirm("Vuoi scaricare la registrazione video di questa sessione?");

                if (utenteConferma) {
                    const fileVideo = new Blob(pezziVideoRef.current, { type: 'video/webm' });
                    const linkTemp = URL.createObjectURL(fileVideo);
                    const tagA = document.createElement('a');
                    tagA.style.display = 'none';
                    tagA.href = linkTemp;
                    tagA.download = `analisi_cinematica_${new Date().toISOString().slice(0, 10)}.webm`;

                    document.body.appendChild(tagA);
                    tagA.click();

                    setTimeout(() => {
                        document.body.removeChild(tagA);
                        window.URL.revokeObjectURL(linkTemp);
                    }, 100);
                }
            }

            pezziVideoRef.current = [];
        };

        registratoreRef.current.start();
        setIsRecording(true);
    }, [canvasRef, setIsRecording]);

    const stopRecording = useCallback((salvaVideo = true) => {
        if (registratoreRef.current && registratoreRef.current.state === "recording") {
            vuoleSalvareRef.current = salvaVideo;
            registratoreRef.current.stop();
            setIsRecording(false);
        }
    }, [setIsRecording]);

    return { startRecording, stopRecording };
}