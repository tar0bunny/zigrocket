import { useEffect, useRef, useState } from "react";

const W = 480;
const H = 640;
const ROCKET_W = 56;
const ROCKET_H = 64;

// ─────────────────────────────────────────────────────────────────────────────
// SPRITE CONFIG
// All paths are relative to /public — drop your PNGs in public/assets/
// ─────────────────────────────────────────────────────────────────────────────
const ROCKET_SPRITE = { src: "/assets/rocketship.png", w: ROCKET_W, h: ROCKET_H };

const OBSTACLE_SPRITES = [
  { key: "alien",         src: "/assets/alien1.png",         w: 52, h: 44 },
  { key: "asteroid1",     src: "/assets/asteroid1.png",      w: 46, h: 40 },
  { key: "asteroid2",     src: "/assets/asteroid2.png",      w: 50, h: 44 },
  { key: "asteroid3",     src: "/assets/asteroid3.png",      w: 44, h: 38 },
  { key: "asteroid4",     src: "/assets/asteroid4.png",      w: 46, h: 40 },
  { key: "barrel1",       src: "/assets/barrel1.png",        w: 36, h: 44 },
  { key: "barrel2",       src: "/assets/barrel2.png",        w: 36, h: 44 },
  { key: "cloud",         src: "/assets/cloud1.png",         w: 56, h: 44 },
  { key: "comet1",        src: "/assets/comet1.png",         w: 52, h: 44 },
  { key: "comet2",        src: "/assets/comet2.png",         w: 52, h: 44 },
  { key: "crystal1",      src: "/assets/crystal1.png",       w: 30, h: 44 },
  { key: "crystal2",      src: "/assets/crystal2.png",       w: 34, h: 50 },
  { key: "crystal3",      src: "/assets/crystal3.png",       w: 30, h: 44 },
  { key: "debris1",       src: "/assets/debris1.png",        w: 52, h: 36 },
  { key: "debris2",       src: "/assets/debris2.png",        w: 52, h: 40 },
  { key: "debris3",       src: "/assets/debris3.png",        w: 44, h: 34 },
  { key: "debris4",       src: "/assets/debris4.png",        w: 48, h: 36 },
  { key: "shootingstar1", src: "/assets/shootingstar1.png",  w: 60, h: 32 },
  { key: "shootingstar2", src: "/assets/shootingstar2.png",  w: 60, h: 32 },
];

// ─────────────────────────────────────────────────────────────────────────────
// Preload all images, return a map of key → HTMLImageElement
// ─────────────────────────────────────────────────────────────────────────────
function preloadImages(onDone) {
  const result = {};
  const all = [
    { key: "rocket", src: ROCKET_SPRITE.src },
    ...OBSTACLE_SPRITES.map(o => ({ key: o.key, src: o.src })),
  ];
  let remaining = all.length;
  for (const { key, src } of all) {
    const img = new Image();
    img.onload  = () => { result[key] = img; if (--remaining === 0) onDone(result); };
    img.onerror = () => {                     if (--remaining === 0) onDone(result); };
    img.src = src;
  }
}

function makeStars() {
  return Array.from({ length: 80 }, (_, i) => ({
    id: i,
    x: Math.random() * W,
    y: Math.random() * H,
    size: Math.random() * 2.2 + 0.4,
    speed: Math.random() * 0.7 + 0.3,
    opacity: Math.random() * 0.6 + 0.3,
    twinkleOffset: Math.random() * Math.PI * 2,
  }));
}

