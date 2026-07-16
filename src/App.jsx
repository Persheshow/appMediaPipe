import { useState, useEffect } from 'react';
import { usePose } from './hooks/usePose';
import { useVideoRecorder } from './hooks/useVideoRecorder';
import logoUnifi from './assets/logo_unifi.png';
import { SpeedInsights } from '@vercel/speed-insights/react';

const NOMI_ESERCIZI = {
  SQUAT: 'Squat',
  DEADLIFT: 'Stacco da terra',
  OVERHEAD_PRESS: 'Pressa militare',
};


// Dati per il modale informativo
const INFO_ESERCIZI = {
  SQUAT: {
    titolo: 'Esecuzione Squat',
    videoSrc: '/assets/SquatDemo.mp4',
    fonteVideo: 'JET Coaching TV',
    linkVideo: 'https://www.youtube.com/watch?v=daDK0huWvfc',
    descrizione: 'La validità dell\'alzata richiede che la coordinata Y dell\'anca scenda al di sotto dello zenit del ginocchio (sotto il parallelo). La risalita deve essere completata con la piena estensione di anche e ginocchia.'
  },
  DEADLIFT: {
    titolo: 'Esecuzione Stacco da terra',
    videoSrc: '/assets/DeadliftDemo.mp4',
    fonteVideo: ' BodyFix Method \- Get Your Life Back\: Move Pain Free',
    linkVideo: 'https://www.youtube.com/watch?v=GKtFw2Egc3Y',
    descrizione: 'L\'alzata è valida al raggiungimento simultaneo della completa estensione di anche e ginocchia. È causa di invalidazione la flessione o la discesa del bilanciere durante la fase di trazione concentrica.'
  },
  OVERHEAD_PRESS: {
    titolo: 'Esecuzione Pressa Militare',
    videoSrc: '/assets/OverheadPressDemo.mp4',
    fonteVideo: 'Brian DeBaets',
    linkVideo: 'https://www.youtube.com/watch?v=bV21SQgC364',
    descrizione: 'Il movimento è validato dalla completa estensione dell\'articolazione del gomito (lockout). È vietata la flessione delle ginocchia per generare spinta inerziale e l\'eccessiva iperestensione lombare.'
  }
};

