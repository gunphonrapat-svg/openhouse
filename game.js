const videoElement = document.querySelector('.input_video');
const canvasElement = document.querySelector('.output_canvas');
const canvasCtx = canvasElement.getContext('2d');
const guideEl = document.getElementById('gesture-guide');

let player = { x: 0.5, y: 0.5, progress: 0, holding: null, state: 'empty' };
let score = 0;
let isProcessing = false;

const stations = {
    'PLATE': { name: 'จาน', x: 0.1, y: 0.85, color: '#FFFFFF', icon: '🍽️', hint: '✋ แบแช่ไว้ > ✊ กำเพื่อหยิบจาน' },
    'RICE':  { name: 'ข้าวสาร', x: 0.1, y: 0.15, color: '#FFEB3B', icon: '🌾', hint: '✋ แบแช่ไว้ > ✊ กำเพื่อหยิบข้าว' },
    'EGG':   { name: 'ไข่สด', x: 0.25, y: 0.15, color: '#FF9800', icon: '🥚', hint: '✋ แบแช่ไว้ > ✊ กำเพื่อหยิบไข่' },
    'PORK':  { name: 'หมูสด', x: 0.4, y: 0.15, color: '#E91E63', icon: '🥩', hint: '✋ แบแช่ไว้ > ✊ กำเพื่อหยิบหมู' },
    'TRASH': { name: 'ถังขยะ', x: 0.9, y: 0.15, color: '#424242', icon: '🗑️', hint: '✋ แบมือค้างเพื่อทิ้งของ' },
    'COOKER':{ name: 'หม้อข้าว', x: 0.2, y: 0.5, color: '#BDBDBD', icon: '🍚', state: 'empty', progress: 0, item: null },
    'PAN':   { name: 'กระทะ', x: 0.4, y: 0.5, color: '#263238', icon: '🍳', state: 'empty', progress: 0, item: null },
    'TABLE': { name: 'พื้นที่เตรียม', x: 0.7, y: 0.7, color: '#5D4037', contents: [], icon: '🍱', hint: '✋ แบมือแช่ไว้เพื่อวางของ' },
    'SERVE': { name: 'จุดส่ง', x: 0.9, y: 0.85, color: '#2E7D32', icon: '🚚', hint: '✋ แบมือเพื่อเสิร์ฟอาหาร' }
};

const recipes = [
    { name: "ข้าวไข่เจียว", items: ["จาน", "ข้าวสุก", "ไข่ทอด"] },
    { name: "ข้าวหมูทอด", items: ["จาน", "ข้าวสุก", "หมูทอด"] }
];

const itemVisuals = {
    'จาน': { icon: '🍽️' }, 'ข้าวสาร': { icon: '🌾' }, 'ข้าวสุก': { icon: '🍚' },
    'ไข่สด': { icon: '🥚' }, 'ไข่ทอด': { icon: '🍳' }, 'หมูสด': { icon: '🥩' }, 'หมูทอด': { icon: '🍖' }
};

function detectGesture(lm) {
    const dist = Math.sqrt(Math.pow(lm[12].x - lm[9].x, 2) + Math.pow(lm[12].y - lm[9].y, 2));
    return dist < 0.08 ? "Fist" : "Open Palm";
}

async function onResults(results) {
    canvasElement.width = canvasElement.clientWidth;
    canvasElement.height = canvasElement.clientHeight;
    canvasCtx.save();
    
    // 1. วาดพื้นหลัง (เข้มสนิท)
    canvasCtx.fillStyle = '#000000';
    canvasCtx.fillRect(0, 0, canvasElement.width, canvasElement.height);

    // 2. วาดภาพจากกล้อง (ปรับความโปร่งแสงให้เหลือเฉพาะภาพพื้นหลัง)
    canvasCtx.save();
    canvasCtx.translate(canvasElement.width, 0);
    canvasCtx.scale(-1, 1);
    canvasCtx.globalAlpha = 0.3; // ความชัดของตัวเรา (ถ้าต้องการให้ชัดขึ้นปรับเป็น 0.4 หรือ 0.5)
    canvasCtx.drawImage(results.image, 0, 0, canvasElement.width, canvasElement.height);
    canvasCtx.restore();

    // 3. ปรับค่า Global Alpha คืนค่าเป็น 1.0 เสมอเพื่อให้ไอคอนและสถานีเข้มชัดเจน
    canvasCtx.globalAlpha = 1.0;

    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        const hand = results.multiHandLandmarks[0];
        player.x = 1 - hand[9].x; player.y = hand[9].y;
        let gesture = detectGesture(hand);
        
        let nearStation = null;
        for (let id in stations) {
            let s = stations[id];
            let d = Math.sqrt(Math.pow(player.x - s.x, 2) + Math.pow(player.y - s.y, 2));
            if (d < 0.08) nearStation = id;
        }

        if (nearStation) {
            handleInteraction(nearStation, gesture);
            guideEl.innerText = stations[nearStation].hint;
            guideEl.style.display = 'block';
        } else {
            guideEl.style.display = 'none';
            player.progress = 0;
            if (player.state === 'grabbing') player.state = 'empty';
        }
    }

    updateCooking();
    drawStations();
    drawRecipeCard();
    drawPlayer();
    canvasCtx.restore();
}

