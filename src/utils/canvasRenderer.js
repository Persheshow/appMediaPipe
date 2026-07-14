import { ESERCIZI, SKELETON_COLORS } from '../config/exercises';

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

    const puntoAnca = landmarks[cfgPunti.hip];
    if (puntoAnca && puntoAnca.visibility > 0.2) {
        ctx.beginPath();
        ctx.fillStyle = isTargetReached ? '#00ff88' : '#ef4444';
        ctx.arc(puntoAnca.x * w, puntoAnca.y * h, 6, 0, 2 * Math.PI);
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#ffffff';
        ctx.stroke();
    }
}

export function drawSquatOverlays(ctx, w, h, kneePoint, isTargetReached, smoothedKneeYRef) {
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

    ctx.fillStyle = "rgba(0, 47, 108, 0.75)";
    ctx.fillRect(0, 0, w, 50);

    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 24px sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(`VALIDE: ${validReps}`, 20, 34);

    ctx.textAlign = "right";
    ctx.fillText(`ANGOLO: ${currentAngle ? Math.round(currentAngle) + '°' : '--'}`, w - 20, 34);

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

    ctx.restore();
}