// ─────────────────────────────────────────────────────────────────────────────
export default function ZigRocket() {
  const canvasRef = useRef(null);
  const [screen,       setScreen]       = useState("loading");
  const [displayScore, setDisplayScore] = useState(0);
  const [displayLevel, setDisplayLevel] = useState(1);
  const [displayHigh,  setDisplayHigh]  = useState(0);
  const [showLevelUp,  setShowLevelUp]  = useState(false);
  const [levelUpMsg,   setLevelUpMsg]   = useState("");

  const G       = useRef(null);   // all mutable game state
  const rafRef  = useRef(null);
  const imgs    = useRef({});     // loaded Image objects


  // ── Web Audio sound engine ────────────────────────────────────────────────
  const audioCtx = useRef(null);

  function getAudio() {
    if (!audioCtx.current) {
      audioCtx.current = new (window.AudioContext || window.webkitAudioContext)();
    }
    // resume if browser suspended it
    if (audioCtx.current.state === "suspended") audioCtx.current.resume();
    return audioCtx.current;
  }

  // dodge: soft rising blip
  function soundDodge() {
    try {
      const ac  = getAudio();
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.connect(gain); gain.connect(ac.destination);
      osc.type = "sine";
      const now = ac.currentTime;
      osc.frequency.setValueAtTime(520, now);
      osc.frequency.linearRampToValueAtTime(780, now + 0.08);
      gain.gain.setValueAtTime(0.18, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
      osc.start(now); osc.stop(now + 0.12);
    } catch {}
  }

  // level up: cheerful two-tone chime
  function soundLevelUp() {
    try {
      const ac  = getAudio();
      const now = ac.currentTime;
      for (const [freq, t, dur] of [
        [523, 0,    0.12],
        [659, 0.1,  0.12],
        [784, 0.2,  0.20],
        [1047,0.32, 0.28],
      ]) {
        const osc  = ac.createOscillator();
        const gain = ac.createGain();
        osc.connect(gain); gain.connect(ac.destination);
        osc.type = "triangle";
        osc.frequency.setValueAtTime(freq, now + t);
        gain.gain.setValueAtTime(0.22, now + t);
        gain.gain.exponentialRampToValueAtTime(0.001, now + t + dur);
        osc.start(now + t); osc.stop(now + t + dur);
      }
    } catch {}
  }

  // explosion: low rumble + noise burst
  function soundExplosion() {
    try {
      const ac  = getAudio();
      const now = ac.currentTime;

      // low thud
      const osc  = ac.createOscillator();
      const gain = ac.createGain();
      osc.connect(gain); gain.connect(ac.destination);
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(120, now);
      osc.frequency.exponentialRampToValueAtTime(30, now + 0.4);
      gain.gain.setValueAtTime(0.5, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
      osc.start(now); osc.stop(now + 0.4);

      // noise crackle
      const bufSize  = ac.sampleRate * 0.3;
      const buffer   = ac.createBuffer(1, bufSize, ac.sampleRate);
      const data     = buffer.getChannelData(0);
      for (let i = 0; i < bufSize; i++) data[i] = (Math.random() * 2 - 1) * 0.6;
      const source   = ac.createBufferSource();
      source.buffer  = buffer;
      const nGain    = ac.createGain();
      source.connect(nGain); nGain.connect(ac.destination);
      nGain.gain.setValueAtTime(0.4, now);
      nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
      source.start(now); source.stop(now + 0.3);
    } catch {}
  }

  // launch: short whoosh
  function soundLaunch() {
    try {
      const ac  = getAudio();
      const now = ac.currentTime;
      const osc  = ac.createOscillator();
      const gain = ac.createGain();
      osc.connect(gain); gain.connect(ac.destination);
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(200, now);
      osc.frequency.linearRampToValueAtTime(600, now + 0.15);
      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
      osc.start(now); osc.stop(now + 0.2);
    } catch {}
  }

  // ── preload on mount ──────────────────────────────────────────────────────
  useEffect(() => {
    preloadImages(loaded => {
      imgs.current = loaded;
      G.current = { stars: makeStars(), highScore: parseInt(localStorage.getItem("zigrocket_hs") ?? "0", 10) };
      setDisplayHigh(parseInt(localStorage.getItem("zigrocket_hs") ?? "0", 10));
      setScreen("menu");
    });
  }, []);

  // ── game init ─────────────────────────────────────────────────────────────
  function initGame() {
    G.current = {
      rocket: { x: W / 2 - ROCKET_W / 2, y: H - 140 },
      obstacles: [],
      stars: makeStars(),
      keys: {},
      touch: null,
      score: 0,
      level: 1,
      rocketSpeed: 5,
      spawnTimer: 0,
      obstacleId: 0,
      highScore: G.current?.highScore ?? 0,
      running: true,
      exploding: false,
      explosionFrame: 0,
      explosionX: 0,
      explosionY: 0,
    };
  }

  // ── background helpers ────────────────────────────────────────────────────
  function drawBackground(ctx) {
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0,   "#4a2d9c");
    bg.addColorStop(0.4, "#5a34a8");
    bg.addColorStop(0.75,"#5c2a8a");
    bg.addColorStop(1,   "#4e2278");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    const t = Date.now() / 8000;
    for (const [nx, ny, nr, nc] of [
      [60,  100, 130, "rgba(196,181,253,0.30)"],  // purple top-left
      [400, 200, 110, "rgba(147,197,253,0.24)"],   // blue top-right
      [240, 380, 140, "rgba(216,180,254,0.26)"],  // purple mid
      [80,  520, 100, "rgba(249,168,212,0.24)"],  // pink bottom-left
      [380, 560,  90, "rgba(165,180,252,0.22)"],  // indigo bottom-right
    ]) {
      const gr = ctx.createRadialGradient(
        nx + Math.sin(t + nx) * 12, ny + Math.cos(t + ny * 0.01) * 10, 0, nx, ny, nr
      );
      gr.addColorStop(0, nc);
      gr.addColorStop(1, "transparent");
      ctx.fillStyle = gr;
      ctx.fillRect(0, 0, W, H);
    }
  }

  function drawStars(ctx, stars) {
    const now = Date.now() / 1000;
    for (const s of stars) {
      const tw = 0.4 + 0.6 * Math.sin(now * 2.5 + s.twinkleOffset);
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255,255,255,${(s.opacity * tw).toFixed(2)})`;
      ctx.fill();
    }
  }

  // ── main game loop ────────────────────────────────────────────────────────
  function startLoop() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");

    function loop() {
      const g = G.current;
      if (!g) return;

      if (g.running && !g.exploding) {
        // keyboard
        const spd = g.rocketSpeed;
        if (g.keys["ArrowLeft"]  || g.keys["a"]) g.rocket.x -= spd;
        if (g.keys["ArrowRight"] || g.keys["d"]) g.rocket.x += spd;
        if (g.keys["ArrowUp"]    || g.keys["w"]) g.rocket.y -= spd;
        if (g.keys["ArrowDown"]  || g.keys["s"]) g.rocket.y += spd;

        // touch drag — rocket follows finger delta
        if (g.touch) {
          g.rocket.x = g.touch.rocketStartX + (g.touch.currentX - g.touch.startX);
          g.rocket.y = g.touch.rocketStartY + (g.touch.currentY - g.touch.startY);
        }

        g.rocket.x = Math.max(0, Math.min(W - ROCKET_W, g.rocket.x));
        g.rocket.y = Math.max(0, Math.min(H - ROCKET_H, g.rocket.y));

        // scroll stars
        for (const s of g.stars) {
          s.y += s.speed;
          if (s.y > H) { s.y = -4; s.x = Math.random() * W; }
        }

        // spawn obstacles
        g.spawnTimer++;
        const spawnRate = Math.max(25, 55 - g.level * 3);
        if (g.spawnTimer >= spawnRate) {
          g.spawnTimer = 0;
          const sp = OBSTACLE_SPRITES[Math.floor(Math.random() * OBSTACLE_SPRITES.length)];
          g.obstacles.push({
            id:    g.obstacleId++,
            key:   sp.key,
            w:     sp.w,
            h:     sp.h,
            x:     Math.random() * (W - sp.w - 20) + 10,
            y:     -sp.h - 10,
            speed: 2 + Math.random() * 2 + g.level * 0.3,
            rot:   0,
            // comets/shootingstars spin slowly; asteroids spin faster
            rotSpeed: sp.key.startsWith("asteroid")
              ? (Math.random() - 0.5) * 0.06
              : (Math.random() - 0.5) * 0.02,
          });
        }

        // move + collide
        const survived = [];
        let scored = 0;
        for (const o of g.obstacles) {
          o.y   += o.speed;
          o.rot += o.rotSpeed;
          if (o.y > H + o.h) { scored++; soundDodge(); continue; }

          const rx = g.rocket.x + ROCKET_W / 2;
          const ry = g.rocket.y + ROCKET_H / 2;
          const ox = o.x + o.w / 2;
          const oy = o.y + o.h / 2;
          if (Math.hypot(rx - ox, ry - oy) < ROCKET_W * 0.38 + o.w * 0.35) {
            g.exploding      = true;
            soundExplosion();
            g.explosionFrame = 0;
            g.explosionX     = g.rocket.x;
            g.explosionY     = g.rocket.y;
            continue;
          }
          survived.push(o);
        }
        g.obstacles = survived;

        // score + level up
        if (scored > 0) {
          g.score += scored;
          setDisplayScore(g.score);
          const newLevel = Math.floor(g.score / 10) + 1;
          if (newLevel > g.level) {
            g.level       = newLevel;
            g.rocketSpeed = 5 + (newLevel - 1);
            setDisplayLevel(newLevel);
            setLevelUpMsg(`⭐ LEVEL ${newLevel}! ⭐`);
            setShowLevelUp(true); soundLevelUp();
            setTimeout(() => setShowLevelUp(false), 1500);
          }
        }
      }

      // explosion tick
      if (g.exploding) {
        g.explosionFrame++;
        if (g.explosionFrame > 16) {
          g.running   = false;
          g.exploding = false;
          if (g.score > g.highScore) { g.highScore = g.score; localStorage.setItem("zigrocket_hs", g.highScore); }
          setDisplayHigh(g.highScore);
          setScreen("gameover");
          return;
        }
      }

      // ── draw ──────────────────────────────────────────────────────────────
      drawBackground(ctx);
      drawStars(ctx, g.stars);

      // obstacles
      for (const o of g.obstacles) {
        const img = imgs.current[o.key];
        ctx.save();
        ctx.translate(o.x + o.w / 2, o.y + o.h / 2);
        ctx.rotate(o.rot);
        if (img) {
          ctx.drawImage(img, -o.w / 2, -o.h / 2, o.w, o.h);
        } else {
          // fallback: coloured rectangle if image failed to load
          ctx.fillStyle = "rgba(255,100,100,0.6)";
          ctx.fillRect(-o.w / 2, -o.h / 2, o.w, o.h);
        }
        ctx.restore();
      }

      // rocket
      if (!g.exploding) {
        const rImg = imgs.current["rocket"];
        ctx.save();
        ctx.translate(g.rocket.x + ROCKET_W / 2, g.rocket.y + ROCKET_H / 2);
        if (rImg) {
          ctx.drawImage(rImg, -ROCKET_W / 2, -ROCKET_H / 2, ROCKET_W, ROCKET_H);
        } else {
          // emoji fallback
          ctx.font = "40px serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.rotate(-Math.PI / 2);
          ctx.fillText("🚀", 0, 0);
        }
        ctx.restore();
      }

      // explosion
      if (g.exploding) {
        const ef    = g.explosionFrame;
        const alpha = Math.max(0, 1 - ef * 0.06);
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(g.explosionX + ROCKET_W / 2, g.explosionY + ROCKET_H / 2);
        ctx.scale(0.4 + ef * 0.1, 0.4 + ef * 0.1);
        // rays
        for (let i = 0; i < 10; i++) {
          const angle = (i / 10) * Math.PI * 2;
          const len   = 24 + (i % 3) * 12;
          ctx.beginPath();
          ctx.moveTo(Math.cos(angle) * 7,   Math.sin(angle) * 7);
          ctx.lineTo(Math.cos(angle) * len,  Math.sin(angle) * len);
          ctx.strokeStyle = ["#ff9f0a","#ff3b30","#ffe033","#ff6eb4","#a78bfa"][i % 5];
          ctx.lineWidth   = 3;
          ctx.lineCap     = "round";
          ctx.stroke();
        }
        // glow
        const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, 22 + ef * 2);
        glow.addColorStop(0, "rgba(255,224,51,0.9)");
        glow.addColorStop(1, "rgba(255,59,48,0)");
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(0, 0, 22 + ef * 2, 0, Math.PI * 2);
        ctx.fill();
        // emoji centre
        ctx.font = "30px serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.globalAlpha = alpha;
        ctx.fillText("💥", 0, 0);
        ctx.restore();
      }

      rafRef.current = requestAnimationFrame(loop);
    }

    rafRef.current = requestAnimationFrame(loop);
  }

  // ── idle background loop (menu / gameover) ────────────────────────────────
  useEffect(() => {
    if (screen === "playing" || screen === "loading") return;
    if (!G.current) G.current = { stars: makeStars(), highScore: parseInt(localStorage.getItem("zigrocket_hs") ?? "0", 10) };
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");

    function bgLoop() {
      for (const s of G.current.stars) {
        s.y += s.speed * 0.4;
        if (s.y > H) { s.y = -4; s.x = Math.random() * W; }
      }
      drawBackground(ctx);
      drawStars(ctx, G.current.stars);
      rafRef.current = requestAnimationFrame(bgLoop);
    }
    rafRef.current = requestAnimationFrame(bgLoop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [screen]);

  // ── keyboard listeners ────────────────────────────────────────────────────
  useEffect(() => {
    const down = e => {
      if (G.current) G.current.keys[e.key] = true;
      if (["ArrowUp","ArrowDown","ArrowLeft","ArrowRight"].includes(e.key))
        e.preventDefault();
    };
    const up = e => { if (G.current) G.current.keys[e.key] = false; };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup",   up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup",   up);
    };
  }, []);

  // ── touch listeners ───────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    function pos(touch) {
      const rect   = canvas.getBoundingClientRect();
      const scaleX = W / rect.width;
      const scaleY = H / rect.height;
      return {
        x: (touch.clientX - rect.left) * scaleX,
        y: (touch.clientY - rect.top)  * scaleY,
      };
    }

    function onStart(e) {
      e.preventDefault();
      const g = G.current;
      if (!g?.running) return;
      const p = pos(e.touches[0]);
      g.touch = {
        id:           e.touches[0].identifier,
        startX:       p.x,
        startY:       p.y,
        currentX:     p.x,
        currentY:     p.y,
        rocketStartX: g.rocket.x,
        rocketStartY: g.rocket.y,
      };
    }

    function onMove(e) {
      e.preventDefault();
      const g = G.current;
      if (!g?.touch) return;
      for (const t of e.changedTouches) {
        if (t.identifier === g.touch.id) {
          const p = pos(t);
          g.touch.currentX = p.x;
          g.touch.currentY = p.y;
        }
      }
    }

    function onEnd(e) {
      e.preventDefault();
      const g = G.current;
      if (!g) return;
      for (const t of e.changedTouches) {
        if (g.touch && t.identifier === g.touch.id) g.touch = null;
      }
    }

    canvas.addEventListener("touchstart",  onStart, { passive: false });
    canvas.addEventListener("touchmove",   onMove,  { passive: false });
    canvas.addEventListener("touchend",    onEnd,   { passive: false });
    canvas.addEventListener("touchcancel", onEnd,   { passive: false });
    return () => {
      canvas.removeEventListener("touchstart",  onStart);
      canvas.removeEventListener("touchmove",   onMove);
      canvas.removeEventListener("touchend",    onEnd);
      canvas.removeEventListener("touchcancel", onEnd);
    };
  }, []);

  // ── start / restart ───────────────────────────────────────────────────────
  function handleStart() {
    cancelAnimationFrame(rafRef.current);
    initGame();
    setDisplayScore(0);
    setDisplayLevel(1);
    setShowLevelUp(false);
    setScreen("playing");
    soundLaunch(); setTimeout(startLoop, 30);
  }

  // ── render ────────────────────────────────────────────────────────────────
  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center",
      justifyContent: "center", minHeight: "100vh", background: "#4a2d9c",
      fontFamily: "'Trebuchet MS', cursive",
      overscrollBehavior: "none", touchAction: "none",
    }}>
      <div style={{
        marginBottom: 10, fontSize: 28, fontWeight: 900, letterSpacing: 3,
        background: "linear-gradient(135deg,#ff6eb4,#a78bfa,#60a5fa)",
        WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
        filter: "drop-shadow(0 0 18px #a78bfa88)",
      }}>
        🚀 ZIGROCKET 🚀
      </div>

      <div style={{
        position: "relative",
        width: "min(480px, 100vw)",
        aspectRatio: `${W} / ${H}`,
      }}>
        <canvas ref={canvasRef} width={W} height={H} style={{
          width: "100%", height: "100%", borderRadius: 20, display: "block",
          boxShadow: "0 0 60px #7c3aed55, 0 0 120px #7c3aed22",
          touchAction: "none",
        }} />

        {/* HUD */}
        {screen === "playing" && (
          <div style={{
            position: "absolute", top: "2%", left: "3%", right: "3%",
            display: "flex", justifyContent: "space-between", alignItems: "flex-start",
            pointerEvents: "none",
          }}>
            <Pill>⭐ {displayScore}</Pill>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
              <Pill>LVL {displayLevel}</Pill>
              <div style={{
                background: "rgba(0,0,0,0.45)",
                backdropFilter: "blur(8px)",
                border: "1px solid rgba(253,230,138,0.25)",
                borderRadius: 20,
                padding: "4px 12px",
                fontSize: 11,
                fontWeight: 700,
                color: "#fde68a",
                opacity: 0.75,
                letterSpacing: 0.5,
                whiteSpace: "nowrap",
              }}>
                🏆 {displayHigh}
              </div>
            </div>
          </div>
        )}



        {/* Level up banner */}
        {showLevelUp && (
          <div style={{
            position: "absolute", top: "18%", left: "50%",
            transform: "translateX(-50%)",
            background: "linear-gradient(135deg,#fde68a,#fca5a5,#c4b5fd)",
            padding: "9px 26px", borderRadius: 50,
            fontSize: 20, fontWeight: 900, color: "#1a1a2e",
            boxShadow: "0 0 28px #fde68a88", whiteSpace: "nowrap",
            animation: "popIn 0.3s cubic-bezier(0.34,1.56,0.64,1)",
            pointerEvents: "none",
          }}>
            {levelUpMsg}
          </div>
        )}

        {/* Menu */}
        {screen === "menu" && (
          <Overlay>
            <img
              src="/assets/rocketship.png"
              alt="rocket"
              style={{
                width: 110, height: 110, objectFit: "contain", marginBottom: 18,
                filter: "drop-shadow(0 0 18px #ff6eb4aa) drop-shadow(0 0 36px #a78bfa66)",
                animation: "rocketBob 2s ease-in-out infinite",
              }}
            />
            <div style={{ fontSize: 26, fontWeight: 900, color: "#fde68a", marginBottom: 6 }}>
              ZIGROCKET
            </div>
            <div style={{ fontSize: 12, color: "#c4b5fd", marginBottom: 28, opacity: 0.85 }}>
              dodge obstacles · survive space
            </div>
            <Btn onClick={handleStart}>🚀 LAUNCH!</Btn>
          </Overlay>
        )}

        {/* Game over */}
        {screen === "gameover" && (
          <Overlay>
            <div style={{ fontSize: 48, marginBottom: 4 }}>💥</div>
            <div style={{ fontSize: 22, fontWeight: 900, color: "#fca5a5", marginBottom: 6 }}>
              YOU GOT HIT!
            </div>
            <div style={{
              background: "rgba(255,255,255,0.06)", borderRadius: 16,
              padding: "14px 36px", marginBottom: 20, textAlign: "center",
            }}>
              <div style={{ fontSize: 12, color: "#c4b5fd", marginBottom: 3 }}>SCORE</div>
              <div style={{ fontSize: 44, fontWeight: 900, color: "#fde68a" }}>{displayScore}</div>
              {displayScore > 0 && displayScore >= displayHigh
                ? <div style={{ fontSize: 12, color: "#6ee7b7", marginTop: 4 }}>✨ new high score!</div>
                : <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>best: {displayHigh}</div>
              }
            </div>
            <Btn onClick={handleStart}>🔄 TRY AGAIN</Btn>
          </Overlay>
        )}

        {/* Loading */}
        {screen === "loading" && (
          <Overlay>
            <div style={{ fontSize: 28, color: "#c4b5fd" }}>🚀 loading…</div>
          </Overlay>
        )}
      </div>

      <style>{`
        @keyframes popIn {
          from { transform: translateX(-50%) scale(0.3); opacity: 0; }
          to   { transform: translateX(-50%) scale(1);   opacity: 1; }
        }
        @keyframes rocketBob {
          0%, 100% { transform: translateY(0px);  }
          50%       { transform: translateY(-12px); }
        }
      `}</style>
    </div>
  );
}

function Pill({ children }) {
  return (
    <div style={{
      background: "rgba(0,0,0,0.55)", backdropFilter: "blur(8px)",
      border: "1px solid rgba(167,139,250,0.3)", borderRadius: 20,
      padding: "5px 14px", fontSize: 14, fontWeight: 800, color: "#fde68a",
    }}>
      {children}
    </div>
  );
}

function Overlay({ children }) {
  return (
    <div style={{
      position: "absolute", inset: 0, display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      background: "rgba(5,1,15,0.82)", backdropFilter: "blur(6px)", borderRadius: 20,
    }}>
      {children}
    </div>
  );
}

function Btn({ onClick, children }) {
  return (
    <button onClick={onClick} style={{
      background: "linear-gradient(135deg,#7c3aed,#a855f7,#ec4899)",
      border: "none", borderRadius: 50, padding: "12px 34px",
      fontSize: 15, fontWeight: 900, color: "white", cursor: "pointer",
      letterSpacing: 1.5, boxShadow: "0 0 28px #7c3aed77",
      transition: "transform 0.12s",
    }}
      onMouseEnter={e => e.currentTarget.style.transform = "scale(1.06)"}
      onMouseLeave={e => e.currentTarget.style.transform = "scale(1)"}
    >
      {children}
    </button>
  );
}