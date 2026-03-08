import { useEffect, useRef, useState } from "react";

const W = 480;
const H = 640;

const ROCKET_W = 36;
const ROCKET_H = 36;

const OBSTACLE_TYPES = [
  { emoji: "🪨", size: 50 },
  { emoji: "🪨", size: 36 },
  { emoji: "🪨", size: 24 },
  { emoji: "🛸", size: 44 },
  { emoji: "🛢️", size: 34 },
  { emoji: "☄️", size: 46 },
  { emoji: "💫", size: 40 },
];

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

export default function ZigRocket() {
  const canvasRef = useRef(null);
  const [screen, setScreen] = useState("menu");
  const [displayScore, setDisplayScore] = useState(0);
  const [displayLevel, setDisplayLevel] = useState(1);
  const [displayHigh, setDisplayHigh] = useState(0);
  const [showLevelUp, setShowLevelUp] = useState(false);
  const [levelUpMsg, setLevelUpMsg] = useState("");

  const G = useRef(null);
  const rafRef = useRef(null);
  const screenRef = useRef("menu");

  function initGame() {
    G.current = {
      rocket: { x: W / 2 - ROCKET_W / 2, y: H - 120 },
      obstacles: [],
      stars: makeStars(),
      keys: {},
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

  function drawBackground(ctx) {
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, "#0a0415");
    bg.addColorStop(0.5, "#0d0a2e");
    bg.addColorStop(1, "#150525");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    const t = Date.now() / 8000;
    for (const [nx, ny, nr, nc] of [
      [80, 140, 100, "rgba(107,33,168,0.12)"],
      [370, 310, 80, "rgba(30,58,138,0.10)"],
      [200, 490, 65, "rgba(124,58,237,0.09)"],
    ]) {
      const gr = ctx.createRadialGradient(nx + Math.sin(t) * 10, ny + Math.cos(t) * 8, 0, nx, ny, nr);
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

  function startLoop() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");

    const emojiCache = {};
    function getEmojiCanvas(emoji, size) {
      const key = `${emoji}-${size}`;
      if (emojiCache[key]) return emojiCache[key];
      const oc = document.createElement("canvas");
      oc.width = size + 8;
      oc.height = size + 8;
      const oc2 = oc.getContext("2d");
      oc2.font = `${size}px serif`;
      oc2.textAlign = "center";
      oc2.textBaseline = "middle";
      oc2.fillText(emoji, (size + 8) / 2, (size + 8) / 2);
      emojiCache[key] = oc;
      return oc;
    }

    function loop() {
      const g = G.current;
      if (!g) return;

      if (g.running && !g.exploding) {
        const spd = g.rocketSpeed;
        if (g.keys["ArrowLeft"]  || g.keys["a"]) g.rocket.x -= spd;
        if (g.keys["ArrowRight"] || g.keys["d"]) g.rocket.x += spd;
        if (g.keys["ArrowUp"]    || g.keys["w"]) g.rocket.y -= spd;
        if (g.keys["ArrowDown"]  || g.keys["s"]) g.rocket.y += spd;
        g.rocket.x = Math.max(0, Math.min(W - ROCKET_W, g.rocket.x));
        g.rocket.y = Math.max(0, Math.min(H - ROCKET_H, g.rocket.y));

        for (const s of g.stars) {
          s.y += s.speed;
          if (s.y > H) { s.y = -4; s.x = Math.random() * W; }
        }

        g.spawnTimer++;
        const spawnRate = Math.max(25, 55 - g.level * 3);
        if (g.spawnTimer >= spawnRate) {
          g.spawnTimer = 0;
          const t = OBSTACLE_TYPES[Math.floor(Math.random() * OBSTACLE_TYPES.length)];
          g.obstacles.push({
            id: g.obstacleId++,
            emoji: t.emoji,
            size: t.size,
            x: Math.random() * (W - t.size - 20) + 10,
            y: -t.size - 10,
            speed: 2 + Math.random() * 2 + g.level * 0.3,
            rot: Math.random() * 360,
            rotSpeed: (Math.random() - 0.5) * 4,
          });
        }

        const survived = [];
        let scored = 0;
        for (const o of g.obstacles) {
          o.y += o.speed;
          o.rot += o.rotSpeed;

          if (o.y > H + o.size) { scored++; continue; }

          const rx = g.rocket.x + ROCKET_W / 2;
          const ry = g.rocket.y + ROCKET_H / 2;
          const ox = o.x + o.size / 2;
          const oy = o.y + o.size / 2;
          if (Math.hypot(rx - ox, ry - oy) < ROCKET_W * 0.42 + o.size * 0.38) {
            g.exploding = true;
            g.explosionFrame = 0;
            g.explosionX = g.rocket.x;
            g.explosionY = g.rocket.y;
            continue;
          }
          survived.push(o);
        }
        g.obstacles = survived;

        if (scored > 0) {
          g.score += scored;
          setDisplayScore(g.score);
          const newLevel = Math.floor(g.score / 10) + 1;
          if (newLevel > g.level) {
            g.level = newLevel;
            g.rocketSpeed = 5 + (newLevel - 1);
            setDisplayLevel(newLevel);
            setLevelUpMsg(`⭐ LEVEL ${newLevel}! ⭐`);
            setShowLevelUp(true);
            setTimeout(() => setShowLevelUp(false), 1500);
          }
        }
      }

      if (g.exploding) {
        g.explosionFrame++;
        if (g.explosionFrame > 14) {
          g.running = false;
          g.exploding = false;
          if (g.score > g.highScore) g.highScore = g.score;
          setDisplayHigh(g.highScore);
          screenRef.current = "gameover";
          setScreen("gameover");
          return;
        }
      }

      // ── draw ──
      drawBackground(ctx);
      drawStars(ctx, g.stars);

      for (const o of g.obstacles) {
        ctx.save();
        ctx.translate(o.x + o.size / 2, o.y + o.size / 2);
        ctx.rotate((o.rot * Math.PI) / 180);
        ctx.drawImage(getEmojiCanvas(o.emoji, o.size), -o.size / 2 - 4, -o.size / 2 - 4);
        ctx.restore();
      }

      if (!g.exploding) {
        ctx.save();
        ctx.translate(g.rocket.x + ROCKET_W / 2, g.rocket.y + ROCKET_H / 2);
        ctx.rotate(-Math.PI / 2);
        ctx.drawImage(getEmojiCanvas("🚀", ROCKET_W), -ROCKET_W / 2 - 4, -ROCKET_H / 2 - 4);
        ctx.restore();
      }

      if (g.exploding) {
        const ef = g.explosionFrame;
        const scale = 0.5 + ef * 0.09;
        const alpha = Math.max(0, 1 - ef * 0.07);
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(g.explosionX + ROCKET_W / 2, g.explosionY + ROCKET_H / 2);
        ctx.scale(scale, scale);
        for (let i = 0; i < 8; i++) {
          const angle = (i / 8) * Math.PI * 2;
          const len = 28 + (i % 3) * 10;
          ctx.beginPath();
          ctx.moveTo(Math.cos(angle) * 8, Math.sin(angle) * 8);
          ctx.lineTo(Math.cos(angle) * len, Math.sin(angle) * len);
          ctx.strokeStyle = ["#ff9f0a", "#ff3b30", "#ffe033", "#ff6eb4"][i % 4];
          ctx.lineWidth = 3 + (i % 2);
          ctx.lineCap = "round";
          ctx.stroke();
        }
        ctx.beginPath();
        ctx.arc(0, 0, 12 + ef * 1.5, 0, Math.PI * 2);
        ctx.fillStyle = "#ffe033";
        ctx.globalAlpha = alpha * 0.7;
        ctx.fill();
        ctx.beginPath();
        ctx.arc(0, 0, 6 + ef, 0, Math.PI * 2);
        ctx.fillStyle = "white";
        ctx.globalAlpha = alpha;
        ctx.fill();
        ctx.font = "28px serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("💥", 0, 0);
        ctx.restore();
      }

      rafRef.current = requestAnimationFrame(loop);
    }

    rafRef.current = requestAnimationFrame(loop);
  }

  // background loop for menu / gameover
  useEffect(() => {
    if (screen === "playing") return;
    if (!G.current) G.current = { stars: makeStars(), highScore: 0 };

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

  // key listeners
  useEffect(() => {
    const down = e => {
      if (G.current) G.current.keys[e.key] = true;
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) e.preventDefault();
    };
    const up = e => { if (G.current) G.current.keys[e.key] = false; };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  function handleStart() {
    cancelAnimationFrame(rafRef.current);
    initGame();
    setDisplayScore(0);
    setDisplayLevel(1);
    setShowLevelUp(false);
    screenRef.current = "playing";
    setScreen("playing");
    setTimeout(startLoop, 30);
  }

  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center",
      justifyContent: "center", minHeight: "100vh", background: "#05010f",
      fontFamily: "'Trebuchet MS', cursive",
    }}>
      <div style={{
        marginBottom: 10, fontSize: 30, fontWeight: 900, letterSpacing: 3,
        background: "linear-gradient(135deg,#ff6eb4,#a78bfa,#60a5fa)",
        WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
        filter: "drop-shadow(0 0 18px #a78bfa88)",
      }}>
        🚀 ZIGROCKET 🚀
      </div>

      <div style={{ position: "relative", width: W, height: H }}>
        <canvas ref={canvasRef} width={W} height={H} style={{
          borderRadius: 20, display: "block",
          boxShadow: "0 0 60px #7c3aed55, 0 0 120px #7c3aed22",
        }} />

        {screen === "playing" && (
          <div style={{
            position: "absolute", top: 14, left: 14, right: 14,
            display: "flex", justifyContent: "space-between", pointerEvents: "none",
          }}>
            <Pill>⭐ {displayScore}</Pill>
            <Pill>LVL {displayLevel}</Pill>
          </div>
        )}

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

        {screen === "menu" && (
          <Overlay>
            <div style={{ fontSize: 64, marginBottom: 6 }}>🚀</div>
            <div style={{ fontSize: 26, fontWeight: 900, color: "#fde68a", marginBottom: 4 }}>ZIGROCKET</div>
            <div style={{ fontSize: 12, color: "#c4b5fd", marginBottom: 20, opacity: 0.85 }}>
              dodge meteors · survive space
            </div>
            <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 24, lineHeight: 2 }}>
              ← → ↑ ↓ &nbsp;or&nbsp; WASD to fly
            </div>
            <Btn onClick={handleStart}>🚀 LAUNCH!</Btn>
            <div style={{ marginTop: 18, fontSize: 11, color: "#475569" }}>
              every 10 dodges = level up 🌟
            </div>
          </Overlay>
        )}

        {screen === "gameover" && (
          <Overlay>
            <div style={{ fontSize: 48, marginBottom: 4 }}>💥</div>
            <div style={{ fontSize: 22, fontWeight: 900, color: "#fca5a5", marginBottom: 6 }}>YOU GOT HIT!</div>
            <div style={{
              background: "rgba(255,255,255,0.06)", borderRadius: 16,
              padding: "14px 36px", marginBottom: 20, textAlign: "center",
            }}>
              <div style={{ fontSize: 12, color: "#c4b5fd", marginBottom: 3 }}>SCORE</div>
              <div style={{ fontSize: 44, fontWeight: 900, color: "#fde68a" }}>{displayScore}</div>
              {displayScore > 0 && displayScore >= displayHigh
                ? <div style={{ fontSize: 12, color: "#6ee7b7", marginTop: 4 }}>✨ new high score!</div>
                : <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>best: {displayHigh}</div>}
            </div>
            <Btn onClick={handleStart}>🔄 TRY AGAIN</Btn>
          </Overlay>
        )}
      </div>

      <style>{`
        @keyframes popIn {
          from { transform: translateX(-50%) scale(0.3); opacity: 0; }
          to   { transform: translateX(-50%) scale(1);   opacity: 1; }
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