function handleInteraction(id, gesture) {
    let s = stations[id];
    if (['PLATE', 'RICE', 'EGG', 'PORK'].includes(id) && !player.holding) {
        if (player.state === 'empty' && gesture === 'Open Palm') {
            player.progress += 2;
            if (player.progress > 25) player.state = 'grabbing';
        } else if (player.state === 'grabbing' && gesture === 'Fist') {
            player.holding = s.name; player.state = 'holding'; player.progress = 0;
        }
    }
    else if ((id === 'COOKER' || id === 'PAN') && gesture === 'Fist' && player.holding) {
        if (s.state === 'empty') {
            if (id === 'COOKER' && player.holding === 'ข้าวสาร') { s.item = 'ข้าวสุก'; startCook(s); }
            else if (id === 'PAN' && player.holding === 'ไข่สด') { s.item = 'ไข่ทอด'; startCook(s); }
            else if (id === 'PAN' && player.holding === 'หมูสด') { s.item = 'หมูทอด'; startCook(s); }
        }
    }
    else if ((id === 'COOKER' || id === 'PAN') && s.state === 'cooked' && !player.holding) {
        if (player.state === 'empty' && gesture === 'Open Palm') {
            player.progress += 2;
            if (player.progress > 25) player.state = 'grabbing';
        } else if (player.state === 'grabbing' && gesture === 'Fist') {
            player.holding = s.item; s.state = 'empty'; s.item = null; s.progress = 0; player.state = 'holding';
        }
    }
    else if (id === 'TABLE' && player.holding && gesture === 'Open Palm') {
        player.progress += 2;
        if (player.progress >= 35) {
            stations['TABLE'].contents.push(player.holding);
            player.holding = null; player.state = 'empty'; player.progress = 0;
        }
    }
    else if (id === 'SERVE' && gesture === 'Open Palm') {
        player.progress += 2;
        if (player.progress >= 30) { checkRecipe(); player.progress = 0; }
    }
    else if (id === 'TRASH' && player.holding && gesture === 'Open Palm') {
        player.holding = null; player.state = 'empty';
    }
}

function startCook(s) { player.holding = null; player.state = 'empty'; s.state = 'cooking'; player.progress = 0; }

function checkRecipe() {
    let table = stations['TABLE'].contents;
    let found = false;
    recipes.forEach(r => {
        if (r.items.every(i => table.includes(i))) { score += 50; found = true; }
    });
    if (found) { stations['TABLE'].contents = []; document.getElementById('score').innerText = score; }
}

function updateCooking() {
    ['COOKER', 'PAN'].forEach(id => {
        let s = stations[id];
        if (s.state === 'cooking') {
            s.progress += 0.5;
            if (s.progress >= 100) s.state = 'cooked';
        }
    });
}