export default function App() {
  const [esercizioScelto, setEsercizioScelto] = useState('SQUAT');
  const [allenamentoAvviato, setAllenamentoAvviato] = useState(false);
  const [cameraLato, setCameraLato] = useState('user');
  const [cameraDoppia, setCameraDoppia] = useState(false);
  const [logSessione, setLogSessione] = useState([]);
  const [staRegistrando, setStaRegistrando] = useState(false);
  const [infoModaleAperto, setInfoModaleAperto] = useState(false);

  const aggiungiLogRipetizione = (nuovoLog) => {
    setLogSessione(prev => [...prev, nuovoLog]);
  };

  const {
    videoRef,
    canvasRef,
    isLoading: caricamentoModello,
    error: erroreModello,
    validReps: ripetizioniValide,
    reset: resetConteggio,
  } = usePose(esercizioScelto, allenamentoAvviato, cameraLato, staRegistrando, aggiungiLogRipetizione);

  const { startRecording: avviaRegistrazione, stopRecording: fermaRegistrazione } =
    useVideoRecorder(canvasRef, setStaRegistrando);

  const suonaBeep = () => {
    try {
      const CtxAudio = window.AudioContext || window.webkitAudioContext;
      if (!CtxAudio) return;

      const ctx = new CtxAudio();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, ctx.currentTime);

      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 0.25);
    } catch (e) {
      console.warn("Esecuzione del flusso audio interrotta", e);
    }
  };

  useEffect(() => {
    if (ripetizioniValide > 0) suonaBeep();
  }, [ripetizioniValide]);

  useEffect(() => {
    async function trovaFotocamere() {
      const suSmartphone = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
      if (suSmartphone) {
        setCameraDoppia(true);
        return;
      }
      try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return;
        const dispositivi = await navigator.mediaDevices.enumerateDevices();
        const cams = dispositivi.filter(d => d.kind === 'videoinput');
        setCameraDoppia(cams.length > 1);
      } catch (err) {
        console.error("Errore nell'inizializzazione della fotocamera:", err);
      }
    }
    trovaFotocamere();
  }, []);

  return (
    <div className="min-h-screen bg-white text-[#002f6c] flex flex-col items-center p-4 font-sans selection:bg-[#002f6c] selection:text-white relative">

      {infoModaleAperto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#002f6c]/80 p-4 backdrop-blur-sm">
          <div className="bg-white border border-[#002f6c] w-full max-w-md flex flex-col rounded-none shadow-2xl">

            <div className="flex justify-between items-center border-b border-[#002f6c] p-4">
              <h2 className="text-sm font-bold uppercase tracking-widest">{INFO_ESERCIZI[esercizioScelto].titolo}</h2>
              <button onClick={() => setInfoModaleAperto(false)} className="text-[#002f6c] hover:bg-[#002f6c] hover:text-white px-2 py-1 border border-transparent hover:border-[#002f6c] transition-none">
                ✕
              </button>
            </div>

            <div className="p-4 flex flex-col gap-4">
              <div className="w-full bg-gray-100 border border-[#002f6c] aspect-video relative flex items-center justify-center overflow-hidden">
                <span className="absolute text-xs uppercase tracking-widest text-gray-400 z-0">Video non disponibile</span>
                <video
                  src={INFO_ESERCIZI[esercizioScelto].videoSrc}
                  autoPlay
                  loop
                  muted
                  playsInline
                  controls={false}
                  className="w-full h-full object-cover relative z-10 pointer-events-none"
                />
              </div>

              {/* Riferimento Copyright */}
              <div className="flex justify-end -mt-2">
                <a
                  href={INFO_ESERCIZI[esercizioScelto].linkVideo}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[10px] text-[#002f6c] underline uppercase tracking-widest hover:opacity-70"
                >
                  © Fonte: {INFO_ESERCIZI[esercizioScelto].fonteVideo}
                </a>
              </div>

              <p className="text-sm leading-relaxed text-justify border-t border-gray-200 pt-3">
                {INFO_ESERCIZI[esercizioScelto].descrizione}
              </p>
            </div>

          </div>
        </div>
      )}

      <header className="w-full max-w-xl text-center flex flex-col items-center my-8">
        <img src={logoUnifi} alt="Logo Università degli Studi di Firenze" className="w-48 h-auto object-contain mb-8" />
        <h1 className="text-2xl uppercase tracking-widest leading-tight">
          Analisi cinematica in tempo reale per il riconoscimento di ripetizioni valide di esercizi di powerlifting
        </h1>
      </header>

      {!allenamentoAvviato ? (
        <div className="w-full max-w-xl flex flex-col gap-6">
          <div className="bg-white border border-[#002f6c] rounded-none p-6 flex flex-col gap-8">
            <div className="flex flex-col gap-3">
              <div className="flex justify-between items-end mb-1">
                <h3 className="text-xs uppercase tracking-widest">Esercizio</h3>
                <button
                  onClick={() => setInfoModaleAperto(true)}
                  className="w-6 h-6 rounded-full border border-[#002f6c] flex items-center justify-center text-xs font-bold hover:bg-[#002f6c] hover:text-white transition-none"
                  aria-label="Informazioni Esercizio"
                >
                  ?
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                {Object.entries(NOMI_ESERCIZI).map(([chiave, etichetta]) => (
                  <button
                    key={chiave}
                    onClick={() => setEsercizioScelto(chiave)}
                    className={`py-3 px-4 rounded-none text-sm border transition-none ${esercizioScelto === chiave ? 'bg-[#002f6c] text-white border-[#002f6c]' : 'bg-white text-[#002f6c] border-[#002f6c] hover:bg-[#002f6c] hover:text-white'}`}
                  >
                    {etichetta}
                  </button>
                ))}
              </div>
            </div>

            {cameraDoppia && (
              <div className="flex flex-col gap-3">
                <h3 className="text-xs uppercase tracking-widest mb-1">2. Seleziona Fotocamera</h3>
                <div className="flex gap-2">
                  <button onClick={() => setCameraLato('user')} className={`flex-1 py-3 rounded-none text-sm border transition-none ${cameraLato === 'user' ? 'bg-[#002f6c] text-white' : 'bg-white text-[#002f6c] border-[#002f6c] hover:bg-[#002f6c] hover:text-white'}`}>Fotocamera Anteriore</button>
                  <button onClick={() => setCameraLato('environment')} className={`flex-1 py-3 rounded-none text-sm border transition-none ${cameraLato === 'environment' ? 'bg-[#002f6c] text-white' : 'bg-white text-[#002f6c] border-[#002f6c] hover:bg-[#002f6c] hover:text-white'}`}>Fotocamera Posteriore</button>
                </div>
              </div>
            )}
          </div>

          <div className="bg-white border border-[#002f6c] rounded-none p-6 flex flex-col gap-3">
            <h3 className="text-xs uppercase tracking-widest">Istruzioni</h3>
            <ul className="list-disc list-outside text-sm space-y-2 ml-4">
              <li>Posizionare il dispositivo al lato del soggetto.</li>
              <li>Assicurarsi che l'intera figura, incluse mani e piedi, siano nell'inquadratura.</li>
              <li>Garantire un elevato contrasto tra il soggetto e lo sfondo.</li>
              <li>Mantenere il dispositivo stabile durante l'intera durata dell'acquisizione.</li>
            </ul>
          </div>

          <button onClick={() => setAllenamentoAvviato(true)} className="w-full py-4 bg-[#002f6c] text-white border border-[#002f6c] rounded-none text-lg uppercase tracking-widest transition-none hover:bg-white hover:text-[#002f6c]">Inizia</button>
        </div>
      ) : (
        <div className="w-full max-w-xl flex flex-col items-center">

          <main className="w-full relative min-h-[50vh] bg-white rounded-none overflow-hidden border border-[#002f6c]">
            {caricamentoModello && !erroreModello && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-white z-10">
                <div className="w-8 h-8 border-4 border-[#002f6c] border-t-transparent rounded-none animate-spin" />
                <p className="text-xs text-[#002f6c] mt-4 uppercase tracking-widest">Inizializzazione Modello...</p>
              </div>
            )}

            {erroreModello && <div className="absolute inset-0 flex items-center justify-center bg-white p-6 text-center text-sm z-30 border-4 border-[#002f6c] uppercase">{erroreModello}</div>}

            <video ref={videoRef} className="hidden" playsInline muted />
            <canvas ref={canvasRef} className="w-full h-auto block" />

            {cameraDoppia && !caricamentoModello && !erroreModello && !staRegistrando && (
              <button onClick={() => setCameraLato(prev => prev === 'user' ? 'environment' : 'user')} className="absolute bottom-4 right-4 bg-white border border-[#002f6c] text-[#002f6c] p-3 rounded-none z-30 transition-none hover:bg-[#002f6c] hover:text-white">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" /></svg>
              </button>
            )}
          </main>

          {!caricamentoModello && !erroreModello && (
            <button
              onClick={staRegistrando ? () => fermaRegistrazione(true) : avviaRegistrazione}
              className={`w-full mt-4 flex items-center justify-center gap-3 py-4 text-sm font-bold tracking-widest rounded-none border transition-none ${staRegistrando
                ? 'bg-red-600 text-white border-red-600 animate-pulse'
                : 'bg-white text-[#002f6c] border-[#002f6c] hover:bg-[#002f6c] hover:text-white'
                }`}
            >
              {staRegistrando ? 'TERMINA ESERCIZIO' : 'INIZIA ESERCIZIO'}
            </button>
          )}

        </div>
      )}

      {allenamentoAvviato && logSessione.length > 0 && (
        <div className="w-full max-w-xl flex flex-col gap-6 mt-8">
          <section className="bg-white border border-[#002f6c] rounded-none overflow-hidden">
            <div className="bg-white border-b border-[#002f6c] px-5 py-4 flex items-center justify-between">
              <h2 className="text-xs uppercase tracking-widest">Registro Acquisizioni</h2>
              <span className="text-[10px] uppercase tracking-wider border border-[#002f6c] px-2.5 py-1 rounded-none">TOTALE: {logSessione.length}</span>
            </div>
            <div className="flex flex-col">
              {logSessione.slice(-10).reverse().map((riga, idx) => (
                <div key={`${riga.timestamp}-${idx}`} className="flex items-center justify-between px-5 py-3 text-sm border-b border-[#002f6c] last:border-b-0">
                  <div className="flex items-center gap-4">
                    <div className="flex flex-col">
                      <span className="text-[10px] uppercase tracking-widest">{riga.time}</span>
                      <span className="uppercase tracking-widest text-xs mt-1">{riga.ex === 'SQUAT' ? 'Squat' : riga.ex === 'DEADLIFT' ? 'Stacco' : 'Pressa'}</span>
                    </div>
                  </div>
                  <div className="flex flex-col items-end">
                    <span className="text-xs uppercase tracking-wider">{riga.esito === 'VALID_REP' ? 'VALIDA' : 'NON VALIDA'}</span>
                    {riga.errori !== 'Nessuno' && <span className="text-[10px] uppercase mt-1">{riga.errori}</span>}
                  </div>
                </div>
              ))}
              {logSessione.length > 10 && <div className="px-5 py-3 text-center text-[10px] border-t border-[#002f6c] uppercase tracking-widest">Visualizzati gli ultimi 10 record della sessione attiva.</div>}
            </div>
          </section>
        </div>
      )}

      {allenamentoAvviato && (
        <footer className="w-full max-w-xl mt-6 mb-8 flex flex-col gap-4">
          <button
            onClick={() => {
              if (staRegistrando) fermaRegistrazione(false);
              setAllenamentoAvviato(false);
            }}
            className="w-full py-4 bg-white border border-[#002f6c] rounded-none text-sm uppercase tracking-widest transition-none hover:bg-[#002f6c] hover:text-white"
          >
            Indietro
          </button>
        </footer>
      )}

      <footer className="w-full max-w-xl mt-auto pt-12 pb-6 flex flex-col items-center gap-1.5 text-[#002f6c] text-center">
        <div className="w-16 h-[1px] bg-[#002f6c] mb-4 opacity-50"></div>
        <p className="text-[15px] uppercase tracking-wider">Corso di Laurea in Informatica</p>
        <p className="text-[15px] uppercase tracking-wider opacity-70">A.A. 2025/2026</p>
      </footer>

      <SpeedInsights />
    </div>
  );
}