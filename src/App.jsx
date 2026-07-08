/**
 * @file App.jsx
 * @description Modulo principale dell'interfaccia utente per l'analisi cinematica.
 * Configura l'ambiente visivo accademico (Ateneo UniFI), gestisce l'esportazione
 * del dataset strutturato in colonne per software statistici e centralizza il buffer di sessione.
 */

import { useState, useEffect } from 'react';
import { usePose } from './hooks/usePose';
import logoUnifi from './assets/logo_unifi.png';

// ── COSTANTI ──────────────────────────────────────────────────────────────────
const EXERCISE_LABELS = {
  SQUAT: 'Squat',
  DEADLIFT: 'Stacco da terra',
  OVERHEAD_PRESS: 'Pressa militare',
};

export default function App() {
  // ── STATO APPLICAZIONE ──────────────────────────────────────────────────────
  const [exercise, setExercise] = useState('SQUAT');
  const [isActive, setIsActive] = useState(false);
  const [facingMode, setFacingMode] = useState('user'); // 'user' = frontale, 'environment' = posteriore
  const [hasMultipleCameras, setHasMultipleCameras] = useState(false);

  // Buffer locale per lo storico di sessione condiviso e persistente
  const [sessionLogs, setSessionLogs] = useState([]);

  // Rilevazione e scrittura asincrona nel buffer centralizzato
  const handleNewLog = (newLog) => {
    setSessionLogs(prev => [...prev, newLog]);
  };

  // Inizializzazione dell'hook custom (Configurazione semplificata senza cameraSide)
  const { videoRef, canvasRef, isLoading, isTrackingLost, loadingMsg, error, validReps, faults, angles, reset } = usePose(
    exercise, isActive, facingMode, handleNewLog
  );

  const exerciseLabel = EXERCISE_LABELS[exercise];
  const mirrorClass = facingMode === 'user' ? 'scale-x-[-1]' : '';

  // ── GESTIONE TEMPORIZZATA DELL'OVERLAY DI ERRORE ────────────────────────────
  const [visibleFaults, setVisibleFaults] = useState([]);

  useEffect(() => {
    // Se la Macchina a Stati rileva un errore, lo mostriamo e facciamo partire il timer
    if (faults && faults.length > 0) {
      setVisibleFaults(faults);

      const timer = setTimeout(() => {
        setVisibleFaults([]); // Nasconde l'alert dopo 3.5 secondi
      }, 3500);

      // Cleanup: se arriva un nuovo evento prima dello scadere del tempo, cancella il vecchio timer
      return () => clearTimeout(timer);
    } else {
      // Se la ripetizione è valida, nascondiamo immediatamente eventuali errori precedenti
      setVisibleFaults([]);
    }
  }, [faults]);

  // ── EFFETTI HARDWARE ────────────────────────────────────────────────────────
  useEffect(() => {
    /**
     * Interroga l'API per contare i moduli ottici fisici.
     * Gestisce i vincoli di privacy dei sistemi operativi mobili.
     */
    async function checkCameras() {
      // BYPASS MOBILE: Forza la disponibilità multicamera se rileva architettura mobile,
      // aggirando il blocco preventivo dei permessi (Anti-Fingerprinting) dei browser.
      const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
      if (isMobile) {
        setHasMultipleCameras(true);
        return;
      }

      try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return;
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoInputs = devices.filter(device => device.kind === 'videoinput');
        setHasMultipleCameras(videoInputs.length > 1);
      } catch (err) {
        console.error("Errore nell'inizializzazione della fotocamera:", err);
      }
    }
    checkCameras();
  }, []);

  // ── GESTIONE DATI ED ESPORTAZIONE ───────────────────────────────────────────
  /**
   * Genera un tracciato CSV conforme, strutturando i campi in colonne distinte 
   * tramite l'uso del delimitatore ';' e del marcatore UTF-8 BOM.
   */
  const exportCSV = () => {
    const escapeCSV = value => `"${String(value ?? '').replaceAll('"', '""')}"`;
    // Intestazione formale modificata per riflettere il rilevamento automatico del lato
    const headers = ['Ora', 'Esercizio', 'Esito', 'Errori'];

    // Generazione delle righe mappando l'output
    const rows = sessionLogs.map(log => [
      log.time,
      log.ex,
      log.esito,
      log.errori,
    ].map(escapeCSV).join(';')).join('\n');

    // Iniezione del Byte Order Mark (\uFEFF) per l'allineamento automatico delle colonne in Excel
    const csv = `\uFEFF${headers.map(escapeCSV).join(';')}\n${rows}`;
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `dataset_cinematica_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const clearAllHistory = () => {
    setSessionLogs([]);
    reset();
  };

  // ── RENDER COMPONENTE ───────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-white text-[#002f6c] flex flex-col items-center p-4 font-sans selection:bg-[#002f6c] selection:text-white">

      {/* HEADER UNIFI */}
      <header className="w-full max-w-xl text-center flex flex-col items-center my-8">
        <img
          src={logoUnifi}
          alt="Logo Università degli Studi di Firenze"
          className="w-48 h-auto object-contain mb-8"
        />
        <h1 className="text-2xl uppercase tracking-widest leading-tight">
          Analisi cinematica in tempo reale per il riconoscimento
          di ripetizioni valide e non valide tramite MediaPipe
        </h1>
      </header>

      {/* CAMERA INATTIVA*/}
      {!isActive ? (
        <div className="w-full max-w-xl flex flex-col gap-6">

          <div className="bg-white border border-[#002f6c] rounded-none p-6 flex flex-col gap-8">

            {/* SELETTORE ESERCIZIO */}
            <div className="flex flex-col gap-3">
              <h3 className="text-xs uppercase tracking-widest mb-1">Esercizio</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                {Object.entries(EXERCISE_LABELS).map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => setExercise(key)}
                    className={`py-3 px-4 rounded-none text-sm transition-none border ${exercise === key
                      ? 'bg-[#002f6c] text-white border-[#002f6c]'
                      : 'bg-white text-[#002f6c] border-[#002f6c] hover:bg-[#002f6c] hover:text-white'
                      }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* SELETTORE FOTOCAMERA */}
            {hasMultipleCameras && (
              <div className="flex flex-col gap-3">
                <h3 className="text-xs uppercase tracking-widest mb-1">2. Seleziona Fotocamera</h3>
                <div className="flex gap-2">
                  <button
                    onClick={() => setFacingMode('user')}
                    className={`flex-1 py-3 rounded-none text-sm transition-none border ${facingMode === 'user' ? 'bg-[#002f6c] text-white border-[#002f6c]' : 'bg-white text-[#002f6c] border-[#002f6c] hover:bg-[#002f6c] hover:text-white'
                      }`}
                  >
                    Fotocamera Anteriore
                  </button>
                  <button
                    onClick={() => setFacingMode('environment')}
                    className={`flex-1 py-3 rounded-none text-sm transition-none border ${facingMode === 'environment' ? 'bg-[#002f6c] text-white border-[#002f6c]' : 'bg-white text-[#002f6c] border-[#002f6c] hover:bg-[#002f6c] hover:text-white'
                      }`}
                  >
                    Fotocamera Posteriore
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* ISTRUZIONI */}
          <div className="bg-white border border-[#002f6c] rounded-none p-6 flex flex-col gap-3">
            <h3 className="text-xs uppercase tracking-widest">Istruzioni</h3>
            <ul className="list-disc list-outside text-sm space-y-2 ml-4">
              <li>Posizionare il dispositivo al lato del soggetto.</li>
              <li>Assicurarsi che l'intera figura, incluse mani e piedi, siano nell'inquadratura.</li>
              <li>Garantire un elevato contrasto tra il soggetto e lo sfondo.</li>
              <li>Mantenere il dispositivo stabile durante l'intera durata dell'acquisizione.</li>
            </ul>
          </div>

          <button onClick={() => setIsActive(true)} className="w-full py-4 bg-[#002f6c] hover:bg-white hover:text-[#002f6c] border border-[#002f6c] rounded-none text-lg text-white uppercase tracking-widest transition-none">
            Inizia
          </button>
        </div>
      ) : (
        /* CAMERA ATTIVA */
        <div className="w-full max-w-xl flex flex-col items-center">

          {/* DASHBOARD NUMERICA */}
          <section className="w-full bg-white border border-[#002f6c] rounded-none p-4 flex justify-around mb-4">
            <div className="text-center w-1/3">
              <p className="text-[10px] uppercase tracking-widest mb-1">Ripetizioni Valide</p>
              <p className="text-3xl">{validReps}</p>
            </div>
            <div className="w-px bg-[#002f6c] self-stretch" />
            <div className="text-center w-2/3 flex flex-col items-center justify-center">
              <p className="text-[10px] uppercase tracking-widest mb-1">Angolo</p>
              <p className="text-sm font-mono whitespace-pre-line border border-[#002f6c] px-3 py-1.5 rounded-none">
                {exercise === 'SQUAT' && (`Ginocchio: ${angles.primary ? Math.round(angles.primary) : '--'}°`)}
                {exercise === 'DEADLIFT' && (`Anca: ${angles.primary ? Math.round(angles.primary) : '--'}° | Gin: ${angles.secondary ? Math.round(angles.secondary) : '--'}°`)}
                {exercise === 'OVERHEAD_PRESS' && (`Gomito: ${angles.primary ? Math.round(angles.primary) : '--'}° | Tr: ${angles.secondary ? Math.round(angles.secondary) : '--'}°`)}
              </p>
            </div>
          </section>

          {/* INQUADRATURA E OVERLAYS DI STATO */}
          <main className="w-full relative min-h-[50vh] bg-white rounded-none overflow-hidden border border-[#002f6c]">

            {isLoading && !error && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-white z-10">
                <div className="w-8 h-8 border-4 border-[#002f6c] border-t-transparent rounded-none animate-spin" />
                <p className="text-xs text-[#002f6c] mt-4 uppercase tracking-widest">Inizializzazione Modello...</p>
              </div>
            )}

            {error && <div className="absolute inset-0 flex items-center justify-center bg-white p-6 text-center text-sm z-30 border-4 border-[#002f6c] uppercase">{error}</div>}

            <video ref={videoRef} className={`w-full h-auto block ${mirrorClass}`} playsInline muted />
            <canvas ref={canvasRef} className={`absolute top-0 left-0 w-full h-full ${mirrorClass}`} />

            {/* ERROR OVERLAY */}
            {visibleFaults.length > 0 && !isLoading && !error && (
              <div className="absolute top-8 left-1/2 -translate-x-1/2 w-[85%] bg-white border border-[#002f6c] p-2 text-center z-20">
                <p className="text-[10px] text-[#002f6c] uppercase tracking-widest mb-1">Esecuzione non Valida</p>
                <p className="text-xs text-[#002f6c] uppercase tracking-widest">{visibleFaults.join(' • ')}</p>
              </div>
            )}

            {/* TRACKING OVERLAY */}
            {isTrackingLost && !isLoading && !error && (
              <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-[#002f6c] text-white px-5 py-2.5 rounded-none text-xs tracking-widest flex items-center gap-2 border border-[#002f6c] uppercase z-20 w-max max-w-[90%]">
                <span className="w-2 h-2 bg-white rounded-none animate-ping" />
                Corpo Non Rilevato
              </div>
            )}

            {/* BOTTONE FLUTTUANTE: Cambio camera on-the-fly */}
            {hasMultipleCameras && !isLoading && !error && (
              <button
                onClick={() => setFacingMode(prev => prev === 'user' ? 'environment' : 'user')}
                className="absolute bottom-6 right-6 bg-white hover:bg-[#002f6c] hover:text-white border border-[#002f6c] text-[#002f6c] p-3.5 rounded-none z-30 transition-none"
                title="Inverti fotocamera"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
                </svg>
              </button>
            )}
          </main>

          <footer className="w-full mt-6">
            <button onClick={() => setIsActive(false)} className="w-full py-4 bg-white hover:bg-[#002f6c] hover:text-white border border-[#002f6c] rounded-none text-sm uppercase tracking-widest transition-none">
              Indietro
            </button>
          </footer>
        </div>
      )}

      {/* SEZIONE STORICO */}
      {sessionLogs.length > 0 && (
        <div className="w-full max-w-xl flex flex-col gap-6 mt-10 mb-8">

          {/* COMPONENTE REGISTRO */}
          <section className="bg-white border border-[#002f6c] rounded-none overflow-hidden">
            <div className="bg-white border-b border-[#002f6c] px-5 py-4 flex items-center justify-between">
              <h2 className="text-xs uppercase tracking-widest">Registro Acquisizioni</h2>
              <span className="text-[10px] uppercase tracking-wider border border-[#002f6c] px-2.5 py-1 rounded-none">
                TOTALE: {sessionLogs.length}
              </span>
            </div>
            <div className="flex flex-col">
              {sessionLogs.slice(-10).reverse().map((log, index) => (
                <div key={`${log.timestamp}-${index}`} className="flex items-center justify-between px-5 py-3 text-sm border-b border-[#002f6c] last:border-b-0">
                  <div className="flex items-center gap-4">
                    <div className="flex flex-col">
                      <span className="text-[10px] uppercase tracking-widest">
                        {log.time}
                      </span>
                      <span className="uppercase tracking-widest text-xs mt-1">
                        {log.ex === 'SQUAT' ? 'Squat' : log.ex === 'DEADLIFT' ? 'Stacco' : 'Pressa'}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-col items-end">
                    <span className="text-xs uppercase tracking-wider">
                      {log.esito === 'VALID_REP' ? 'VALIDA' : 'NON VALIDA'}
                    </span>
                    <span className="text-[10px] uppercase mt-1">
                      {log.errori === 'Nessuno' ? '' : log.errori}
                    </span>
                  </div>
                </div>
              ))}
              {sessionLogs.length > 10 && (
                <div className="px-5 py-3 text-center text-[10px] border-t border-[#002f6c] uppercase tracking-widest">
                  Visualizzati gli ultimi 10 record. Esporta in CSV per l'analisi completa.
                </div>
              )}
            </div>
          </section>

          {/* PANNELLO GESTIONE ACQUISIZIONI */}
          {!isActive && (
            <div className="bg-white border border-[#002f6c] rounded-none p-4 flex flex-col gap-4">
              <div className="flex items-center justify-between px-2">
                <span className="text-xs uppercase tracking-widest">Gestisci Acquisizioni</span>
              </div>
              <div className="flex gap-2">
                <button onClick={clearAllHistory} className="flex-1 py-3 bg-white border border-[#002f6c] hover:bg-[#002f6c] hover:text-white rounded-none text-sm uppercase tracking-widest transition-none">
                  Azzera
                </button>
                <button onClick={exportCSV} className="flex-[2] py-3 bg-white border border-[#002f6c] hover:bg-[#002f6c] hover:text-white rounded-none text-sm uppercase tracking-widest transition-none">
                  Esporta (.CSV)
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}