function drawStations() {
    for (let id in stations) {
        const s = stations[id];
        const sx = s.x * canvasElement.width, sy = s.y * canvasElement.height;
        
        // วาดกรอบสถานีให้ทึบและชัดเจนขึ้น
        canvasCtx.fillStyle = 'rgba(255,255,255,0.2)'; // เพิ่มความเข้มพื้นหลังสถานี
        canvasCtx.strokeStyle = s.color;
        canvasCtx.lineWidth = 3;
        canvasCtx.beginPath(); 
        canvasCtx.roundRect(sx-45, sy-45, 90, 90, 15); 
        canvasCtx.fill();
        canvasCtx.stroke(); // เพิ่มเส้นขอบตามสีของสถานี
        
        // วาด Emoji (เน้นให้ชัด)
        canvasCtx.font = "50px Arial"; 
        canvasCtx.textAlign = "center";
        canvasCtx.fillText(s.icon, sx, sy + 15);

        // วาดชื่อสถานี (สีขาวเข้ม)
        canvasCtx.font = "bold 14px Arial"; 
        canvasCtx.fillStyle = "#FFFFFF";
        canvasCtx.fillText(s.name, sx, sy + 58);

        if (id === 'TABLE' && s.contents.length > 0) {
            s.contents.forEach((item, idx) => {
                canvasCtx.font = "30px Arial";
                canvasCtx.fillText(itemVisuals[item].icon, sx - 25 + (idx * 25), sy - 55);
            });
        }
        if (s.state === 'cooking') {
            canvasCtx.fillStyle = '#111'; canvasCtx.fillRect(sx-30, sy+25, 60, 10);
            canvasCtx.fillStyle = '#ff1744'; canvasCtx.fillRect(sx-30, sy+25, (s.progress/100)*60, 10);
        }
        if (s.state === 'cooked') {
            canvasCtx.fillStyle = '#00e676'; canvasCtx.font = "bold 16px Arial";
            canvasCtx.fillText("✅ สุกแล้ว!", sx, sy - 65);
        }
    }
}

function drawRecipeCard() {
    const rx = canvasElement.width - 210, ry = 20;
    canvasCtx.fillStyle = 'rgba(0,0,0,0.9)'; // เข้มขึ้น
    canvasCtx.roundRect(rx, ry, 190, 110, 15); canvasCtx.fill();
    canvasCtx.strokeStyle = '#00ff88'; canvasCtx.lineWidth = 3; canvasCtx.stroke();
    canvasCtx.fillStyle = '#00ff88'; canvasCtx.font = 'bold 18px Arial'; canvasCtx.textAlign = 'left';
    canvasCtx.fillText('👨‍🍳 ออเดอร์', rx + 15, ry + 25);
    canvasCtx.font = 'bold 13px Arial'; canvasCtx.fillStyle = 'white';
    recipes.forEach((r, i) => {
        canvasCtx.fillText(`${r.name}:`, rx + 15, ry + 50 + (i * 30));
        canvasCtx.font = '11px Arial'; canvasCtx.fillStyle = '#00E5FF';
        canvasCtx.fillText(`${r.items.join(' + ')}`, rx + 15, ry + 68 + (i * 30));
        canvasCtx.font = 'bold 13px Arial'; canvasCtx.fillStyle = 'white';
    });
}

function drawPlayer() {
    const px = player.x * canvasElement.width, py = player.y * canvasElement.height;
    if (player.progress > 0) {
        canvasCtx.beginPath();
        canvasCtx.arc(px, py, 40, 0, (player.progress/25) * Math.PI * 2);
        canvasCtx.strokeStyle = '#00ff88'; canvasCtx.lineWidth = 6; canvasCtx.stroke();
    }
    
    canvasCtx.shadowBlur = 10;
    canvasCtx.shadowColor = "black";
    canvasCtx.font = "60px Arial"; canvasCtx.textAlign = "center";
    if (player.holding) {
        canvasCtx.fillText(itemVisuals[player.holding].icon, px, py + 20);
    } else {
        canvasCtx.fillStyle = player.state === 'grabbing' ? '#00E5FF' : '#ffff00';
        canvasCtx.beginPath(); canvasCtx.arc(px, py, 15, 0, Math.PI*2); canvasCtx.fill();
    }
    canvasCtx.shadowBlur = 0;
}

document.getElementById('startBtn').onclick = async () => {
    document.getElementById('startBtn').style.display = 'none';
    const hands = new Hands({locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`});
    hands.setOptions({ maxNumHands: 1, modelComplexity: 1, minDetectionConfidence: 0.8 });
    hands.onResults(onResults);
    const camera = new Camera(videoElement, {
        onFrame: async () => {
            if (isProcessing) return;
            isProcessing = true;
            await hands.send({image: videoElement});
            isProcessing = false;
        }, width: 1280, height: 720
    });
    camera.start();
};