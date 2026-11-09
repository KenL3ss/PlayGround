(() => {
  const canvas = document.querySelector('#game');
  const ctx = canvas.getContext('2d');
  const $ = (id) => document.getElementById(id);
  const startOverlay = $('startOverlay');
  const pauseOverlay = $('pauseOverlay');
  const finishOverlay = $('finishOverlay');
  const raceHud = $('raceHud');
  const speedHud = $('speedHud');
  const pauseButton = $('pauseButton');
  const TAU = Math.PI * 2;
  const START_T = Math.PI / 2;
  const ROAD_HALF = 61;
  const cars = [];
  const keys = new Set();
  let state = 'ready';
  let lastFrame = 0;
  let elapsed = 0;
  let lap = 0;
  let previousProgress = 0;
  let currentProgress = 0;
  let speed = 0;
  let heading = 0;
  let boost = 1;
  let usedBrake = false;
  let finishTimeout = 0;
  let audioOn = true;
  const track = (t) => ({
    x: 500 + 320 * Math.cos(t) + 18 * Math.cos(3 * t),
    y: 300 + 204 * Math.sin(t) + 12 * Math.sin(3 * t)
  });
  const tangent = (t) => {
    const p = track(t), q = track(t + .001);
    return Math.atan2(q.y - p.y, q.x - p.x);
  };
  const trackPoints = Array.from({ length: 480 }, (_, i) => track(i / 480 * TAU));
  const scenery = [];
  let seed = 8941;
  const random = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  for (let i = 0; i < 145; i++) {
    const a = random() * TAU;
    const r = random() < .72 ? 1 : .62;
    scenery.push({ x: 500 + (320 * r + 95 + random() * 110) * Math.cos(a), y: 300 + (204 * r + 82 + random() * 90) * Math.sin(a), size: 3 + random() * 7, shade: Math.floor(random() * 4) });
  }
  const carSpecs = [
    { name: 'YOU', color: '#d8ff3e', stripe: '#efffa7', player: true, offset: 0 },
    { name: 'NOVA', color: '#fb5f8c', stripe: '#ffc0d1', offset: -.11, pace: .0048 },
    { name: 'KAI', color: '#f4c842', stripe: '#fff0a0', offset: -.22, pace: .0044 },
    { name: 'MILES', color: '#62a8ff', stripe: '#c4e0ff', offset: -.33, pace: .0041 }
  ];
  function freshRace() {
    cars.length = 0;
    carSpecs.forEach((spec, i) => {
      const t = START_T + .18 + spec.offset;
      const p = track(t);
      cars.push({ ...spec, x: p.x, y: p.y + (i ? (i % 2 ? 17 : -17) : 0), angle: tangent(t), t, progress: 0, speed: 0, laps: 0, color: spec.color });
    });
    lap = 0; elapsed = 0; speed = 0; boost = 1; usedBrake = false;
    previousProgress = 0; currentProgress = .18;
    $('lapCurrent').textContent = '1'; $('lapTotal').textContent = '3'; $('lapFill').style.width = '3%';
    $('timer').textContent = '00:00.00'; $('speed').textContent = '000'; $('position').innerHTML = '1<span>ST</span>';
    $('boostLabel').innerHTML = 'BOOST <b>▰▰▰</b>';
  }
  freshRace();

  function drawBackground() {
    const bg = ctx.createLinearGradient(0, 0, 1000, 600);
    bg.addColorStop(0, '#29372b'); bg.addColorStop(.48, '#344432'); bg.addColorStop(1, '#202d23');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, 1000, 600);
    // Subtle ground grain and softly lit city blocks beyond the course.
    for (let i = 0; i < 70; i++) {
      const x = (i * 193 + 37) % 1000, y = (i * 317 + 18) % 600;
      ctx.fillStyle = i % 3 ? '#ffffff05' : '#0b160b12'; ctx.fillRect(x, y, 35 + (i % 5) * 9, 2);
    }
    ctx.save();
    for (let i = 0; i < 17; i++) {
      const x = i * 73 - 12, h = 22 + (i * 41 % 49);
      ctx.fillStyle = '#111a17'; ctx.fillRect(x, 0, 54, h);
      ctx.fillRect(x + 4, 600 - h * .7, 48, h * .7);
      for (let wy = 9; wy < h - 5; wy += 10) for (let wx = 7; wx < 49; wx += 13) {
        ctx.fillStyle = (i + wx + wy) % 4 === 0 ? '#eaff7b35' : '#a9c5a00c'; ctx.fillRect(x + wx, wy, 3, 3);
      }
    }
    ctx.restore();
    // Infield lawn, subtly patterned like a compact street circuit park.
    ctx.fillStyle = '#35482f'; ctx.beginPath(); ctx.ellipse(500, 300, 234, 133, -.04, 0, TAU); ctx.fill();
    ctx.save(); ctx.beginPath(); ctx.ellipse(500, 300, 228, 128, -.04, 0, TAU); ctx.clip();
    for (let x = 285; x < 730; x += 24) { ctx.fillStyle = (x / 24 | 0) % 2 ? '#ffffff04' : '#12201109'; ctx.fillRect(x, 150, 8, 300); }
    ctx.restore();
    // Outer run-off and asphalt ribbon.
    strokeTrack('#111812', 153);
    strokeTrack('#7c856c', 147);
    ctx.save(); ctx.lineWidth = 141; ctx.setLineDash([12, 12]); ctx.lineDashOffset = 0; ctx.strokeStyle = '#e5c862'; pathTrack(); ctx.stroke(); ctx.setLineDash([12, 12]); ctx.lineDashOffset = 12; ctx.strokeStyle = '#f1f0dc'; pathTrack(); ctx.stroke(); ctx.restore();
    strokeTrack('#282d2c', 126);
    // Directional asphalt texture.
    ctx.save(); ctx.lineWidth = 1; ctx.strokeStyle = '#ffffff08'; pathTrack(); ctx.stroke();
    ctx.setLineDash([17, 18]); ctx.lineDashOffset = 0; ctx.lineWidth = 2; ctx.strokeStyle = '#e7e7cf91'; pathTrack(); ctx.stroke(); ctx.restore();
    // Start line, placed across the road at the bottom of the circuit.
    const start = track(START_T), startAngle = tangent(START_T) + Math.PI / 2;
    ctx.save(); ctx.translate(start.x, start.y); ctx.rotate(startAngle);
    for (let i = 0; i < 12; i++) { ctx.fillStyle = i % 2 ? '#eef0e5' : '#202522'; ctx.fillRect(-6 + i * 12, -5, 12, 10); }
    ctx.restore();
    // Landscape lights, planted trees and a low-contrast inner service road.
    scenery.forEach((tree, i) => {
      ctx.fillStyle = '#0e160f33'; ctx.beginPath(); ctx.ellipse(tree.x + 3, tree.y + 5, tree.size * 1.1, tree.size * .62, -.3, 0, TAU); ctx.fill();
      ctx.fillStyle = ['#435c3e', '#506b43', '#3d5539', '#63794b'][tree.shade];
      ctx.beginPath(); ctx.arc(tree.x, tree.y, tree.size, 0, TAU); ctx.fill();
      ctx.fillStyle = '#a1bd6950'; ctx.beginPath(); ctx.arc(tree.x - tree.size * .25, tree.y - tree.size * .3, tree.size * .47, 0, TAU); ctx.fill();
      if (i % 5 === 0) { ctx.fillStyle = '#d7fa7a'; ctx.shadowColor = '#d7fa7a'; ctx.shadowBlur = 12; ctx.beginPath(); ctx.arc(tree.x, tree.y, 1.5, 0, TAU); ctx.fill(); ctx.shadowBlur = 0; }
    });
    // A little infield pit building gives the circuit a sense of place.
    ctx.fillStyle = '#263126'; ctx.fillRect(431, 278, 139, 23); ctx.fillStyle = '#475241'; ctx.fillRect(439, 282, 123, 14);
    ctx.fillStyle = '#bce447'; ctx.fillRect(447, 285, 2, 8); ctx.fillRect(454, 285, 2, 8); ctx.fillRect(461, 285, 2, 8);
    ctx.fillStyle = '#202820'; ctx.font = '7px monospace'; ctx.fillText('PIT  /  NEON CIRCUIT', 474, 292);
  }
  function pathTrack() {
    ctx.beginPath();
    trackPoints.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
    ctx.closePath();
  }
  function strokeTrack(color, width) { ctx.save(); ctx.lineWidth = width; ctx.strokeStyle = color; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; pathTrack(); ctx.stroke(); ctx.restore(); }

  function drawCar(car, isPlayer) {
    ctx.save(); ctx.translate(car.x, car.y); ctx.rotate(car.angle);
    // Shadow and tire-contact shadow.
    ctx.fillStyle = '#0508058a'; ctx.beginPath(); ctx.ellipse(2, 5, 17, 10, 0, 0, TAU); ctx.fill();
    // Rear lights glow as the cars sweep around the bends.
    ctx.fillStyle = '#ff465b'; ctx.shadowColor = '#ff314c'; ctx.shadowBlur = 9; ctx.fillRect(-13, -7, 3, 4); ctx.fillRect(-13, 3, 3, 4); ctx.shadowBlur = 0;
    // Wheels.
    ctx.fillStyle = '#111413';
    for (const x of [-9, 7]) { ctx.fillRect(x, -10, 7, 3); ctx.fillRect(x, 7, 7, 3); }
    // Sculpted compact racer silhouette.
    ctx.fillStyle = car.color; ctx.beginPath();
    ctx.moveTo(16, 0); ctx.lineTo(11, -6.5); ctx.lineTo(5, -8); ctx.lineTo(-8, -8); ctx.lineTo(-14, -5); ctx.lineTo(-16, 0); ctx.lineTo(-14, 5); ctx.lineTo(-8, 8); ctx.lineTo(5, 8); ctx.lineTo(11, 6.5); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#111c1a'; ctx.beginPath(); ctx.moveTo(7, -5.3); ctx.lineTo(2, -6); ctx.lineTo(-6, -5.5); ctx.lineTo(-9, -3.2); ctx.lineTo(-9, 3.2); ctx.lineTo(-6, 5.5); ctx.lineTo(2, 6); ctx.lineTo(7, 5.3); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#a7beb4'; ctx.globalAlpha = .55; ctx.beginPath(); ctx.moveTo(4, -4.7); ctx.lineTo(-4, -4.4); ctx.lineTo(-7, -2.7); ctx.lineTo(1, -2.7); ctx.closePath(); ctx.fill(); ctx.globalAlpha = 1;
    ctx.fillStyle = car.stripe || '#f4f3d9'; ctx.fillRect(-12, -1, 21, 2);
    ctx.fillStyle = '#fff6ce'; ctx.shadowColor = '#efffc4'; ctx.shadowBlur = 7; ctx.fillRect(12, -5, 3, 2); ctx.fillRect(12, 3, 3, 2); ctx.shadowBlur = 0;
    if (isPlayer && state === 'racing' && keys.has(' ')) {
      ctx.fillStyle = '#a4f4ff'; ctx.shadowColor = '#61ddff'; ctx.shadowBlur = 15; ctx.beginPath(); ctx.moveTo(-14, -3); ctx.lineTo(-25 - random() * 7, 0); ctx.lineTo(-14, 3); ctx.fill(); ctx.shadowBlur = 0;
    }
    if (isPlayer) { ctx.strokeStyle = '#efffa0'; ctx.lineWidth = 1; ctx.globalAlpha = .7; ctx.beginPath(); ctx.ellipse(0, 0, 19, 12, 0, 0, TAU); ctx.stroke(); }
    ctx.restore();
  }
  function nearestTrack(x, y) {
    let best = Infinity, bestIndex = 0;
    for (let i = 0; i < trackPoints.length; i++) {
      const p = trackPoints[i], d = (p.x - x) ** 2 + (p.y - y) ** 2;
      if (d < best) { best = d; bestIndex = i; }
    }
    return { t: bestIndex / trackPoints.length * TAU, distance: Math.sqrt(best) };
  }
  function formatTime(s) {
    const minutes = Math.floor(s / 60), seconds = Math.floor(s % 60), hundredths = Math.floor((s % 1) * 100);
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(hundredths).padStart(2, '0')}`;
  }
  function update(dt) {
    if (state !== 'racing') return;
    elapsed += dt;
    const player = cars[0];
    const throttle = keys.has('arrowup') || keys.has('w');
    const brake = keys.has('arrowdown') || keys.has('s');
    const left = keys.has('arrowleft') || keys.has('a');
    const right = keys.has('arrowright') || keys.has('d');
    const boosting = keys.has(' ') && boost > 0.01;
    if (brake) usedBrake = true;
    const near = nearestTrack(player.x, player.y);
    const offroad = near.distance > ROAD_HALF - 8;
    const maxSpeed = boosting ? 5.15 : 3.15;
    if (throttle) speed += .095 * dt * 60;
    else speed -= .017 * dt * 60;
    if (brake) speed -= .105 * dt * 60;
    if (offroad) speed -= .055 * dt * 60;
    speed = Math.max(0, Math.min(maxSpeed, speed));
    if (boosting && throttle) boost = Math.max(0, boost - .20 * dt);
    else boost = Math.min(1, boost + .055 * dt);
    const steer = (right ? 1 : 0) - (left ? 1 : 0);
    if (speed > .16) heading += steer * .045 * (speed / 3.15) * dt * 60 * (speed > 2.7 ? 1 : .82);
    // Light steering self-align makes keyboard driving forgiving without removing drift.
    const desired = tangent(near.t);
    let angleDelta = ((desired - heading + Math.PI * 3) % TAU) - Math.PI;
    if (!steer && !offroad && speed > 1.25) heading += angleDelta * .0045 * dt * 60;
    player.x += Math.cos(heading) * speed * dt * 60;
    player.y += Math.sin(heading) * speed * dt * 60;
    player.angle = heading; player.speed = speed;
    // AI opponents follow the racing line, with small speed variations and lateral offsets.
    for (let i = 1; i < cars.length; i++) {
      const car = cars[i];
      car.t += car.pace * dt * 60;
      if (car.t >= TAU) { car.t -= TAU; car.laps++; }
      const p = track(car.t), tangentAngle = tangent(car.t), side = Math.sin(car.t * 2 + i) * 4;
      car.x = p.x + Math.cos(tangentAngle + Math.PI / 2) * side;
      car.y = p.y + Math.sin(tangentAngle + Math.PI / 2) * side;
      car.angle = tangentAngle; car.speed = car.pace * 2000;
    }
    const progress = (near.t - START_T + TAU) % TAU;
    if (progress + .5 < previousProgress && previousProgress > 5.4) {
      lap++;
      $('lapCurrent').textContent = String(Math.min(lap + 1, 3));
      if (lap >= 3) finishRace();
    }
    previousProgress = progress; currentProgress = progress;
    $('lapFill').style.width = `${Math.max(1, progress / TAU * 100)}%`;
    $('timer').textContent = formatTime(elapsed);
    $('speed').textContent = String(Math.round(speed * 49)).padStart(3, '0');
    $('boostLabel').innerHTML = `BOOST <b>${boost > .66 ? '▰▰▰' : boost > .33 ? '▰▰' : boost > .04 ? '▰' : '···'}</b>`;
    const standing = [player, ...cars.slice(1)].map((c, i) => ({ i, score: (i === 0 ? lap : c.laps) * TAU + (i === 0 ? progress : (c.t - START_T + TAU) % TAU) })).sort((a, b) => b.score - a.score);
    const place = standing.findIndex(c => c.i === 0) + 1;
    const suffix = place === 1 ? 'ST' : place === 2 ? 'ND' : place === 3 ? 'RD' : 'TH';
    $('position').innerHTML = `${place}<span>${suffix}</span>`;
    document.querySelectorAll('.driver-row').forEach((row, i) => row.querySelector('.driver-rating').textContent = `P${standing.findIndex(c => c.i === i) + 1}`);
  }
  function draw() {
    ctx.clearRect(0, 0, 1000, 600);
    drawBackground();
    cars.slice(1).forEach(car => drawCar(car, false));
    drawCar(cars[0], true);
  }
  function finishRace() {
    state = 'finished';
    $('finishTitle').textContent = $('position').textContent.trim().startsWith('1') ? 'NICE DRIVE.' : 'RACE COMPLETE.';
    $('finishCopy').textContent = usedBrake ? 'The city is yours tonight. Take another lap?' : 'Daily challenge complete. You kept it clean.';
    $('finishTime').textContent = formatTime(elapsed);
    finishOverlay.hidden = false; pauseButton.hidden = true;
  }
  function startRace() {
    if (state === 'racing') return;
    if (state === 'finished') freshRace();
    state = 'racing'; startOverlay.hidden = true; pauseOverlay.hidden = true; finishOverlay.hidden = true;
    raceHud.hidden = false; speedHud.hidden = false; pauseButton.hidden = false;
    keys.clear(); canvas.focus?.();
  }
  function pauseRace() {
    if (state === 'racing') { state = 'paused'; pauseOverlay.hidden = false; pauseButton.hidden = true; keys.clear(); }
    else if (state === 'paused') { state = 'racing'; pauseOverlay.hidden = true; pauseButton.hidden = false; lastFrame = performance.now(); }
  }
  function frame(now) {
    const dt = Math.min(.04, (now - (lastFrame || now)) / 1000);
    lastFrame = now; update(dt); draw(); requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  $('startButton').addEventListener('click', startRace);
  $('replayButton').addEventListener('click', () => { freshRace(); startRace(); });
  $('pauseButton').addEventListener('click', pauseRace);
  $('resumeButton').addEventListener('click', pauseRace);
  $('fullscreenButton').addEventListener('click', () => {
    const frame = document.querySelector('.game-frame');
    if (!document.fullscreenElement) frame.requestFullscreen?.(); else document.exitFullscreen?.();
  });
  document.querySelector('.sound-toggle').addEventListener('click', (event) => {
    audioOn = !audioOn; event.currentTarget.classList.toggle('muted', !audioOn); event.currentTarget.textContent = audioOn ? '♫' : '♪';
  });
  window.addEventListener('keydown', (event) => {
    const key = event.key.toLowerCase();
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(key)) event.preventDefault();
    if (key === 'escape' || key === 'p') { pauseRace(); return; }
    if (key === 'enter' && (state === 'ready' || state === 'finished')) { if (state === 'finished') freshRace(); startRace(); return; }
    keys.add(key);
  });
  window.addEventListener('keyup', (event) => keys.delete(event.key.toLowerCase()));
  window.addEventListener('blur', () => { keys.clear(); if (state === 'racing') pauseRace(); });
})();
