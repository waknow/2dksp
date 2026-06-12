import './style.css';

/** 获取 Canvas 元素及绘图上下文 */
const canvas = document.getElementById("game") as HTMLCanvasElement;
const ctx = canvas.getContext("2d")!;

/** 获取控制滑块及数值显示元素 */
const vSlider = document.getElementById("vSlider") as HTMLInputElement;
const mSlider = document.getElementById("mSlider") as HTMLInputElement;
const vValDisplay = document.getElementById("vVal") as HTMLElement;
const mValDisplay = document.getElementById("mVal") as HTMLElement;

const integratorSelect = document.getElementById("integratorSelect") as HTMLSelectElement;
const stepSlider = document.getElementById("stepSlider") as HTMLInputElement;
const stepValDisplay = document.getElementById("stepVal") as HTMLElement;

const predTimeSlider = document.getElementById("predTimeSlider") as HTMLInputElement;
const predTimeValDisplay = document.getElementById("predTimeVal") as HTMLElement;

/** 初始发射速度（水平方向） */
let initialVelocity = 80;
/** 预测时间（秒） */
let predictionDuration = 20;

/** 监听初速度滑块变化 */
vSlider.addEventListener("input", () => {
    initialVelocity = parseInt(vSlider.value);
    vValDisplay.textContent = vSlider.value;
});

/** 监听星球质量滑块变化 */
mSlider.addEventListener("input", () => {
    earth.mass = parseInt(mSlider.value);
    mValDisplay.textContent = mSlider.value;
});

/** 监听步长滑块变化 */
stepSlider.addEventListener("input", () => {
    const hz = parseInt(stepSlider.value);
    physicsStep = 1 / hz;
    stepValDisplay.textContent = stepSlider.value;
});

/** 监听预测时间滑块变化 */
predTimeSlider.addEventListener("input", () => {
    predictionDuration = parseInt(predTimeSlider.value);
    predTimeValDisplay.textContent = predTimeSlider.value;
});

/** 画布缩放以填满窗口 */
function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}

window.addEventListener("resize", resize);
resize();

/** 物理常数 */
const G = 500; // 重力常数
const ESCAPE_DISTANCE = 5000; // 逃逸距离

/** 飞船状态枚举 */
enum ShipState {
    READY = "READY",
    ORBITING = "ORBITING",
    CRASHED = "CRASHED",
    ESCAPED = "ESCAPED"
}

/** 积分方法枚举 */
type IntegratorType = "Euler" | "SemiEuler" | "Verlet" | "Leapfrog";

/** 天体（星球）接口 */
interface Body {
    x: number;
    y: number;
    mass: number;
    radius: number;
}

/** 中心天体配置 */
const earth: Body = {
    x: 0,
    y: 0,
    mass: 10000,
    radius: 50
};

/** 飞船接口 */
interface Ship {
    x: number;
    y: number;
    prevX: number;
    prevY: number;
    vx: number;
    vy: number;
    state: ShipState;
}

/** 模拟参数 */
let zoom = 1;
let timeScale = 1;
let physicsStep = 1 / 240;

/** 飞船实例及轨迹 */
let ship: Ship;
let trail: { x: number; y: number }[] = [];

/** 重置飞船 */
function resetShip() {
    ship = {
        x: 0,
        y: -120,
        prevX: 0,
        prevY: -120,
        vx: 0,
        vy: 0,
        state: ShipState.READY
    };
    trail = [];
}

resetShip();

/** 获取指定位置的加速度 */
function getAcceleration(x: number, y: number) {
    const dx = earth.x - x;
    const dy = earth.y - y;
    const r2 = dx * dx + dy * dy;
    const r = Math.sqrt(r2);
    if (r === 0) return { ax: 0, ay: 0 };
    const accel = G * earth.mass / r2;
    return {
        ax: (dx / r) * accel,
        ay: (dy / r) * accel
    };
}

