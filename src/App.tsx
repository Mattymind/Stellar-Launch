/* @ts-nocheck */
/* eslint-disable @typescript-eslint/no-unused-vars */
import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Rocket,
  Star,
  Zap,
  Pause,
  Play,
  Crown,
  Calendar,
  Users,
  Gift,
  Clock,
  CheckCircle,
} from "lucide-react";
import { client } from "@/lib/client";
import { useAuth } from "@adaptive-ai/sdk/client";

// Install global guards as early as possible (before React effects run) to prevent
// known transient network/RPC parsing issues from crashing the app.
const __installStellarLaunchGlobalGuards = () => {
  if (typeof window === "undefined") return;
  const w = window as any;
  if (w.__stellarLaunchGlobalGuardsInstalled) return;
  w.__stellarLaunchGlobalGuardsInstalled = true;

  const ignoreMsgRegex =
    /Failed to fetch|NetworkError|RpcError|Cannot use 'in' operator to search for 'result' in null/i;

  window.addEventListener(
    "error",
    (ev: any) => {
      const msg = String(ev?.message || ev?.error?.message || "");
      if (msg && ignoreMsgRegex.test(msg)) {
        // Prevent default browser logging + hard stops for these known transient issues.
        if (typeof ev?.preventDefault === "function") ev.preventDefault();
      }
    },
    true,
  );

  window.addEventListener("unhandledrejection", (ev: any) => {
    const reason: any = ev?.reason;
    const msg = typeof reason === "string" ? reason : reason?.message || "";
    if (msg && ignoreMsgRegex.test(msg)) {
      if (typeof ev?.preventDefault === "function") ev.preventDefault();
    }
  });
};

__installStellarLaunchGlobalGuards();
// Minimal UI primitives (local) to avoid type issues from transitive deps
const cn = (...a: Array<string | undefined | null | false>) =>
  a.filter(Boolean).join(" ");

const Button = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: string;
    size?: string;
  }
>(({ className, ...rest }, ref) => (
  <button
    ref={ref}
    className={cn(
      "inline-flex items-center justify-center rounded-md px-3 py-2 text-sm font-medium border border-border bg-secondary/20 hover:bg-secondary/30 transition",
      className,
    )}
    {...rest}
  />
));
Button.displayName = "Button";

function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-card text-card-foreground shadow-sm",
        className,
      )}
      {...props}
    />
  );
}
function CardHeader({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-6", className)} {...props} />;
}
function CardContent({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-6 pt-0", className)} {...props} />;
}
function CardTitle({
  className,
  ...props
}: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3
      className={cn(
        "text-lg font-semibold leading-none tracking-tight",
        className,
      )}
      {...props}
    />
  );
}

const DialogContext = React.createContext<{
  open: boolean;
  setOpen: (v: boolean) => void;
} | null>(null);
function Dialog({
  children,
  open: openProp,
}: {
  children: React.ReactNode;
  open?: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const isOpen = openProp ?? open;
  return (
    <DialogContext.Provider value={{ open: isOpen, setOpen }}>
      {children}
    </DialogContext.Provider>
  );
}
function DialogTrigger({
  children,
}: {
  children: React.ReactElement | React.ReactNode;
}) {
  const ctx = React.useContext(DialogContext);
  if (!ctx) return <>{children}</>;
  const onClick = (e: any) => {
    if (React.isValidElement(children) && (children as any).props?.onClick) {
      (children as any).props.onClick(e);
    }
    ctx.setOpen(true);
  };
  if (React.isValidElement(children)) {
    return React.cloneElement(children as any, { onClick });
  }
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center justify-center"
    >
      {children}
    </button>
  );
}
function DialogContent(props: any) {
  const { className, children } = props;
  const ctx = React.useContext(DialogContext);
  if (!ctx) return <>{children}</>;
  if (!ctx.open) return null;
  return (
    <div
      className={cn(
        "fixed inset-0 z-50 flex items-center justify-center",
        className,
      )}
    >
      <div
        className="absolute inset-0 bg-black/50"
        onClick={() => ctx.setOpen(false)}
      />
      <div className="relative z-10 w-[90vw] max-w-md rounded-xl border border-border bg-card p-4 shadow-xl">
        {children}
      </div>
    </div>
  );
}
function DialogHeader({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("mb-2", className)} {...props} />;
}
function DialogTitle({
  className,
  ...props
}: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h2 className={cn("text-lg font-semibold", className)} {...props} />;
}

function Badge({
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { variant?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border border-border px-2 py-0.5 text-xs",
        className,
      )}
      {...props}
    />
  );
}

interface GameObject {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  type: "star" | "obstacle";
  variant?: string; // e.g. 'building','laserEye','blackHole'
  rotation?: number;
  vx?: number;
  vy?: number;
  speed?: number;
  harm?: boolean; // if true, collision ends the run
}

interface Particle {
  id: string;
  x: number;
  y: number;
  velocityX: number;
  velocityY: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
  type?: "normal" | "pulseRing" | "textPop";
  radius?: number;
  maxRadius?: number;
  text?: string;
  fontSize?: number;
}

interface GameState {
  rocket: {
    x: number;
    y: number;
    velocityX: number;
    velocityY: number;
    fuel: number;
    rotation: number;
    collectionEffect?: {
      type: string;
      duration: number;
      maxDuration: number;
    };
  };
  camera: {
    y: number;
    shake: number;
  };
  objects: GameObject[];
  particles: Particle[];
  starsCollected: number;
  gameStatus: "ready" | "playing" | "dying" | "gameOver" | "paused";
  ignitionLevel: number;
  maxAltitude: number;
  currentAltitude: number;
  slowMotion?: {
    duration: number;
    maxDuration: number;
    intensity: number;
  };

  deathTimer?: number;

  // Prism Splitter: temporary trail of ghost hazards
  ghostTrail?: {
    duration: number;
    maxDuration: number;
    nextSpawnIn: number;
  };

  crashBubble?: {
    x: number;
    y: number;
    text: string;
    duration: number;
    maxDuration: number;
  };

  nearMissCooldown?: number;

  // Lightning screen flash effect
  lightningFlash?: {
    duration: number;
    maxDuration: number;
    intensity: number; // 0..1
    color?: string; // default white
  };

  // Black hole swallow animation state
  swallow?: {
    active: boolean;
    x: number;
    y: number;
    duration: number;
    maxDuration: number;
  };

  flightStartTime: number;
  backgroundStars: BackgroundStar[];
  nebulas: Nebula[];

  gravity?: { sign: number; duration: number };
  difficulty?: {
    density: number;
    speed: number;
    unpredictability: number;
    nextEventIn: number;
  };

  // Prevent late-game hazards from overlapping unfairly
  lateHazardLock?: {
    kind: "meteorSwarm" | "railgunSnipe" | null;
    timer: number;
  };
}
interface BackgroundStar {
  x: number;
  y: number;
  size: number;
  opacity: number;
  speed: number;
}

interface Nebula {
  x: number;
  y: number;
  radius: number;
  color1: string;
  color2: string;
}

function MobileControls({
  gameState,
  onGameAction,
}: {
  gameState: GameState;
  onGameAction: (action: string) => void;
}) {
  // Show controls during gameplay
  if (gameState.gameStatus === "playing") {
    return (
      <div className="absolute bottom-4 left-0 right-0 flex flex-col items-center gap-3 pointer-events-none">
        {/* Touch instruction pill */}
        <div
          className="px-4 py-2 rounded-[999px] border-[3px] border-[#A3BCE3] shadow-[0_0_26px_rgba(54,128,255,0.45)] pointer-events-none"
          style={{
            background:
              "radial-gradient(50% 50% at 50% 50%, rgba(33, 29, 83, 0.85) 0%, rgba(15,23,42,0.95) 100%)",
          }}
        >
          <p className="text-[11px] font-medium tracking-wide text-[#F0EFF4] text-center">
            <span className="font-semibold text-[#F3D262]">HOLD</span> to boost
            · <span className="font-semibold text-[#F3D262]">DRAG</span>
            &nbsp;to steer
          </p>
        </div>

        {/* Pause button */}
        <button
          className="pointer-events-auto w-12 h-12 rounded-full border-[3px] border-[#CDAAFF] shadow-[0_0_26px_rgba(205,170,255,0.7)] bg-black/40 flex items-center justify-center transition-transform active:scale-95"
          style={{
            background:
              "radial-gradient(50% 50% at 50% 50%, rgba(33,29,83,0.95) 0%, rgba(15,23,42,0.98) 100%)",
          }}
          onTouchStart={(e) => {
            e.preventDefault();
            onGameAction("pause");
          }}
          onClick={(e) => {
            e.preventDefault();
            onGameAction("pause");
          }}
        >
          <Pause className="w-5 h-5 text-[#F0EFF4]" />
        </button>
      </div>
    );
  }

  return null;
}

