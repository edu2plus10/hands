import { HandLandmarker, FilesetResolver } from
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0";

const video = document.getElementById("cam");
const layer = document.getElementById("canvas");
const btn = document.getElementById("start");
const msg = document.getElementById("msg");

let handLandmarker;
let lastVideoTime = -1;
let running = false;

// 指先のガタつき抑制
let sx = null, sy = null;
const SMOOTH = 0.35;

// 生成数の暴走防止（DOMが増え続けると重くなる）
const MAX_NODES = 600;

function clamp(n, a, b){ return Math.max(a, Math.min(b, n)); }

async function startCamera(){
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: "user" },
    audio: false
  });
  video.srcObject = stream;

  await new Promise((resolve) => {
    video.onloadedmetadata = () => resolve();
  });
}

async function initLandmarker(){
  const vision = await FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
  );
  handLandmarker = await HandLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath:
        "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task"
    },
    runningMode: "VIDEO",
    numHands: 1,
    minHandDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5
  });
}

function spawnCircle(x, y, speed){
  // speed（移動量）で派手さを変える
  const size = clamp(18 + speed * 1.2 + Math.random() * 20, 14, 120);
  const hue = (performance.now() * 0.03 + speed * 2 + Math.random() * 40) % 360;
  const alpha = clamp(0.35 + speed * 0.01, 0.35, 0.95);

  const d = document.createElement("div");
  d.className = "circle";
  d.style.width = size + "px";
  d.style.height = size + "px";
  d.style.left = (x - size / 2) + "px";
  d.style.top  = (y - size / 2) + "px";
  d.style.backgroundColor = `hsla(${hue}, 90%, 60%, ${alpha})`;

  layer.appendChild(d);

  // アニメ終了でDOM削除（重くならないように）
  d.addEventListener("animationend", () => d.remove());

  // 保険：上限超えたら古いのから消す
  while (layer.childElementCount > MAX_NODES) {
    layer.firstElementChild?.remove();
  }
}

function loop(){
  if (!running) return;

  const now = performance.now();

  if (video.currentTime !== lastVideoTime) {
    const result = handLandmarker.detectForVideo(video, now);
    lastVideoTime = video.currentTime;

    const hand = result?.landmarks?.[0];
    if (hand) {
      // 人差し指の先端 = index 8
      const tip = hand[8];

      // tip座標は 0..1 正規化
      // videoはCSSで左右反転しているので x も反転して合わせる
      const rect = layer.getBoundingClientRect();
      const x = (1 - tip.x) * rect.width;
      const y = tip.y * rect.height;

      // スムージング
      if (sx == null) { sx = x; sy = y; }
      const px = sx, py = sy;
      sx = sx + (x - sx) * SMOOTH;
      sy = sy + (y - sy) * SMOOTH;

      const speed = Math.hypot(sx - px, sy - py);

      // 小さい揺れでは生成しない（ノイズ抑制）
      if (speed > 1.2) {
        // speedが速いと“出る量”を増やす
        const n = clamp(Math.floor(speed / 6), 1, 6);
        for (let i = 0; i < n; i++) {
          spawnCircle(sx + (Math.random()-0.5)*6, sy + (Math.random()-0.5)*6, speed);
        }
      }

      msg.textContent = "検出中：人差し指で生成";
    } else {
      msg.textContent = "手が見つかりません（手をカメラへ）";
    }
  }

  requestAnimationFrame(loop);
}

btn.addEventListener("click", async () => {
  try{
    btn.disabled = true;
    msg.textContent = "初期化中…（カメラ→モデル）";

    await startCamera();
    await initLandmarker(); // Hand Landmarker の公式ルート :contentReference[oaicite:1]{index=1}

    running = true;
    msg.textContent = "起動しました：手を映してください";
    requestAnimationFrame(loop);
  }catch(e){
    console.error(e);
    msg.textContent = "起動失敗（HTTPS/localhost、カメラ権限を確認）";
    btn.disabled = false;
  }
});