/** 积分核心逻辑 */
function integrate(
    type: IntegratorType,
    state: { x: number; y: number; vx: number; vy: number },
    dt: number,
    update: (x: number, y: number, vx: number, vy: number) => void
) {
    if (type === "Euler") {
        const { ax, ay } = getAcceleration(state.x, state.y);
        update(
            state.x + state.vx * dt,
            state.y + state.vy * dt,
            state.vx + ax * dt,
            state.vy + ay * dt
        );
    } else if (type === "SemiEuler") {
        const { ax, ay } = getAcceleration(state.x, state.y);
        const nvx = state.vx + ax * dt;
        const nvy = state.vy + ay * dt;
        update(
            state.x + nvx * dt,
            state.y + nvy * dt,
            nvx,
            nvy
        );
    } else if (type === "Verlet") {
        const a1 = getAcceleration(state.x, state.y);
        const nx = state.x + state.vx * dt + 0.5 * a1.ax * dt * dt;
        const ny = state.y + state.vy * dt + 0.5 * a1.ay * dt * dt;
        const a2 = getAcceleration(nx, ny);
        const nvx = state.vx + 0.5 * (a1.ax + a2.ax) * dt;
        const nvy = state.vy + 0.5 * (a1.ay + a2.ay) * dt;
        update(nx, ny, nvx, nvy);
    } else if (type === "Leapfrog") {
        // Leapfrog (Kick-Drift-Kick)
        // 1. $v_{1/2} = v_0 + a_0 * dt/2$
        const a0 = getAcceleration(state.x, state.y);
        const v_half_x = state.vx + a0.ax * (dt * 0.5);
        const v_half_y = state.vy + a0.ay * (dt * 0.5);
        
        // 2. $x_1 = x_0 + v_{1/2} * dt$
        const nx = state.x + v_half_x * dt;
        const ny = state.y + v_half_y * dt;
        
        // 3. $v_1 = v_{1/2} + a_1 * dt/2$
        const a1 = getAcceleration(nx, ny);
        const nvx = v_half_x + a1.ax * (dt * 0.5);
        const nvy = v_half_y + a1.ay * (dt * 0.5);
        
        update(nx, ny, nvx, nvy);
    }
}

/** 计算轨道预测（使用全局配置的物理步长） */
function getPredictedOrbit() {
    const type = integratorSelect.value as IntegratorType;
    let px = 0;
    let py = -120;
    let pvx = initialVelocity;
    let pvy = 0;

    const points: { x: number; y: number }[] = [];
    
    // 使用当前配置的物理步长，以展示该步长下的真实计算误差
    const dt = physicsStep; 
    const totalSteps = Math.floor(predictionDuration / dt);

    for (let i = 0; i < totalSteps; i++) {
        const r = Math.sqrt(px * px + py * py);
        if (r < earth.radius || r > ESCAPE_DISTANCE) break;

        integrate(type, { x: px, y: py, vx: pvx, vy: pvy }, dt, (nx, ny, nvx, nvy) => {
            px = nx; py = ny; pvx = nvx; pvy = nvy;
        });

        // 采样逻辑：根据步长动态调整采样密度
        // 目标是每秒预测时间约记录 60 个点，避免低 Hz 时线段过少，高 Hz 时点数过多
        const skipSteps = Math.max(1, Math.floor((1 / dt) / 60));
        if (i % skipSteps === 0) {
            points.push({ x: px, y: py });
        }
    }
    return points;
}

/** 核心物理模拟 */
function physics(dt: number) {
    if (ship.state !== ShipState.ORBITING) return;

    ship.prevX = ship.x;
    ship.prevY = ship.y;

    const type = integratorSelect.value as IntegratorType;
    integrate(type, ship, dt, (nx, ny, nvx, nvy) => {
        ship.x = nx; ship.y = ny;
        ship.vx = nvx; ship.vy = nvy;
    });

    const newR = Math.sqrt(ship.x * ship.x + ship.y * ship.y);
    if (newR <= earth.radius) {
        const nx = ship.x / newR; const ny = ship.y / newR;
        ship.x = nx * earth.radius; ship.y = ny * earth.radius;
        ship.vx = 0; ship.vy = 0;
        ship.state = ShipState.CRASHED;
        return;
    }

    const v2 = ship.vx * ship.vx + ship.vy * ship.vy;
    const energy = 0.5 * v2 - G * earth.mass / newR;
    if ((energy > 0 && newR > 1000) || newR > ESCAPE_DISTANCE) {
        ship.state = ShipState.ESCAPED; return;
    }

    trail.push({ x: ship.x, y: ship.y });
    if (trail.length > 5000) trail.shift();
}

