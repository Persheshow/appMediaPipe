/**
 * @file canvasRenderer.js
 * @description Modulo per il rendering grafico degli overlay topologici sul Canvas HTML.
 * Isola i compiti di disegno a basso livello dall'elaborazione logico-strutturale dei dati.
 */

import { EXERCISES, SKELETON_COLORS } from '../config/exercises';

/**
 * Disegna i segmenti ossei principali dell'esoscheletro corporeo.
 */
export function drawSkeleton(ctx, landmarks, w, h, isTargetReached, side, ex, faultsSize) {
    let color = SKELETON_COLORS.active;

    if (faultsSize > 0) {
        color = SKELETON_COLORS.warning; // Priorità: Rosso se viene rilevato un errore attivo
    } else if (isTargetReached) {
        color = SKELETON_COLORS.target;
    }

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
        if (p1 && p2 && p1.visibility > 0.4 && p2.visibility > 0.4) {
            ctx.beginPath(); ctx.moveTo(p1.x * w, p1.y * h); ctx.lineTo(p2.x * w, p2.y * h); ctx.stroke();
        }
    });

    // Rendering del nodo articolare dell'Anca con inversione cromatica controllata
    const hipPoint = landmarks[lmConfig.hip];
    if (hipPoint && hipPoint.visibility > 0.4) {
        ctx.beginPath();
        ctx.fillStyle = isTargetReached ? '#00ff88' : '#ef4444'; // Verde se sotto il parallelo, altrimenti rosso
        ctx.arc(hipPoint.x * w, hipPoint.y * h, 6, 0, 2 * Math.PI);
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#ffffff';
        ctx.stroke();
    }
}

/**
 * Gestisce l'overlay specifico per l'analisi dello Squat (Barra progressi e linea di rottura).
 */
export function drawSquatOverlays(ctx, w, h, kneePoint, progress, isTargetReached, smoothedKneeYRef) {
    if (kneePoint && kneePoint.visibility > 0.4) {
        // Filtraggio EMA interno per azzerare le oscillazioni (jittering) della linea verde del ginocchio
        if (smoothedKneeYRef.current === null) {
            smoothedKneeYRef.current = kneePoint.y;
        } else {
            smoothedKneeYRef.current = (kneePoint.y * 0.15) + (smoothedKneeYRef.current * 0.85);
        }

        const kneeY = smoothedKneeYRef.current * h;

        ctx.beginPath();
        ctx.setLineDash([8, 6]);
        ctx.moveTo(0, kneeY);
        ctx.lineTo(w, kneeY);
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#00ff88';
        ctx.stroke();
        ctx.setLineDash([]); // Ripristino
    }

    // Sincronizzazione grafica della barra di ampiezza verticale
    if (progress !== undefined) {
        const barW = 10;
        const barH = h * 0.3;
        const barX = w - barW - 15;
        const barY = (h - barH) / 2;

        ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.fillRect(barX, barY, barW, barH);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1;
        ctx.strokeRect(barX, barY, barW, barH);

        const fillH = (progress / 100) * barH;
        ctx.fillStyle = isTargetReached ? '#00ff88' : '#ef4444';
        ctx.fillRect(barX, barY + barH - fillH, barW, fillH);
    }
}