function GameCanvas({
  gameState,
  onGameAction,
  touchControlsRef,
  touchStateRef,
  requireFreshInputRef,
  userData,
}: {
  gameState: GameState;
  onGameAction: (action: string, data?: any) => void;
  touchControlsRef: React.MutableRefObject<{
    left: boolean;
    right: boolean;
    boost: boolean;
  }>;
  touchStateRef: React.MutableRefObject<{
    isActive: boolean;
    startX: number;
    startY: number;
    currentX: number;
    currentY: number;
  }>;
  requireFreshInputRef: React.MutableRefObject<boolean>;
  userData: any;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [canvasSize, setCanvasSize] = useState({ width: 400, height: 600 });
  const rocketImageRef = useRef<HTMLImageElement | null>(null);
  const satelliteImageRef = useRef<HTMLImageElement | null>(null);
  const spaceJunkImageRef = useRef<HTMLImageElement | null>(null);
  const driftingAsteroidImageRef = useRef<HTMLImageElement | null>(null);
  const stormCloudImageRef = useRef<HTMLImageElement | null>(null);
  const lightningCloudImageRef = useRef<HTMLImageElement | null>(null);
  const icePatchImageRef = useRef<HTMLImageElement | null>(null);
  const spaceMineImageRef = useRef<HTMLImageElement | null>(null);
  const lavaBoulderImageRef = useRef<HTMLImageElement | null>(null);
  const awareWallImageRef = useRef<HTMLImageElement | null>(null);

  // Load rocket image
  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      rocketImageRef.current = img;
    };
    img.src =
      "https://xg3zcyyhbr.on.adaptive.ai/cdn/pQNJNThbpe6akJXaTQhynJBdrYpfkZbX.png";
  }, []);

  // Load satellite fragment image
  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      satelliteImageRef.current = img;
    };
    img.src =
      "https://xg3zcyyhbr.on.adaptive.ai/cdn/kPbakAaPwaFwL9mE8nRWDhMPmFkYPptb.png";
  }, []);

  // Load space junk image
  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      spaceJunkImageRef.current = img;
    };
    img.src =
      "https://xg3zcyyhbr.on.adaptive.ai/cdn/3PBCd6diEiVQzd8QD8NeXHcNHgXfmqfe.png";
  }, []);

  // Load drifting asteroid image
  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      driftingAsteroidImageRef.current = img;
    };
    img.src = "https://cdn-icons-png.flaticon.com/512/7687/7687086.png";
  }, []);

  // Load storm cloud image
  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      stormCloudImageRef.current = img;
    };
    img.src =
      "https://xg3zcyyhbr.on.adaptive.ai/cdn/V36tB4jLW2jZWKK2GdG3yzTpXZZbAkAL.png";
  }, []);

  // Load lightning cloud image
  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      lightningCloudImageRef.current = img;
    };
    img.src =
      "https://xg3zcyyhbr.on.adaptive.ai/cdn/rXxpBgUcUXqgp6WZbkEZcDjdZPN2D4z4.png";
  }, []);

  // Load ice patch image
  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      icePatchImageRef.current = img;
    };
    img.src =
      "https://xg3zcyyhbr.on.adaptive.ai/cdn/rnCLERxxP4E6YcPnrR9ttzJV9chb23Y2.png";
  }, []);

  // Load space mine image
  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      spaceMineImageRef.current = img;
    };
    img.src =
      "https://xg3zcyyhbr.on.adaptive.ai/cdn/zGhEMxqMeDRryQyYWWN4zxF2zHcjzBFb.png";
  }, []);

  // Load lava boulder image (replaces Space Teeth)
  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      lavaBoulderImageRef.current = img;
    };
    img.src =
      "https://xg3zcyyhbr.on.adaptive.ai/cdn/LpgX6wpYEYNdhaE3fpT7Az2KkAdhRYYE.png";
  }, []);

  // Load aware wall image
  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      awareWallImageRef.current = img;
    };
    img.src =
      "https://xg3zcyyhbr.on.adaptive.ai/cdn/KQ9X2gZjPXqmNCMmm7gh4fzpZY7mXXyU.png";
  }, []);

  // Update canvas size based on the actual game container size (prevents stretching on desktop)
  useEffect(() => {
    const updateCanvasSize = () => {
      const el = containerRef.current;
      if (el) {
        const rect = el.getBoundingClientRect();
        const w = Math.max(1, Math.floor(rect.width));
        const h = Math.max(1, Math.floor(rect.height));
        setCanvasSize({ width: w, height: h });
        return;
      }

      // Fallback (should be rare)
      setCanvasSize({
        width: Math.floor(window.innerWidth),
        height: Math.floor(window.innerHeight),
      });
    };

    updateCanvasSize();

    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined" && containerRef.current) {
      ro = new ResizeObserver(() => updateCanvasSize());
      ro.observe(containerRef.current);
    }

    window.addEventListener("resize", updateCanvasSize);
    return () => {
      window.removeEventListener("resize", updateCanvasSize);
      if (ro) ro.disconnect();
    };
  }, []);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // High-DPI / Retina support with balanced scaling
    const dpr =
      typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
    // Reduce pixel work on low-end devices while keeping things crisp.
    const scale = Math.min(1.25, dpr);

    const displayWidth = canvasSize.width;
    const displayHeight = canvasSize.height;
    const neededWidth = Math.floor(displayWidth * scale);
    const neededHeight = Math.floor(displayHeight * scale);

    if (canvas.width !== neededWidth || canvas.height !== neededHeight) {
      canvas.width = neededWidth;
      canvas.height = neededHeight;
    }

    // Always render in world units and scale once at the top
    ctx.setTransform(scale, 0, 0, scale, 0, 0);

    // Clear canvas
    ctx.clearRect(0, 0, displayWidth, displayHeight);

    // Calculate camera offset and scaling first
    const cameraY = gameState.camera.y;
    const scaleX = displayWidth / 400;
    const scaleY = displayHeight / 600;

    // Apply camera shake
    const shakeX = (Math.random() - 0.5) * gameState.camera.shake;
    const shakeY = (Math.random() - 0.5) * gameState.camera.shake;
    ctx.save();
    ctx.translate(shakeX, shakeY);

    // Draw pure space background gradient
    const gradient = ctx.createLinearGradient(0, 0, 0, displayHeight);

    // Pure space colors with subtle nebula hints
    gradient.addColorStop(0, "#1e1b4b"); // Deep space purple
    gradient.addColorStop(0.3, "#0f0f23"); // Dark space
    gradient.addColorStop(0.6, "#000000"); // Black space
    gradient.addColorStop(1, "#000000"); // Deep black

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, displayWidth, displayHeight);

    ctx.save();

    // Draw nebulas with parallax
    gameState.nebulas.forEach((nebula) => {
      const screenY = (nebula.y - cameraY * 0.2) * scaleY;
      const scaledX = nebula.x * scaleX;
      const scaledRadius = nebula.radius * Math.min(scaleX, scaleY);
      if (screenY > -scaledRadius && screenY < canvas.height + scaledRadius) {
        const nebulaGrad = ctx.createRadialGradient(
          scaledX,
          screenY,
          0,
          scaledX,
          screenY,
          scaledRadius,
        );
        nebulaGrad.addColorStop(0, nebula.color1);
        nebulaGrad.addColorStop(1, nebula.color2);
        ctx.fillStyle = nebulaGrad;
        ctx.beginPath();
        ctx.arc(scaledX, screenY, scaledRadius, 0, 2 * Math.PI);
        ctx.fill();
      }
    });

    // Draw parallax stars
    const worldHeight = canvas.height * 2;
    gameState.backgroundStars.forEach((star) => {
      const parallaxY = star.y - cameraY * star.speed;
      let wrappedY = (parallaxY * scaleY) % worldHeight;
      if (wrappedY < 0) {
        wrappedY += worldHeight;
      }

      const scaledX = star.x * scaleX;

      ctx.beginPath();
      ctx.arc(
        scaledX,
        wrappedY,
        star.size * Math.min(scaleX, scaleY),
        0,
        Math.PI * 2,
      );
      ctx.fillStyle = `rgba(255, 255, 255, ${star.opacity})`;
      ctx.fill();
    });

    ctx.restore();

    // Global wind streaks + optional Cloud Zone haze (1000–3000m)
    {
      const angleDeg = (gameState as any).wind?.angle ?? 0;
      const strength = (gameState as any).wind?.strength ?? 0;
      const angleRad = (angleDeg * Math.PI) / 180;
      const s = Math.min(scaleX, scaleY);

      // Determine Cloud Zone factor with soft edges
      const currentAltitude = Math.max(0, 580 - gameState.rocket.y);
      let cloudFactor = 0;
      if (currentAltitude >= 1000 && currentAltitude <= 3000) {
        cloudFactor = 1;
      } else if (currentAltitude >= 900 && currentAltitude < 1000) {
        cloudFactor = (currentAltitude - 900) / 100; // fade in
      } else if (currentAltitude > 3000 && currentAltitude < 3150) {
        cloudFactor = 1 - (currentAltitude - 3000) / 150; // fade out
      }

      // Ambient cloud haze
      if (cloudFactor > 0) {
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = 0.15 * cloudFactor;
        const haze = ctx.createLinearGradient(0, 0, 0, canvas.height);
        haze.addColorStop(0, "rgba(148, 163, 184, 0.20)");
        haze.addColorStop(1, "rgba(59, 130, 246, 0.08)");
        ctx.fillStyle = haze;
        ctx.fillRect(0, 0, displayWidth, displayHeight);

        // Soft patchy glow
        for (let i = 0; i < 4; i++) {
          const cx = (i + 0.5) * (canvas.width / 4);
          const cy = canvas.height * (0.25 + 0.2 * (i % 2));
          const rg = ctx.createRadialGradient(cx, cy, 0, cx, cy, 220 * s);
          rg.addColorStop(0, "rgba(226, 232, 240, 0.10)");
          rg.addColorStop(1, "rgba(226, 232, 240, 0)");
          ctx.fillStyle = rg;
          ctx.beginPath();
          ctx.arc(cx, cy, 240 * s, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }

      // Wind streaks only in the Cloud Zone (1000–3000m)
      if (cloudFactor > 0) {
        const count = 36;
        const time = Date.now() * (0.001 + strength * 0.0025);
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        // Fade in/out near Cloud Zone boundaries
        ctx.globalAlpha = cloudFactor;

        for (let i = 0; i < count; i++) {
          // deterministic pseudo-random seeds
          const seed = Math.abs(Math.sin(i * 12.9898) * 43758.5453) % 1;
          const seed2 = Math.abs(Math.sin((i + 1) * 78.233)) % 1;
          const baseSpeed = 40 + seed * 120;
          const travel = (time * baseSpeed) % (canvas.width + canvas.height);
          const baseX = seed * canvas.width;
          const baseY = seed2 * canvas.height;
          const dx = Math.cos(angleRad) * travel;
          const dy = Math.sin(angleRad) * travel;
          const x =
            ((baseX + dx + canvas.width + 100) % (canvas.width + 100)) - 50;
          const y =
            ((baseY + dy + canvas.height + 100) % (canvas.height + 100)) - 50;

          const length = (80 + seed2 * 180) * (1 + strength * 0.8) * s;
          const width = (1.4 + strength * 2.6) * s;
          const alpha = 0.06 + strength * 0.18;

          ctx.save();
          ctx.translate(x, y);
          ctx.rotate(angleRad);
          const grad = ctx.createLinearGradient(-length / 2, 0, length / 2, 0);
          grad.addColorStop(0, "rgba(99, 102, 241, 0)");
          grad.addColorStop(0.5, `rgba(125, 211, 252, ${alpha})`);
          grad.addColorStop(1, "rgba(99, 102, 241, 0)");
          ctx.fillStyle = grad;
          ctx.fillRect(-length / 2, -width / 2, length, width);
          ctx.restore();
        }
        ctx.restore();
      }
    }

    // Speed lines (subtle “go faster” feel while boosting)
    {
      const s = Math.min(scaleX, scaleY);
      const speed = Math.max(0, -gameState.rocket.velocityY);
      const intensity = Math.max(0, Math.min(1, (speed - 2) / 9));

      if (intensity > 0 && gameState.gameStatus === "playing") {
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = 0.08 + 0.22 * intensity;

        const count = 22 + Math.floor(28 * intensity);
        const time = Date.now() * (0.002 + 0.003 * intensity);

        for (let i = 0; i < count; i++) {
          const seed = Math.abs(Math.sin(i * 12.9898) * 43758.5453) % 1;
          const seed2 = Math.abs(Math.sin((i + 9) * 78.233)) % 1;

          const x = seed * displayWidth;
          const y =
            ((seed2 * displayHeight + time * 900) % (displayHeight + 200)) -
            100;

          const len = (18 + 70 * intensity) * s;
          const w = (1.2 + 2.2 * intensity) * s;

          const grad = ctx.createLinearGradient(0, y - len, 0, y + len);
          grad.addColorStop(0, "rgba(56,189,248,0)");
          grad.addColorStop(
            0.5,
            `rgba(224,242,254,${0.22 + 0.35 * intensity})`,
          );
          grad.addColorStop(1, "rgba(56,189,248,0)");

          ctx.fillStyle = grad;
          ctx.fillRect(x - w / 2, y - len, w, len * 2);
        }

        // Soft center glow
        const centerX = gameState.rocket.x * scaleX;
        const centerY = (gameState.rocket.y - cameraY) * scaleY;

        const glow = ctx.createRadialGradient(
          centerX,
          centerY,
          0,
          centerX,
          centerY,
          240 * s,
        );
        glow.addColorStop(0, `rgba(56,189,248,${0.1 * intensity})`);
        glow.addColorStop(1, "rgba(56,189,248,0)");
        ctx.fillStyle = glow;
        ctx.fillRect(0, 0, displayWidth, displayHeight);

        ctx.restore();
      }
    }

    // Meteor Swarm lane telegraph (only while charging, keeps it readable/fair)
    {
      const laneXs = [70, 150, 250, 330];
      const activeSwarms = gameState.objects.filter(
        (o) =>
          o.type === "obstacle" &&
          o.variant === "meteorSwarm" &&
          (o as any).swarmState === "charging",
      ) as any[];

      if (activeSwarms.length) {
        const s = Math.min(scaleX, scaleY);
        ctx.save();
        ctx.globalCompositeOperation = "lighter";

        // Keep it readable: if multiple exist, show the closest one only.
        const sw = activeSwarms[0] as any;
        const targetIdxs: number[] =
          (sw.swarmTargetLaneIndexes as number[]) ?? [0, 1, 2, 3];
        const safeIdx: number = (sw.swarmSafeLaneIndex as number) ?? -1;

        for (let i = 0; i < laneXs.length; i++) {
          const x = (laneXs[i] ?? 200) * scaleX;
          const w = 52 * s;

          const isTarget = targetIdxs.includes(i);
          const isSafe = safeIdx === i;

          const grad = ctx.createLinearGradient(0, 0, 0, displayHeight);
          if (isTarget) {
            grad.addColorStop(0, "rgba(239,68,68,0)");
            grad.addColorStop(0.35, "rgba(239,68,68,0.10)");
            grad.addColorStop(0.75, "rgba(239,68,68,0.10)");
            grad.addColorStop(1, "rgba(239,68,68,0)");
          } else if (isSafe) {
            grad.addColorStop(0, "rgba(34,211,238,0)");
            grad.addColorStop(0.35, "rgba(34,211,238,0.08)");
            grad.addColorStop(0.75, "rgba(34,211,238,0.08)");
            grad.addColorStop(1, "rgba(34,211,238,0)");
          } else {
            grad.addColorStop(0, "rgba(255,255,255,0)");
            grad.addColorStop(0.35, "rgba(255,255,255,0.03)");
            grad.addColorStop(0.75, "rgba(255,255,255,0.03)");
            grad.addColorStop(1, "rgba(255,255,255,0)");
          }

          ctx.fillStyle = grad;
          ctx.fillRect(x - w / 2, 0, w, displayHeight);
        }

        ctx.restore();
      }
    }

    // Railgun Snipe telegraph: a thin targeting line (only while charging)
    {
      const activeSnipes = gameState.objects.filter(
        (o) =>
          o.type === "obstacle" &&
          o.variant === "railgunSnipe" &&
          (o as any).snipeState === "charging",
      ) as any[];

      if (activeSnipes.length) {
        const s = Math.min(scaleX, scaleY);
        ctx.save();
        ctx.globalCompositeOperation = "lighter";

        // Keep it readable: show only the closest snipe telegraph if multiple exist.
        const centerY = cameraY + 300;
        activeSnipes.sort(
          (a, b) => Math.abs(a.y - centerY) - Math.abs(b.y - centerY),
        );
        const sn = activeSnipes[0] as any;
        const targetX = (sn.snipeTargetX ?? 200) * scaleX;
        const charge = Math.max(0, Math.min(1, sn.snipeCharge ?? 0));

        const lineW = (2.5 + 3.5 * charge) * s;
        const glow = (10 + 18 * charge) * s;

        // Soft vertical highlight
        const col = ctx.createLinearGradient(0, 0, 0, displayHeight);
        col.addColorStop(0, `rgba(224,242,254,${0.0 + 0.05 * charge})`);
        col.addColorStop(0.5, `rgba(56,189,248,${0.1 + 0.18 * charge})`);
        col.addColorStop(1, `rgba(224,242,254,${0.0 + 0.05 * charge})`);
        ctx.fillStyle = col;
        ctx.fillRect(targetX - 18 * s, 0, 36 * s, displayHeight);

        // Crisp beam line
        ctx.shadowColor = "rgba(56,189,248,0.95)";
        ctx.shadowBlur = glow;
        ctx.strokeStyle = `rgba(250,250,255,${0.45 + 0.5 * charge})`;
        ctx.lineWidth = lineW;
        ctx.beginPath();
        ctx.moveTo(targetX, 0);
        ctx.lineTo(targetX, displayHeight);
        ctx.stroke();

        ctx.restore();
      }
    }

    // Draw particles first (behind objects)
    gameState.particles.forEach((particle) => {
      const screenY = (particle.y - cameraY) * scaleY;
      const scaledX = particle.x * scaleX;

      if (screenY > -50 && screenY < canvas.height + 50) {
        ctx.save();
        const alpha = particle.life / particle.maxLife;
        ctx.globalAlpha = alpha;

        if (particle.type === "pulseRing") {
          // Draw expanding pulse ring
          const progress = 1 - particle.life / particle.maxLife;
          const currentRadius =
            (particle.radius || 0) +
            progress * ((particle.maxRadius || 50) - (particle.radius || 0));

          ctx.strokeStyle = particle.color;
          ctx.lineWidth = 4 * Math.min(scaleX, scaleY) * alpha;
          ctx.shadowColor = particle.color;
          ctx.shadowBlur = 15 * Math.min(scaleX, scaleY);
          ctx.beginPath();
          ctx.arc(
            scaledX,
            screenY,
            currentRadius * Math.min(scaleX, scaleY),
            0,
            Math.PI * 2,
          );
          ctx.stroke();

          // Inner pulse ring
          ctx.globalAlpha = alpha * 0.5;
          ctx.lineWidth = 2 * Math.min(scaleX, scaleY);
          ctx.beginPath();
          ctx.arc(
            scaledX,
            screenY,
            currentRadius * 0.7 * Math.min(scaleX, scaleY),
            0,
            Math.PI * 2,
          );
          ctx.stroke();
        } else if (particle.type === "textPop") {
          const baseUnit = Math.min(scaleX, scaleY);
          const progress = 1 - particle.life / particle.maxLife;
          const yFloat = -18 * baseUnit * progress;

          ctx.save();
          ctx.translate(scaledX, screenY + yFloat);
          ctx.globalCompositeOperation = "lighter";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";

          const fontSize = (particle.fontSize ?? 16) * baseUnit;
          ctx.font = `900 ${fontSize}px system-ui, -apple-system, sans-serif`;

          ctx.shadowColor = particle.color;
          ctx.shadowBlur = 14 * baseUnit;
          ctx.fillStyle = particle.color;
          ctx.fillText(particle.text ?? "", 0, 0);

          ctx.restore();
        } else {
          // Draw normal particles
          ctx.fillStyle = particle.color;
          ctx.beginPath();
          ctx.arc(
            scaledX,
            screenY,
            particle.size * Math.min(scaleX, scaleY),
            0,
            Math.PI * 2,
          );
          ctx.fill();
        }
        ctx.restore();
      }
    });

    // Draw objects
    gameState.objects.forEach((obj) => {
      const screenY = (obj.y - cameraY) * scaleY;
      const scaledX = obj.x * scaleX;

      // Only draw if object is visible
      if (screenY > -50 && screenY < canvas.height + 50) {
        ctx.save();
        ctx.translate(scaledX, screenY);
        ctx.rotate(((obj.rotation || 0) * Math.PI) / 180);

        if (obj.type === "star") {
          // Draw animated star
          ctx.fillStyle = "#fbbf24";
          ctx.shadowColor = "#fbbf24";
          ctx.shadowBlur = 15 * Math.min(scaleX, scaleY);

          // Draw star shape
          const size = 12 * Math.min(scaleX, scaleY);
          ctx.beginPath();
          for (let i = 0; i < 5; i++) {
            const angle = ((i * 144 - 90) * Math.PI) / 180;
            const x = Math.cos(angle) * size;
            const y = Math.sin(angle) * size;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.closePath();
          ctx.fill();
        } else if (obj.type === "obstacle") {
          // Variant-based surreal visuals
          const s = Math.min(scaleX, scaleY);
          switch (obj.variant) {
            case "building": {
              ctx.fillStyle = "#334155";
              ctx.shadowColor = "#475569";
              ctx.shadowBlur = 10 * s;
              ctx.fillRect(
                -obj.width * s * 0.5,
                -obj.height * s,
                obj.width * s,
                obj.height * s,
              );
              // windows
              ctx.fillStyle = "#fbbf24";
              for (let i = -2; i <= 2; i++) {
                for (let j = -3; j <= 0; j++) {
                  if (Math.random() < 0.6) {
                    ctx.fillRect(i * 12, j * 16, 6, 8);
                  }
                }
              }
              break;
            }
            case "bird": {
              ctx.fillStyle = "#e11d48";
              ctx.beginPath();
              ctx.moveTo(-10 * s, 0);
              ctx.lineTo(0, -6 * s);
              ctx.lineTo(10 * s, 0);
              ctx.closePath();
              ctx.fill();
              break;
            }
            case "balloon": {
              const r = 12 * s;
              ctx.fillStyle = "#f43f5e";
              ctx.beginPath();
              ctx.arc(0, -r, r, 0, Math.PI * 2);
              ctx.fill();
              ctx.strokeStyle = "#f43f5e";
              ctx.beginPath();
              ctx.moveTo(0, 0);
              ctx.lineTo(0, 15 * s);
              ctx.stroke();
              break;
            }
            case "stormCloud": {
              const img = stormCloudImageRef.current;
              const flicker = (Math.sin(Date.now() * 0.02) + 1) * 0.5;
              ctx.shadowColor = `rgba(148,163,184,${0.5 + flicker * 0.3})`;
              ctx.shadowBlur = 18 * s * (0.6 + flicker * 0.6);

              if (img) {
                const w = obj.width * s * 1.4;
                const h = obj.height * s * 1.2;
                ctx.drawImage(img, -w / 2, -h / 2, w, h);
              } else {
                for (let i = -2; i <= 2; i++) {
                  const rg = ctx.createRadialGradient(
                    i * 14 * s,
                    -10 * s,
                    4 * s,
                    i * 14 * s,
                    -10 * s,
                    18 * s,
                  );
                  rg.addColorStop(0, "rgba(203,213,225,0.9)");
                  rg.addColorStop(1, "rgba(100,116,139,0.6)");
                  ctx.fillStyle = rg;
                  ctx.beginPath();
                  ctx.arc(
                    i * 12 * s,
                    -8 * s + Math.sin(i + Date.now() * 0.002) * 2 * s,
                    16 * s,
                    0,
                    Math.PI * 2,
                  );
                  ctx.fill();
                }
              }

              ctx.shadowBlur = 0;
              break;
            }
            case "lightningCloud": {
              // Static lightning cloud that emits vertical strikes below it
              const img = lightningCloudImageRef.current;
              const lc: any = obj as any;
              const isStriking = !!lc.isStriking;
              const charge = Math.max(0, Math.min(1, lc.chargeLevel ?? 0));

              // Cloud body glow
              const flicker = (Math.sin(Date.now() * 0.035) + 1) * 0.5;
              ctx.shadowColor = `rgba(180,200,255,${0.45 + flicker * 0.35})`;
              ctx.shadowBlur = 22 * s * (0.6 + flicker * 0.6);

              if (img) {
                // Match storm cloud sizing so both cloud icons feel consistent
                const w = obj.width * s * 1.4;
                const h = obj.height * s * 1.2;
                ctx.drawImage(img, -w / 2, -h / 2, w, h);
              } else {
                // Fallback to procedural cloud if image not ready
                for (let i = -2; i <= 2; i++) {
                  const rg = ctx.createRadialGradient(
                    i * 14 * s,
                    -12 * s,
                    4 * s,
                    i * 14 * s,
                    -12 * s,
                    22 * s,
                  );
                  rg.addColorStop(0, "rgba(226,232,240,0.95)");
                  rg.addColorStop(1, "rgba(148,163,184,0.55)");
                  ctx.fillStyle = rg;
                  ctx.beginPath();
                  ctx.arc(i * 12 * s, -10 * s, 18 * s, 0, Math.PI * 2);
                  ctx.fill();
                }
              }
              ctx.shadowBlur = 0;

              // If currently striking, draw an animated bolt below
              const totalLen = (isStriking ? 90 : 60) * s;
              const jitter = isStriking ? 10 * s : 4 * s;
              const now = Date.now();

              // Draw subtle inner charge arcs in the cloud when charging
              if (!isStriking && charge > 0.2) {
                ctx.save();
                ctx.globalAlpha = 0.4 * charge;
                ctx.strokeStyle = `rgba(200,220,255,${0.6 * charge})`;
                ctx.lineWidth = 1.5 * s;
                ctx.beginPath();
                ctx.moveTo(-10 * s, -12 * s);
                ctx.lineTo(0, -16 * s);
                ctx.lineTo(10 * s, -12 * s);
                ctx.stroke();
                ctx.restore();
              }

              if (isStriking) {
                ctx.save();
                ctx.shadowColor = "rgba(250,250,255,0.9)";
                ctx.shadowBlur = 18 * s;
                for (let k = 0; k < 2; k++) {
                  ctx.beginPath();
                  ctx.moveTo(0, -6 * s);
                  let yCursor = -6 * s;
                  for (let i = 0; i < 6; i++) {
                    const xJ = Math.sin(now * 0.02 + i * 9 + k * 13) * jitter;
                    yCursor += totalLen / 6;
                    ctx.lineTo(xJ, yCursor);
                  }
                  ctx.strokeStyle = "rgba(250,250,255,0.95)";
                  ctx.lineWidth = 4 * s;
                  ctx.stroke();
                }
                ctx.restore();
              }
              break;
            }
            case "lightning": {
              // Proper animated lightning strike with charge-up and strike phases
              const now = Date.now();
              const isStriking = !!(obj as any).isStriking;
              const charge = Math.max(
                0,
                Math.min(1, (obj as any).chargeLevel ?? 0),
              );

              // Base glow (charge-up)
              const chargeAlpha = 0.2 + 0.5 * charge;
              ctx.shadowColor = `rgba(250,250,255,${0.6 + charge * 0.3})`;
              ctx.shadowBlur = (10 + 14 * charge) * s;

              // Draw multiple jittered bolt segments when striking
              const segments = isStriking ? 5 : 3;
              const totalLen = (isStriking ? 80 : 60) * s;
              const jitter = isStriking ? 10 * s : 4 * s;

              for (let k = 0; k < (isStriking ? 2 : 1); k++) {
                ctx.beginPath();
                ctx.moveTo(0, -totalLen * 0.6);
                let yCursor = -totalLen * 0.6;
                for (let i = 0; i < segments; i++) {
                  const xJ = Math.sin(now * 0.02 + i * 9 + k * 13) * jitter;
                  yCursor += totalLen / segments;
                  ctx.lineTo(xJ, yCursor);
                }
                ctx.strokeStyle = isStriking
                  ? `rgba(250,250,255,${0.95})`
                  : `rgba(200,220,255,${0.4 + chargeAlpha * 0.6})`;
                ctx.lineWidth = (isStriking ? 4 : 2.5) * s;
                ctx.stroke();

                // occasional branches during strike
                if (isStriking) {
                  ctx.beginPath();
                  const bx = Math.cos(now * 0.03 + k) * 8 * s;
                  const by =
                    (-totalLen * 0.2 + Math.sin(now * 0.05 + k) * 8) * s;
                  ctx.moveTo(bx, by);
                  ctx.lineTo(bx - 16 * s, by + 10 * s);
                  ctx.stroke();
                }
              }

              ctx.shadowBlur = 0;
              break;
            }
            case "icePatch": {
              // Frosty ice patch that can crack and then break
              const img = icePatchImageRef.current;
              const w = obj.width * s;
              const h = obj.height * s;

              if (img) {
                ctx.drawImage(img, -w / 2, -h / 2, w, h);
              } else {
                const g = ctx.createLinearGradient(
                  -w / 2,
                  -h / 2,
                  w / 2,
                  h / 2,
                );
                g.addColorStop(0, "rgba(191,219,254,0.85)");
                g.addColorStop(1, "rgba(59,130,246,0.55)");
                ctx.fillStyle = g;
                ctx.fillRect(-w / 2, -h / 2, w, h);
                ctx.strokeStyle = "rgba(255,255,255,0.6)";
                ctx.lineWidth = 2 * s;
                ctx.strokeRect(-w / 2, -h / 2, w, h);
              }

              // If cracked, draw visible fissures on top of the icon
              const isCracked = (obj as any).state === "cracked";
              if (isCracked) {
                ctx.save();
                ctx.strokeStyle = "rgba(255,255,255,0.9)";
                ctx.lineWidth = 1.5 * s;
                ctx.globalAlpha = 0.9;
                // main crack
                ctx.beginPath();
                ctx.moveTo(-36 * s, -8 * s);
                ctx.lineTo(-10 * s, -5 * s);
                ctx.lineTo(8 * s, -2 * s);
                ctx.lineTo(30 * s, 6 * s);
                ctx.stroke();
                // secondary branches
                ctx.beginPath();
                ctx.moveTo(-10 * s, -5 * s);
                ctx.lineTo(-2 * s, -12 * s);
                ctx.moveTo(8 * s, -2 * s);
                ctx.lineTo(16 * s, -10 * s);
                ctx.moveTo(14 * s, 2 * s);
                ctx.lineTo(6 * s, 10 * s);
                ctx.stroke();
                ctx.restore();
              } else {
                // subtle glint on intact ice
                ctx.fillStyle = "rgba(255,255,255,0.6)";
                ctx.beginPath();
                ctx.moveTo(-30 * s, -6 * s);
                ctx.lineTo(-10 * s, -10 * s);
                ctx.lineTo(-15 * s, -4 * s);
                ctx.closePath();
                ctx.fill();
              }
              break;
            }
            case "lavaRock": {
              ctx.fillStyle = "#fb923c";
              ctx.shadowColor = "#f97316";
              ctx.shadowBlur = 12 * s;
              ctx.beginPath();
              for (let i = 0; i < 7; i++) {
                const ang = (i / 7) * Math.PI * 2;
                const rad =
                  10 * s + Math.sin(i * 2 + Date.now() * 0.004) * 3 * s;
                ctx.lineTo(Math.cos(ang) * rad, Math.sin(ang) * rad);
              }
              ctx.closePath();
              ctx.fill();
              break;
            }
            case "lavaBoulder": {
              const img = lavaBoulderImageRef.current;
              if (img) {
                const size = 78 * s;
                ctx.drawImage(img, -size / 2, -size / 2, size, size);
              } else {
                // fallback: use the lava rock look if the icon hasn't loaded yet
                ctx.fillStyle = "#fb923c";
                ctx.shadowColor = "#f97316";
                ctx.shadowBlur = 12 * s;
                ctx.beginPath();
                for (let i = 0; i < 7; i++) {
                  const ang = (i / 7) * Math.PI * 2;
                  const rad =
                    12 * s + Math.sin(i * 2 + Date.now() * 0.004) * 3 * s;
                  ctx.lineTo(Math.cos(ang) * rad, Math.sin(ang) * rad);
                }
                ctx.closePath();
                ctx.fill();
                ctx.shadowBlur = 0;
              }
              break;
            }
            case "magnetParticle": {
              // Small blue energy orb with electric sparks
              const coreRadius = 6 * s;

              // Glowing core
              const coreGrad = ctx.createRadialGradient(
                0,
                0,
                0,
                0,
                0,
                coreRadius * 1.6,
              );
              coreGrad.addColorStop(0, "rgba(56,189,248,0.95)");
              coreGrad.addColorStop(0.5, "rgba(59,130,246,0.9)");
              coreGrad.addColorStop(1, "rgba(15,23,42,0)");
              ctx.fillStyle = coreGrad;
              ctx.beginPath();
              ctx.arc(0, 0, coreRadius * 1.6, 0, Math.PI * 2);
              ctx.fill();

              // Bright inner orb
              ctx.fillStyle = "#60a5fa";
              ctx.shadowColor = "#38bdf8";
              ctx.shadowBlur = 12 * s;
              ctx.beginPath();
              ctx.arc(0, 0, coreRadius, 0, Math.PI * 2);
              ctx.fill();
              ctx.shadowBlur = 0;

              // Electric sparks around the orb
              const sparkCount = 6;
              const time = Date.now() * 0.008;
              ctx.strokeStyle = "#e0f2fe";
              ctx.lineWidth = 1.5 * s;
              for (let i = 0; i < sparkCount; i++) {
                const angle = (i / sparkCount) * Math.PI * 2 + time * 0.6;
                const r1 = coreRadius * 1.4;
                const r2 = coreRadius * 2.2;

                ctx.beginPath();
                ctx.moveTo(Math.cos(angle) * r1, Math.sin(angle) * r1);
                const midAngle = angle + (Math.random() - 0.5) * 0.4;
                const midR = (r1 + r2) / 2;
                ctx.lineTo(
                  Math.cos(midAngle) * midR,
                  Math.sin(midAngle) * midR,
                );
                ctx.lineTo(Math.cos(angle) * r2, Math.sin(angle) * r2);
                ctx.stroke();
              }

              break;
            }
            case "singularityShards": {
              // Orbiting debris ring: the shards are lethal, the center is safe.
              const anyObj: any = obj as any;
              const coreR = 10 * s;
              const orbitR = (anyObj.orbitRadius ?? 58) * s;
              const count = Math.max(4, Math.min(10, anyObj.shardCount ?? 6));
              const shardSize = (anyObj.shardSize ?? 10) * s;

              const t = Date.now() * 0.001;
              const speed = (anyObj.orbitSpeed ?? 1.2) * 0.9;
              const phase = anyObj.orbitPhase ?? 0;
              const theta0 = t * speed + phase;

              // Center glow
              const coreGrad = ctx.createRadialGradient(
                0,
                0,
                0,
                0,
                0,
                coreR * 3.2,
              );
              coreGrad.addColorStop(0, "rgba(167,139,250,0.95)");
              coreGrad.addColorStop(0.5, "rgba(59,130,246,0.35)");
              coreGrad.addColorStop(1, "rgba(2,6,23,0)");
              ctx.fillStyle = coreGrad;
              ctx.beginPath();
              ctx.arc(0, 0, coreR * 3.2, 0, Math.PI * 2);
              ctx.fill();

              // Orbit ring
              ctx.save();
              ctx.globalCompositeOperation = "lighter";
              ctx.shadowColor = "rgba(59,130,246,0.7)";
              ctx.shadowBlur = 10 * s;
              ctx.strokeStyle = "rgba(224,242,254,0.5)";
              ctx.lineWidth = 2.5 * s;
              ctx.beginPath();
              ctx.arc(0, 0, orbitR, 0, Math.PI * 2);
              ctx.stroke();
              ctx.restore();

              // Shards
              for (let i = 0; i < count; i++) {
                const a = theta0 + (i / count) * Math.PI * 2;
                const px = Math.cos(a) * orbitR;
                const py = Math.sin(a) * orbitR;

                ctx.save();
                ctx.translate(px, py);
                ctx.rotate(a + Math.sin(t * 3 + i) * 0.25);

                const gl = ctx.createRadialGradient(
                  0,
                  0,
                  0,
                  0,
                  0,
                  shardSize * 2.2,
                );
                gl.addColorStop(0, "rgba(250,250,255,0.9)");
                gl.addColorStop(0.35, "rgba(56,189,248,0.55)");
                gl.addColorStop(1, "rgba(2,6,23,0)");
                ctx.fillStyle = gl;
                ctx.beginPath();
                ctx.arc(0, 0, shardSize * 2.2, 0, Math.PI * 2);
                ctx.fill();

                ctx.shadowColor = "rgba(167,139,250,0.9)";
                ctx.shadowBlur = 12 * s;
                ctx.fillStyle = "rgba(226,232,240,0.95)";
                ctx.beginPath();
                ctx.moveTo(-shardSize * 0.9, shardSize * 0.2);
                ctx.lineTo(0, -shardSize * 1.1);
                ctx.lineTo(shardSize * 1.0, shardSize * 0.3);
                ctx.lineTo(0.2 * shardSize, shardSize * 1.1);
                ctx.closePath();
                ctx.fill();
                ctx.shadowBlur = 0;

                ctx.restore();
              }

              // Tiny core dot on top
              ctx.fillStyle = "rgba(15,23,42,0.95)";
              ctx.beginPath();
              ctx.arc(0, 0, coreR * 0.65, 0, Math.PI * 2);
              ctx.fill();
              break;
            }
            case "blackHole": {
              // Circular blue-purple gravity well with distortion ring
              const baseR = 20 * s;
              let r = baseR;

              const swallow = (gameState as any).swallow;
              if (
                swallow &&
                swallow.active &&
                swallow.x === obj.x &&
                swallow.y === obj.y
              ) {
                const t =
                  1 - swallow.duration / Math.max(1, swallow.maxDuration);
                r = baseR * (1 - 0.3 * t); // iris-style contraction during swallow
              }

              const grd = ctx.createRadialGradient(0, 0, 2, 0, 0, r * 1.6);
              grd.addColorStop(0, "#38bdf8");
              grd.addColorStop(0.5, "#6366f1");
              grd.addColorStop(1, "#020617");
              ctx.fillStyle = grd;
              ctx.beginPath();
              ctx.arc(0, 0, r, 0, Math.PI * 2);
              ctx.fill();

              // Distortion/event horizon ring
              ctx.strokeStyle = "rgba(191,219,254,0.9)";
              ctx.lineWidth = 2 * s;
              ctx.shadowColor = "rgba(129,140,248,0.8)";
              ctx.shadowBlur = 10 * s;
              ctx.beginPath();
              ctx.arc(0, 0, r * 1.3, 0, Math.PI * 2);
              ctx.stroke();
              ctx.shadowBlur = 0;
              break;
            }
            case "rotatingWall": {
              ctx.fillStyle = "#7c3aed";
              ctx.fillRect(-45 * s, -8 * s, 90 * s, 16 * s);
              break;
            }
            case "warpedWall": {
              ctx.fillStyle = "#06b6d4";
              ctx.fillRect(-55 * s, -9 * s, 110 * s, 18 * s);
              break;
            }
            case "spaceMine": {
              const img = spaceMineImageRef.current;
              const mineState: any = obj as any;
              const armed = !!mineState.mineArmed;
              const exploding = !!mineState.mineExploding;
              const prog = Math.max(
                0,
                Math.min(1, mineState.mineExplosionProgress ?? 0),
              );
              const mineFade = exploding ? Math.max(0, 1 - prog) : 1;

              // Mine body (icon + light) fades out during the explosion
              ctx.save();
              ctx.globalAlpha = ctx.globalAlpha * mineFade;

              // Draw mine icon
              if (img) {
                const w = obj.width * s * 1.4;
                const h = obj.height * s * 1.4;
                ctx.drawImage(img, -w / 2, -h / 2, w, h);
              } else {
                // Fallback: a simple spiky circle
                ctx.fillStyle = "#475569";
                ctx.beginPath();
                ctx.arc(0, 0, 18 * s, 0, Math.PI * 2);
                ctx.fill();
                for (let i = 0; i < 8; i++) {
                  const a = (i / 8) * Math.PI * 2;
                  ctx.fillRect(
                    Math.cos(a) * 18 * s,
                    Math.sin(a) * 18 * s,
                    6 * s,
                    2 * s,
                  );
                }
              }

              // Idle blink red light in the middle (ramps up during arming)
              {
                const timer = mineState.mineTimer ?? 0;
                const maxTimer = mineState.mineTimerMax ?? 60;
                const armProgress = armed
                  ? Math.max(0, Math.min(1, 1 - timer / Math.max(1, maxTimer)))
                  : 0;

                const t = Date.now() * (armed ? 0.02 : 0.006);
                const blink = (Math.sin(t) + 1) * 0.5; // 0..1

                // Base blink, then build up intensity as it arms
                const baseAlpha = 0.15 + 0.75 * blink;
                const alpha = Math.min(
                  1,
                  baseAlpha * (0.75 + 1.6 * armProgress),
                );
                const blur = (10 + 18 * armProgress) * s;
                const r = (4.5 + 2.5 * armProgress) * s;

                ctx.save();
                ctx.globalAlpha = alpha;
                ctx.shadowColor = "rgba(239,68,68,0.95)";
                ctx.shadowBlur = blur;
                ctx.fillStyle = "#ef4444";
                ctx.beginPath();
                ctx.arc(0, 0, r, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
              }

              ctx.restore();

              // Explosion wave (spreads to 3x mine size) — fades out smoothly
              if (exploding) {
                const maxR = Math.max(obj.width, obj.height) * 3 * s;
                const baseR = Math.max(obj.width, obj.height) * 0.7 * s;
                const r = baseR + (maxR - baseR) * prog;

                const fade = Math.max(0, 1 - prog);

                ctx.save();
                ctx.globalCompositeOperation = "lighter";

                const ringGrad = ctx.createRadialGradient(
                  0,
                  0,
                  r * 0.2,
                  0,
                  0,
                  r,
                );
                ringGrad.addColorStop(0, "rgba(250, 204, 21, 0.0)");
                ringGrad.addColorStop(
                  0.6,
                  `rgba(249, 115, 22, ${0.25 * fade})`,
                );
                ringGrad.addColorStop(1, "rgba(239, 68, 68, 0.0)");

                ctx.strokeStyle = `rgba(250, 204, 21, ${0.85 * fade})`;
                ctx.lineWidth = 6 * s;
                ctx.shadowColor = `rgba(249, 115, 22, ${0.9 * fade})`;
                ctx.shadowBlur = 16 * s * (0.4 + 0.6 * fade);
                ctx.beginPath();
                ctx.arc(0, 0, r, 0, Math.PI * 2);
                ctx.stroke();

                // soft fill glow
                ctx.fillStyle = ringGrad;
                ctx.globalAlpha = 0.9 * fade;
                ctx.beginPath();
                ctx.arc(0, 0, r, 0, Math.PI * 2);
                ctx.fill();

                ctx.restore();
              }
              break;
            }
            case "spaceTeeth": {
              ctx.fillStyle = "#e11d48";
              const t = (Math.sin(Date.now() * 0.005) * 0.5 + 0.5) * 10 * s;
              ctx.fillRect(-40 * s, -t - 8 * s, 80 * s, 8 * s);
              ctx.fillRect(-40 * s, t, 80 * s, 8 * s);
              break;
            }
            case "awareWall": {
              const img = awareWallImageRef.current;
              if (img) {
                // The provided asset is designed for a wider, more readable wall.
                const w = 109 * s;
                const h = 40 * s;
                ctx.drawImage(img, -w / 2, -h / 2, w, h);
              } else {
                ctx.fillStyle = "#22c55e";
                ctx.fillRect(-54.5 * s, -20 * s, 109 * s, 40 * s);
              }
              break;
            }
            case "fractalWall": {
              // Removed (no longer used)
              break;
            }
            case "meteorSwarm": {
              // Meteor Swarm emitter is intentionally hidden.
              // Cues are shown via the lane telegraph + banner + the meteors themselves.
              break;
            }
            case "meteor": {
              // Fast streak projectile (very dangerous)
              const vx = (obj as any).vx ?? 0;
              const vy = (obj as any).vy ?? 6;
              const ang = Math.atan2(vy, vx);
              const len = 70 * s;
              const head = 10 * s;

              ctx.save();
              ctx.rotate(ang);
              ctx.globalCompositeOperation = "lighter";

              const g = ctx.createLinearGradient(-len, 0, head, 0);
              g.addColorStop(0, "rgba(239,68,68,0)");
              g.addColorStop(0.55, "rgba(251,113,133,0.28)");
              g.addColorStop(1, "rgba(254,242,242,0.95)");

              ctx.strokeStyle = g;
              ctx.lineWidth = 6 * s;
              ctx.shadowColor = "rgba(251,113,133,0.8)";
              ctx.shadowBlur = 14 * s;
              ctx.beginPath();
              ctx.moveTo(-len, 0);
              ctx.lineTo(head, 0);
              ctx.stroke();

              // hot head
              const hg = ctx.createRadialGradient(0, 0, 0, 0, 0, 16 * s);
              hg.addColorStop(0, "rgba(254,242,242,0.95)");
              hg.addColorStop(0.4, "rgba(251,113,133,0.75)");
              hg.addColorStop(1, "rgba(239,68,68,0)");
              ctx.fillStyle = hg;
              ctx.beginPath();
              ctx.arc(0, 0, 16 * s, 0, Math.PI * 2);
              ctx.fill();

              ctx.restore();
              break;
            }
            case "railShot": {
              // Ultra-fast straight shot (dangerous, but clearly telegraphed)
              const vx = (obj as any).vx ?? 0;
              const vy = (obj as any).vy ?? 18;
              const ang = Math.atan2(vy, vx);
              const len = 95 * s;
              const head = 12 * s;

              ctx.save();
              ctx.rotate(ang);
              ctx.globalCompositeOperation = "lighter";

              const g = ctx.createLinearGradient(-len, 0, head, 0);
              g.addColorStop(0, "rgba(56,189,248,0)");
              g.addColorStop(0.55, "rgba(125,211,252,0.22)");
              g.addColorStop(1, "rgba(250,250,255,0.95)");

              ctx.strokeStyle = g;
              ctx.lineWidth = 5 * s;
              ctx.shadowColor = "rgba(56,189,248,0.9)";
              ctx.shadowBlur = 16 * s;
              ctx.beginPath();
              ctx.moveTo(-len, 0);
              ctx.lineTo(head, 0);
              ctx.stroke();

              const hg = ctx.createRadialGradient(0, 0, 0, 0, 0, 18 * s);
              hg.addColorStop(0, "rgba(250,250,255,0.95)");
              hg.addColorStop(0.35, "rgba(125,211,252,0.75)");
              hg.addColorStop(1, "rgba(56,189,248,0)");
              ctx.fillStyle = hg;
              ctx.beginPath();
              ctx.arc(0, 0, 18 * s, 0, Math.PI * 2);
              ctx.fill();

              ctx.restore();
              break;
            }
            case "railgunSnipe": {
              // Intentionally hidden (the telegraph + shot are the readable parts)
              break;
            }
            case "prismSplitter": {
              // Crystal prism that creates a ghost trail when touched
              const t = Date.now() * 0.0035;
              const r = 18 * s;

              // Outer glow
              ctx.save();
              ctx.globalCompositeOperation = "lighter";
              ctx.shadowColor = "rgba(167,139,250,0.85)";
              ctx.shadowBlur = 16 * s;

              const g = ctx.createLinearGradient(-r, -r, r, r);
              g.addColorStop(0, "rgba(56,189,248,0.85)");
              g.addColorStop(0.5, "rgba(167,139,250,0.95)");
              g.addColorStop(1, "rgba(236,72,153,0.75)");

              ctx.fillStyle = g;
              ctx.beginPath();
              ctx.moveTo(0, -r);
              ctx.lineTo(r, 0);
              ctx.lineTo(0, r);
              ctx.lineTo(-r, 0);
              ctx.closePath();
              ctx.fill();

              // Inner facet shimmer
              ctx.shadowBlur = 0;
              ctx.globalAlpha = 0.7;
              ctx.strokeStyle = "rgba(224,242,254,0.85)";
              ctx.lineWidth = 2 * s;
              ctx.beginPath();
              ctx.moveTo(0, -r * 0.65);
              ctx.lineTo(r * 0.55, 0);
              ctx.lineTo(0, r * 0.65);
              ctx.lineTo(-r * 0.55, 0);
              ctx.closePath();
              ctx.stroke();

              // Small twinkle dot
              ctx.globalAlpha = 0.45 + 0.25 * (Math.sin(t * 3) * 0.5 + 0.5);
              ctx.fillStyle = "rgba(224,242,254,1)";
              ctx.beginPath();
              ctx.arc(r * 0.35, -r * 0.15, 2.2 * s, 0, Math.PI * 2);
              ctx.fill();

              ctx.restore();
              break;
            }
            case "ghostClone": {
              // Short-lived, avoidable afterimage hazards
              const anyObj: any = obj as any;
              const ttl = Math.max(0, anyObj.ghostTtl ?? 0);
              const maxTtl = Math.max(1, anyObj.ghostTtlMax ?? 120);
              const arming = Math.max(0, anyObj.ghostArming ?? 0);

              const lifeAlpha = Math.min(1, ttl / maxTtl);
              const armAlpha = arming > 0 ? 0.25 : 1;
              const alpha = 0.55 * lifeAlpha * armAlpha;

              const r = 14 * s;
              ctx.save();
              ctx.globalAlpha = alpha;
              ctx.globalCompositeOperation = "lighter";
              ctx.shadowColor = "rgba(56,189,248,0.65)";
              ctx.shadowBlur = 10 * s;

              const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 1.6);
              g.addColorStop(0, "rgba(224,242,254,0.85)");
              g.addColorStop(0.4, "rgba(56,189,248,0.55)");
              g.addColorStop(1, "rgba(2,6,23,0)");

              ctx.fillStyle = g;
              ctx.beginPath();
              ctx.arc(0, 0, r * 1.6, 0, Math.PI * 2);
              ctx.fill();

              // Diamond core
              ctx.globalAlpha = alpha * 0.9;
              ctx.fillStyle = "rgba(56,189,248,0.85)";
              ctx.beginPath();
              ctx.moveTo(0, -r);
              ctx.lineTo(r, 0);
              ctx.lineTo(0, r);
              ctx.lineTo(-r, 0);
              ctx.closePath();
              ctx.fill();

              // Arming hint: dashed ring while it's safe
              if (arming > 0) {
                ctx.globalAlpha = alpha;
                ctx.strokeStyle = "rgba(224,242,254,0.55)";
                ctx.lineWidth = 2 * s;
                ctx.setLineDash([4 * s, 4 * s]);
                ctx.beginPath();
                ctx.arc(0, 0, r * 1.35, 0, Math.PI * 2);
                ctx.stroke();
                ctx.setLineDash([]);
              }

              ctx.restore();
              break;
            }
            case "gravityFlip": {
              // Visible, avoidable hazard that flips gravity when touched
              const t = Date.now() * 0.006;
              const r = 20 * s + Math.sin(t) * 2 * s;

              // Outer pulsing ring
              ctx.save();
              ctx.shadowColor = "rgba(239,68,68,0.9)";
              ctx.shadowBlur = 12 * s;
              ctx.strokeStyle = "#ef4444";
              ctx.lineWidth = 3 * s;
              ctx.beginPath();
              ctx.arc(0, 0, r, 0, Math.PI * 2);
              ctx.stroke();
              ctx.restore();

              // Up/Down chevrons inside the ring
              ctx.fillStyle = "#ef4444";
              const aw = 6 * s,
                ah = 8 * s;
              // Up chevron
              ctx.beginPath();
              ctx.moveTo(0, -r + 6 * s);
              ctx.lineTo(-aw, -r + 6 * s + ah);
              ctx.lineTo(aw, -r + 6 * s + ah);
              ctx.closePath();
              ctx.fill();
              // Down chevron
              ctx.beginPath();
              ctx.moveTo(0, r - 6 * s);
              ctx.lineTo(-aw, r - 6 * s - ah);
              ctx.lineTo(aw, r - 6 * s - ah);
              ctx.closePath();
              ctx.fill();
              break;
            }
            case "laserGate": {
              const anyObj: any = obj as any;
              const laserState = anyObj.laserState || "cooldown";
              const charge = Math.max(0, Math.min(1, anyObj.laserCharge ?? 0));
              const s2 = Math.min(scaleX, scaleY);

              const w = (obj.width || 18) * s2;
              const h = (obj.height || 140) * s2;

              // Soft warning column (always a faint outline so it reads)
              ctx.save();
              ctx.globalCompositeOperation = "lighter";
              ctx.globalAlpha = laserState === "cooldown" ? 0.15 : 0.35;
              ctx.strokeStyle = "rgba(239,68,68,0.55)";
              ctx.lineWidth = 2.5 * s2;
              ctx.shadowColor = "rgba(239,68,68,0.65)";
              ctx.shadowBlur = 10 * s2;
              ctx.strokeRect(-w / 2, -h / 2, w, h);
              ctx.restore();

              if (laserState === "charging") {
                // Charging: flashing segments + brighter glow
                const flick = (Math.sin(Date.now() * 0.02) + 1) * 0.5;
                ctx.save();
                ctx.globalCompositeOperation = "lighter";
                ctx.globalAlpha = 0.35 + 0.45 * charge;
                ctx.shadowColor = "rgba(239,68,68,0.9)";
                ctx.shadowBlur = (12 + 18 * charge) * s2;

                // segmented beam preview
                ctx.fillStyle = `rgba(254,242,242,${0.15 + 0.25 * flick})`;
                const segH = 10 * s2;
                const gap = 10 * s2;
                for (let y = -h / 2; y < h / 2; y += segH + gap) {
                  ctx.fillRect(-w / 2, y, w, segH);
                }

                // end caps
                const capGrad = ctx.createRadialGradient(
                  0,
                  -h / 2,
                  0,
                  0,
                  -h / 2,
                  22 * s2,
                );
                capGrad.addColorStop(0, "rgba(254,242,242,0.8)");
                capGrad.addColorStop(1, "rgba(239,68,68,0)");
                ctx.fillStyle = capGrad;
                ctx.beginPath();
                ctx.arc(0, -h / 2, 22 * s2, 0, Math.PI * 2);
                ctx.fill();

                const capGrad2 = ctx.createRadialGradient(
                  0,
                  h / 2,
                  0,
                  0,
                  h / 2,
                  22 * s2,
                );
                capGrad2.addColorStop(0, "rgba(254,242,242,0.8)");
                capGrad2.addColorStop(1, "rgba(239,68,68,0)");
                ctx.fillStyle = capGrad2;
                ctx.beginPath();
                ctx.arc(0, h / 2, 22 * s2, 0, Math.PI * 2);
                ctx.fill();

                ctx.restore();
              }

              if (laserState === "active") {
                // Active: solid, very bright beam
                const flick = (Math.sin(Date.now() * 0.06) + 1) * 0.5;
                ctx.save();
                ctx.globalCompositeOperation = "lighter";
                ctx.globalAlpha = 0.9;

                const beamGrad = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
                beamGrad.addColorStop(0, "rgba(254,242,242,0.95)");
                beamGrad.addColorStop(
                  0.5,
                  `rgba(239,68,68,${0.75 + 0.2 * flick})`,
                );
                beamGrad.addColorStop(1, "rgba(254,242,242,0.95)");

                ctx.fillStyle = beamGrad;
                ctx.shadowColor = "rgba(239,68,68,0.95)";
                ctx.shadowBlur = 22 * s2;
                ctx.fillRect(-w / 2, -h / 2, w, h);

                // hot center line
                ctx.shadowBlur = 0;
                ctx.globalAlpha = 0.85;
                ctx.fillStyle = "rgba(254,242,242,0.95)";
                ctx.fillRect(-w * 0.18, -h / 2, w * 0.36, h);

                ctx.restore();
              }

              break;
            }
            case "spaceJunk": {
              const img = spaceJunkImageRef.current;
              if (img) {
                const size = 60 * s;
                ctx.drawImage(img, -size / 2, -size / 2, size, size);
              } else {
                // Fallback simple junk drawing if image not loaded yet
                ctx.fillStyle = "#94a3b8";
                ctx.strokeStyle = "#cbd5e1";
                ctx.lineWidth = 2 * s;
                ctx.shadowColor = "rgba(148,163,184,0.6)";
                ctx.shadowBlur = 8 * s;
                ctx.beginPath();
                for (let i = 0; i < 6; i++) {
                  const ang = (i / 6) * Math.PI * 2;
                  const rad =
                    10 * s + (Math.sin(Date.now() * 0.003 + i) * 4 + 2) * s;
                  const x = Math.cos(ang) * rad;
                  const y = Math.sin(ang) * rad;
                  if (i === 0) ctx.moveTo(x, y);
                  else ctx.lineTo(x, y);
                }
                ctx.closePath();
                ctx.fill();
                ctx.stroke();
                ctx.fillStyle = "rgba(255,255,255,0.6)";
                ctx.fillRect(6 * s, -2 * s, 3 * s, 3 * s);
                ctx.shadowBlur = 0;
              }
              break;
            }
            case "satelliteFragment": {
              // Draw provided broken satellite panels icon
              const img = satelliteImageRef.current;
              if (img) {
                const size = 60 * s;
                ctx.drawImage(img, -size / 2, -size / 2, size, size);
              } else {
                // Fallback simple panel if image not loaded yet
                ctx.fillStyle = "#1e3a8a";
                ctx.strokeStyle = "#e5e7eb";
                ctx.lineWidth = 2 * s;
                ctx.shadowColor = "rgba(59,130,246,0.4)";
                ctx.shadowBlur = 6 * s;
                const w = 26 * s,
                  h = 14 * s;
                ctx.fillRect(-w / 2, -h / 2, w, h);
                ctx.strokeRect(-w / 2, -h / 2, w, h);
                ctx.beginPath();
                ctx.moveTo(-w / 2, -h / 2);
                ctx.lineTo(-w / 2 - 6 * s, -h / 2 - 4 * s);
                ctx.moveTo(w / 2, h / 2);
                ctx.lineTo(w / 2 + 6 * s, h / 2 + 4 * s);
                ctx.stroke();
                ctx.shadowBlur = 0;
              }
              break;
            }
            case "driftingAsteroid": {
              const img = driftingAsteroidImageRef.current;
              if (img) {
                const size = 72 * s;
                const scaledSize = size / 1.75;
                ctx.drawImage(
                  img,
                  -scaledSize / 2,
                  -scaledSize / 2,
                  scaledSize,
                  scaledSize,
                );
              } else {
                // rocky body with craters (fallback)
                const r = 14 * s;
                const grd = ctx.createRadialGradient(0, 0, r * 0.2, 0, 0, r);
                grd.addColorStop(0, "#9ca3af");
                grd.addColorStop(1, "#4b5563");
                ctx.fillStyle = grd;
                ctx.beginPath();
                ctx.arc(0, 0, r, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = "rgba(0,0,0,0.25)";
                for (let i = 0; i < 3; i++) {
                  const ang = i * 2.1 + Date.now() * 0.0007;
                  ctx.beginPath();
                  ctx.arc(
                    Math.cos(ang) * r * 0.4,
                    Math.sin(ang) * r * 0.35,
                    3 * s,
                    0,
                    Math.PI * 2,
                  );
                  ctx.fill();
                }
              }
              break;
            }
            default: {
              // generic block
              ctx.fillStyle = "#9ca3af";
              ctx.fillRect(
                -obj.width * s * 0.5,
                -obj.height * s * 0.5,
                obj.width * s,
                obj.height * s,
              );
            }
          }
        }

        ctx.restore();
      }
    });

    // Draw rocket with standby animation and collection effects
    let rocketScreenY = (gameState.rocket.y - cameraY) * scaleY;
    let rocketScreenX = gameState.rocket.x * scaleX;

    // In ready state, visually center the rocket on screen (independent of physics)
    if (gameState.gameStatus === "ready") {
      rocketScreenX = displayWidth / 2;
      rocketScreenY = displayHeight / 2;
    }

    ctx.save();
    ctx.translate(rocketScreenX, rocketScreenY);

    const swallow = (gameState as any).swallow;
    let rocketScale = gameState.gameStatus === "ready" ? 5 : 1;
    if (swallow && swallow.active) {
      const t = 1 - swallow.duration / Math.max(1, swallow.maxDuration);
      rocketScale = Math.max(0.3, 1 - 0.7 * t);
    }

    // Add standby animation when in ready state (position only)
    if (gameState.gameStatus === "ready") {
      const time = Date.now() * 0.003;
      const floatOffset = Math.sin(time) * 2; // Gentle floating motion
      ctx.translate(0, floatOffset);
      ctx.scale(rocketScale, rocketScale);
    } else {
      ctx.scale(rocketScale, rocketScale);
    }

    ctx.rotate((gameState.rocket.rotation * Math.PI) / 180);

    // ---- Enhanced Flame Trail ----
    const isBoostingFlame =
      gameState.rocket.velocityY < 0 &&
      gameState.rocket.fuel > 0 &&
      gameState.gameStatus === "playing";
    const isIdleFlame = gameState.gameStatus === "ready";

    if (isBoostingFlame || isIdleFlame) {
      const rocketSize = 15 * Math.min(scaleX, scaleY);
      const baseFlameLength = isIdleFlame
        ? 8
        : Math.abs(gameState.rocket.velocityY) * 3;
      const flameLength = baseFlameLength;
      const flameIntensity = 1;

      // Dual blue jet flames (high-tech look)
      const nozzleOffset = rocketSize * 0.85;
      const nozzleY = rocketSize * 0.6;
      const nozzleWidth = rocketSize * 0.3;
      const jetLength = flameLength * Math.min(scaleX, scaleY);

      for (const dir of [-1, 1]) {
        ctx.save();
        ctx.translate(nozzleOffset * dir, 0);

        // Outer blue flame with gradient from light cyan to deep blue
        const outerGrad = ctx.createLinearGradient(
          0,
          nozzleY,
          0,
          nozzleY + jetLength,
        );
        outerGrad.addColorStop(0, "#e0f2fe"); // light cyan
        outerGrad.addColorStop(0.4, "#38bdf8"); // bright blue
        outerGrad.addColorStop(1, "#0f172a"); // deep blue
        ctx.fillStyle = outerGrad;
        ctx.shadowColor = "#38bdf8";
        ctx.shadowBlur = 18 * Math.min(scaleX, scaleY) * flameIntensity;
        ctx.globalAlpha = 0.95;

        ctx.beginPath();
        ctx.moveTo(-nozzleWidth / 2, nozzleY);
        ctx.lineTo(nozzleWidth / 2, nozzleY);
        ctx.lineTo(0, nozzleY + jetLength);
        ctx.closePath();
        ctx.fill();

        // Inner core flame
        const innerGrad = ctx.createLinearGradient(
          0,
          nozzleY,
          0,
          nozzleY + jetLength * 0.8,
        );
        innerGrad.addColorStop(0, "#f9fafb");
        innerGrad.addColorStop(0.5, "#a5f3fc");
        innerGrad.addColorStop(1, "#38bdf8");
        ctx.fillStyle = innerGrad;
        ctx.shadowColor = "#a5f3fc";
        ctx.shadowBlur = 12 * Math.min(scaleX, scaleY) * flameIntensity;
        ctx.globalAlpha = 1;

        ctx.beginPath();
        ctx.moveTo(-nozzleWidth / 3, nozzleY);
        ctx.lineTo(nozzleWidth / 3, nozzleY);
        ctx.lineTo(0, nozzleY + jetLength * 0.8);
        ctx.closePath();
        ctx.fill();

        ctx.restore();
      }
    }

    // Draw rocket image
    if (rocketImageRef.current) {
      const rocketSize = 60 * Math.min(scaleX, scaleY); // 60px rocket size

      // Draw the rocket image centered
      ctx.drawImage(
        rocketImageRef.current,
        -rocketSize / 2,
        -rocketSize / 2,
        rocketSize,
        rocketSize,
      );
    }

    ctx.restore();

    // Crash comic bubble
    if (gameState.crashBubble && gameState.crashBubble.duration > 0) {
      const bubble = gameState.crashBubble;
      const screenY = (bubble.y - cameraY) * scaleY;
      const scaledX = bubble.x * scaleX;

      if (screenY > -50 && screenY < canvas.height + 50) {
        const t =
          Math.max(0, bubble.duration) / Math.max(1, bubble.maxDuration);
        const scaleFactor = 1 + 0.15 * Math.sin((1 - t) * Math.PI);
        const alpha = t;
        const baseUnit = Math.min(scaleX, scaleY);

        ctx.save();
        ctx.translate(scaledX, screenY - 40 * baseUnit);
        ctx.scale(scaleFactor, scaleFactor);
        ctx.rotate(((1 - t) * 10 * Math.PI) / 180);

        ctx.globalAlpha = alpha;

        const bw = 90 * baseUnit;
        const bh = 40 * baseUnit;
        const r = 16 * baseUnit;

        const grad = ctx.createLinearGradient(-bw / 2, -bh / 2, bw / 2, bh / 2);
        grad.addColorStop(0, "#f9a8d4");
        grad.addColorStop(0.5, "#facc15");
        grad.addColorStop(1, "#38bdf8");

        ctx.fillStyle = grad;
        ctx.strokeStyle = "rgba(15,23,42,0.9)";
        ctx.lineWidth = 3 * baseUnit;

        ctx.beginPath();
        ctx.moveTo(-bw / 2 + r, -bh / 2);
        ctx.lineTo(bw / 2 - r, -bh / 2);
        ctx.quadraticCurveTo(bw / 2, -bh / 2, bw / 2, -bh / 2 + r);
        ctx.lineTo(bw / 2, bh / 2 - r);
        ctx.quadraticCurveTo(bw / 2, bh / 2, bw / 2 - r, bh / 2);
        ctx.lineTo(-bw / 2 + r, bh / 2);
        ctx.quadraticCurveTo(-bw / 2, bh / 2, -bw / 2, bh / 2 - r);
        ctx.lineTo(-bw / 2, -bh / 2 + r);
        ctx.quadraticCurveTo(-bw / 2, -bh / 2, -bw / 2 + r, -bh / 2);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // little tail
        ctx.beginPath();
        ctx.moveTo(0, bh / 2);
        ctx.lineTo(10 * baseUnit, bh / 2 + 10 * baseUnit);
        ctx.lineTo(-4 * baseUnit, bh / 2);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = "#0f172a";
        ctx.font = `${14 * baseUnit}px system-ui, -apple-system, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(bubble.text, 0, -2 * baseUnit);

        ctx.restore();
      }
    }

    // Draw exciting ignition sequence

    // Global screen flash overlay for lightning strikes
    if (
      (gameState as any).lightningFlash &&
      (gameState as any).lightningFlash.duration > 0
    ) {
      const lf = (gameState as any).lightningFlash;
      const t = Math.max(0, lf.duration) / Math.max(1, lf.maxDuration);
      // Ease-out curve for flash decay
      const alpha = Math.min(1, Math.pow(t, 0.7)) * (lf.intensity ?? 0.8);
      ctx.save();
      ctx.globalCompositeOperation = "screen";
      ctx.globalAlpha = alpha;
      ctx.fillStyle = lf.color || "#ffffff";
      ctx.fillRect(0, 0, displayWidth, displayHeight);
      ctx.restore();
    }

    ctx.restore(); // Restore from camera shake
  }, [gameState, canvasSize]);

  // We draw exactly when the game state changes (the main game loop already runs on requestAnimationFrame).
  // This avoids having a second, independent draw loop.
  useEffect(() => {
    draw();
  }, [draw]);

  // Unified touch handling for launch charging and gameplay
  const handleCanvasTouchStart = (e: React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const touch = e.touches[0];
    if (!touch) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = touch.clientX - rect.left;
    const y = touch.clientY - rect.top;

    // If we just resumed, the first intentional tap should both unfreeze the game
    // and count as gameplay input (i.e., it can immediately boost).
    if (gameState.gameStatus === "playing" && requireFreshInputRef.current) {
      requireFreshInputRef.current = false;
      // Clear any lingering controls from before the pause.
      touchControlsRef.current = { left: false, right: false, boost: false };
    }

    touchStateRef.current = {
      isActive: true,
      startX: x,
      startY: y,
      currentX: x,
      currentY: y,
    };

    if (gameState.gameStatus === "ready") {
      onGameAction("launch");
    } else if (gameState.gameStatus === "playing") {
      touchControlsRef.current.boost = true;
    }
  };

  const handleCanvasTouchMove = (e: React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    if (!touchStateRef.current.isActive) return;

    const touch = e.touches[0];
    if (!touch) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = touch.clientX - rect.left;
    const y = touch.clientY - rect.top;

    touchStateRef.current.currentX = x;
    touchStateRef.current.currentY = y;

    if (gameState.gameStatus === "playing") {
      const deltaX = x - touchStateRef.current.startX;
      const absDeltaX = Math.abs(deltaX);

      // Reset steering
      touchControlsRef.current.left = false;
      touchControlsRef.current.right = false;

      // Apply steering only when movement passes dead zone threshold
      const DEADZONE = 18; // pixels
      if (absDeltaX > DEADZONE) {
        if (deltaX < 0) {
          touchControlsRef.current.left = true;
        } else {
          touchControlsRef.current.right = true;
        }
      }
    }
  };

  const handleCanvasTouchEnd = (e: React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();

    // Always clear all controls on touch end, regardless of game state
    // This prevents stuck inputs across state transitions
    touchControlsRef.current.boost = false;
    touchControlsRef.current.left = false;
    touchControlsRef.current.right = false;
    touchStateRef.current.isActive = false;
  };

  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    if (e.button !== 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Desktop: first click after resuming should both unfreeze and count as gameplay input.
    if (gameState.gameStatus === "playing" && requireFreshInputRef.current) {
      requireFreshInputRef.current = false;
      // Clear any lingering controls from before the pause.
      touchControlsRef.current = { left: false, right: false, boost: false };
    }

    touchStateRef.current = {
      isActive: true,
      startX: x,
      startY: y,
      currentX: x,
      currentY: y,
    };

    if (gameState.gameStatus === "ready") {
      onGameAction("launch");
    } else if (gameState.gameStatus === "playing") {
      touchControlsRef.current.boost = true;
    }
  };

  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!touchStateRef.current.isActive) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    touchStateRef.current.currentX = x;
    touchStateRef.current.currentY = y;

    if (gameState.gameStatus === "playing") {
      const deltaX = x - touchStateRef.current.startX;
      const absDeltaX = Math.abs(deltaX);

      // Reset steering
      touchControlsRef.current.left = false;
      touchControlsRef.current.right = false;

      // Apply steering only when movement passes dead zone threshold
      const DEADZONE = 18; // pixels
      if (absDeltaX > DEADZONE) {
        if (deltaX < 0) {
          touchControlsRef.current.left = true;
        } else {
          touchControlsRef.current.right = true;
        }
      }
    }
  };

  const handleCanvasMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault();

    touchControlsRef.current.boost = false;
    touchControlsRef.current.left = false;
    touchControlsRef.current.right = false;
    touchStateRef.current.isActive = false;
  };

  const handleCanvasMouseLeave = () => {
    // Treat leaving the canvas like releasing the mouse button
    touchControlsRef.current.boost = false;
    touchControlsRef.current.left = false;
    touchControlsRef.current.right = false;
    touchStateRef.current.isActive = false;
  };

  return (
    <div ref={containerRef} className="relative w-full h-full">
      <canvas
        ref={canvasRef}
        width={canvasSize.width}
        height={canvasSize.height}
        className="game-canvas cursor-pointer w-full h-full"
        style={{
          touchAction: "none",
          display: "block",
          width: "100%",
          height: "100%",
          maxWidth: "100%",
          maxHeight: "100%",
        }}
        onTouchStart={handleCanvasTouchStart}
        onTouchMove={handleCanvasTouchMove}
        onTouchEnd={handleCanvasTouchEnd}
        onTouchCancel={handleCanvasTouchEnd}
        onMouseDown={handleCanvasMouseDown}
        onMouseMove={handleCanvasMouseMove}
        onMouseUp={handleCanvasMouseUp}
        onMouseLeave={handleCanvasMouseLeave}
      />

      {/* Star counter pill only in ready state */}
      <AnimatePresence>
        {gameState.gameStatus === "ready" && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            className="absolute top-3 right-3 z-10"
          >
            <motion.div
              className="flex items-center gap-2 rounded-[35px] px-4 py-2 border-[3px] border-[#F3D262] shadow-[0_4px_30px_rgba(247,255,0,0.55)]"
              style={{
                background:
                  "radial-gradient(50% 50% at 50% 50%, rgba(68, 74, 67, 0.79) 0%, rgba(122, 118, 70, 0.79) 100%), #444B44",
              }}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.1, duration: 0.3, ease: "backOut" }}
            >
              <Star className="h-6 w-6 text-yellow-300 animate-twinkle" />
              <span className="text-xl font-bold" style={{ color: "#E3E5E2" }}>
                {(userData as any)?.stars || 0}
              </span>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function AltitudeIndicator({ gameState }: { gameState: GameState }) {
  const altitude = Math.max(
    0,
    Math.round((gameState as any).currentAltitude ?? gameState.maxAltitude),
  );

  if (gameState.gameStatus !== "playing" && gameState.gameStatus !== "paused") {
    return null;
  }

  return (
    <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 pointer-events-none select-none">
      <div
        className="px-4 py-2 rounded-[999px] border-[3px] border-[#CDAAFF] shadow-[0_0_26px_rgba(205,170,255,0.7)] flex items-baseline gap-2"
        style={{
          background:
            "radial-gradient(50% 50% at 50% 50%, rgba(33,29,83,0.9) 0%, rgba(15,23,42,0.98) 100%)",
        }}
      >
        <span className="text-[10px] text-[#B589DB] font-mono uppercase tracking-wide">
          ALT
        </span>
        <span className="text-xl font-black text-[#F0EFF4] font-mono">
          {altitude}
        </span>
        <span className="text-[11px] text-[#F0EFF4] font-mono">m</span>
      </div>
    </div>
  );
}

// Leaderboard UI has been fully removed to keep the focus on solo endless flight.

// Shop and power-up UI have been removed to keep the game focused on simple, endless flight.

function AdminPanel({
  isAdmin,
  onOpen,
}: {
  isAdmin: boolean;
  onOpen: () => void;
}) {
  if (!isAdmin) return null;

  return (
    <div className="absolute top-3 left-3 z-30">
      <button
        className="h-11 w-11 rounded-full border-[3px] border-[#CDAAFF] shadow-[0_0_26px_rgba(205,170,255,0.7)] bg-black/40 flex items-center justify-center active:scale-95 transition-transform"
        style={{
          background:
            "radial-gradient(50% 50% at 50% 50%, rgba(33,29,83,0.95) 0%, rgba(15,23,42,0.98) 100%)",
        }}
        aria-label="Admin panel"
        title="Admin panel"
        onClick={(e) => {
          e.preventDefault();
          onOpen();
        }}
      >
        <span className="text-[#F0EFF4] text-lg font-black">A</span>
      </button>
    </div>
  );
}

function AdminPanelPage({
  isAdmin,
  onBack,
}: {
  isAdmin: boolean;
  onBack: () => void;
}) { const queryClient = useQueryClient();
  const [searchInput, setSearchInput] = useState("");
  const [query, setQuery] = useState("");

  const {
    data: adminUsersData, isLoading: isInitialLoading, isFetching, error, isFetched } = useQuery({ queryKey: ["adminUsers", query], queryFn: async ( }) => {
      return await client.adminListUsers({ query, limit: 50 });
    },
    {
      enabled: isAdmin,
      refetchOnWindowFocus: false,
      staleTime: 10_000,
    },
  );

  const resetMutation = useMutation({ mutationFn: client.adminResetUser,
    onSuccess: () => {
      void queryClient.invalidateQueries(["adminUsers"]);
    },
  });

  const deleteMutation = useMutation({ mutationFn: client.adminDeleteUser,
    onSuccess: () => {
      void queryClient.invalidateQueries(["adminUsers"]);
    },
  });

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-background text-foreground p-6">
        <div className="mx-auto w-full max-w-xl">
          <div className="flex items-center justify-between gap-3">
            <div className="text-lg font-semibold">Game Admin</div>
            <button
              onClick={onBack}
              className="px-4 py-2 rounded-md border border-border"
            >
              Back
            </button>
          </div>

          <div className="mt-4 rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
            You don’t have access to this page.
          </div>
        </div>
      </div>
    );
  }

  const users = (adminUsersData as any)?.users ?? [];

  return (
    <div className="min-h-screen bg-background text-foreground p-4 sm:p-6">
      <div className="mx-auto w-full max-w-3xl">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-xl font-semibold">Game Admin</div>
            <div className="text-xs text-muted-foreground">
              Search, reset, or delete player profiles.
            </div>
          </div>
          <button
            onClick={onBack}
            className="px-4 py-2 rounded-md border border-border"
          >
            Back to game
          </button>
        </div>

        <div className="mt-4 flex gap-2">
          <input
            className="flex-1 h-10 rounded-md border border-border bg-background px-3 text-sm"
            placeholder="Search by name, handle, or id…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
          <Button
            onClick={(e) => {
              e.preventDefault();
              setQuery(searchInput.trim());
            }}
            disabled={isInitialLoading || isFetching}
          >
            {isFetching ? "Searching…" : "Search"}
          </Button>
        </div>

        {!!error && (
          <div className="mt-3 text-sm text-destructive">
            Couldn’t load players. Try again.
          </div>
        )}

        <div className="mt-4 overflow-hidden rounded-lg border border-border">
          {isInitialLoading ? (
            <div className="p-4 text-sm text-muted-foreground">
              Loading players…
            </div>
          ) : isFetched && users.length === 0 ? (
            <div className="p-4 text-sm text-muted-foreground">
              No players found.
            </div>
          ) : (
            <div className="divide-y divide-border">
              {users.map((u: any) => {
                const label =
                  (u?.handle ? `@${u.handle}` : u?.name) ||
                  String(u?.id || "").slice(0, 8);

                return (
                  <div key={u.id} className="p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <div className="font-semibold truncate">{label}</div>
                          <Badge className="shrink-0">
                            {u?.role || "PLAYER"}
                          </Badge>
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground break-all">
                          {u.id}
                        </div>
                        <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                          <div className="rounded-md bg-muted/40 px-2 py-1">
                            <span className="text-muted-foreground">Best</span>
                            <span className="ml-2 font-semibold">
                              {u.maxAltitude}m
                            </span>
                          </div>
                          <div className="rounded-md bg-muted/40 px-2 py-1">
                            <span className="text-muted-foreground">Stars</span>
                            <span className="ml-2 font-semibold">
                              {u.stars}
                            </span>
                          </div>
                          <div className="rounded-md bg-muted/40 px-2 py-1">
                            <span className="text-muted-foreground">
                              Flights
                            </span>
                            <span className="ml-2 font-semibold">
                              {u.totalFlights}
                            </span>
                          </div>
                          <div className="rounded-md bg-muted/40 px-2 py-1">
                            <span className="text-muted-foreground">
                              Survival
                            </span>
                            <span className="ml-2 font-semibold">
                              {u.totalSurvivalTime}s
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="shrink-0 flex flex-col gap-2">
                        <Button
                          onClick={() =>
                            resetMutation.mutate({
                              userId: u.id,
                              mode: "STARS_ONLY",
                            })
                          }
                          disabled={
                            resetMutation.isPending || deleteMutation.isPending
                          }
                        >
                          Reset stars
                        </Button>
                        <Button
                          onClick={() =>
                            resetMutation.mutate({
                              userId: u.id,
                              mode: "STATS_ONLY",
                            })
                          }
                          disabled={
                            resetMutation.isPending || deleteMutation.isPending
                          }
                        >
                          Reset stats
                        </Button>
                        <Button
                          onClick={() =>
                            resetMutation.mutate({ userId: u.id, mode: "ALL" })
                          }
                          disabled={
                            resetMutation.isPending || deleteMutation.isPending
                          }
                        >
                          Reset all
                        </Button>
                        <Button
                          className="border-destructive/60 text-destructive"
                          onClick={() => {
                            const ok = window.confirm(
                              "Delete this player? This cannot be undone.",
                            );
                            if (!ok) return;
                            deleteMutation.mutate({ userId: u.id });
                          }}
                          disabled={
                            resetMutation.isPending || deleteMutation.isPending
                          }
                        >
                          Delete
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {(resetMutation as any).error && (
          <div className="mt-3 text-sm text-destructive">
            Action failed. Double-check permissions and try again.
          </div>
        )}
        {(deleteMutation as any).error && (
          <div className="mt-3 text-sm text-destructive">
            Delete failed. (You can’t delete yourself.)
          </div>
        )}
      </div>
    </div>
  );
}

function GameOverDialog({
  gameState,
  onRestart,
}: {
  gameState: GameState;
  onRestart: () => void;
}) {
  const flightSeconds = gameState.flightStartTime
    ? Math.max(1, Math.round((Date.now() - gameState.flightStartTime) / 1000))
    : 0;

  return (
    <AnimatePresence>
      {gameState.gameStatus === "gameOver" && (
        <motion.div
          className="fixed inset-0 z-40 bg-black bg-opacity-50 flex items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3, ease: "easeInOut" }}
        >
          <motion.div
            initial={{ scale: 0.8, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.8, opacity: 0, y: -20 }}
            transition={{ duration: 0.3, ease: "backOut" }}
          >
            <div
              className="px-6 py-5 rounded-3xl border-[3px] border-[#CDAAFF] shadow-[0_0_32px_rgba(205,170,255,0.7)] text-center"
              style={{
                background:
                  "radial-gradient(50% 50% at 50% 50%, rgba(33, 29, 83, 0.9) 0%, rgba(15,23,42,0.98) 100%)",
              }}
            >
              <div className="mb-3 flex items-center justify-center gap-2">
                <Rocket className="h-7 w-7 text-[#F0EFF4]" />
                <div className="text-left">
                  <div className="text-xs uppercase tracking-wide font-medium text-[#B589DB]">
                    Flight complete
                  </div>
                </div>
              </div>

              <div className="w-full rounded-2xl bg-black/15 border border-white/10 px-4 py-3 mb-4">
                <div className="flex items-baseline justify-center gap-2 mb-2">
                  <span className="text-xs text-[#B589DB] font-mono uppercase tracking-wide">
                    ALT
                  </span>
                  <span className="text-3xl font-black text-[#F0EFF4]">
                    {Math.round(gameState.maxAltitude)}
                  </span>
                  <span className="text-sm text-[#F0EFF4]">m</span>
                </div>
                <div className="flex items-center justify-center gap-4 text-[11px] text-[#E3E5E2]/85">
                  <div className="flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5 text-[#F3D262]" />
                    <span>{flightSeconds}s</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Star className="h-3.5 w-3.5 text-[#F3D262]" />
                    <span>{gameState.starsCollected} stars</span>
                  </div>
                </div>
              </div>

              <button
                onClick={onRestart}
                className="mt-1 w-full px-4 py-2.5 text-sm font-bold tracking-wide rounded-[999px] border-[3px] border-[#A3BCE3] text-[#1B365E] shadow-[0_0_26px_rgba(54,128,255,0.6)] active:scale-95 transition-transform"
                style={{
                  background:
                    "radial-gradient(50% 50% at 50% 50%, #EDF8FD 28.85%, #BAD3FD 100%), #F2FEFF",
                }}
              >
                LAUNCH AGAIN
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default function App() {
  const auth = useAuth();
  const queryClient = useQueryClient();

  const computeEffectivePath = useCallback(() => {
    if (typeof window === "undefined") return "/";

    const pathname = window.location.pathname || "/";

    try {
      const params = new URLSearchParams(window.location.search || "");
      const wantsAdminPanel =
        params.has("Admin_Panel") ||
        params.has("admin_panel") ||
        params.has("adminpanel");

      if (pathname === "/" && wantsAdminPanel) {
        return "/admin_panel";
      }
    } catch {
      // ignore
    }

    return pathname;
  }, []);

  const [path, setPath] = useState(() => {
    return computeEffectivePath();
  });

  useEffect(() => {
    const onPop = () => {
      try {
        setPath(computeEffectivePath());
      } catch {
        setPath("/");
      }
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [computeEffectivePath]);

  const navigate = useCallback(
    (to: string) => {
      if (typeof window === "undefined") return;

      const next = to || "/";
      const nextUrl = next === "/admin_panel" ? "/?Admin_Panel" : next;
      if (nextUrl === window.location.pathname + window.location.search) return;

      window.history.pushState({}, "", nextUrl);
      setPath(computeEffectivePath());
      try {
        window.scrollTo(0, 0);
      } catch {
        // ignore
      }
    },
    [computeEffectivePath],
  );

  // Runtime safeguards: storage check and global error capture
  const [storageOk, setStorageOk] = useState<boolean | null>(null);
  const [runtimeError, setRuntimeError] = useState<string | null>(null);

  // Test Mode: disables obstacle collisions (helpful for debugging / practicing)
  const [testMode, setTestMode] = useState<boolean>(() => {
    try {
      return window.localStorage.getItem("stellarLaunch_testMode") === "1";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    // Storage check
    try {
      const ls = window.localStorage;
      const key = `__sl_test_${Date.now()}`;
      ls.setItem(key, "1");
      ls.removeItem(key);
      setStorageOk(true);
    } catch (err: any) {
      console.error("[StorageGuard] Storage unavailable:", err?.message || err);
      setStorageOk(false);
    }

    const ignoreMsgRegex =
      /Failed to fetch|NetworkError|RpcError|Cannot use 'in' operator to search for 'result' in null/i;

    const onError = (ev: any) => {
      // Resource load errors (image/script/css) come through as plain Events, not ErrorEvents.
      const target = ev?.target as any;
      const isResourceError = !!target && target !== window;

      if (isResourceError) {
        const tag = String(target?.tagName || "").toUpperCase();
        const src =
          (typeof target?.src === "string" && target.src) ||
          (typeof target?.href === "string" && target.href) ||
          "";

        // Images are non-critical because we have fallbacks in the canvas.
        if (tag === "IMG") {
          console.warn("[Asset] Image failed to load:", src || "(unknown)");
          return;
        }

        // Scripts/styles failing to load can be critical, but browser extensions sometimes
        // inject their own scripts that may be blocked. Only treat as critical if it looks
        // like it belongs to this app or the Adaptive platform.
        if (tag === "SCRIPT" || tag === "LINK") {
          const looksLikeExtension =
            src.startsWith("chrome-extension://") ||
            src.startsWith("moz-extension://") ||
            src.startsWith("safari-extension://");

          let origin = "";
          try {
            origin = src ? new URL(src).origin : "";
          } catch {
            origin = "";
          }

          const isSameOrigin = !!origin && origin === window.location.origin;
          const isAdaptiveOrigin =
            !!origin &&
            (origin.endsWith(".adaptive.ai") ||
              origin.endsWith(".on.adaptive.ai"));

          // If we can't determine the URL, or it clearly isn't part of the app, ignore.
          if (looksLikeExtension || (!isSameOrigin && !isAdaptiveOrigin)) {
            console.warn(
              "[Asset] Non-critical script/style failed to load:",
              src,
            );
            return;
          }

          console.error("[Asset] Critical asset failed to load:", tag);
          setRuntimeError(
            "A required file failed to load. Please reload the page and try again.",
          );
          return;
        }

        // Other resource errors: don't crash the game.
        console.warn("[Asset] Resource failed to load:", tag);
        return;
      }

      // Runtime JS errors
      const msg = String(ev?.message || (ev as any)?.error?.message || "");

      // Cross-origin errors often show up as a useless "Script error." with no details.
      // Treat them as non-blocking so the game can keep running.
      if (!msg || msg === "Script error." || ignoreMsgRegex.test(msg)) {
        if (typeof ev?.preventDefault === "function") ev.preventDefault();
        console.warn(
          "[GlobalError] Ignored non-blocking error:",
          msg || "(no message)",
        );
        return;
      }

      console.error("[GlobalError]", (ev as any)?.error || msg);
      setRuntimeError(msg);
    };

    const onRejection = (ev: PromiseRejectionEvent) => {
      const reason: any = ev.reason;
      const msg = typeof reason === "string" ? reason : reason?.message || "";

      if (!msg || msg === "Script error." || ignoreMsgRegex.test(msg)) {
        if (typeof (ev as any)?.preventDefault === "function") {
          (ev as any).preventDefault();
        }
        console.warn(
          "[UnhandledRejection] Ignored non-blocking rejection:",
          msg || "(no message)",
        );
        return;
      }

      console.error("[UnhandledRejection]", reason);
      setRuntimeError(msg || "Unexpected error");
    };

    // Use capture so we can catch resource load errors too.
    window.addEventListener("error", onError, true);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError, true);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  // Persist Test Mode toggle (without re-attaching global listeners)
  useEffect(() => {
    try {
      window.localStorage.setItem(
        "stellarLaunch_testMode",
        testMode ? "1" : "0",
      );
    } catch {
      // ignore
    }
  }, [testMode]);

  const isAuthed = auth?.status === "authenticated" && !!(auth as any)?.userId;

  const safeUserDefaults = useMemo(
    () => ({
      id: (auth as any)?.userId ?? "unknown",
      name: null,
      selectedRocket: "rocket_1",
      maxAltitude: 0,
      stars: 0,
      totalStarsCollected: 0,
      totalFlights: 0,
      totalSurvivalTime: 0,
    }),
    [(auth as any)?.userId],
  );

  const { data: userData = safeUserDefaults, isLoading: isUserDataInitialLoading } = useQuery({ queryKey: ["userData", (auth as any)?.userId ?? null], queryFn: async ( }) => {
      // This query should only run once the user is signed in.
      // If we hit a transient RPC/network parsing issue, keep the game playable with safe defaults.
      try {
        return await client.getUserData();
      } catch (err: any) {
        const msg = String(err?.message || "");
        if (
          /Failed to fetch|NetworkError|RpcError|Cannot use 'in' operator to search for 'result' in null/i.test(
            msg,
          )
        ) {
          return safeUserDefaults;
        }
        throw err;
      }
    },
    {
      enabled: isAuthed,
      retry: 1,
      refetchOnWindowFocus: false,
      placeholderData: safeUserDefaults,
      staleTime: 30_000,
    },
  );

  const { data: myRole } = useQuery({ queryKey: ["myRole", (auth as any)?.userId ?? null], queryFn: async ( }) => {
      try {
        return await client.getMyRole();
      } catch {
        return { role: "PLAYER" };
      }
    },
    {
      enabled: isAuthed,
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      placeholderData: { role: "PLAYER" },
    },
  );

  const updateGameResultMutation = useMutation<any, unknown, any>(
    client.updateGameResult,
    {
      onSuccess: () => {
        queryClient.invalidateQueries(["userData"]);
      },
      onError: () => {
        // Keep the game flow smooth even if saving fails due to transient network issues.
        // We'll try again on the next run.
      },
    },
  );

  const [gameState, setGameState] = useState<GameState>({
    rocket: {
      x: 200,
      y: 500,
      velocityX: 0,
      velocityY: 0,
      fuel: 100,
      rotation: 0,
    },
    camera: { y: 0, shake: 0 },
    objects: [],
    particles: [],

    starsCollected: 0,
    gameStatus: "ready",
    ignitionLevel: 0,
    maxAltitude: 0,
    currentAltitude: 0,

    flightStartTime: 0,
    deathTimer: 0,
    backgroundStars: [],
    nebulas: [],
    gravity: { sign: 1, duration: 0 },
    difficulty: {
      density: 1,
      speed: 1,
      unpredictability: 0.5,
      nextEventIn: 600,
    },
    lateHazardLock: { kind: null, timer: 0 },
    nearMissCooldown: 0,
  });

  const gameLoopRef = useRef<number>();
  const lastFrameTimeRef = useRef<number>(0);
  const touchControlsRef = useRef<{
    left: boolean;
    right: boolean;
    boost: boolean;
  }>({ left: false, right: false, boost: false });

  const touchStateRef = useRef<{
    isActive: boolean;
    startX: number;
    startY: number;
    currentX: number;
    currentY: number;
  }>({ isActive: false, startX: 0, startY: 0, currentX: 0, currentY: 0 });

  // After resuming from pause, require a fresh, intentional tap/click on the canvas
  // before the game continues and any controls take effect.
  const requireFreshInputRef = useRef<boolean>(false);

  // Prevent double-toggling pause/resume on mobile (touch events can trigger click afterwards)
  const ignoreNextResumeClickRef = useRef<boolean>(false);

  // Hidden gesture: 10 taps on left half, then 10 taps on right half toggles Test Mode.
  const secretToggleRef = useRef<{
    phase: "left" | "right";
    leftCount: number;
    rightCount: number;
    startedAt: number;
    lastTapAt: number;
  }>({
    phase: "left",
    leftCount: 0,
    rightCount: 0,
    startedAt: 0,
    lastTapAt: 0,
  });

  const secretDownRef = useRef<{ x: number; y: number; ts: number } | null>(
    null,
  );

  const resetSecretToggle = useCallback(() => {
    secretToggleRef.current = {
      phase: "left",
      leftCount: 0,
      rightCount: 0,
      startedAt: 0,
      lastTapAt: 0,
    };
  }, []);

  const registerSecretTap = useCallback(
    (clientX: number) => {
      const now = Date.now();
      const s = secretToggleRef.current;

      // If the user pauses too long, reset the sequence.
      if (s.lastTapAt && now - s.lastTapAt > 1500) {
        resetSecretToggle();
      }

      const s2 = secretToggleRef.current;
      if (!s2.startedAt) s2.startedAt = now;

      // Total time window: keep it tight so it won't toggle accidentally.
      if (now - s2.startedAt > 8000) {
        resetSecretToggle();
        return;
      }

      const side =
        clientX < (typeof window !== "undefined" ? window.innerWidth / 2 : 0)
          ? "left"
          : "right";

      if (s2.phase === "left") {
        if (side !== "left") {
          resetSecretToggle();
          return;
        }
        s2.leftCount += 1;
        if (s2.leftCount >= 10) {
          s2.phase = "right";
          s2.rightCount = 0;
        }
      } else {
        if (side !== "right") {
          resetSecretToggle();
          return;
        }
        s2.rightCount += 1;
        if (s2.rightCount >= 10) {
          setTestMode((v) => {
            const next = !v;
            console.log("[TestMode] Toggled via secret gesture:", next);
            return next;
          });
          resetSecretToggle();
          return;
        }
      }

      s2.lastTapAt = now;
    },
    [resetSecretToggle],
  );

  // Keep Meteor Swarm from spawning too frequently in 15,000m+.
  // This is a ref so it persists across chunk generation calls.
  const meteorSwarmSpacingRef = useRef<{ lastAltitude: number }>({
    lastAltitude: -Infinity,
  });

  // Keep Railgun Snipes from spawning too frequently in 15,000m+.
  const railgunSnipeSpacingRef = useRef<{ lastAltitude: number }>({
    lastAltitude: -Infinity,
  });

  const generateBackgroundStars = useCallback(
    (count: number): BackgroundStar[] => {
      const stars: BackgroundStar[] = [];
      for (let i = 0; i < count; i++) {
        stars.push({
          x: Math.random() * 400,
          y: Math.random() * 1200,
          size: Math.random() * 1.5 + 0.5,
          opacity: Math.random() * 0.7 + 0.3,
          speed: Math.random() * 0.4 + 0.1,
        });
      }
      return stars;
    },
    [],
  );

  const generateNebulas = useCallback(
    (startY: number, endY: number): Nebula[] => {
      const nebulas: Nebula[] = [];
      const colors = [
        { c1: "rgba(139, 92, 246, 0.25)", c2: "rgba(139, 92, 246, 0)" },
        { c1: "rgba(236, 72, 153, 0.2)", c2: "rgba(219, 39, 119, 0)" },
        { c1: "rgba(34, 197, 94, 0.2)", c2: "rgba(22, 163, 74, 0)" },
        { c1: "rgba(59, 130, 246, 0.22)", c2: "rgba(37, 99, 235, 0)" },
      ];

      // Generate nebulas spaced throughout the range
      const range = startY - endY;
      const nebulaCount = Math.max(1, Math.floor(range / 400)); // One nebula per 400 units

      for (let i = 0; i < nebulaCount; i++) {
        const color = colors[i % colors.length] || colors[0];
        nebulas.push({
          x: Math.random() * 400,
          y: endY + range * Math.random(),
          radius: Math.random() * 300 + 200,
          color1: color!.c1,
          color2: color!.c2,
        });
      }
      return nebulas;
    },
    [],
  );

  const generateObjects = useCallback((startY: number, endY: number) => {
    const objects: GameObject[] = [];

    let lastMeteorSwarmAltitude =
      (meteorSwarmSpacingRef.current?.lastAltitude as number) ?? -Infinity;

    let lastRailgunSnipeAltitude =
      (railgunSnipeSpacingRef.current?.lastAltitude as number) ?? -Infinity;

    const clamp = (n: number, a: number, b: number) =>
      Math.max(a, Math.min(b, n));

    const layerForAltitude = (alt: number) => {
      if (alt < 1000)
        return {
          name: "low_orbit",
          list: ["spaceJunk", "satelliteFragment", "driftingAsteroid"],
          baseDensity: 0.9,
          baseSpeed: 0.9,
        };
      if (alt < 3000)
        return {
          name: "cloud",
          list: ["stormCloud", "lightningCloud", "icePatch"],
          baseDensity: 0.8,
          baseSpeed: 1.0,
        };
      if (alt < 6000)
        return {
          name: "volcano",
          list: ["lavaRock", "magnetParticle", "gravityWell"],
          baseDensity: 0.9,
          baseSpeed: 1.1,
        };
      if (alt < 10000)
        return {
          name: "asylum",
          list: ["rotatingWall", "warpedWall"],
          baseDensity: 1.0,
          baseSpeed: 1.2,
        };
      if (alt < 15000)
        return {
          name: "devils_lab",
          list: ["spaceMine", "lavaBoulder", "awareWall"],
          baseDensity: 1.15,
          baseSpeed: 1.3,
        };
      return {
        name: "chaos_math",
        list: ["meteorSwarm", "laserGate", "railgunSnipe"],
        baseDensity: 1.3,
        baseSpeed: 1.4,
      };
    };

    const CLEAR_ZONE = 200;
    const clearBoundaries = [0, 1000, 3000, 6000, 10000, 15000];

    const isInClearZone = (altitude: number) => {
      return clearBoundaries.some(
        (boundary) => altitude >= boundary && altitude < boundary + CLEAR_ZONE,
      );
    };

    // Step through world space and populate with stars and obstacles
    for (let y = startY; y > endY; y -= 120) {
      const altitude = Math.max(0, 580 - y);
      const layer = layerForAltitude(altitude);
      const density = clamp(
        layer.baseDensity + Math.floor(altitude / 500) * 0.08,
        0.5,
        2.0,
      );
      const speedMul = layer.baseSpeed + Math.floor(altitude / 500) * 0.05;

      // Stars (collectibles) - allowed everywhere, even in clear zones
      if (Math.random() < 0.55) {
        const x = 20 + Math.random() * 360;
        objects.push({
          id: `star-${y}-${Math.random()}`,
          x,
          y,
          width: 24,
          height: 24,
          type: "star",
          rotation: Math.random() * 360,
        });
      }

      // In clear zones we skip spawning obstacles entirely to keep space open
      if (isInClearZone(altitude)) {
        continue;
      }

      // Obstacles according to current layer
      const obstacleSlots = Math.random() < 0.5 ? 1 : 2; // up to two per band
      for (let i = 0; i < obstacleSlots * density; i++) {
        if (Math.random() > 0.65) continue; // randomness
        const variant =
          layer.list[Math.floor(Math.random() * layer.list.length)];
        const x = 40 + Math.random() * 320;
        const base: GameObject = {
          id: `obs-${variant}-${y}-${Math.random()}`,
          x,
          y: y + (Math.random() * 30 - 15),
          width: 32,
          height: 32,
          type: "obstacle",
          variant,
          rotation: 0,
          vx: 0,
          vy: 0,
          speed: speedMul,
          harm: true,
        };

        // tweak per variant
        switch (variant) {
          case "building":
            base.width = 70;
            base.height = 120;
            base.vx = 0;
            base.harm = true;
            break;
          case "bird":
            base.width = 24;
            base.height = 16;
            base.vx =
              (Math.random() < 0.5 ? -1 : 1) * (0.8 + Math.random()) * speedMul;
            break;
          case "balloon":
            base.width = 20;
            base.height = 28;
            base.vy = -0.3 * speedMul;
            break;
          case "stormCloud":
            base.width = 80;
            base.height = 50;
            base.vx = (Math.random() - 0.5) * 0.8 * speedMul;
            break;
          case "lightningCloud":
            // Match storm cloud sizing so both cloud icons feel consistent
            base.width = 80;
            base.height = 50;
            base.vx = 0;
            base.vy = 0;
            base.harm = false; // clouds themselves are non-lethal; only the strike hurts
            break;
          case "lightning":
            base.width = 10;
            base.height = 80;
            base.harm = true;
            break;
          case "icePatch":
            base.width = 80;
            base.height = 30;
            base.harm = false;
            (base as any).hitsRemaining = 2;
            (base as any).state = "intact"; // intact -> cracked -> broken (removed)
            break;
          case "lavaRock":
            base.width = 28;
            base.height = 28;
            base.vx = (Math.random() - 0.5) * 1.5 * speedMul;
            base.vy = 0.2 * speedMul;
            break;
          case "magnetParticle":
            base.width = 18;
            base.height = 18;
            base.vx = (Math.random() - 0.5) * 1.2 * speedMul;
            break;
          case "gravityWell":
          case "blackHole":
            base.variant = "blackHole";
            base.width = 40;
            base.height = 40;
            base.harm = true;
            break;
          case "singularityShards":
            base.width = 46;
            base.height = 46;
            base.harm = false; // shards are the danger, not the core
            (base as any).orbitRadius = 58;
            (base as any).shardCount = 6;
            (base as any).shardSize = 10;
            (base as any).orbitSpeed = 0.9 + Math.random() * 0.8; // radians/sec-ish
            (base as any).orbitPhase = Math.random() * Math.PI * 2;
            break;
          case "rotatingWall":
            base.width = 90;
            base.height = 16;
            base.rotation = Math.random() * 360;
            base.vx = (Math.random() - 0.5) * 0.6 * speedMul;
            break;
          case "warpedWall":
            base.width = 110;
            base.height = 18;
            base.vx = (Math.random() - 0.5) * 0.7 * speedMul;
            break;
          case "spaceMine":
            base.width = 44;
            base.height = 44;
            base.vx = 0;
            base.vy = 0;
            base.harm = false; // delayed blast handles danger
            (base as any).mineArmed = false;
            (base as any).mineTimer = 0;
            (base as any).mineExploding = false;
            (base as any).mineExplosionTimer = 0;
            (base as any).mineExplosionProgress = 0;
            break;
          case "lavaBoulder":
            base.width = 54;
            base.height = 54;
            base.vx = (Math.random() - 0.5) * 1.0 * speedMul;
            base.vy = 0.12 * speedMul;
            base.harm = true;
            base.rotation = Math.random() * 360;
            break;
          case "awareWall":
            base.width = 109;
            base.height = 40;
            base.vx = (Math.random() - 0.5) * 0.4 * speedMul;
            break;
          case "fractalWall":
            // Removed (no longer spawns)
            break;
          case "meteorSwarm":
            base.width = 52;
            base.height = 52;
            base.harm = false; // emitter itself is not lethal; the meteors are
            (base as any).swarmState = "cooldown"; // cooldown | charging
            (base as any).swarmTimer = 120 + Math.random() * 180;
            (base as any).swarmCharge = 0;
            break;
          case "railgunSnipe":
            base.width = 42;
            base.height = 42;
            base.harm = false; // the snipe "emitter" isn't lethal; the shot is
            (base as any).snipeState = "cooldown"; // cooldown | charging
            (base as any).snipeTimer = 160 + Math.random() * 220;
            (base as any).snipeCharge = 0;
            (base as any).snipeTargetX = 200;
            break;
          case "prismSplitter":
            base.width = 56;
            base.height = 44;
            base.harm = false;
            break;
          case "laserGate":
            base.width = 18;
            base.height = 140;
            base.harm = false; // handled by laser timing
            base.vx = (Math.random() - 0.5) * 0.3 * speedMul;
            base.vy = 0;
            (base as any).laserState = "cooldown"; // cooldown | charging | active
            (base as any).laserTimer = 140 + Math.random() * 180; // until next charge
            (base as any).laserCharge = 0;
            break;
          case "spaceJunk":
            base.width = 28;
            base.height = 28;
            base.vx = (Math.random() - 0.5) * 0.8 * speedMul;
            base.vy = (Math.random() - 0.5) * 0.4 * speedMul;
            base.harm = true;
            base.rotation = Math.random() * 360;
            break;
          case "satelliteFragment":
            base.width = 36;
            base.height = 22;
            base.vx = (Math.random() - 0.5) * 0.6 * speedMul;
            base.vy = (Math.random() - 0.5) * 0.3 * speedMul;
            base.harm = true;
            base.rotation = Math.random() * 360;
            break;
          case "driftingAsteroid":
            base.width = 30;
            base.height = 30;
            base.vx = (Math.random() - 0.5) * 0.5 * speedMul;
            base.vy = (Math.random() - 0.5) * 0.5 * speedMul;
            base.harm = true;
            base.rotation = Math.random() * 360;
            break;
        }
        // Meteor Swarm is extremely dangerous — keep it rare.
        // In the 15,000m+ zone, allow roughly one spawn per ~500m.
        if (variant === "meteorSwarm") {
          if (altitude - lastMeteorSwarmAltitude < 500) {
            continue;
          }
          lastMeteorSwarmAltitude = altitude;
        }

        // Railgun Snipes should be scary but not spammy.
        // Keep them roughly one per ~700m in the 15,000m+ zone.
        if (variant === "railgunSnipe") {
          if (altitude - lastRailgunSnipeAltitude < 700) {
            continue;
          }
          lastRailgunSnipeAltitude = altitude;
        }

        objects.push(base);
      }
    }

    meteorSwarmSpacingRef.current.lastAltitude = lastMeteorSwarmAltitude;
    railgunSnipeSpacingRef.current.lastAltitude = lastRailgunSnipeAltitude;

    return objects;
  }, []);

  const initializeGame = useCallback(() => {
    // Reset per-run spacing state
    meteorSwarmSpacingRef.current.lastAltitude = -Infinity;
    railgunSnipeSpacingRef.current.lastAltitude = -Infinity;

    // Calculate fuel capacity
    const maxFuel = 1000000000; // Infinite fuel

    // Position rocket in space (y=580)
    setGameState({
      rocket: {
        x: 200,
        y: 580, // Start in space
        velocityX: 0,
        velocityY: 0,
        fuel: maxFuel,
        rotation: 0,
        collectionEffect: undefined,
      },
      camera: { y: 80, shake: 0 }, // Initial camera position
      objects: generateObjects(580, -1000), // Start objects from initial position
      particles: [],
      starsCollected: 0,
      gameStatus: "ready",
      ignitionLevel: 0,
      maxAltitude: 0,
      currentAltitude: 0,
      flightStartTime: 0,
      backgroundStars: generateBackgroundStars(50),
      nebulas: generateNebulas(580, -1000),
      crashBubble: undefined,
      swallow: undefined,
      ghostTrail: undefined,
      nearMissCooldown: 0,
      gravity: { sign: 1, duration: 0 },
      difficulty: {
        density: 1,
        speed: 1,
        unpredictability: 0.5,
        nextEventIn: 600,
      },
      lateHazardLock: { kind: null, timer: 0 },
    });
  }, [userData, generateObjects, generateBackgroundStars, generateNebulas]);

  const createParticles = useCallback(
    (
      x: number,
      y: number,
      color: string,
      count = 5,
      type: "normal" | "pulseRing" = "normal",
    ) => {
      const particles: Particle[] = [];

      if (type === "pulseRing") {
        // Create pulse ring effect
        particles.push({
          id: `pulse-${Date.now()}`,
          x,
          y,
          velocityX: 0,
          velocityY: 0,
          life: 45,
          maxLife: 45,
          color,
          size: 0,
          type: "pulseRing",
          radius: 10,
          maxRadius: 60,
        });
      } else {
        // Create normal particles
        for (let i = 0; i < count; i++) {
          particles.push({
            id: `particle-${Date.now()}-${i}`,
            x: x + (Math.random() - 0.5) * 5,
            y: y + (Math.random() - 0.5) * 5,
            velocityX: (Math.random() - 0.5) * 4,
            velocityY: (Math.random() - 0.5) * 4,
            life: 20,
            maxLife: 20,
            color,
            size: Math.random() * 2 + 1,
            type: "normal",
          });
        }
      }
      return particles;
    },
    [],
  );

  const createTextPop = useCallback(
    (x: number, y: number, text: string, color: string, fontSize = 16) => {
      const p: Particle = {
        id: `text-${Date.now()}-${Math.random()}`,
        x,
        y,
        velocityX: (Math.random() - 0.5) * 0.8,
        velocityY: -0.8 - Math.random() * 0.6,
        life: 26,
        maxLife: 26,
        color,
        size: 0,
        type: "textPop",
        text,
        fontSize,
      };
      return [p];
    },
    [],
  );

  const gameLoop = useCallback(
    (currentTime: number) => {
      // Calculate delta time in seconds
      const deltaTime =
        lastFrameTimeRef.current === 0
          ? 1 / 60
          : (currentTime - lastFrameTimeRef.current) / 1000;
      lastFrameTimeRef.current = currentTime;

      // Cap delta time to prevent large jumps (e.g., when tab becomes inactive)
      const clampedDeltaTime = Math.min(deltaTime, 1 / 30); // Max 30 FPS equivalent
      const targetFPS = 60;
      const baseFrameMultiplier = clampedDeltaTime * targetFPS;

      setGameState((prevState) => {
        // Apply slow motion to frame multiplier for cinematic effect
        const slowMotionMultiplier = prevState.slowMotion
          ? prevState.slowMotion.intensity
          : 1.0;
        const frameMultiplier = baseFrameMultiplier * slowMotionMultiplier;
        if (
          prevState.gameStatus !== "playing" &&
          prevState.gameStatus !== "dying"
        ) {
          return prevState;
        }

        const newState = { ...prevState };

        // Update slow motion effect (frame rate independent)
        if (newState.slowMotion) {
          newState.slowMotion.duration -= baseFrameMultiplier; // Use base frame multiplier to avoid slow motion affecting its own timer
          if (newState.slowMotion.duration <= 0) {
            newState.slowMotion = undefined;
          }
        }

        // Update lightning flash overlay timer
        if ((newState as any).lightningFlash) {
          (newState as any).lightningFlash.duration -= baseFrameMultiplier;
          if ((newState as any).lightningFlash.duration <= 0) {
            (newState as any).lightningFlash = undefined;
          }
        }

        // Late-game hazard overlap lock (15,000m+)
        if (!newState.lateHazardLock) {
          newState.lateHazardLock = { kind: null, timer: 0 };
        }
        if (newState.lateHazardLock.timer > 0) {
          newState.lateHazardLock.timer = Math.max(
            0,
            newState.lateHazardLock.timer - baseFrameMultiplier,
          );
          if (newState.lateHazardLock.timer <= 0) {
            newState.lateHazardLock.kind = null;
          }
        }

        // Handle black hole swallow animation and soft reset
        if (newState.swallow && newState.swallow.active) {
          newState.swallow.duration -= baseFrameMultiplier;

          // If animation finished, soft-reset the run at altitude 100
          if (newState.swallow.duration <= 0) {
            const maxFuel = newState.rocket.fuel;
            const respawnY = 580 - 100; // altitude 100

            // Respawn at 100m and auto-launch upward
            newState.rocket = {
              x: 200,
              y: respawnY,
              velocityX: 0,
              velocityY: -9,
              fuel: maxFuel,
              rotation: 0,
              collectionEffect: undefined,
            };

            newState.camera = { y: respawnY - 300, shake: 10 };
            newState.objects = generateObjects(respawnY, respawnY - 1000);
            newState.particles = [];
            newState.starsCollected = 0;
            newState.gameStatus = "playing";
            newState.ignitionLevel = 0;
            newState.maxAltitude = 100;
            newState.currentAltitude = 100;
            newState.flightStartTime = Date.now();
            newState.backgroundStars = generateBackgroundStars(50);
            newState.nebulas = generateNebulas(respawnY, respawnY - 1000);
            newState.gravity = { sign: 1, duration: 0 };
            newState.difficulty = {
              density: 1,
              speed: 1,
              unpredictability: 0.5,
              nextEventIn: 600,
            };
            newState.swallow = undefined;

            return newState;
          }

          // While swallowing, pull rocket toward the well and focus camera
          const sx = newState.swallow.x;
          const sy = newState.swallow.y;
          const lerpFactor = 0.15 * frameMultiplier;

          newState.rocket.x += (sx - newState.rocket.x) * lerpFactor;
          newState.rocket.y += (sy - newState.rocket.y) * lerpFactor;
          newState.camera.y +=
            (sy - 300 - newState.camera.y) * 0.1 * frameMultiplier;

          newState.rocket.velocityX *= Math.pow(0.8, frameMultiplier);
          newState.rocket.velocityY *= Math.pow(0.8, frameMultiplier);
          newState.camera.shake = Math.max(
            0,
            newState.camera.shake - 0.5 * frameMultiplier,
          );

          newState.currentAltitude = Math.max(0, 580 - newState.rocket.y);

          return newState;
        }

        // Update rocket collection effect (frame rate independent)
        if (newState.rocket.collectionEffect) {
          newState.rocket.collectionEffect.duration -= frameMultiplier;
          if (newState.rocket.collectionEffect.duration <= 0) {
            newState.rocket.collectionEffect = undefined;
          }
        }

        // Update crash bubble timer
        if (newState.crashBubble) {
          newState.crashBubble.duration -= baseFrameMultiplier;
          if (newState.crashBubble.duration <= 0) {
            newState.crashBubble = undefined;
          }
        }

        // Update Prism Splitter ghost trail timer
        if (newState.ghostTrail) {
          newState.ghostTrail.duration -= baseFrameMultiplier;
          newState.ghostTrail.nextSpawnIn -= baseFrameMultiplier;
          if (newState.ghostTrail.duration <= 0) {
            newState.ghostTrail = undefined;
          }
        }

        // Near-miss cooldown (prevents spam)
        if (
          (newState as any).nearMissCooldown &&
          (newState as any).nearMissCooldown > 0
        ) {
          (newState as any).nearMissCooldown = Math.max(
            0,
            (newState as any).nearMissCooldown - baseFrameMultiplier,
          );
        }

        // During death, keep the rocket stuck at the impact point
        if (newState.gameStatus === "dying") {
          const deathPose: any = (newState as any).deathPose;
          if (!deathPose) {
            (newState as any).deathPose = {
              x: newState.rocket.x,
              y: newState.rocket.y,
              rotation: newState.rocket.rotation,
            };
          }

          const pose: any = (newState as any).deathPose;
          // Stick rocket at the recorded impact position
          newState.rocket.x = pose.x;
          newState.rocket.y = pose.y;
          newState.rocket.rotation = pose.rotation;
          newState.rocket.velocityX = 0;
          newState.rocket.velocityY = 0;

          // Let camera shake ease out
          const shakeDamping = Math.pow(0.9, frameMultiplier);
          newState.camera.shake *= shakeDamping;

          // Keep altitude based on frozen pose
          newState.currentAltitude = Math.max(0, 580 - newState.rocket.y);
          newState.maxAltitude = Math.max(
            newState.maxAltitude,
            newState.currentAltitude,
          );

          // Countdown to game over
          newState.deathTimer =
            (newState.deathTimer || 0) - baseFrameMultiplier;
          if (!newState.deathTimer || newState.deathTimer <= 0) {
            newState.gameStatus = "gameOver";
          }

          // Still let particles evolve so the explosion feels alive
          newState.particles = newState.particles.filter((particle) => {
            particle.life -= frameMultiplier;
            particle.x += particle.velocityX * frameMultiplier;
            particle.y += particle.velocityY * frameMultiplier;
            particle.velocityY += 0.1 * frameMultiplier;
            return particle.life > 0;
          });

          return newState;
        }

        // Physics (frame rate independent) - Level-based improvements
        const baseGravity = 0.25;
        const gravitySign = newState.gravity?.sign ?? 1;

        // Make "falling" feel less harsh: when moving in the same direction as gravity,
        // reduce gravity strength by 2x.
        let gravityStrength = baseGravity * frameMultiplier;
        const isFallingWithGravity =
          newState.rocket.velocityY * gravitySign > 0;
        if (isFallingWithGravity) {
          gravityStrength *= 0.5;
        }
        const gravity = gravityStrength * gravitySign;

        const boostPower = 0.6 * frameMultiplier;
        const steerPower = 0.6 * frameMultiplier;

        // If we just resumed, keep the world frozen until the player taps the canvas.
        // This avoids accidental movement/boost caused by lingering touches.
        if (requireFreshInputRef.current) {
          return newState;
        }

        const controls = requireFreshInputRef.current
          ? { left: false, right: false, boost: false }
          : touchControlsRef.current;

        // Handle touch controls with smoother boost application
        if (controls.boost) {
          // Apply boost more smoothly to prevent sudden jumps
          const smoothBoostPower = Math.min(boostPower, 0.8 * frameMultiplier); // Cap boost power
          newState.rocket.velocityY -= smoothBoostPower;
          // Fuel boost effects based on level (50% to 20% consumption)
          // Fuel is infinite; no consumption

          // Create boost particles
          const jetSparkOffset = 8;
          const leftJetSparks = createParticles(
            newState.rocket.x - jetSparkOffset,
            newState.rocket.y + 12,
            "#38bdf8",
            2,
          );
          const rightJetSparks = createParticles(
            newState.rocket.x + jetSparkOffset,
            newState.rocket.y + 12,
            "#38bdf8",
            2,
          );
          newState.particles.push(...leftJetSparks, ...rightJetSparks);

          // Add screen shake
          newState.camera.shake = Math.min(2, newState.camera.shake + 0.2);
        }

        if (controls.left) {
          newState.rocket.velocityX -= steerPower;
          const rotationSpeed = 1 * frameMultiplier; // Reduced rotation speed
          newState.rocket.rotation = Math.max(
            -15,
            newState.rocket.rotation - rotationSpeed,
          );
        } else if (controls.right) {
          newState.rocket.velocityX += steerPower;
          const rotationSpeed = 1 * frameMultiplier; // Reduced rotation speed
          newState.rocket.rotation = Math.min(
            15,
            newState.rocket.rotation + rotationSpeed,
          );
        } else {
          // Return to center rotation (frame rate independent)
          const rotationDamping = Math.pow(0.9, frameMultiplier);
          newState.rocket.rotation *= rotationDamping;
        }

        // Apply physics (frame rate independent)
        newState.rocket.velocityY += gravity;
        const airResistance = Math.pow(0.95, frameMultiplier);
        newState.rocket.velocityX *= airResistance;

        // Apply velocity caps to prevent going off screen (reduced for smoother gameplay)
        // Speed boost scales upward velocity based on upgrade level
        const baseMaxUpwardVelocity = -12; // Base maximum upward speed
        const baseMaxDownwardVelocity = 10; // Base maximum downward speed

        const maxUpwardVelocity = baseMaxUpwardVelocity;
        const maxDownwardVelocity = baseMaxDownwardVelocity; // Downward velocity unchanged

        newState.rocket.velocityY = Math.max(
          maxUpwardVelocity,
          Math.min(maxDownwardVelocity, newState.rocket.velocityY),
        );

        newState.rocket.x += newState.rocket.velocityX * frameMultiplier;
        newState.rocket.y += newState.rocket.velocityY * frameMultiplier;

        // Keep rocket in bounds
        newState.rocket.x = Math.max(20, Math.min(380, newState.rocket.x));

        // Update camera with smooth following (frame rate independent)
        const targetCameraY = newState.rocket.y - 300;
        const cameraFollowSpeed = 0.1 * frameMultiplier; // Slower camera for smoother experience
        newState.camera.y +=
          (targetCameraY - newState.camera.y) * cameraFollowSpeed;

        // Reduce camera shake (frame rate independent)
        const shakeDamping = Math.pow(0.9, frameMultiplier);
        newState.camera.shake *= shakeDamping;

        // Update altitude (starting from y=580)
        const altitude = Math.max(0, 580 - newState.rocket.y);
        newState.currentAltitude = altitude;

        // Dynamic crosswind: ONLY active in the Cloud Zone (~1000–3000m),
        // with a soft fade-in/out to match the wind-streak visuals.
        if (!(newState as any).wind) {
          (newState as any).wind = { angle: 0, strength: 0 };
        }
        {
          const t = currentTime * 0.001;

          // Cloud Zone factor with soft edges (same ranges as the visual wind streaks)
          let cloudFactor = 0;
          if (altitude >= 1000 && altitude <= 3000) {
            cloudFactor = 1;
          } else if (altitude >= 900 && altitude < 1000) {
            cloudFactor = (altitude - 900) / 100; // fade in
          } else if (altitude > 3000 && altitude < 3150) {
            cloudFactor = 1 - (altitude - 3000) / 150; // fade out
          }

          // Within the Cloud Zone, keep a lively but readable wind.
          // Outside of it, targetStrength becomes 0 (no wind force at all).
          const cloudProgress = Math.max(
            0,
            Math.min(1, (altitude - 1000) / 2000),
          );
          const base = 0.18 + cloudProgress * 0.1; // ~0.18 → ~0.28
          const osc = (Math.sin(t * 0.6 + altitude * 0.002) + 1) * 0.08; // 0..0.16

          const rawStrength = Math.min(0.6, base + osc);
          const targetStrength = rawStrength * cloudFactor;
          const targetAngle = Math.sin(t * 0.35 + altitude * 0.001) * 22; // degrees

          // smooth interpolation
          const wind = (newState as any).wind;
          wind.strength +=
            (targetStrength - wind.strength) * 0.025 * frameMultiplier;

          // shortest-angle interpolation
          const cur = wind.angle || 0;
          let diff = targetAngle - cur;
          while (diff > 180) diff -= 360;
          while (diff < -180) diff += 360;
          wind.angle = cur + diff * 0.02 * frameMultiplier;

          // Apply wind force only while in (or fading into/out of) the Cloud Zone.
          // Outside that range, wind is purely cosmetic state (no force applied).
          if (cloudFactor > 0) {
            const angleRad = (wind.angle * Math.PI) / 180;

            // Rocket drift
            newState.rocket.velocityX +=
              Math.sin(angleRad) * wind.strength * 0.12 * frameMultiplier;

            // Slight obstacle drift for atmosphere
            newState.objects.forEach((o) => {
              if (o.type === "obstacle") {
                o.x +=
                  Math.sin(angleRad) * wind.strength * 0.03 * frameMultiplier;
                if (o.x < 20) o.x = 20;
                if (o.x > 380) o.x = 380;
              }
            });
          }
        }

        newState.maxAltitude = Math.max(newState.maxAltitude, altitude);

        // Prism Splitter: spawn short-lived ghost hazards behind the rocket
        if (
          newState.gameStatus === "playing" &&
          newState.ghostTrail &&
          newState.ghostTrail.nextSpawnIn <= 0
        ) {
          // Keep it lightweight: spawn at a steady interval, with a short "arming" grace period.
          newState.ghostTrail.nextSpawnIn = 14; // ~4 per second at 60fps

          const gy = newState.rocket.y + 26; // slightly behind the rocket
          const gx = newState.rocket.x + (Math.random() - 0.5) * 8;

          newState.objects.push({
            id: `ghost-${Date.now()}-${Math.random()}`,
            x: Math.max(24, Math.min(376, gx)),
            y: gy,
            width: 28,
            height: 28,
            type: "obstacle",
            variant: "ghostClone",
            harm: true,
            vx: 0,
            vy: 0,
            rotation: 0,
          } as any);

          const justSpawned = newState.objects[
            newState.objects.length - 1
          ] as any;
          justSpawned.ghostArming = 12; // short safe window so it never spawns “on you”
          justSpawned.ghostTtlMax = 95;
          justSpawned.ghostTtl = 95;

          // Cap total ghosts for performance
          const ghosts = newState.objects.filter(
            (o) => o.type === "obstacle" && o.variant === "ghostClone",
          );
          if (ghosts.length > 12) {
            const extras = ghosts.length - 12;
            let removed = 0;
            newState.objects = newState.objects.filter((o) => {
              if (
                removed < extras &&
                o.type === "obstacle" &&
                o.variant === "ghostClone"
              ) {
                removed += 1;
                return false;
              }
              return true;
            });
          }
        }

        // Update particles (frame rate independent)
        newState.particles = newState.particles.filter((particle) => {
          particle.life -= frameMultiplier;
          particle.x += particle.velocityX * frameMultiplier;
          particle.y += particle.velocityY * frameMultiplier;
          particle.velocityY += 0.1 * frameMultiplier; // Gravity on particles
          return particle.life > 0;
        });

        // Update objects (movement/rotation)
        newState.objects.forEach((obj) => {
          if (obj.type === "obstacle") {
            // Meteor projectiles: very fast, short-lived
            if (obj.variant === "meteor") {
              const anyObj: any = obj as any;
              if (anyObj.meteorTtl != null) {
                anyObj.meteorTtl =
                  (anyObj.meteorTtl ?? 0) - baseFrameMultiplier;
                if (anyObj.meteorTtl <= 0) {
                  anyObj.meteorRemove = true;
                }
              }
            }

            // Railgun shots: even faster, short-lived
            if (obj.variant === "railShot") {
              const anyObj: any = obj as any;
              if (anyObj.shotTtl != null) {
                anyObj.shotTtl = (anyObj.shotTtl ?? 0) - baseFrameMultiplier;
                if (anyObj.shotTtl <= 0) {
                  anyObj.shotRemove = true;
                }
              }
            }

            // Meteor Swarm emitter lifecycle: cooldown → warning charge → spawn barrage
            if (obj.variant === "meteorSwarm") {
              const anyObj: any = obj as any;
              if (!anyObj.swarmState) {
                anyObj.swarmState = "cooldown";
                anyObj.swarmTimer = 140 + Math.random() * 200;
                anyObj.swarmCharge = 0;
              }

              const aheadDist = newState.rocket.y - obj.y;
              // Give players a small “breather gap” after entering the 15,000m+ zone
              // before the late-game hazards can begin charging/telegraphing.
              const chaosGraceUntilAlt = 15000 + 450;
              const inChaosGrace =
                (newState.currentAltitude ?? 0) < chaosGraceUntilAlt;

              const inActivationWindow =
                !inChaosGrace && aheadDist > 0 && aheadDist < 900;

              // If the emitter is far behind the player, drop it to prevent buildup.
              if (obj.y > newState.rocket.y + 1400) {
                anyObj.swarmRemove = true;
              }

              // If we’re still in the grace window, force the swarm back into cooldown.
              if (inChaosGrace && anyObj.swarmState === "charging") {
                anyObj.swarmState = "cooldown";
                anyObj.swarmTimer = Math.max(anyObj.swarmTimer ?? 0, 18);
                anyObj.swarmCharge = 0;
                anyObj.swarmSafeLaneIndex = undefined;
                anyObj.swarmTargetLaneIndexes = undefined;
              }

              if (anyObj.swarmState === "cooldown") {
                anyObj.swarmTimer -= baseFrameMultiplier;

                // If the player is approaching, don't let a long cooldown make this missable.
                if (inActivationWindow) {
                  anyObj.swarmTimer = Math.min(anyObj.swarmTimer, 0);
                }

                if (anyObj.swarmTimer <= 0 && inActivationWindow) {
                  if (
                    newState.lateHazardLock?.kind &&
                    newState.lateHazardLock.kind !== "meteorSwarm"
                  ) {
                    // Another late-game hazard is already charging/attacking; retry soon.
                    anyObj.swarmTimer = Math.max(anyObj.swarmTimer ?? 0, 10);
                  } else {
                    anyObj.swarmState = "charging";
                    anyObj.swarmTimer = 34; // warning window (readable but still scary)
                    anyObj.swarmCharge = 0;
                    newState.lateHazardLock = {
                      kind: "meteorSwarm",
                      timer: 70,
                    };

                    // Pre-pick the "safe lane" (always reachable) and telegraph it.
                    const laneXs = [70, 150, 250, 330];
                    let rocketLaneIndex = 0;
                    let best = Infinity;
                    for (let li = 0; li < laneXs.length; li++) {
                      const d = Math.abs(
                        (laneXs[li] ?? 200) - newState.rocket.x,
                      );
                      if (d < best) {
                        best = d;
                        rocketLaneIndex = li;
                      }
                    }

                    const adjacent: number[] = [];
                    if (rocketLaneIndex - 1 >= 0)
                      adjacent.push(rocketLaneIndex - 1);
                    if (rocketLaneIndex + 1 < 4)
                      adjacent.push(rocketLaneIndex + 1);

                    // Most of the time, force a 1-lane move; sometimes allow "stay".
                    const forceMove =
                      Math.random() < 0.8 && adjacent.length > 0;
                    const safeLaneIndex = forceMove
                      ? adjacent[Math.floor(Math.random() * adjacent.length)]!
                      : rocketLaneIndex;

                    anyObj.swarmSafeLaneIndex = safeLaneIndex;
                    anyObj.swarmTargetLaneIndexes = [0, 1, 2, 3].filter(
                      (i: number) => i !== safeLaneIndex,
                    );
                  }
                }
              } else if (anyObj.swarmState === "charging") {
                // Keep the lock alive while charging so other late hazards don't overlap.
                if (
                  !newState.lateHazardLock?.kind ||
                  newState.lateHazardLock.kind === "meteorSwarm"
                ) {
                  newState.lateHazardLock = {
                    kind: "meteorSwarm",
                    timer: Math.max(newState.lateHazardLock?.timer ?? 0, 30),
                  };
                }

                anyObj.swarmTimer -= baseFrameMultiplier;
                const total = 34;
                const rem = Math.max(0, anyObj.swarmTimer);
                anyObj.swarmCharge = 1 - rem / total;

                if (anyObj.swarmTimer <= 0) {
                  // Spawn a brutal but readable barrage: fast falling streaks in all but one "safe lane".
                  const laneXs = [70, 150, 250, 330];
                  const targetIdxs: number[] =
                    (anyObj.swarmTargetLaneIndexes as number[]) ?? [0, 1, 2, 3];

                  // Slightly longer barrage, but guaranteed gap lane.
                  const burstCount = 7 + Math.floor(Math.random() * 3); // 7–9
                  const baseY = newState.rocket.y - 520; // spawn above the player

                  for (let i = 0; i < burstCount; i++) {
                    const laneIndex =
                      targetIdxs[
                        Math.floor(Math.random() * targetIdxs.length)
                      ] ?? 1;
                    const x0 =
                      (laneXs[laneIndex] ?? 200) + (Math.random() - 0.5) * 10;
                    const y0 = baseY - i * 55;

                    // Very fast downward streaks
                    const vy = 13 + Math.random() * 6;
                    const vx = (Math.random() - 0.5) * 1.6;

                    const meteor: GameObject = {
                      id: `meteor-${Date.now()}-${Math.random()}`,
                      x: x0,
                      y: y0,
                      width: 16,
                      height: 16,
                      type: "obstacle",
                      variant: "meteor",
                      vx,
                      vy,
                      rotation: 0,
                      harm: true,
                    };
                    (meteor as any).meteorTtl = 140; // ~2.3s
                    newState.objects.push(meteor);
                  }

                  // Clear telegraph info after firing so it doesn't stick
                  anyObj.swarmSafeLaneIndex = undefined;
                  anyObj.swarmTargetLaneIndexes = undefined;

                  // Small flash so it feels lethal
                  (newState as any).lightningFlash = {
                    duration: 10,
                    maxDuration: 10,
                    intensity: 0.18,
                    color: "#ef4444",
                  };

                  // Fire once, then remove the hidden emitter so it can't be "outrun" or retrigger.
                  anyObj.swarmRemove = true;

                  anyObj.swarmState = "cooldown";
                  anyObj.swarmTimer = 230 + Math.random() * 260;
                  anyObj.swarmCharge = 0;
                }
              }
            }

            // Railgun Snipe lifecycle: cooldown → targeting line → fire straight shot(s)
            if (obj.variant === "railgunSnipe") {
              const anyObj: any = obj as any;
              if (!anyObj.snipeState) {
                anyObj.snipeState = "cooldown";
                anyObj.snipeTimer = 170 + Math.random() * 240;
                anyObj.snipeCharge = 0;
                anyObj.snipeTargetX = 200;
              }

              const aheadDist = newState.rocket.y - obj.y;
              // Give players a small “breather gap” after entering the 15,000m+ zone
              // before the late-game hazards can begin charging/telegraphing.
              const chaosGraceUntilAlt = 15000 + 450;
              const inChaosGrace =
                (newState.currentAltitude ?? 0) < chaosGraceUntilAlt;

              const inActivationWindow =
                !inChaosGrace && aheadDist > 0 && aheadDist < 950;

              // If the emitter is far behind the player, drop it to prevent buildup.
              if (obj.y > newState.rocket.y + 1400) {
                anyObj.snipeRemove = true;
              }

              const clampX = (x: number) => Math.max(30, Math.min(370, x));

              // If we’re still in the grace window, force the snipe back into cooldown.
              if (inChaosGrace && anyObj.snipeState === "charging") {
                anyObj.snipeState = "cooldown";
                anyObj.snipeTimer = Math.max(anyObj.snipeTimer ?? 0, 18);
                anyObj.snipeCharge = 0;
              }

              if (anyObj.snipeState === "cooldown") {
                anyObj.snipeTimer -= baseFrameMultiplier;

                // Trigger as soon as the rocket is approaching so you can't "outrun" it.
                if (inActivationWindow) {
                  if (
                    newState.lateHazardLock?.kind &&
                    newState.lateHazardLock.kind !== "railgunSnipe"
                  ) {
                    // Another late-game hazard is already charging/attacking; retry soon.
                    anyObj.snipeTimer = Math.max(anyObj.snipeTimer ?? 0, 10);
                  } else {
                    anyObj.snipeState = "charging";
                    anyObj.snipeTimer = 30; // warning window
                    anyObj.snipeCharge = 0;
                    newState.lateHazardLock = {
                      kind: "railgunSnipe",
                      timer: 65,
                    };

                    // Target where the rocket is NOW (with a slight random bias), giving the player a chance to react.
                    anyObj.snipeTargetX = clampX(
                      newState.rocket.x + (Math.random() - 0.5) * 36,
                    );
                  }
                }
              } else if (anyObj.snipeState === "charging") {
                // Keep the lock alive while charging so other late hazards don't overlap.
                if (
                  !newState.lateHazardLock?.kind ||
                  newState.lateHazardLock.kind === "railgunSnipe"
                ) {
                  newState.lateHazardLock = {
                    kind: "railgunSnipe",
                    timer: Math.max(newState.lateHazardLock?.timer ?? 0, 28),
                  };
                }

                anyObj.snipeTimer -= baseFrameMultiplier;
                const total = 30;
                const rem = Math.max(0, anyObj.snipeTimer);
                anyObj.snipeCharge = 1 - rem / total;

                if (anyObj.snipeTimer <= 0) {
                  // Fire 2 quick shots down the targeted line, then the emitter disappears.
                  const baseY = newState.rocket.y - 560;
                  const burst = 2;

                  for (let i = 0; i < burst; i++) {
                    const shot: GameObject = {
                      id: `rail-${Date.now()}-${Math.random()}`,
                      x: anyObj.snipeTargetX,
                      y: baseY - i * 70,
                      width: 12,
                      height: 12,
                      type: "obstacle",
                      variant: "railShot",
                      vx: (Math.random() - 0.5) * 0.6,
                      vy: 18 + Math.random() * 7,
                      rotation: 0,
                      harm: true,
                    };
                    (shot as any).shotTtl = 150;
                    newState.objects.push(shot);
                  }

                  (newState as any).lightningFlash = {
                    duration: 10,
                    maxDuration: 10,
                    intensity: 0.16,
                    color: "#38bdf8",
                  };

                  anyObj.snipeState = "cooldown";
                  anyObj.snipeTimer = 240 + Math.random() * 280;
                  anyObj.snipeCharge = 0;
                  anyObj.snipeRemove = true;
                }
              }
            }

            // Ghost clones: stationary and short-lived
            if (obj.variant === "ghostClone") {
              const anyObj: any = obj as any;
              if (anyObj.ghostArming && anyObj.ghostArming > 0) {
                anyObj.ghostArming = Math.max(
                  0,
                  anyObj.ghostArming - baseFrameMultiplier,
                );
              }
              if (anyObj.ghostTtl != null) {
                anyObj.ghostTtl = (anyObj.ghostTtl ?? 0) - baseFrameMultiplier;
                if (anyObj.ghostTtl <= 0) {
                  anyObj.ghostRemove = true;
                }
              }
            }

            // movement
            obj.x += (obj.vx || 0) * frameMultiplier;
            obj.y += (obj.vy || 0) * frameMultiplier;
            // keep within bounds
            if (obj.x < 20) {
              obj.x = 20;
              obj.vx = Math.abs(obj.vx || 0);
            }
            if (obj.x > 380) {
              obj.x = 380;
              obj.vx = -Math.abs(obj.vx || 0);
            }
            // rotation for rotating walls and debris
            if (obj.variant === "rotatingWall") {
              obj.rotation = (obj.rotation || 0) + 1.2 * frameMultiplier;
            } else if (obj.variant === "warpedWall") {
              obj.rotation = (obj.rotation || 0) + 0.6 * frameMultiplier;
            } else if (obj.variant === "spaceJunk") {
              obj.rotation = (obj.rotation || 0) + 0.8 * frameMultiplier;
            } else if (obj.variant === "satelliteFragment") {
              obj.rotation = 0;
            } else if (obj.variant === "driftingAsteroid") {
              obj.rotation = (obj.rotation || 0) + 0.3 * frameMultiplier;
            } else if (obj.variant === "gravityFlip") {
              // Gravity Flip removed
            }
            // aware wall tracks player horizontally a bit
            if (obj.variant === "awareWall") {
              const dir = Math.sign(newState.rocket.x - obj.x) || 0;
              obj.vx = (obj.vx || 0) * 0.9 + dir * 0.15 * frameMultiplier;
            }

            // Lightning lifecycle: charge → strike → cooldown
            if (obj.variant === "lightning") {
              const anyObj: any = obj as any;
              if (anyObj.strikeCooldown == null) {
                anyObj.strikeCooldown = 120 + Math.random() * 180; // frames
                anyObj.strikeDuration = 18;
                anyObj.isStriking = false;
                anyObj.chargeLevel = 0;
              }

              if (anyObj.isStriking) {
                anyObj.strikeDuration -= frameMultiplier;
                anyObj.chargeLevel = 1;

                // Trigger a short global flash while striking
                const onScreen =
                  Math.abs(obj.y - (newState.camera.y + 300)) < 400;
                if (onScreen) {
                  const currentIntensity =
                    (newState as any).lightningFlash?.intensity ?? 0;
                  (newState as any).lightningFlash = {
                    duration: 14,
                    maxDuration: 14,
                    intensity: Math.max(0.1, currentIntensity),
                    color: "#ffffff",
                  };
                }

                // Camera shake disabled for lightning strikes (keep flash only)

                if (anyObj.strikeDuration <= 0) {
                  anyObj.isStriking = false;
                  anyObj.strikeCooldown = 150 + Math.random() * 200;
                  anyObj.chargeLevel = 0;
                }
              } else {
                anyObj.strikeCooldown -= frameMultiplier;
                // build-up charge effect as cooldown nears zero
                anyObj.chargeLevel = Math.max(
                  0,
                  1 - anyObj.strikeCooldown / 60,
                );
                if (anyObj.strikeCooldown <= 0) {
                  anyObj.isStriking = true;
                  anyObj.strikeDuration = 18;
                }
              }
            } else if (obj.variant === "lightningCloud") {
              const anyObj: any = obj as any;
              if (anyObj.strikeCooldown == null) {
                anyObj.strikeCooldown = 120 + Math.random() * 180;
                anyObj.strikeDuration = 18;
                anyObj.isStriking = false;
                anyObj.chargeLevel = 0;
              }

              if (anyObj.isStriking) {
                anyObj.strikeDuration -= frameMultiplier;
                anyObj.chargeLevel = 1;

                // Flash the screen when a cloud strike happens and it's on screen
                const onScreen =
                  Math.abs(obj.y - (newState.camera.y + 300)) < 400;
                if (onScreen) {
                  const currentIntensity =
                    (newState as any).lightningFlash?.intensity ?? 0;
                  (newState as any).lightningFlash = {
                    duration: 14,
                    maxDuration: 14,
                    intensity: Math.max(0.1, currentIntensity),
                    color: "#ffffff",
                  };
                }
                // Camera shake disabled for lightning strikes (keep flash only)

                if (anyObj.strikeDuration <= 0) {
                  anyObj.isStriking = false;
                  anyObj.strikeCooldown = 150 + Math.random() * 200;
                  anyObj.chargeLevel = 0;
                }
              } else {
                anyObj.strikeCooldown -= frameMultiplier;
                anyObj.chargeLevel = Math.max(
                  0,
                  1 - anyObj.strikeCooldown / 60,
                );
                if (anyObj.strikeCooldown <= 0) {
                  anyObj.isStriking = true;
                  anyObj.strikeDuration = 18;
                }
              }
            }

            // Space mine lifecycle: proximity arm → 2s delay → explosion wave
            if (obj.variant === "spaceMine") {
              const anyObj: any = obj as any;
              if (anyObj.mineArmed == null) {
                anyObj.mineArmed = false;
                anyObj.mineTimer = 0;
                anyObj.mineTimerMax = 60;
                anyObj.mineExploding = false;
                anyObj.mineExplosionTimer = 0;
                anyObj.mineExplosionProgress = 0;
                anyObj.mineRemove = false;
              }

              const dist = Math.hypot(
                obj.x - newState.rocket.x,
                obj.y - newState.rocket.y,
              );
              const triggerRadius = 55;

              if (!anyObj.mineExploding) {
                if (!anyObj.mineArmed && dist < triggerRadius) {
                  anyObj.mineArmed = true;
                  anyObj.mineTimer = 60; // ~1 second at 60fps
                  anyObj.mineTimerMax = 60; // for arming intensity ramp
                }

                if (anyObj.mineArmed) {
                  anyObj.mineTimer -= baseFrameMultiplier;
                  if (anyObj.mineTimer <= 0) {
                    anyObj.mineExploding = true;
                    anyObj.mineExplosionTimer = 42; // ~0.7s
                    anyObj.mineExplosionProgress = 0;

                    // A little flash as it detonates
                    (newState as any).lightningFlash = {
                      duration: 12,
                      maxDuration: 12,
                      intensity: 0.25,
                      color: "#fb923c",
                    };
                  }
                }
              } else {
                anyObj.mineExplosionTimer -= baseFrameMultiplier;
                const total = 42;
                const remaining = Math.max(0, anyObj.mineExplosionTimer);
                anyObj.mineExplosionProgress = 1 - remaining / total;

                // In Test Mode, mines never harm you
                if (!testMode) {
                  const blastRadius = Math.max(obj.width, obj.height) * 3;
                  if (
                    dist <= blastRadius &&
                    newState.gameStatus === "playing"
                  ) {
                    newState.gameStatus = "dying";
                    newState.deathTimer = 45;
                    newState.camera.shake = Math.max(newState.camera.shake, 18);
                    (newState as any).lightningFlash = {
                      duration: 18,
                      maxDuration: 18,
                      intensity: 0.45,
                      color: "#fb923c",
                    };
                    touchControlsRef.current = {
                      left: false,
                      right: false,
                      boost: false,
                    };
                    (newState as any).deathPose = {
                      x: newState.rocket.x,
                      y: newState.rocket.y,
                      rotation: newState.rocket.rotation,
                    };

                    const impactX = (newState.rocket.x + obj.x) / 2;
                    const impactY = (newState.rocket.y + obj.y) / 2;

                    newState.crashBubble = {
                      x: impactX,
                      y: impactY,
                      text: "KABOOM!",
                      duration: 55,
                      maxDuration: 55,
                    };

                    (newState as any).slowMotion = {
                      duration: 25,
                      maxDuration: 25,
                      intensity: 0.45,
                    };
                  }
                }

                if (anyObj.mineExplosionTimer <= 0) {
                  anyObj.mineRemove = true;
                }
              }
            }
          }

          // Laser Gate: warning charge-up → active deadly beam → cooldown
          if (obj.type === "obstacle" && obj.variant === "laserGate") {
            const anyObj: any = obj as any;
            if (!anyObj.laserState) {
              anyObj.laserState = "cooldown";
              anyObj.laserTimer = 160 + Math.random() * 200;
              anyObj.laserCharge = 0;
            }

            // Only run expensive state transitions if it's plausibly on screen
            const onScreen = Math.abs(obj.y - (newState.camera.y + 300)) < 520;

            if (anyObj.laserState === "cooldown") {
              anyObj.laserTimer -= baseFrameMultiplier;
              if (anyObj.laserTimer <= 0 && onScreen) {
                anyObj.laserState = "charging";
                anyObj.laserTimer = 26; // readable warning window
                anyObj.laserCharge = 0;
              }
            } else if (anyObj.laserState === "charging") {
              anyObj.laserTimer -= baseFrameMultiplier;
              const total = 26;
              const rem = Math.max(0, anyObj.laserTimer);
              anyObj.laserCharge = 1 - rem / total;

              if (anyObj.laserTimer <= 0) {
                anyObj.laserState = "active";
                anyObj.laserTimer = 38; // deadly window
                anyObj.laserCharge = 1;

                (newState as any).lightningFlash = {
                  duration: 10,
                  maxDuration: 10,
                  intensity: 0.22,
                  color: "#ef4444",
                };
              }
            } else if (anyObj.laserState === "active") {
              anyObj.laserTimer -= baseFrameMultiplier;
              if (anyObj.laserTimer <= 0) {
                anyObj.laserState = "cooldown";
                anyObj.laserTimer = 210 + Math.random() * 260;
                anyObj.laserCharge = 0;
              }
            }
          }

          // Decrement per-object collision cooldown if present
          if ((obj as any).hitCooldown && (obj as any).hitCooldown > 0) {
            (obj as any).hitCooldown = Math.max(
              0,
              (obj as any).hitCooldown - frameMultiplier,
            );
          }
        });

        // Black hole / gravity wells pull the rocket
        newState.objects.forEach((obj) => {
          if (obj.type === "obstacle" && obj.variant === "blackHole") {
            const dx = obj.x - newState.rocket.x;
            const dy = obj.y - newState.rocket.y;
            const distSq = dx * dx + dy * dy + 1;
            const strength = 80 / distSq; // inverse-square falloff
            newState.rocket.velocityX +=
              (dx / Math.sqrt(distSq)) * strength * frameMultiplier;
            newState.rocket.velocityY +=
              (dy / Math.sqrt(distSq)) * strength * frameMultiplier;
          }
        });

        // Collision detection and interactions
        newState.objects = newState.objects.filter((obj) => {
          // In Test Mode, we still collect stars but ignore all obstacle collisions
          const collisionsDisabled = !!testMode;

          // Remove exploded mines after their wave finishes
          if ((obj as any)?.mineRemove) {
            return false;
          }

          // Remove expired ghost clones
          if ((obj as any)?.ghostRemove) {
            return false;
          }

          // Remove expired meteors
          if ((obj as any)?.meteorRemove) {
            return false;
          }

          // Remove expired railgun shots
          if ((obj as any)?.shotRemove) {
            return false;
          }

          // Remove Meteor Swarm emitters once they're well behind the player (prevents buildup)
          if ((obj as any)?.swarmRemove) {
            return false;
          }

          // Remove used railgun snipe emitters (they fire once)
          if ((obj as any)?.snipeRemove) {
            return false;
          }

          // Laser Gate: deadly only during the active beam window (use a rectangle hitbox for fairness)
          if (
            !collisionsDisabled &&
            obj.type === "obstacle" &&
            obj.variant === "laserGate"
          ) {
            const anyObj: any = obj as any;
            const state = anyObj.laserState || "cooldown";
            if (state === "active") {
              const rocketRadius = 12;
              const halfW = (obj.width || 0) / 2;
              const halfH = (obj.height || 0) / 2;
              const dx = Math.abs(newState.rocket.x - obj.x);
              const dy = Math.abs(newState.rocket.y - obj.y);

              if (
                dx < halfW + rocketRadius &&
                dy < halfH + rocketRadius &&
                newState.gameStatus === "playing"
              ) {
                newState.gameStatus = "dying";
                newState.deathTimer = 45;
                newState.camera.shake = Math.max(newState.camera.shake, 18);
                (newState as any).lightningFlash = {
                  duration: 16,
                  maxDuration: 16,
                  intensity: 0.45,
                  color: "#ef4444",
                };
                touchControlsRef.current = {
                  left: false,
                  right: false,
                  boost: false,
                };
                (newState as any).deathPose = {
                  x: newState.rocket.x,
                  y: newState.rocket.y,
                  rotation: newState.rocket.rotation,
                };

                newState.crashBubble = {
                  x: newState.rocket.x,
                  y: newState.rocket.y,
                  text: "SIZZLE!",
                  duration: 55,
                  maxDuration: 55,
                };

                (newState as any).slowMotion = {
                  duration: 25,
                  maxDuration: 25,
                  intensity: 0.45,
                };
              }
            }
          }

          // LightningCloud harm region: only during a strike, directly below the cloud
          if (
            !collisionsDisabled &&
            obj.type === "obstacle" &&
            obj.variant === "lightningCloud"
          ) {
            const lc: any = obj as any;
            if (lc.isStriking) {
              const dx = Math.abs(newState.rocket.x - obj.x);
              const ry = newState.rocket.y;
              const boltTop = obj.y - 6; // just under the cloud body
              const boltBottom = obj.y + 90; // strike reach in world units
              if (dx < 16 && ry > boltTop && ry < boltBottom) {
                if (newState.gameStatus === "playing") {
                  newState.gameStatus = "dying";
                  newState.deathTimer = 45;
                  newState.camera.shake = Math.max(newState.camera.shake, 18);
                  (newState as any).lightningFlash = {
                    duration: 18,
                    maxDuration: 18,
                    intensity: 0.5,
                    color: "#ffffff",
                  };
                  touchControlsRef.current = {
                    left: false,
                    right: false,
                    boost: false,
                  };
                  (newState as any).deathPose = {
                    x: newState.rocket.x,
                    y: newState.rocket.y,
                    rotation: newState.rocket.rotation,
                  };

                  const impactX = (newState.rocket.x + obj.x) / 2;
                  const impactY = (newState.rocket.y + obj.y) / 2;

                  newState.crashBubble = {
                    x: impactX,
                    y: impactY,
                    text: "ZAP!",
                    duration: 40,
                    maxDuration: 40,
                  };

                  // Brief slow-motion to let the hit land
                  (newState as any).slowMotion = {
                    duration: 25,
                    maxDuration: 25,
                    intensity: 0.45,
                  };
                }
              }
            }
          }
          // Singularity shards: only the orbiting shards are lethal (center is safe).
          if (
            !collisionsDisabled &&
            obj.type === "obstacle" &&
            obj.variant === "singularityShards" &&
            newState.gameStatus === "playing"
          ) {
            const anyObj: any = obj as any;
            const orbitRadius = anyObj.orbitRadius ?? 58;
            const shardCount = Math.max(
              4,
              Math.min(10, anyObj.shardCount ?? 6),
            );
            const shardSize = anyObj.shardSize ?? 10;
            const orbitSpeed = anyObj.orbitSpeed ?? 1.2;
            const orbitPhase = anyObj.orbitPhase ?? 0;

            const t = currentTime * 0.001;
            const theta0 = t * orbitSpeed + orbitPhase;

            for (let i = 0; i < shardCount; i++) {
              const a = theta0 + (i / shardCount) * Math.PI * 2;
              const sx = obj.x + Math.cos(a) * orbitRadius;
              const sy = obj.y + Math.sin(a) * orbitRadius;
              const d = Math.hypot(
                newState.rocket.x - sx,
                newState.rocket.y - sy,
              );

              // Fair-ish hitbox: a bit larger than shardSize so it reads clearly.
              if (d < shardSize + 14) {
                newState.gameStatus = "dying";
                newState.deathTimer = 45;
                newState.camera.shake = Math.max(newState.camera.shake, 18);
                (newState as any).lightningFlash = {
                  duration: 16,
                  maxDuration: 16,
                  intensity: 0.42,
                  color: "#a78bfa",
                };
                touchControlsRef.current = {
                  left: false,
                  right: false,
                  boost: false,
                };
                (newState as any).deathPose = {
                  x: newState.rocket.x,
                  y: newState.rocket.y,
                  rotation: newState.rocket.rotation,
                };

                const impactX = (newState.rocket.x + sx) / 2;
                const impactY = (newState.rocket.y + sy) / 2;

                newState.crashBubble = {
                  x: impactX,
                  y: impactY,
                  text: "SHARD!",
                  duration: 50,
                  maxDuration: 50,
                };

                (newState as any).slowMotion = {
                  duration: 25,
                  maxDuration: 25,
                  intensity: 0.45,
                };
                break;
              }
            }
          }

          const dx = obj.x - newState.rocket.x;
          const dy = obj.y - newState.rocket.y;
          const distance = Math.sqrt(dx * dx + dy * dy);

          // Meteors: very small hitbox, very lethal
          if (
            !collisionsDisabled &&
            obj.type === "obstacle" &&
            obj.variant === "meteor" &&
            distance < 20 &&
            newState.gameStatus === "playing"
          ) {
            newState.gameStatus = "dying";
            newState.deathTimer = 45;
            newState.camera.shake = Math.max(newState.camera.shake, 18);
            (newState as any).lightningFlash = {
              duration: 14,
              maxDuration: 14,
              intensity: 0.4,
              color: "#ef4444",
            };
            touchControlsRef.current = {
              left: false,
              right: false,
              boost: false,
            };
            (newState as any).deathPose = {
              x: newState.rocket.x,
              y: newState.rocket.y,
              rotation: newState.rocket.rotation,
            };

            newState.crashBubble = {
              x: (newState.rocket.x + obj.x) / 2,
              y: (newState.rocket.y + obj.y) / 2,
              text: "SMACK!",
              duration: 50,
              maxDuration: 50,
            };

            (newState as any).slowMotion = {
              duration: 25,
              maxDuration: 25,
              intensity: 0.45,
            };

            return true;
          }

          // Railgun shots: very small hitbox, very lethal
          if (
            !collisionsDisabled &&
            obj.type === "obstacle" &&
            obj.variant === "railShot" &&
            distance < 18 &&
            newState.gameStatus === "playing"
          ) {
            newState.gameStatus = "dying";
            newState.deathTimer = 45;
            newState.camera.shake = Math.max(newState.camera.shake, 18);
            (newState as any).lightningFlash = {
              duration: 14,
              maxDuration: 14,
              intensity: 0.35,
              color: "#38bdf8",
            };
            touchControlsRef.current = {
              left: false,
              right: false,
              boost: false,
            };
            (newState as any).deathPose = {
              x: newState.rocket.x,
              y: newState.rocket.y,
              rotation: newState.rocket.rotation,
            };

            newState.crashBubble = {
              x: (newState.rocket.x + obj.x) / 2,
              y: (newState.rocket.y + obj.y) / 2,
              text: "ZING!",
              duration: 50,
              maxDuration: 50,
            };

            (newState as any).slowMotion = {
              duration: 25,
              maxDuration: 25,
              intensity: 0.45,
            };

            return true;
          }

          // Ghost clones: smaller, fair hitbox; only lethal once armed
          if (
            !collisionsDisabled &&
            obj.type === "obstacle" &&
            obj.variant === "ghostClone" &&
            (obj as any).ghostArming <= 0 &&
            distance < 24 &&
            newState.gameStatus === "playing"
          ) {
            newState.gameStatus = "dying";
            newState.deathTimer = 45;
            newState.camera.shake = Math.max(newState.camera.shake, 16);
            (newState as any).lightningFlash = {
              duration: 16,
              maxDuration: 16,
              intensity: 0.35,
              color: "#38bdf8",
            };
            touchControlsRef.current = {
              left: false,
              right: false,
              boost: false,
            };
            (newState as any).deathPose = {
              x: newState.rocket.x,
              y: newState.rocket.y,
              rotation: newState.rocket.rotation,
            };

            newState.crashBubble = {
              x: (newState.rocket.x + obj.x) / 2,
              y: (newState.rocket.y + obj.y) / 2,
              text: "ECHO!",
              duration: 50,
              maxDuration: 50,
            };

            (newState as any).slowMotion = {
              duration: 25,
              maxDuration: 25,
              intensity: 0.45,
            };

            return true;
          }

          // Near-miss feedback for dangerous obstacles (when you *almost* collide)
          if (
            !collisionsDisabled &&
            obj.type === "obstacle" &&
            newState.gameStatus === "playing" &&
            ((newState as any).nearMissCooldown ?? 0) <= 0 &&
            distance < 58 &&
            distance >= 35
          ) {
            (newState as any).nearMissCooldown = 18;
            newState.camera.shake = Math.max(newState.camera.shake, 5);
            newState.particles.push(
              ...createTextPop(
                newState.rocket.x,
                newState.rocket.y - 18,
                "NEAR!",
                "#e0f2fe",
                14,
              ),
            );
          }

          if (distance < 35) {
            if (obj.type === "star") {
              newState.starsCollected++;
              newState.camera.shake = Math.max(newState.camera.shake, 2);
              newState.particles.push(
                ...createParticles(obj.x, obj.y, "#fbbf24", 10),
                ...createTextPop(obj.x, obj.y - 10, "+1", "#fde68a", 16),
              );
              return false;
            } else if (obj.type === "obstacle") {
              // Lightning clouds should be collidable on contact (in addition to the strike bolt region)
              if (obj.variant === "lightningCloud") {
                if (collisionsDisabled) {
                  return true;
                }

                if (newState.gameStatus === "playing") {
                  newState.gameStatus = "dying";
                  newState.deathTimer = 45;
                  newState.camera.shake = Math.max(newState.camera.shake, 18);
                  (newState as any).lightningFlash = {
                    duration: 18,
                    maxDuration: 18,
                    intensity: 0.5,
                    color: "#ffffff",
                  };
                  touchControlsRef.current = {
                    left: false,
                    right: false,
                    boost: false,
                  };
                  (newState as any).deathPose = {
                    x: newState.rocket.x,
                    y: newState.rocket.y,
                    rotation: newState.rocket.rotation,
                  };

                  const impactX = (newState.rocket.x + obj.x) / 2;
                  const impactY = (newState.rocket.y + obj.y) / 2;

                  newState.crashBubble = {
                    x: impactX,
                    y: impactY,
                    text: "ZAP!",
                    duration: 40,
                    maxDuration: 40,
                  };

                  // Brief slow-motion to let the hit land
                  (newState as any).slowMotion = {
                    duration: 25,
                    maxDuration: 25,
                    intensity: 0.45,
                  };
                }

                return true;
              }

              // Space mine: touching it is fatal (in addition to the delayed explosion wave)
              if (obj.variant === "spaceMine") {
                if (collisionsDisabled) {
                  return true;
                }

                if (newState.gameStatus === "playing") {
                  newState.gameStatus = "dying";
                  newState.deathTimer = 45;
                  newState.camera.shake = Math.max(newState.camera.shake, 18);
                  (newState as any).lightningFlash = {
                    duration: 18,
                    maxDuration: 18,
                    intensity: 0.45,
                    color: "#fb923c",
                  };
                  touchControlsRef.current = {
                    left: false,
                    right: false,
                    boost: false,
                  };
                  (newState as any).deathPose = {
                    x: newState.rocket.x,
                    y: newState.rocket.y,
                    rotation: newState.rocket.rotation,
                  };

                  const impactX = (newState.rocket.x + obj.x) / 2;
                  const impactY = (newState.rocket.y + obj.y) / 2;

                  newState.crashBubble = {
                    x: impactX,
                    y: impactY,
                    text: "KABOOM!",
                    duration: 55,
                    maxDuration: 55,
                  };

                  (newState as any).slowMotion = {
                    duration: 25,
                    maxDuration: 25,
                    intensity: 0.45,
                  };
                }

                return true;
              }

              // Meteors: ignore the big generic collision radius.
              // (A smaller, deadly hitbox is handled above.)
              if (obj.variant === "meteor") {
                return true;
              }

              // Railgun shots: ignore the big generic collision radius.
              // (A smaller, deadly hitbox is handled above.)
              if (obj.variant === "railShot") {
                return true;
              }

              // Laser Gates: ignore the big generic collision radius.
              // (A fair rectangle hitbox is handled above only while active.)
              if (obj.variant === "laserGate") {
                return true;
              }

              // Ghost clones: ignore the big generic collision radius.
              // (A smaller, fair hitbox is handled above once they finish "arming".)
              if (obj.variant === "ghostClone") {
                return true;
              }

              // Prism Splitter: creates a temporary ghost trail (works even in Test Mode)
              if (obj.variant === "prismSplitter") {
                // Extend/refresh the effect if you hit multiple prisms
                const maxDuration = 180; // ~3s
                if (!newState.ghostTrail) {
                  newState.ghostTrail = {
                    duration: maxDuration,
                    maxDuration,
                    nextSpawnIn: 0,
                  };
                } else {
                  newState.ghostTrail.duration = Math.min(
                    newState.ghostTrail.maxDuration,
                    newState.ghostTrail.duration + 90,
                  );
                  newState.ghostTrail.nextSpawnIn = Math.min(
                    newState.ghostTrail.nextSpawnIn,
                    4,
                  );
                }

                newState.particles.push(
                  ...createParticles(obj.x, obj.y, "#a78bfa", 10),
                  ...createParticles(obj.x, obj.y, "#38bdf8", 8),
                );

                (newState as any).lightningFlash = {
                  duration: 12,
                  maxDuration: 12,
                  intensity: 0.18,
                  color: "#a78bfa",
                };

                return false; // consume prism
              }

              if (collisionsDisabled) {
                return true;
              }

              // Singularity shards: touching the core does nothing (the orbiting shards handle danger)
              if (obj.variant === "singularityShards") {
                return true;
              }

              // Gravity Flip removed
              if (obj.variant === "gravityFlip") {
                return false;
              }
              // Special handling for ice patches: crack on first hit (with solid collision), break on second
              if (obj.variant === "icePatch") {
                const cooldown = (obj as any).hitCooldown || 0;
                if (cooldown <= 0) {
                  const prevHits = (obj as any).hitsRemaining ?? 2;
                  const nextHits = prevHits - 1;
                  (obj as any).hitsRemaining = nextHits;
                  (obj as any).hitCooldown = 20; // ~0.33s at 60fps

                  if (nextHits <= 0) {
                    // Break the ice: spawn shards and remove the patch
                    newState.particles.push(
                      ...createParticles(obj.x, obj.y, "#93c5fd", 15),
                    );
                    newState.particles.push(
                      ...createParticles(obj.x, obj.y, "#e0f2fe", 10),
                    );
                    newState.camera.shake = Math.max(newState.camera.shake, 6);
                    return false; // remove object
                  } else {
                    // First hit: crack it and keep it, but behave as a solid collision
                    (obj as any).state = "cracked";

                    // Positional separation away from the patch
                    const dxR = newState.rocket.x - obj.x;
                    const dyR = newState.rocket.y - obj.y;
                    const dist = Math.max(1, Math.sqrt(dxR * dxR + dyR * dyR));
                    const overlap = Math.max(0, 36 - dist); // keep outside our 35px radius
                    const nx = dxR / dist;
                    const ny = dyR / dist;
                    newState.rocket.x += nx * overlap;
                    newState.rocket.y += ny * overlap;

                    // Velocity response: small bounce + slowdown
                    newState.rocket.velocityX *= 0.5;
                    if (newState.rocket.velocityY < 0) {
                      // was going up: bounce downward gently
                      newState.rocket.velocityY =
                        Math.abs(newState.rocket.velocityY) * 0.4 + 1.0;
                    } else {
                      // already going down: add a little extra push
                      newState.rocket.velocityY += 1.0;
                    }

                    newState.particles.push(
                      ...createParticles(obj.x, obj.y, "#e0f2fe", 8),
                    );
                    newState.camera.shake = Math.max(newState.camera.shake, 4);
                  }
                }
                return true; // keep ice patch (unless broken above)
              }

              // Gravity wells (black holes) swallow the rocket and soft-reset instead of killing
              if (obj.variant === "blackHole") {
                if (!newState.swallow || !newState.swallow.active) {
                  newState.swallow = {
                    active: true,
                    x: obj.x,
                    y: obj.y,
                    duration: 30,
                    maxDuration: 30,
                  };
                  // Camera shake disabled for lightning strikes (keep flash only)
                }
                return true; // keep the well
              }

              // Default obstacle behavior
              if (obj.harm !== false) {
                if (newState.gameStatus === "playing") {
                  newState.gameStatus = "dying";
                  newState.deathTimer = 45;
                  newState.camera.shake = Math.max(newState.camera.shake, 20);
                  (newState as any).lightningFlash = {
                    duration: 18,
                    maxDuration: 18,
                    intensity: 0.5,
                    color: "#ffffff",
                  };
                  touchControlsRef.current = {
                    left: false,
                    right: false,
                    boost: false,
                  };
                  (newState as any).deathPose = {
                    x: newState.rocket.x,
                    y: newState.rocket.y,
                    rotation: newState.rocket.rotation,
                  };

                  const impactX = (newState.rocket.x + obj.x) / 2;
                  const impactY = (newState.rocket.y + obj.y) / 2;

                  const labels = ["BOOM!", "OOPS!", "BONK!"];
                  const label =
                    labels[Math.floor(Math.random() * labels.length)] ||
                    "BOOM!";
                  newState.crashBubble = {
                    x: impactX,
                    y: impactY,
                    text: label,
                    duration: 50,
                    maxDuration: 50,
                  };

                  (newState as any).slowMotion = {
                    duration: 25,
                    maxDuration: 25,
                    intensity: 0.45,
                  };
                }
                return true;
              }
            }
          }
          return true;
        });

        // Generate new objects as rocket goes higher
        if (
          newState.rocket.y <
          Math.min(...newState.objects.map((o) => o.y)) + 500
        ) {
          const newObjects = generateObjects(
            Math.min(...newState.objects.map((o) => o.y)),
            Math.min(...newState.objects.map((o) => o.y)) - 1000,
          );
          newState.objects.push(...newObjects);
        }

        // Generate new nebulas as rocket goes higher
        const highestNebula =
          newState.nebulas.length > 0
            ? Math.min(...newState.nebulas.map((n) => n.y))
            : newState.rocket.y;

        if (newState.rocket.y < highestNebula + 1000) {
          const newNebulas = generateNebulas(
            highestNebula,
            highestNebula - 2000,
          );
          newState.nebulas.push(...newNebulas);
        }

        // Remove nebulas that are too far below the camera to optimize performance
        newState.nebulas = newState.nebulas.filter(
          (nebula) => nebula.y > newState.camera.y - 2000,
        );

        // Fuel packs and auto-refill power-ups have been removed; fuel is now managed purely by your flying.

        // Mini-events & adaptive difficulty timers
        if (!newState.difficulty) {
          (newState as any).difficulty = {
            density: 1,
            speed: 1,
            unpredictability: 0.5,
            nextEventIn: 600,
          };
        }
        const difficulty = newState.difficulty!;
        difficulty.nextEventIn -= baseFrameMultiplier;
        if (difficulty.nextEventIn <= 0) {
          // Gravity Flip mini-event removed
          difficulty.nextEventIn = 700 + Math.random() * 500;
        }

        // Gravity inversion timer decay
        if (newState.gravity && newState.gravity.duration > 0) {
          (newState.gravity as any).duration -= baseFrameMultiplier;
          if ((newState.gravity as any).duration <= 0) {
            (newState.gravity as any).sign = 1;
            (newState.gravity as any).duration = 0;
          }
        }

        // Game over conditions
        if (newState.rocket.y > 650) {
          if (newState.gameStatus === "playing") {
            newState.gameStatus = "dying";
            newState.deathTimer = 45;
            newState.camera.shake = Math.max(newState.camera.shake, 16);
            (newState as any).lightningFlash = {
              duration: 14,
              maxDuration: 14,
              intensity: 0.4,
              color: "#ffffff",
            };
            touchControlsRef.current = {
              left: false,
              right: false,
              boost: false,
            };
            (newState as any).deathPose = {
              x: newState.rocket.x,
              y: newState.rocket.y,
              rotation: newState.rocket.rotation,
            };

            const impactX = newState.rocket.x;
            const impactY = newState.rocket.y;

            newState.crashBubble = {
              x: impactX,
              y: impactY,
              text: "YIKES!",
              duration: 50,
              maxDuration: 50,
            };

            (newState as any).slowMotion = {
              duration: 25,
              maxDuration: 25,
              intensity: 0.4,
            };
          }
        }

        return newState;
      });

      gameLoopRef.current = requestAnimationFrame(gameLoop);
    },
    [
      userData,
      generateObjects,
      createParticles,
      generateBackgroundStars,
      generateNebulas,
      testMode,
    ],
  );

  const handleGameAction = useCallback(
    (action: string) => {
      setGameState((prevState) => {
        const newState = { ...prevState };

        switch (action) {
          case "launch":
            if (newState.gameStatus === "ready") {
              // Reduced launch power for smoother gameplay
              newState.rocket.velocityY = -9; // Reduced launch power (half of previous)
              newState.gameStatus = "playing";
              // Disable launch screen shake for smoother experience
              newState.camera.shake = 0;

              // Initialize flight tracking
              newState.flightStartTime = Date.now();

              // Clear boost flag to prevent stuck boost after launch
              // This prevents the touch from carrying over into gameplay
              touchControlsRef.current.boost = false;
            }
            break;

          case "pause":
            if (newState.gameStatus === "playing") {
              // Pause immediately and clear any held controls so they can't "stick"
              newState.gameStatus = "paused";
              touchControlsRef.current = {
                left: false,
                right: false,
                boost: false,
              };
              touchStateRef.current = {
                isActive: false,
                startX: 0,
                startY: 0,
                currentX: 0,
                currentY: 0,
              };
              requireFreshInputRef.current = true;
            } else if (newState.gameStatus === "paused") {
              // Resume, but keep the world frozen until the player taps the canvas.
              newState.gameStatus = "playing";
              touchControlsRef.current = {
                left: false,
                right: false,
                boost: false,
              };
              touchStateRef.current = {
                isActive: false,
                startX: 0,
                startY: 0,
                currentX: 0,
                currentY: 0,
              };
              requireFreshInputRef.current = true;
            }
            break;
        }

        return newState;
      });
    },
    [userData],
  );

  const handleRestart = useCallback(() => {
    if (
      gameState.gameStatus === "gameOver" &&
      auth.status === "authenticated"
    ) {
      const flightDuration = (Date.now() - gameState.flightStartTime) / 1000;
      // Guard against any accidental double-trigger where the mutation could be
      // invoked without a payload.
      const payload = {
        altitude: Number.isFinite(gameState.maxAltitude)
          ? gameState.maxAltitude
          : 0,
        starsCollected: Number.isFinite(gameState.starsCollected)
          ? gameState.starsCollected
          : 0,
        survivalTime: Number.isFinite(flightDuration) ? flightDuration : 0,
      };

      updateGameResultMutation.mutate(payload);
    }

    // Clear all touch controls to prevent stuck inputs
    touchControlsRef.current = { left: false, right: false, boost: false };
    touchStateRef.current = {
      isActive: false,
      startX: 0,
      startY: 0,
      currentX: 0,
      currentY: 0,
    };

    // Stop the game loop before reinitializing to prevent velocity carryover
    if (gameLoopRef.current) {
      cancelAnimationFrame(gameLoopRef.current);
      gameLoopRef.current = undefined;
    }

    initializeGame();
  }, [gameState, auth.status, updateGameResultMutation, initializeGame]);

  // Game loop
  useEffect(() => {
    if (
      gameState.gameStatus === "playing" ||
      gameState.gameStatus === "dying"
    ) {
      // Reset frame time when starting
      lastFrameTimeRef.current = 0;
      gameLoopRef.current = requestAnimationFrame(gameLoop);
    } else {
      if (gameLoopRef.current) {
        cancelAnimationFrame(gameLoopRef.current);
        gameLoopRef.current = undefined;
      }
    }

    return () => {
      if (gameLoopRef.current) {
        cancelAnimationFrame(gameLoopRef.current);
        gameLoopRef.current = undefined;
      }
    };
  }, [gameState.gameStatus, gameLoop]);

  // Initialize game once we know the user is authenticated.
  // Stats may load slightly later; we can render them when available.
  const hasInitialized = useRef(false);
  useEffect(() => {
    if (auth.status === "authenticated" && !hasInitialized.current) {
      initializeGame();
      hasInitialized.current = true;
    }
  }, [auth.status, initializeGame]);

  // If storage is blocked, show a storage-specific message.
  if (storageOk === false) {
    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-card border border-border rounded-xl p-6 text-center">
          <div className="mb-3 flex items-center justify-center">
            <svg
              width="32"
              height="32"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              className="text-destructive"
            >
              <path
                d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <h2 className="text-lg font-semibold mb-2">
            We couldn’t access browser storage
          </h2>
          <p className="text-sm text-muted-foreground mb-3">
            This can happen in private windows, strict tracking protection, or
            embeds. Enable storage/cookies for this site or open in a normal
            window, then try again.
          </p>
          <div className="flex gap-2 justify-center">
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 rounded-md bg-primary text-primary-foreground"
            >
              Reload
            </button>
            <button
              onClick={() => {
                try {
                  const ls = window.localStorage;
                  const k = `__sl_retry_${Date.now()}`;
                  ls.setItem(k, "1");
                  ls.removeItem(k);
                  setStorageOk(true);
                } catch {
                  setStorageOk(false);
                }
              }}
              className="px-4 py-2 rounded-md border border-border"
            >
              Try again
            </button>
          </div>
        </div>
      </div>
    );
  }

  // If something unexpected happened at runtime, show an error-specific message.
  if (runtimeError) {
    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-card border border-border rounded-xl p-6 text-center">
          <div className="mb-3 flex items-center justify-center">
            <svg
              width="32"
              height="32"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              className="text-destructive"
            >
              <path
                d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <h2 className="text-lg font-semibold mb-2">Something went wrong</h2>
          <p className="text-sm text-muted-foreground mb-3">
            Try reloading the page. If it keeps happening, it may be a temporary
            network or asset-loading issue.
          </p>
          <p className="text-xs text-muted-foreground mb-4 break-words">
            Details: {runtimeError}
          </p>
          <div className="flex gap-2 justify-center">
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 rounded-md bg-primary text-primary-foreground"
            >
              Reload
            </button>
            <button
              onClick={() => setRuntimeError(null)}
              className="px-4 py-2 rounded-md border border-border"
            >
              Dismiss
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (auth.status === "loading") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <Rocket className="h-12 w-12 mx-auto mb-4 text-primary animate-pulse" />
          <p>Loading Stellar Launch...</p>
        </div>
      </div>
    );
  }

  if (auth.status === "unauthenticated") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="max-w-md w-full mx-4">
          <CardHeader className="text-center">
            <Rocket className="h-12 w-12 mx-auto mb-4 text-primary" />
            <CardTitle>Stellar Launch</CardTitle>
          </CardHeader>
          <CardContent className="text-center">
            <p className="mb-4 text-muted-foreground">
              Launch your rocket to the stars in this endless space adventure!
            </p>
            <Button onClick={() => auth.signIn()} className="w-full">
              Sign In to Play
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const isAdmin = (myRole as any)?.role === "ADMIN";

  if (path === "/admin_panel") {
    return <AdminPanelPage isAdmin={!!isAdmin} onBack={() => navigate("/")} />;
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Game Area */}
      <div className="h-screen flex items-center justify-center">
        <div
          className="relative h-full w-full max-w-[400px]"
          onPointerDownCapture={(e) => {
            secretDownRef.current = {
              x: e.clientX,
              y: e.clientY,
              ts: Date.now(),
            };
          }}
          onPointerUpCapture={(e) => {
            const down = secretDownRef.current;
            secretDownRef.current = null;
            if (!down) return;

            const dt = Date.now() - down.ts;
            const dx = e.clientX - down.x;
            const dy = e.clientY - down.y;
            const dist = Math.hypot(dx, dy);

            // Only count quick, mostly-stationary taps (not holds/drags).
            if (dt > 320 || dist > 12) return;

            registerSecretTap(e.clientX);
          }}
          onPointerCancelCapture={() => {
            secretDownRef.current = null;
          }}
        >
          <GameCanvas
            gameState={gameState}
            onGameAction={handleGameAction}
            touchControlsRef={touchControlsRef}
            touchStateRef={touchStateRef}
            requireFreshInputRef={requireFreshInputRef}
            userData={userData}
          />

          <MobileControls
            gameState={gameState}
            onGameAction={handleGameAction}
          />

          <AltitudeIndicator gameState={gameState} />

          {/* Admin panel is URL-only; open via /?Admin_Panel */}
          {false && (
            <AdminPanel
              isAdmin={(myRole as any)?.role === "ADMIN"}
              onOpen={() => navigate("/admin_panel")}
            />
          )}

          {/* Ready screen hero: Personal Best badge, centered rocket, and Start Game button */}
          {gameState.gameStatus === "ready" && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="flex flex-col items-center gap-6 text-center pointer-events-auto">
                {/* Personal Best badge above rocket */}
                <div className="animate-float-up">
                  <div
                    className="relative inline-flex items-center gap-3 px-6 py-4 rounded-[22px] border-[3px] border-[#CDAAFF] shadow-[0_0_37px_#6D60BA]"
                    style={{
                      background:
                        "radial-gradient(50% 50% at 50% 50%, rgba(33, 29, 83, 0.2) 61.06%, rgba(121, 81, 176, 0.2) 100%), #3F3C74",
                    }}
                  >
                    <div className="relative">
                      <Rocket className="h-8 w-8 text-[#B589DB] relative z-10" />
                    </div>
                    <div className="relative z-10 text-left">
                      <div
                        className="text-sm uppercase tracking-wide font-medium"
                        style={{ color: "#B589DB" }}
                      >
                        PERSONAL BEST
                      </div>
                      <div
                        className="text-3xl font-black"
                        style={{ color: "#F0EFF4" }}
                      >
                        {(userData as any)?.maxAltitude || 0}
                        <span
                          className="text-xl ml-1"
                          style={{ color: "#F0EFF4" }}
                        >
                          m
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Invisible spacer that reserves vertical space for the rocket so the button never overlaps it */}
                <div aria-hidden="true" className="w-80 h-80" />

                {/* Start Game button below rocket */}
                <button
                  className="px-10 py-3 text-lg font-bold tracking-wide rounded-[46px] border-[6px] border-[#A3BCE3] text-[#1B365E] shadow-[0_0_52px_rgba(54,128,255,0.53)] active:scale-95 transition-transform"
                  style={{
                    background:
                      "radial-gradient(50% 50% at 50% 50%, #EDF8FD 28.85%, #BAD3FD 100%), #F2FEFF",
                  }}
                  onClick={() => handleGameAction("launch")}
                >
                  START GAME
                </button>
              </div>
            </div>
          )}

          {/* Action Buttons removed per mobile-only core gameplay */}
          {false && (
            <motion.div
              className="absolute bottom-6 left-0 right-0 flex justify-center pointer-events-auto px-4"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5, duration: 0.6, ease: "backOut" }}
            >
              {/* Grouped Buttons with Staggered Animation - Responsive container */}
              <div className="flex gap-4 sm:gap-6 items-center justify-center max-w-full">
                {/* Leaderboard with Staggered Animation */}
                <motion.div
                  initial={{ scale: 0, opacity: 0, y: 20 }}
                  animate={{ scale: 1, opacity: 1, y: 0 }}
                  transition={{
                    delay: 0.7,
                    duration: 0.5,
                    type: "spring",
                    stiffness: 300,
                    damping: 20,
                  }}
                  whileHover={{
                    scale: 1.05,
                    transition: { duration: 0.2 },
                  }}
                  whileTap={{ scale: 0.95 }}
                ></motion.div>

                {/* Shop with Staggered Animation */}
              </div>
            </motion.div>
          )}

          {/* Game Status Overlays with Smooth Transitions */}
          <AnimatePresence>
            {gameState.gameStatus === "paused" && (
              <motion.div
                className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center rounded-lg"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3, ease: "easeInOut" }}
              >
                <motion.div
                  initial={{ scale: 0.8, opacity: 0, y: 20 }}
                  animate={{ scale: 1, opacity: 1, y: 0 }}
                  exit={{ scale: 0.8, opacity: 0, y: -20 }}
                  transition={{ duration: 0.3, ease: "backOut" }}
                >
                  <div
                    className="px-6 py-5 rounded-3xl border-[3px] border-[#CDAAFF] shadow-[0_0_32px_rgba(205,170,255,0.7)] text-center"
                    style={{
                      background:
                        "radial-gradient(50% 50% at 50% 50%, rgba(33, 29, 83, 0.9) 0%, rgba(15,23,42,0.98) 100%)",
                    }}
                  >
                    <div className="mb-3 flex items-center justify-center gap-2">
                      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-black/30 border border-white/15">
                        <Pause className="h-5 w-5 text-[#F0EFF4]" />
                      </div>
                      <div className="text-left">
                        <div className="text-xs uppercase tracking-wide font-medium text-[#B589DB]">
                          Game paused
                        </div>
                        <div className="text-[11px] text-[#E3E5E2]/85">
                          Take a breather, then jump back in
                        </div>
                      </div>
                    </div>
                    <button
                      className="mt-1 w-full px-4 py-2.5 text-sm font-bold tracking-wide rounded-[999px] border-[3px] border-[#A3BCE3] text-[#1B365E] shadow-[0_0_26px_rgba(54,128,255,0.6)] active:scale-95 transition-transform"
                      style={{
                        background:
                          "radial-gradient(50% 50% at 50% 50%, #EDF8FD 28.85%, #BAD3FD 100%), #F2FEFF",
                      }}
                      onTouchEnd={(e) => {
                        e.preventDefault();
                        ignoreNextResumeClickRef.current = true;
                        setTimeout(() => {
                          ignoreNextResumeClickRef.current = false;
                        }, 600);
                        handleGameAction("pause");
                      }}
                      onClick={(e) => {
                        if (ignoreNextResumeClickRef.current) return;
                        e.preventDefault();
                        handleGameAction("pause");
                      }}
                    >
                      <span>RESUME GAME</span>
                    </button>
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <GameOverDialog gameState={gameState} onRestart={handleRestart} />
    </div>
  );
}
