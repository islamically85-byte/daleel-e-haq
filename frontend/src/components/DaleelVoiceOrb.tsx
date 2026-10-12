import React, { useEffect, useRef } from 'react';
import { Mic, MicOff, Sparkles, Headphones, Radio } from 'lucide-react';

export interface DaleelVoiceOrbProps {
  isAISpeaking: boolean;
  isUserSpeaking: boolean;
  isMuted: boolean;
  isConnected: boolean;
  isConnecting: boolean;
  aiVolume: number; // 0..1
  userVolume: number; // 0..1
  bargeInMode: 'natural' | 'protected';
  size?: number;
  onToggleMute?: () => void;
}

interface Particle {
  angle: number;
  distance: number;
  speed: number;
  radius: number;
  baseAlpha: number;
  alpha: number;
  hueOffset: number;
}

interface ShockwaveRing {
  radius: number;
  maxRadius: number;
  alpha: number;
  velocity: number;
}

export const DaleelVoiceOrb: React.FC<DaleelVoiceOrbProps> = ({
  isAISpeaking,
  isUserSpeaking,
  isMuted,
  isConnected,
  isConnecting,
  aiVolume,
  userVolume,
  bargeInMode,
  size = 200,
  onToggleMute
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // References for smooth animation values (attack/decay damping)
  const smoothedAiVolRef = useRef(0);
  const smoothedUserVolRef = useRef(0);
  const animTimeRef = useRef(0);
  const shockwavesRef = useRef<ShockwaveRing[]>([]);
  const particlesRef = useRef<Particle[]>([]);
  const lastShockwaveSpawnRef = useRef(0);

  // Initialize floating spiritual dust particles
  useEffect(() => {
    const particles: Particle[] = [];
    const count = 18;
    for (let i = 0; i < count; i++) {
      particles.push({
        angle: (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.3,
        distance: 42 + Math.random() * 38,
        speed: (0.004 + Math.random() * 0.006) * (i % 2 === 0 ? 1 : -1),
        radius: 1.0 + Math.random() * 1.8,
        baseAlpha: 0.25 + Math.random() * 0.45,
        alpha: 0.3,
        hueOffset: (Math.random() - 0.5) * 20
      });
    }
    particlesRef.current = particles;
  }, []);

  // Main Canvas Rendering Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const render = () => {
      // 1. Attack / Decay smoothing of incoming RMS levels
      const targetAi = isAISpeaking ? aiVolume : 0;
      const targetUser = !isMuted && isUserSpeaking ? userVolume : 0;

      // Asymmetric filter: fast attack, smooth decay
      const aiAttack = 0.32;
      const aiDecay = 0.12;
      smoothedAiVolRef.current +=
        targetAi > smoothedAiVolRef.current
          ? (targetAi - smoothedAiVolRef.current) * aiAttack
          : (targetAi - smoothedAiVolRef.current) * aiDecay;

      const userAttack = 0.28;
      const userDecay = 0.14;
      smoothedUserVolRef.current +=
        targetUser > smoothedUserVolRef.current
          ? (targetUser - smoothedUserVolRef.current) * userAttack
          : (targetUser - smoothedUserVolRef.current) * userDecay;

      const smAi = smoothedAiVolRef.current;
      const smUser = smoothedUserVolRef.current;

      const speedFactor = prefersReducedMotion ? 0.3 : 1.0;
      animTimeRef.current += 0.024 * speedFactor;
      const time = animTimeRef.current;

      const dpr = window.devicePixelRatio || 1;
      const width = size;
      const height = size;

      // Handle DPI scaling
      if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
        canvas.width = width * dpr;
        canvas.height = height * dpr;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);

      const cx = width / 2;
      const cy = height / 2;

      // Base radius calculation
      const baseRadius = 42 + smAi * 16 + smUser * 12;

      // 2. Shockwave generation during AI speech or User peak energy
      const now = performance.now();
      if (!isMuted && isAISpeaking && smAi > 0.18 && now - lastShockwaveSpawnRef.current > 240) {
        shockwavesRef.current.push({
          radius: baseRadius,
          maxRadius: baseRadius + 38 + smAi * 35,
          alpha: Math.min(0.65, 0.25 + smAi * 0.4),
          velocity: 1.4 + smAi * 2.2
        });
        lastShockwaveSpawnRef.current = now;
      } else if (!isMuted && isUserSpeaking && smUser > 0.22 && now - lastShockwaveSpawnRef.current > 260) {
        shockwavesRef.current.push({
          radius: baseRadius,
          maxRadius: baseRadius + 32 + smUser * 30,
          alpha: Math.min(0.6, 0.2 + smUser * 0.4),
          velocity: 1.2 + smUser * 1.8
        });
        lastShockwaveSpawnRef.current = now;
      }

      // 3. Render Expanding Shockwaves
      for (let i = shockwavesRef.current.length - 1; i >= 0; i--) {
        const ring = shockwavesRef.current[i];
        ring.radius += ring.velocity;
        const progress = (ring.radius - baseRadius) / (ring.maxRadius - baseRadius);
        const currentAlpha = ring.alpha * (1 - Math.max(0, Math.min(1, progress)));

        if (progress >= 1 || currentAlpha <= 0.01) {
          shockwavesRef.current.splice(i, 1);
          continue;
        }

        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, ring.radius, 0, Math.PI * 2);
        if (isAISpeaking) {
          ctx.strokeStyle = `rgba(18, 168, 134, ${currentAlpha.toFixed(3)})`;
          ctx.lineWidth = 1.6 + (1 - progress) * 2;
        } else {
          ctx.strokeStyle = `rgba(59, 130, 246, ${currentAlpha.toFixed(3)})`;
          ctx.lineWidth = 1.4 + (1 - progress) * 1.8;
        }
        ctx.stroke();
        ctx.restore();
      }

      // 4. Ambient Aura / Glow Backlight
      ctx.save();
      const auraGradient = ctx.createRadialGradient(cx, cy, baseRadius * 0.5, cx, cy, baseRadius * 1.7);
      if (isMuted) {
        auraGradient.addColorStop(0, 'rgba(239, 68, 68, 0.18)');
        auraGradient.addColorStop(0.7, 'rgba(239, 68, 68, 0.04)');
        auraGradient.addColorStop(1, 'rgba(239, 68, 68, 0)');
      } else if (isAISpeaking) {
        const glowOpacity = Math.min(0.45, 0.18 + smAi * 0.35);
        auraGradient.addColorStop(0, `rgba(18, 168, 134, ${glowOpacity})`);
        auraGradient.addColorStop(0.6, `rgba(18, 168, 134, ${(glowOpacity * 0.4).toFixed(3)})`);
        auraGradient.addColorStop(1, 'rgba(18, 168, 134, 0)');
      } else if (isUserSpeaking) {
        const glowOpacity = Math.min(0.45, 0.16 + smUser * 0.35);
        auraGradient.addColorStop(0, `rgba(59, 130, 246, ${glowOpacity})`);
        auraGradient.addColorStop(0.6, `rgba(59, 130, 246, ${(glowOpacity * 0.4).toFixed(3)})`);
        auraGradient.addColorStop(1, 'rgba(59, 130, 246, 0)');
      } else if (isConnecting) {
        auraGradient.addColorStop(0, 'rgba(245, 158, 11, 0.22)');
        auraGradient.addColorStop(0.7, 'rgba(245, 158, 11, 0.05)');
        auraGradient.addColorStop(1, 'rgba(245, 158, 11, 0)');
      } else {
        // Idle tranquil presence: breathing emerald luminescence
        const breath = 0.12 + Math.sin(time * 1.4) * 0.05;
        auraGradient.addColorStop(0, `rgba(18, 168, 134, ${breath})`);
        auraGradient.addColorStop(0.7, `rgba(18, 168, 134, ${(breath * 0.3).toFixed(3)})`);
        auraGradient.addColorStop(1, 'rgba(18, 168, 134, 0)');
      }
      ctx.fillStyle = auraGradient;
      ctx.beginPath();
      ctx.arc(cx, cy, baseRadius * 1.7, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // 5. Floating Orbital Dust Particles
      ctx.save();
      for (const p of particlesRef.current) {
        if (!isMuted && !prefersReducedMotion) {
          p.angle += p.speed * (isAISpeaking ? 1.6 : 1.0);
        }
        const px = cx + Math.cos(p.angle) * (p.distance + smAi * 8 + smUser * 6);
        const py = cy + Math.sin(p.angle) * (p.distance + smAi * 8 + smUser * 6);

        ctx.beginPath();
        ctx.arc(px, py, p.radius, 0, Math.PI * 2);
        if (isMuted) {
          ctx.fillStyle = `rgba(239, 68, 68, ${p.baseAlpha * 0.4})`;
        } else if (isAISpeaking) {
          ctx.fillStyle = `rgba(52, 211, 153, ${Math.min(0.85, p.baseAlpha + smAi * 0.4)})`;
        } else if (isUserSpeaking) {
          ctx.fillStyle = `rgba(147, 197, 253, ${Math.min(0.85, p.baseAlpha + smUser * 0.4)})`;
        } else {
          ctx.fillStyle = `rgba(18, 168, 134, ${p.baseAlpha})`;
        }
        ctx.fill();
      }
      ctx.restore();

      // 6. Fluid Organic Harmonic Wave Core
      const points = 72;
      const amp1 = prefersReducedMotion ? 0.5 : isMuted ? 0.3 : 1.2 + smAi * 11 + smUser * 9;
      const amp2 = prefersReducedMotion ? 0.3 : isMuted ? 0.2 : 0.8 + smAi * 8 + smUser * 6;
      const amp3 = prefersReducedMotion ? 0.2 : isMuted ? 0.1 : 0.5 + smAi * 6;

      ctx.save();
      ctx.beginPath();
      for (let i = 0; i <= points; i++) {
        const theta = (i / points) * Math.PI * 2;
        const wave1 = Math.sin(theta * 3 + time * 3.0) * amp1;
        const wave2 = Math.cos(theta * 5 - time * 2.2) * amp2;
        const wave3 = Math.sin(theta * 7 + time * 4.1) * amp3;
        const r = baseRadius + wave1 + wave2 + wave3;

        const x = cx + Math.cos(theta) * r;
        const y = cy + Math.sin(theta) * r;

        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.closePath();

      // Core Radial Gradient
      const coreGrad = ctx.createRadialGradient(cx - 8, cy - 8, 2, cx, cy, baseRadius);
      if (isMuted) {
        coreGrad.addColorStop(0, '#7F1D1D');
        coreGrad.addColorStop(0.65, '#991B1B');
        coreGrad.addColorStop(1, '#450A0A');
      } else if (isAISpeaking) {
        coreGrad.addColorStop(0, '#34D399');
        coreGrad.addColorStop(0.45, '#12A886');
        coreGrad.addColorStop(0.85, '#0B6350');
        coreGrad.addColorStop(1, '#064E3B');
      } else if (isUserSpeaking) {
        coreGrad.addColorStop(0, '#60A5FA');
        coreGrad.addColorStop(0.45, '#3B82F6');
        coreGrad.addColorStop(0.85, '#1D4ED8');
        coreGrad.addColorStop(1, '#1E3A8A');
      } else if (isConnecting) {
        coreGrad.addColorStop(0, '#FCD34D');
        coreGrad.addColorStop(0.5, '#F59E0B');
        coreGrad.addColorStop(1, '#78350F');
      } else {
        // Idle tranquil jade core
        coreGrad.addColorStop(0, '#2DD4BF');
        coreGrad.addColorStop(0.5, '#12A886');
        coreGrad.addColorStop(0.85, '#0F766E');
        coreGrad.addColorStop(1, '#134E4A');
      }

      ctx.fillStyle = coreGrad;
      ctx.fill();

      // Outer boundary rim stroke
      if (isMuted) {
        ctx.strokeStyle = 'rgba(239, 68, 68, 0.65)';
        ctx.lineWidth = 1.8;
      } else if (isAISpeaking) {
        ctx.strokeStyle = `rgba(52, 211, 153, ${(0.6 + smAi * 0.4).toFixed(3)})`;
        ctx.lineWidth = 2.2 + smAi * 2.0;
      } else if (isUserSpeaking) {
        ctx.strokeStyle = `rgba(96, 165, 250, ${(0.6 + smUser * 0.4).toFixed(3)})`;
        ctx.lineWidth = 2.0 + smUser * 1.8;
      } else {
        ctx.strokeStyle = 'rgba(18, 168, 134, 0.45)';
        ctx.lineWidth = 1.6;
      }
      ctx.stroke();
      ctx.restore();

      // 7. Dynamic Specular Highlights & Glint
      ctx.save();
      const glintGrad = ctx.createLinearGradient(cx - baseRadius * 0.6, cy - baseRadius * 0.6, cx, cy);
      glintGrad.addColorStop(0, 'rgba(255, 255, 255, 0.35)');
      glintGrad.addColorStop(0.5, 'rgba(255, 255, 255, 0.08)');
      glintGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
      ctx.fillStyle = glintGrad;
      ctx.beginPath();
      ctx.ellipse(cx - baseRadius * 0.28, cy - baseRadius * 0.32, baseRadius * 0.42, baseRadius * 0.22, -Math.PI / 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [isAISpeaking, isUserSpeaking, isMuted, isConnected, isConnecting, aiVolume, userVolume, size]);

  return (
    <div
      style={{
        position: 'relative',
        width: `${size}px`,
        height: `${size}px`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        userSelect: 'none'
      }}
      role="img"
      aria-label={
        isMuted
          ? 'Microphone muted'
          : isAISpeaking
            ? 'Daleel-e-Haq is speaking'
            : isUserSpeaking
              ? 'Listening to user voice'
              : isConnecting
                ? 'Connecting to live session'
                : 'Live voice orb ready'
      }
    >
      {/* HTML5 Canvas Surface */}
      <canvas
        ref={canvasRef}
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          filter: isAISpeaking
            ? 'drop-shadow(0 0 16px rgba(18, 168, 134, 0.4))'
            : isUserSpeaking
              ? 'drop-shadow(0 0 14px rgba(59, 130, 246, 0.35))'
              : isMuted
                ? 'drop-shadow(0 0 10px rgba(239, 68, 68, 0.25))'
                : 'drop-shadow(0 0 10px rgba(18, 168, 134, 0.2))',
          transition: 'filter 140ms ease'
        }}
      />

      {/* Central Symbolic Icon Anchor */}
      <div
        onClick={onToggleMute}
        style={{
          position: 'relative',
          zIndex: 2,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '52px',
          height: '52px',
          borderRadius: '50%',
          backgroundColor: isMuted
            ? 'rgba(0, 0, 0, 0.45)'
            : 'rgba(0, 0, 0, 0.25)',
          backdropFilter: 'blur(4px)',
          border: '1px solid rgba(255, 255, 255, 0.15)',
          color: isMuted
            ? '#EF4444'
            : isAISpeaking
              ? '#FFFFFF'
              : isUserSpeaking
                ? '#93C5FD'
                : isConnecting
                  ? '#FBBF24'
                  : 'rgba(255, 255, 255, 0.9)',
          boxShadow: '0 2px 10px rgba(0, 0, 0, 0.3)',
          cursor: onToggleMute ? 'pointer' : 'default',
          transition: 'all 120ms ease'
        }}
        title={onToggleMute ? (isMuted ? 'Click to unmute' : 'Click to mute') : undefined}
      >
        {isMuted ? (
          <MicOff size={26} strokeWidth={2.2} />
        ) : isAISpeaking ? (
          <Sparkles size={26} strokeWidth={2.2} />
        ) : isUserSpeaking ? (
          <Mic size={26} strokeWidth={2.2} />
        ) : isConnecting ? (
          <Radio size={24} strokeWidth={2.2} className="animate-spin" />
        ) : (
          <Headphones size={26} strokeWidth={2.2} />
        )}
      </div>

      {/* Subtle Barge-in Mode Indicator Badge */}
      <div
        style={{
          position: 'absolute',
          bottom: '8px',
          zIndex: 3,
          fontSize: '0.65rem',
          fontWeight: 600,
          padding: '2px 8px',
          borderRadius: '10px',
          backgroundColor:
            bargeInMode === 'protected'
              ? 'rgba(59, 130, 246, 0.2)'
              : 'rgba(18, 168, 134, 0.2)',
          color:
            bargeInMode === 'protected'
              ? '#93C5FD'
              : '#6EE7B7',
          border:
            bargeInMode === 'protected'
              ? '1px solid rgba(59, 130, 246, 0.35)'
              : '1px solid rgba(18, 168, 134, 0.35)',
          letterSpacing: '0.02em',
          pointerEvents: 'none'
        }}
      >
        {bargeInMode === 'protected' ? '🛡️ Protected' : '🌿 Natural'}
      </div>
    </div>
  );
};