/** 键盘交互 */
window.addEventListener("keydown", (e: KeyboardEvent) => {
    if (e.code === "Space" && ship.state !== ShipState.ORBITING) {
        resetShip(); ship.vx = initialVelocity; ship.state = ShipState.ORBITING;
    }
    if (e.key === "r") resetShip();
    if (e.key === "1") timeScale = 1;
    if (e.key === "2") timeScale = 10;
    if (e.key === "3") timeScale = 100;
    if (e.key === "4") timeScale = 1000;
});

canvas.addEventListener("wheel", (e: WheelEvent) => {
    e.preventDefault(); zoom *= e.deltaY > 0 ? 0.9 : 1.1;
}, { passive: false });

function worldToScreen(x: number, y: number) {
    return {
        x: canvas.width / 2 + x * zoom,
        y: canvas.height / 2 + y * zoom
    };
}

let accumulator = 0;
let lastTime = performance.now();

function loop(now: number) {
    let frameTime = (now - lastTime) / 1000;
    lastTime = now;
    frameTime *= timeScale;
    accumulator += frameTime;

    while (accumulator >= physicsStep) {
        physics(physicsStep);
        accumulator -= physicsStep;
    }

    render();
    requestAnimationFrame(loop);
}

function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const escr = worldToScreen(earth.x, earth.y);
    ctx.fillStyle = "#2f7cff"; ctx.beginPath();
    ctx.arc(escr.x, escr.y, earth.radius * zoom, 0, Math.PI * 2); ctx.fill();

    if (trail.length > 1) {
        ctx.strokeStyle = "#00ff88"; ctx.beginPath();
        for (let i = 0; i < trail.length; i++) {
            const p = worldToScreen(trail[i].x, trail[i].y);
            if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
        }
        ctx.stroke();
    }

    if (ship.state !== ShipState.ORBITING) {
        const pred = getPredictedOrbit();
        if (pred.length > 1) {
            ctx.setLineDash([5, 5]); ctx.strokeStyle = "rgba(255, 255, 255, 0.3)";
            ctx.beginPath();
            const start = worldToScreen(0, -120);
            ctx.moveTo(start.x, start.y);
            for (const p of pred) {
                const sp = worldToScreen(p.x, p.y); ctx.lineTo(sp.x, sp.y);
            }
            ctx.stroke(); ctx.setLineDash([]);
        }
    }

    const sscr = worldToScreen(ship.x, ship.y);
    ctx.fillStyle = "white"; ctx.fillRect(sscr.x - 3, sscr.y - 3, 6, 6);

    const speed = Math.sqrt(ship.vx * ship.vx + ship.vy * ship.vy);
    const radius = Math.sqrt(ship.x * ship.x + ship.y * ship.y);
    ctx.fillStyle = "white"; ctx.font = "14px monospace";
    let y = canvas.height - 160;
    ctx.fillText("State: " + ship.state, 10, y); y += 20;
    ctx.fillText("Speed: " + speed.toFixed(2), 10, y); y += 20;
    ctx.fillText("Altitude: " + (radius - earth.radius).toFixed(2), 10, y); y += 20;
    ctx.fillText("Integrator: " + integratorSelect.value, 10, y); y += 20;
    ctx.fillText("Step: " + (1/physicsStep).toFixed(0) + "Hz", 10, y); y += 20;
    ctx.fillText("Pred Time: " + predictionDuration + "s", 10, y); y += 20;
    ctx.fillText("TimeScale: x" + timeScale, 10, y);
}

requestAnimationFrame(loop);
