import React, { useEffect, useRef, useState } from 'react';
import type { DebatePhase } from '../hooks/useLiveDebate';

export interface DaleelVoiceOrbProps {
  phase?: DebatePhase;
  isAISpeaking?: boolean;
  isUserSpeaking?: boolean;
  isMuted?: boolean;
  isConnected?: boolean;
  isConnecting?: boolean;
  aiVolume?: number; // 0..1
  userVolume?: number; // 0..1
  bargeInMode?: 'natural' | 'protected';
  size?: number;
  onOrbClick?: () => void;
  onToggleMute?: () => void;
}

interface Particle {
  angle: number;
  distance: number;
  speed: number;
  radius: number;
  baseAlpha: number;
  hueOffset: number;
}

interface ShockwaveRing {
  radius: number;
  maxRadius: number;
  alpha: number;
  velocity: number;
}

export const DaleelVoiceOrb: React.FC<DaleelVoiceOrbProps> = ({
  phase,
  isAISpeaking: propIsAISpeaking = false,
  isUserSpeaking: propIsUserSpeaking = false,
  isMuted = false,
  isConnected = false,
  isConnecting: propIsConnecting = false,
  aiVolume = 0,
  userVolume = 0,
  bargeInMode = 'protected',
  size = 200,
  onOrbClick,
  onToggleMute
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [orbDimension, setOrbDimension] = useState<number>(size);

  // Derive unified state from phase and legacy props
  const isConnecting = phase === 'connecting' || propIsConnecting;
  const isThinking = phase === 'thinking';
  const isAISpeaking = phase === 'assistant_speaking' || propIsAISpeaking;
  const isUserSpeaking = (phase === 'user_turn' && propIsUserSpeaking) || propIsUserSpeaking;
  const isUserTurnIdle = phase === 'user_turn' && !propIsUserSpeaking;

  // Smoothing refs
  const smoothedAiVolRef = useRef(0);
  const smoothedUserVolRef = useRef(0);
  const animTimeRef = useRef(0);
  const shockwavesRef = useRef<ShockwaveRing[]>([]);
  const particlesRef = useRef<Particle[]>([]);
  const lastShockwaveSpawnRef = useRef(0);

  // Volume refs to avoid tearing down RAF loop on volume change (QA-20)
  const aiVolRef = useRef(aiVolume);
  const userVolRef = useRef(userVolume);
  useEffect(() => {
    aiVolRef.current = aiVolume;
  }, [aiVolume]);
  useEffect(() => {
    userVolRef.current = userVolume;
  }, [userVolume]);

  // ResizeObserver for container-relative responsive sizing
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        const available = Math.min(width || size, height || size);
        if (available > 40) {
          // Clamp between 80px and 240px for mobile landscape reachability
          const clamped = Math.max(80, Math.min(240, Math.round(available)));
          setOrbDimension(clamped);
        }
      }
    });

    ro.observe(el);
    return () => ro.disconnect();
  }, [size]);

  // Initialize celestial particles
  useEffect(() => {
    const particles: Particle[] = [];
    const count = 20;
    for (let i = 0; i < count; i++) {
      particles.push({
        angle: (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.4,
        distance: 40 + Math.random() * 36,
        speed: (0.003 + Math.random() * 0.005) * (i % 2 === 0 ? 1 : -1),
        radius: 1.0 + Math.random() * 1.6,
        baseAlpha: 0.2 + Math.random() * 0.4,
        hueOffset: (Math.random() - 0.5) * 25
      });
    }
    particlesRef.current = particles;
  }, []);

  // Main Canvas Render Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const render = () => {
      // 1. Attack / Decay Smoothing using volume refs
      const targetAi = isAISpeaking ? aiVolRef.current : 0;
      const targetUser = !isMuted && isUserSpeaking ? userVolRef.current : 0;

      const aiAttack = 0.35;
      const aiDecay = 0.12;
      smoothedAiVolRef.current +=
        targetAi > smoothedAiVolRef.current
          ? (targetAi - smoothedAiVolRef.current) * aiAttack
          : (targetAi - smoothedAiVolRef.current) * aiDecay;

      const userAttack = 0.32;
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

      // DPR clamped to 2.0 to conserve GPU memory and prevent high-DPI stutter
      const dpr = Math.min(window.devicePixelRatio || 1, 2.0);
      const width = orbDimension;
      const height = orbDimension;

      if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(height * dpr);
      }
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);

      const cx = width / 2;
      const cy = height / 2;

      // Base radius scaled to container dimension
      const radiusScale = orbDimension / 200;
      const baseRadius = (44 + smAi * 16 + smUser * 12) * radiusScale;

      // 2. Shockwave Spawn during AI Speech
      const now = performance.now();
      if (!isMuted && isAISpeaking && smAi > 0.16 && now - lastShockwaveSpawnRef.current > 240) {
        shockwavesRef.current.push({
          radius: baseRadius,
          maxRadius: baseRadius + (36 + smAi * 36) * radiusScale,
          alpha: Math.min(0.65, 0.22 + smAi * 0.42),
          velocity: (1.3 + smAi * 2.2) * radiusScale
        });
        lastShockwaveSpawnRef.current = now;
      }

      // 3. Render Shockwaves
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
        ctx.strokeStyle = `rgba(18, 168, 134, ${currentAlpha.toFixed(3)})`;
        ctx.lineWidth = (1.5 + (1 - progress) * 2.2) * radiusScale;
        ctx.stroke();
        ctx.restore();
      }

      // 4. Ambient Halo / Backlight
      ctx.save();
      const auraGradient = ctx.createRadialGradient(cx, cy, baseRadius * 0.4, cx, cy, baseRadius * 1.85);

      if (isMuted) {
        auraGradient.addColorStop(0, 'rgba(239, 68, 68, 0.22)');
        auraGradient.addColorStop(0.65, 'rgba(239, 68, 68, 0.05)');
        auraGradient.addColorStop(1, 'rgba(239, 68, 68, 0)');
      } else if (isThinking) {
        // Celestial breathing golden-emerald aura
        const pulse = 0.22 + Math.sin(time * 2.2) * 0.08;
        auraGradient.addColorStop(0, `rgba(245, 158, 11, ${pulse})`);
        auraGradient.addColorStop(0.5, `rgba(18, 168, 134, ${(pulse * 0.7).toFixed(3)})`);
        auraGradient.addColorStop(1, 'rgba(18, 168, 134, 0)');
      } else if (isAISpeaking) {
        const glowOpacity = Math.min(0.48, 0.18 + smAi * 0.38);
        auraGradient.addColorStop(0, `rgba(18, 168, 134, ${glowOpacity})`);
        auraGradient.addColorStop(0.65, `rgba(52, 211, 153, ${(glowOpacity * 0.4).toFixed(3)})`);
        auraGradient.addColorStop(1, 'rgba(18, 168, 134, 0)');
      } else if (isUserSpeaking) {
        const glowOpacity = Math.min(0.48, 0.16 + smUser * 0.38);
        auraGradient.addColorStop(0, `rgba(59, 130, 246, ${glowOpacity})`);
        auraGradient.addColorStop(0.65, `rgba(96, 165, 250, ${(glowOpacity * 0.4).toFixed(3)})`);
        auraGradient.addColorStop(1, 'rgba(59, 130, 246, 0)');
      } else if (isUserTurnIdle) {
        // Serene ready blue-green aura
        const pulse = 0.14 + Math.sin(time * 1.6) * 0.04;
        auraGradient.addColorStop(0, `rgba(59, 130, 246, ${pulse})`);
        auraGradient.addColorStop(0.6, `rgba(18, 168, 134, ${(pulse * 0.5).toFixed(3)})`);
        auraGradient.addColorStop(1, 'rgba(18, 168, 134, 0)');
      } else if (isConnecting) {
        auraGradient.addColorStop(0, 'rgba(245, 158, 11, 0.25)');
        auraGradient.addColorStop(0.65, 'rgba(245, 158, 11, 0.05)');
        auraGradient.addColorStop(1, 'rgba(245, 158, 11, 0)');
      } else {
        // Idle tranquil jade presence
        const breath = 0.12 + Math.sin(time * 1.4) * 0.04;
        auraGradient.addColorStop(0, `rgba(18, 168, 134, ${breath})`);
        auraGradient.addColorStop(0.65, `rgba(18, 168, 134, ${(breath * 0.3).toFixed(3)})`);
        auraGradient.addColorStop(1, 'rgba(18, 168, 134, 0)');
      }

      ctx.fillStyle = auraGradient;
      ctx.beginPath();
      ctx.arc(cx, cy, baseRadius * 1.85, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // 5. Thinking State: Dual Golden-Emerald Orbital Precession Rings
      if (isThinking) {
        ctx.save();
        const precessionTime = time * 1.4;

        // Ring 1: Warm Gold Precession Ring
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(0.38 + Math.sin(precessionTime * 0.5) * 0.2);
        ctx.beginPath();
        const ring1R = baseRadius * 1.35;
        ctx.ellipse(0, 0, ring1R, ring1R * 0.36, 0, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(245, 158, 11, 0.7)';
        ctx.lineWidth = 1.6 * radiusScale;
        ctx.setLineDash([6, 4]);
        ctx.lineDashOffset = -precessionTime * 12;
        ctx.stroke();

        // Orbital jewel node on ring 1
        const orbNodeX = Math.cos(precessionTime * 2.0) * ring1R;
        const orbNodeY = Math.sin(precessionTime * 2.0) * (ring1R * 0.36);
        ctx.beginPath();
        ctx.arc(orbNodeX, orbNodeY, 3.2 * radiusScale, 0, Math.PI * 2);
        ctx.fillStyle = '#FCD34D';
        ctx.shadowColor = '#F59E0B';
        ctx.shadowBlur = 8;
        ctx.fill();
        ctx.restore();

        // Ring 2: Emerald Scripture Precession Ring (opposing tilt)
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(-0.52 + Math.cos(precessionTime * 0.4) * 0.18);
        ctx.beginPath();
        const ring2R = baseRadius * 1.48;
        ctx.ellipse(0, 0, ring2R, ring2R * 0.32, 0, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(52, 211, 153, 0.65)';
        ctx.lineWidth = 1.4 * radiusScale;
        ctx.setLineDash([4, 5]);
        ctx.lineDashOffset = precessionTime * 10;
        ctx.stroke();

        // Orbital jewel node on ring 2
        const orbNode2X = Math.cos(-precessionTime * 1.7) * ring2R;
        const orbNode2Y = Math.sin(-precessionTime * 1.7) * (ring2R * 0.32);
        ctx.beginPath();
        ctx.arc(orbNode2X, orbNode2Y, 2.8 * radiusScale, 0, Math.PI * 2);
        ctx.fillStyle = '#6EE7B7';
        ctx.shadowColor = '#10B981';
        ctx.shadowBlur = 7;
        ctx.fill();
        ctx.restore();

        ctx.restore();
      }

      // 6. Floating Celestial Dust Particles
      ctx.save();
      for (const p of particlesRef.current) {
        if (!isMuted && !prefersReducedMotion) {
          p.angle += p.speed * (isAISpeaking ? 1.5 : isThinking ? 1.8 : 1.0);
        }
        const dist = (p.distance + smAi * 8 + smUser * 6) * radiusScale;
        const px = cx + Math.cos(p.angle) * dist;
        const py = cy + Math.sin(p.angle) * dist;

        ctx.beginPath();
        ctx.arc(px, py, p.radius * radiusScale, 0, Math.PI * 2);

        if (isMuted) {
          ctx.fillStyle = `rgba(239, 68, 68, ${p.baseAlpha * 0.4})`;
        } else if (isThinking) {
          ctx.fillStyle = `rgba(252, 211, 77, ${Math.min(0.9, p.baseAlpha + 0.3)})`;
        } else if (isAISpeaking) {
          ctx.fillStyle = `rgba(52, 211, 153, ${Math.min(0.85, p.baseAlpha + smAi * 0.4)})`;
        } else if (isUserSpeaking || isUserTurnIdle) {
          ctx.fillStyle = `rgba(147, 197, 253, ${Math.min(0.85, p.baseAlpha + smUser * 0.4)})`;
        } else {
          ctx.fillStyle = `rgba(18, 168, 134, ${p.baseAlpha})`;
        }
        ctx.fill();
      }
      ctx.restore();

      // 7. Organic Fluid Harmonic Wave Core
      const points = 72;
      const amp1 = prefersReducedMotion
        ? 0.4
        : isMuted
          ? 0.2
          : isThinking
            ? 1.5 + Math.sin(time * 3.0) * 1.0
            : 1.0 + smAi * 11 + smUser * 9;
      const amp2 = prefersReducedMotion
        ? 0.2
        : isMuted
          ? 0.1
          : isThinking
            ? 1.0 + Math.cos(time * 2.5) * 0.7
            : 0.7 + smAi * 8 + smUser * 6;
      const amp3 = prefersReducedMotion
        ? 0.1
        : isMuted
          ? 0.05
          : isThinking
            ? 0.8
            : 0.4 + smAi * 5;

      ctx.save();
      ctx.beginPath();
      for (let i = 0; i <= points; i++) {
        const theta = (i / points) * Math.PI * 2;
        const wave1 = Math.sin(theta * 3 + time * 2.8) * amp1 * radiusScale;
        const wave2 = Math.cos(theta * 5 - time * 2.1) * amp2 * radiusScale;
        const wave3 = Math.sin(theta * 7 + time * 3.8) * amp3 * radiusScale;
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

      // Core Gradient Fill
      const coreGrad = ctx.createRadialGradient(
        cx - 8 * radiusScale,
        cy - 8 * radiusScale,
        2 * radiusScale,
        cx,
        cy,
        baseRadius
      );

      if (isMuted) {
        coreGrad.addColorStop(0, '#991B1B');
        coreGrad.addColorStop(0.6, '#7F1D1D');
        coreGrad.addColorStop(1, '#450A0A');
      } else if (isThinking) {
        // Celestial amber-gold and emerald fusion
        coreGrad.addColorStop(0, '#FCD34D');
        coreGrad.addColorStop(0.35, '#F59E0B');
        coreGrad.addColorStop(0.7, '#12A886');
        coreGrad.addColorStop(1, '#064E3B');
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
      } else if (isUserTurnIdle) {
        coreGrad.addColorStop(0, '#93C5FD');
        coreGrad.addColorStop(0.45, '#2563EB');
        coreGrad.addColorStop(0.85, '#1E40AF');
        coreGrad.addColorStop(1, '#0F172A');
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

      // Outer Boundary Rim Stroke
      if (isMuted) {
        ctx.strokeStyle = 'rgba(239, 68, 68, 0.65)';
        ctx.lineWidth = 1.8 * radiusScale;
      } else if (isThinking) {
        ctx.strokeStyle = 'rgba(245, 158, 11, 0.85)';
        ctx.lineWidth = 2.4 * radiusScale;
      } else if (isAISpeaking) {
        ctx.strokeStyle = `rgba(52, 211, 153, ${(0.6 + smAi * 0.4).toFixed(3)})`;
        ctx.lineWidth = (2.2 + smAi * 2.0) * radiusScale;
      } else if (isUserSpeaking) {
        ctx.strokeStyle = `rgba(96, 165, 250, ${(0.6 + smUser * 0.4).toFixed(3)})`;
        ctx.lineWidth = (2.0 + smUser * 1.8) * radiusScale;
      } else if (isUserTurnIdle) {
        ctx.strokeStyle = 'rgba(59, 130, 246, 0.65)';
        ctx.lineWidth = 1.8 * radiusScale;
      } else {
        ctx.strokeStyle = 'rgba(18, 168, 134, 0.5)';
        ctx.lineWidth = 1.6 * radiusScale;
      }
      ctx.stroke();
      ctx.restore();

      // 8. Elegant Optical Specular Glint & Glass Reflection
      ctx.save();
      const glintGrad = ctx.createLinearGradient(
        cx - baseRadius * 0.6,
        cy - baseRadius * 0.6,
        cx,
        cy
      );
      glintGrad.addColorStop(0, 'rgba(255, 255, 255, 0.38)');
      glintGrad.addColorStop(0.45, 'rgba(255, 255, 255, 0.08)');
      glintGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
      ctx.fillStyle = glintGrad;
      ctx.beginPath();
      ctx.ellipse(
        cx - baseRadius * 0.28,
        cy - baseRadius * 0.32,
        baseRadius * 0.42,
        baseRadius * 0.22,
        -Math.PI / 4,
        0,
        Math.PI * 2
      );
      ctx.fill();
      ctx.restore();

      if (!prefersReducedMotion) {
        animationFrameId = requestAnimationFrame(render);
      }
    };

    render();

    return () => {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
    };
  }, [
    isThinking,
    isAISpeaking,
    isUserSpeaking,
    isUserTurnIdle,
    isMuted,
    isConnected,
    isConnecting,
    orbDimension
  ]);

  const handleOrbClick = () => {
    if (onOrbClick) {
      onOrbClick();
    } else if (onToggleMute) {
      onToggleMute();
    }
  };

  const getAriaLabel = () => {
    if (isMuted) return 'Microphone muted';
    if (isThinking) return 'Daleel-e-Haq is verifying evidence and scripture';
    if (isAISpeaking) return 'Daleel-e-Haq is speaking';
    if (isUserSpeaking) return 'Listening to user voice';
    if (isUserTurnIdle) return 'Your turn to speak';
    if (isConnecting) return 'Connecting to live session';
    return 'Daleel-e-Haq voice orb ready';
  };

  const isInteractive = Boolean(onOrbClick || onToggleMute);

  return (
    <div
      ref={containerRef}
      onClick={handleOrbClick}
      onKeyDown={(e) => {
        if (isInteractive && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          handleOrbClick();
        }
      }}
      style={{
        position: 'relative',
        width: `${orbDimension}px`,
        height: `${orbDimension}px`,
        maxWidth: `${orbDimension}px`,
        maxHeight: `${orbDimension}px`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        userSelect: 'none',
        cursor: isInteractive ? 'pointer' : 'default',
        transition: 'transform 180ms ease'
      }}
      role={isInteractive ? 'button' : 'img'}
      tabIndex={isInteractive ? 0 : undefined}
      aria-pressed={onToggleMute ? isMuted : undefined}
      aria-label={getAriaLabel()}
      title={onToggleMute ? (isMuted ? 'Click to unmute' : 'Click to mute') : undefined}
    >
      {/* HTML5 Canvas Surface */}
      <canvas
        ref={canvasRef}
        style={{
          position: 'absolute',
          inset: 0,
          width: `${orbDimension}px`,
          height: `${orbDimension}px`,
          maxWidth: `${orbDimension}px`,
          maxHeight: `${orbDimension}px`,
          pointerEvents: 'none',
          filter: isThinking
            ? 'drop-shadow(0 0 20px rgba(245, 158, 11, 0.4))'
            : isAISpeaking
              ? 'drop-shadow(0 0 18px rgba(18, 168, 134, 0.45))'
              : isUserSpeaking
                ? 'drop-shadow(0 0 16px rgba(59, 130, 246, 0.4))'
                : isMuted
                  ? 'drop-shadow(0 0 12px rgba(239, 68, 68, 0.3))'
                  : 'drop-shadow(0 0 12px rgba(18, 168, 134, 0.25))',
          transition: 'filter 200ms ease'
        }}
      />

      {/* Subtle Bottom Mode Badge (Non-intrusive) */}
      <div
        style={{
          position: 'absolute',
          bottom: '4px',
          zIndex: 3,
          fontSize: '0.65rem',
          fontWeight: 600,
          padding: '2px 8px',
          borderRadius: '10px',
          backgroundColor:
            isMuted
              ? 'rgba(239, 68, 68, 0.2)'
              : bargeInMode === 'protected'
                ? 'rgba(59, 130, 246, 0.2)'
                : 'rgba(18, 168, 134, 0.2)',
          color:
            isMuted
              ? '#F87171'
              : bargeInMode === 'protected'
                ? '#93C5FD'
                : '#6EE7B7',
          border:
            isMuted
              ? '1px solid rgba(239, 68, 68, 0.35)'
              : bargeInMode === 'protected'
                ? '1px solid rgba(59, 130, 246, 0.35)'
                : '1px solid rgba(18, 168, 134, 0.35)',
          letterSpacing: '0.02em',
          pointerEvents: 'none'
        }}
      >
        {isMuted ? '🔇 Muted' : bargeInMode === 'protected' ? '🛡️ Protected' : '🌿 Natural'}
      </div>
    </div>
  );
};
