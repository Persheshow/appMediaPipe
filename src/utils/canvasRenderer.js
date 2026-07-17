import { ESERCIZI, SKELETON_COLORS } from '../config/exercises';

let watermarkMessaggio = null;
let watermarkScadenza = 0;

if (typeof window !== 'undefined') {
    window.addEventListener('execution_error', (e) => {
        watermarkMessaggio = e.detail;
        watermarkScadenza = Date.now() + 2500;
    });
}

export function drawSkeleton(ctx, landmarks, w, h, isTargetReached, side, ex, hasError) {
    let colore = SKELETON_COLORS.active;
    if (hasError) colore = SKELETON_COLORS.warning;
    else if (isTargetReached) colore = SKELETON_COLORS.target;

    ctx.lineWidth = 2;
    ctx.strokeStyle = colore;

    const cfgPunti = ESERCIZI[ex]?.landmarks[side];
    if (!cfgPunti) return;

    const collegamentiBase = [[cfgPunti.shoulder, cfgPunti.hip], [cfgPunti.hip, cfgPunti.knee], [cfgPunti.knee, cfgPunti.ankle]];
    const collegamentiBraccio = (ex === 'OVERHEAD_PRESS' || ex === 'DEADLIFT') && cfgPunti.elbow
        ? [[cfgPunti.shoulder, cfgPunti.elbow], [cfgPunti.elbow, cfgPunti.wrist]] : [];

    [...collegamentiBase, ...collegamentiBraccio].forEach(([inizio, fine]) => {
        if (inizio === undefined || fine === undefined) return;
        const p1 = landmarks[inizio], p2 = landmarks[fine];
        if (p1 && p2 && p1.visibility > 0.2 && p2.visibility > 0.2) {
            ctx.beginPath(); ctx.moveTo(p1.x * w, p1.y * h); ctx.lineTo(p2.x * w, p2.y * h); ctx.stroke();
        }
    });

    let indicePuntoSnodo = cfgPunti.hip;
    if (ex === 'OVERHEAD_PRESS') {
        indicePuntoSnodo = cfgPunti.elbow;
    }

    const puntoEvidenziato = landmarks[indicePuntoSnodo];

    if (puntoEvidenziato && puntoEvidenziato.visibility > 0.2) {
        ctx.beginPath();
        ctx.fillStyle = isTargetReached ? '#00ff88' : '#ef4444';
        ctx.arc(puntoEvidenziato.x * w, puntoEvidenziato.y * h, 6, 0, 2 * Math.PI);
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#ffffff';
        ctx.stroke();
    }
}

export function drawKneeOverlayLine(ctx, w, h, kneePoint, isTargetReached, smoothedKneeYRef) {
    if (kneePoint && kneePoint.visibility > 0.2) {
        if (smoothedKneeYRef.current === null) smoothedKneeYRef.current = kneePoint.y;
        else smoothedKneeYRef.current = (kneePoint.y * 0.15) + (smoothedKneeYRef.current * 0.85);

        const yGinocchio = smoothedKneeYRef.current * h;
        ctx.beginPath();
        ctx.setLineDash([8, 6]);
        ctx.moveTo(0, yGinocchio);
        ctx.lineTo(w, yGinocchio);
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#00ff88';
        ctx.stroke();
        ctx.setLineDash([]);
    }
}

export function drawHUD(ctx, w, h, validReps, hudMessage, isTrackingLost, currentAngle) {
    ctx.save();

    // Sfondo barra superiore
    ctx.fillStyle = "rgba(0, 47, 108, 0.75)";
    ctx.fillRect(0, 0, w, 50);

    // Contatore ripetizioni
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 24px sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(`VALIDE: ${validReps}`, 20, 34);

    // Angolo in tempo reale
    ctx.textAlign = "right";
    ctx.fillText(`ANGOLO: ${currentAngle ? Math.round(currentAngle) + '°' : '--'}`, w - 20, 34);

    // Gestione messaggi del banner (tracking perso o esito singola rep)
    ctx.textAlign = "center";
    const adesso = performance.now();

    if (isTrackingLost) {
        ctx.fillStyle = "rgba(239, 68, 68, 0.9)";
        ctx.fillRect(0, 50, w, 40);
        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 18px sans-serif";
        ctx.fillText("CORPO NON RILEVATO", w / 2, 76);
    }
    else if (hudMessage && adesso < hudMessage.expires) {
        if (hudMessage.type === 'VALID') {
            ctx.fillStyle = "rgba(0, 255, 136, 0.9)";
            ctx.fillRect(0, 50, w, 40);
            ctx.fillStyle = "#002f6c";
            ctx.font = "bold 18px sans-serif";
            ctx.fillText(hudMessage.text, w / 2, 76);
        } else {
            ctx.fillStyle = "rgba(239, 68, 68, 0.9)";
            ctx.fillRect(0, 50, w, 40);
            ctx.fillStyle = "#ffffff";
            ctx.font = "bold 18px sans-serif";
            ctx.fillText(hudMessage.text.toUpperCase(), w / 2, 76);
        }
    }

    // --- WATERMARK CENTRALE OSTRUTTIVO ---
    // Impresso direttamente sul Canvas per renderlo visibile nel file video scaricato
    if (Date.now() < watermarkScadenza && watermarkMessaggio) {
        // Sfondo rosso semitrasparente
        ctx.fillStyle = 'rgba(220, 38, 38, 0.85)';
        ctx.fillRect(0, h / 2 - 60, w, 120);

        // Bordi bianchi del banner
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, h / 2 - 60);
        ctx.lineTo(w, h / 2 - 60);
        ctx.moveTo(0, h / 2 + 60);
        ctx.lineTo(w, h / 2 + 60);
        ctx.stroke();

        // Scrivi l'avviso di errore principale
        ctx.fillStyle = 'white';
        ctx.font = 'bold 28px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(watermarkMessaggio, w / 2, h / 2 - 10);

        // Scrivi il sottotitolo esplicativo
        ctx.font = 'bold 12px sans-serif';
        ctx.fillText("RALLENTA L'ESECUZIONE", w / 2, h / 2 + 30);
    }

    ctx.restore();
}