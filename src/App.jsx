import { useState, useEffect } from 'react';
import { usePose } from './hooks/usePose';
import logoUnifi from './assets/logo_unifi.png';

const EXERCISE_LABELS = {
  SQUAT: 'Squat',
  DEADLIFT: 'Stacco da terra',
  OVERHEAD_PRESS: 'Pressa militare',
};

export default function App() {
  const [exercise, setExercise] = useState('SQUAT');
  const [isActive, setIsActive] = useState(false);
  const [cameraSide, setCameraSide] = useState('LEFT');
  const [facingMode, setFacingMode] = useState('user');
  const [hasMultipleCameras, setHasMultipleCameras] = useState(false);

  // Stato dello storico centralizzato nell'interfaccia principale
  const [sessionLogs, setSessionLogs] = useState([]);

  // Callback per registrare la ripetizione nello stato globale di App.jsx
  const handleNewLog = (newLog) => {
    setSessionLogs(prev => [...prev, newLog]);
  };

  const { videoRef, canvasRef, isLoading, isTrackingLost, loadingMsg, error, validReps, faults, angles, reset } = usePose(
    exercise, isActive, cameraSide, facingMode, handleNewLog
  );

  const exerciseLabel = EXERCISE_LABELS[exercise];
  const mirrorClass = facingMode === 'user' ? 'scale-x-[-1]' : '';

  useEffect(() => {
    async function checkCameras() {
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

  const exportCSV = () => {
    const escapeCSV = value => `"${String(value ?? '').replaceAll('"', '""')}"`;
    const headers = ['Ora', 'Esercizio', 'Esito', 'Errori'];
    // Utilizzo del punto e virgola per la corretta incolonnazione in Excel locale
    const rows = sessionLogs.map(log => [
      log.time,
      log.ex,
      log.esito,
      log.errori,
    ].map(escapeCSV).join(';')).join('\n');
    // Aggiunta del carattere \uFEFF (BOM) per codificare correttamente i caratteri e le colonne
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

  return (
    <div className="min-h-screen bg-white text-[#002f6c] flex flex-col items-center p-4 font-sans selection:bg-[#002f6c] selection:text-white">

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

      {!isActive ? (
        <div className="w-full max-w-xl flex flex-col gap-6">

          <div className="bg-white border border-[#002f6c] rounded-none p-6 flex flex-col gap-8">

            <div className="flex flex-col gap-3">
              <h3 className="text-xs uppercase tracking-widest mb-1">1. Esercizio</h3>
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

            <div className="flex flex-col gap-3">
              <h3 className="text-xs uppercase tracking-widest mb-1">2. Lato</h3>
              <div className="flex gap-2">
                <button
                  onClick={() => setCameraSide('LEFT')}
                  className={`flex-1 py-3 rounded-none text-sm transition-none border ${cameraSide === 'LEFT' ? 'bg-[#002f6c] text-white border-[#002f6c]' : 'bg-white text-[#002f6c] border-[#002f6c] hover:bg-[#002f6c] hover:text-white'
                    }`}
                >
                  Sinistro
                </button>
                <button
                  onClick={() => setCameraSide('RIGHT')}
                  className={`flex-1 py-3 rounded-none text-sm transition-none border ${cameraSide === 'RIGHT' ? 'bg-[#002f6c] text-white border-[#002f6c]' : 'bg-white text-[#002f6c] border-[#002f6c] hover:bg-[#002f6c] hover:text-white'
                    }`}
                >
                  Destro
                </button>
              </div>
            </div>

            {hasMultipleCameras && (
              <div className="flex flex-col gap-3">
                <h3 className="text-xs uppercase tracking-widest mb-1">3. Selezione Fotocamera</h3>
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

          <button onClick={() => setIsActive(true)} className="w-full py-4 bg-[#002f6c] hover:bg-white hover:text-[#002f6c] border border-[#002f6c] rounded-none text-lg text-white uppercase tracking-widest transition-none">
            Inizia Sessione
          </button>
        </div>
      ) : (
        <div className="w-full max-w-xl flex flex-col items-center">

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

          <main className="w-full relative bg-white rounded-none overflow-hidden border border-[#002f6c]" style={{ aspectRatio: '9/16' }}>

            {isLoading && !error && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-white z-10">
                <div className="w-8 h-8 border-4 border-[#002f6c] border-t-transparent rounded-none animate-spin" />
                <p className="text-xs text-[#002f6c] mt-4 uppercase tracking-widest">Inizializzazione Modello...</p>
              </div>
            )}

            {error && <div className="absolute inset-0 flex items-center justify-center bg-white p-6 text-center text-sm z-30 border-4 border-[#002f6c] uppercase">{error}</div>}

            <video ref={videoRef} className={`w-full h-full object-contain ${mirrorClass}`} playsInline muted />
            <canvas ref={canvasRef} className={`absolute top-0 left-0 w-full h-full object-contain ${mirrorClass}`} />

            {/* OVERLAY ERRORE ESECUZIONE (visibile in tempo reale sopra la fotocamera) */}
            {faults.length > 0 && !isLoading && !error && (
              <div className="absolute top-16 left-1/2 -translate-x-1/2 w-[85%] bg-white border border-[#002f6c] p-2 text-center z-20 shadow-md">
                <p className="text-[10px] uppercase tracking-widest mb-1">Errore</p>
                <p className="text-xs uppercase tracking-widest">{faults.join(' • ')}</p>
              </div>
            )}

            {isTrackingLost && !isLoading && !error && (
              <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-[#002f6c] text-white px-5 py-2.5 rounded-none text-xs tracking-widest flex items-center gap-2 border border-[#002f6c] uppercase z-20 w-max max-w-[90%]">
                <span className="w-2 h-2 bg-white rounded-none animate-ping" />
                Corpo Non Rilevato
              </div>
            )}

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
              Interrompi
            </button>
          </footer>
        </div>
      )}

      {sessionLogs.length > 0 && (
        <div className="w-full max-w-xl flex flex-col gap-6 mt-10 mb-8">
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