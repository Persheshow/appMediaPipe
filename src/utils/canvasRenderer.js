/**
 * @file canvasRenderer.js
 * @description Modulo per il rendering grafico degli overlay topologici sul Canvas HTML.
 */

import { EXERCISES, SKELETON_COLORS } from '../config/exercises';

export function drawSkeleton(ctx, landmarks, w, h, isTargetReached, side, ex, hasError) {
    let color = SKELETON_COLORS.active;
    if (hasError) color = SKELETON_COLORS.warning;
    else if (isTargetReached) color = SKELETON_COLORS.target;

    ctx.lineWidth = 2;
    ctx.strokeStyle = color;

    const lmConfig = EXERCISES[ex]?.landmarks[side];
    if (!lmConfig) return;

    const baseConnections = [[lmConfig.shoulder, lmConfig.hip], [lmConfig.hip, lmConfig.knee], [lmConfig.knee, lmConfig.ankle]];
    const armConnections = (ex === 'OVERHEAD_PRESS' || ex === 'DEADLIFT') && lmConfig.elbow
        ? [[lmConfig.shoulder, lmConfig.elbow], [lmConfig.elbow, lmConfig.wrist]] : [];

    [...baseConnections, ...armConnections].forEach(([s, e]) => {
        if (s === undefined || e === undefined) return;
        const p1 = landmarks[s], p2 = landmarks[e];
        if (p1 && p2 && p1.visibility > 0.2 && p2.visibility > 0.2) {
            ctx.beginPath(); ctx.moveTo(p1.x * w, p1.y * h); ctx.lineTo(p2.x * w, p2.y * h); ctx.stroke();
        }
    });

    const hipPoint = landmarks[lmConfig.hip];
    if (hipPoint && hipPoint.visibility > 0.2) {
        ctx.beginPath();
        ctx.fillStyle = isTargetReached ? '#00ff88' : '#ef4444';
        ctx.arc(hipPoint.x * w, hipPoint.y * h, 6, 0, 2 * Math.PI);
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

        const kneeY = smoothedKneeYRef.current * h;
        ctx.beginPath();
        ctx.setLineDash([8, 6]);
        ctx.moveTo(0, kneeY);
        ctx.lineTo(w, kneeY);
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#00ff88';
        ctx.stroke();
        ctx.setLineDash([]);
    }
}

export function drawHUD(ctx, w, h, validReps, hudMessage, isTrackingLost, currentAngle) {
    ctx.save();

    // Barra di telemetria superiore (Spostata da h-50 a 0)
    ctx.fillStyle = "rgba(0, 47, 108, 0.75)";
    ctx.fillRect(0, 0, w, 50);

    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 24px sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(`VALIDE: ${validReps}`, 20, 34);

    ctx.textAlign = "right";
    ctx.fillText(`ANGOLO: ${currentAngle ? Math.round(currentAngle) + '°' : '--'}`, w - 20, 34);

    // Sistema a comparsa per Notifiche (Scalato sotto la barra principale, y = 50)
    ctx.textAlign = "center";
    const now = performance.now();

    if (isTrackingLost) {
        ctx.fillStyle = "rgba(239, 68, 68, 0.9)";
        ctx.fillRect(0, 50, w, 40);
        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 18px sans-serif";
        ctx.fillText("CORPO NON RILEVATO", w / 2, 76);
    }
    else if (hudMessage && now < hudMessage.expires) {
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