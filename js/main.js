
document.addEventListener('DOMContentLoaded', () => {

    let warpMode = false;
    let speedMultiplier = 0.05;

    let gameActive = false;
    let score = 0;
    let enemies = [];
    let lasers = [];
    let mouseX = 0;
    let mouseY = 0;

    function simpleWrapOffset(val, max) {
        if (val < 0)
            return max;

        if (val > max)
            return -max;

        return 0;
    }

    // --- STARFIELD SYSTEM (CANVAS) ---
    const canvas = document.getElementById('space-canvas');
    if (canvas) {
        const ctx = canvas.getContext('2d');
        let width, height;
        let stars = [];

        const DRIFT_X = 0.05;
        const DRIFT_Y = 0.01;
        const STAR_COUNT = 800;

        function resize() {
            width = window.innerWidth;
            height = window.innerHeight;
            canvas.width = width;
            canvas.height = height;
        }

        window.addEventListener('resize', resize);
        resize();

        // Star Class
        class Star {
            constructor() {
                this.reset(true);
            }

            reset(initial = false) {
                this.x = (Math.random() * width) - width / 2;
                this.y = (Math.random() * height) - height / 2;
                this.z = Math.random() * 4;
                this.size = Math.random() * 2;
                this.opacity = Math.random();
                this.twinkleSpeed = 0.02 + Math.random() * 0.05;

                if (initial) {
                    this.screenX = (this.x / this.z) * width + width / 2;
                    this.screenY = (this.y / this.z) * height + height / 2;
                }
            }

            update() {
                if (warpMode) {
                    const dx = this.x - width / 2;
                    const dy = this.y - height / 2;

                    let dist = Math.sqrt(dx * dx + dy * dy);
                    if (dist < 1)
                        dist = 1;

                    this.x += (dx / dist) * this.z * 10 * speedMultiplier;
                    this.y += (dy / dist) * this.z * 10 * speedMultiplier;

                    this.z += 0.1;
                    if (this.x < 0 || this.x > width || this.y < 0 || this.y > height) {
                        this.reset();
                        this.x = (Math.random() * 200 - 100) + width / 2;
                        this.y = (Math.random() * 200 - 100) + height / 2;
                        this.z = 0.1;
                    }
                }
                else {
                    // IDLE: Constant Cinematic Drift
                    let depthFactor = (5 - this.z);
                    this.x -= DRIFT_X * depthFactor;
                    this.y -= DRIFT_Y * depthFactor;

                    // Wrap for drift
                    if (this.x < -width / 2) this.x += width;
                    if (this.y < -height / 2) this.y += height;
                }

                this.opacity += this.twinkleSpeed;
            }

            draw() {
                let drawX = this.x;
                let drawY = this.y;

                if (!warpMode) {
                    drawX = this.x;
                    if (drawX < 0)
                        drawX += width;

                    if (drawX > width)
                        drawX -= width;

                    drawY = this.y;
                    if (drawY < 0)
                        drawY += height;

                    if (drawY > height)
                        drawY -= height;
                }

                // Warp Streak
                if (warpMode) {
                    const prevX = this.x - (this.x - width / 2) * (0.05 * speedMultiplier);
                    const prevY = this.y - (this.y - height / 2) * (0.05 * speedMultiplier);

                    ctx.strokeStyle = `rgba(255, 255, 255, ${this.opacity})`;
                    ctx.lineWidth = this.size * (speedMultiplier > 2 ? 1.5 : 1);
                    ctx.beginPath();
                    ctx.moveTo(this.x, this.y);
                    ctx.lineTo(prevX, prevY);
                    ctx.stroke();
                }
                else {
                    let flicker = (Math.sin(this.opacity) + 1) / 2 * 0.8;
                    ctx.fillStyle = `rgba(255, 255, 255, ${flicker * (1 - this.z / 4)})`;
                    ctx.beginPath();
                    ctx.arc(drawX, drawY, this.size * (1 - this.z / 5), 0, Math.PI * 2);
                    ctx.fill();
                }
            }
        }

        // Shooting Star Class
        class ShootingStar {
            constructor() {
                this.reset();
            }

            reset() {
                this.x = Math.random() * width;
                this.y = 0;
                this.len = (Math.random() * 80) + 10;
                this.speed = (Math.random() * 10) + 6;
                this.size = (Math.random() * 1) + 0.1;
                this.dx = -2 - Math.random() * 4;
                this.dy = this.speed;
                this.life = 0;
                this.maxLife = 100;
                this.active = false;
            }

            trigger() {
                this.reset();
                this.active = true;
                this.x = Math.random() * width + 200;
                this.y = -50;
            }

            update() {
                if (!this.active)
                    return;

                this.x += this.dx;
                this.y += this.dy;
                this.life++;

                if (this.life > this.maxLife || this.x < 0 || this.y > height) {
                    this.active = false;
                }
            }

            draw() {
                if (!this.active)
                    return;

                const tailX = this.x - this.dx * 5;
                const tailY = this.y - this.dy * 5;

                let gradient = ctx.createLinearGradient(this.x, this.y, tailX, tailY);
                gradient.addColorStop(0, "rgba(255, 255, 255, 1)");
                gradient.addColorStop(1, "rgba(255, 255, 255, 0)");

                ctx.lineWidth = 2;
                ctx.strokeStyle = gradient;
                ctx.beginPath();
                ctx.moveTo(this.x, this.y);
                ctx.lineTo(tailX, tailY);
                ctx.stroke();
            }
        }

        for (let i = 0; i < STAR_COUNT; i++) {
            stars.push(new Star());
        }

        let meteor = new ShootingStar();

        // --- ENEMY CLASS (TIE FIGHTER) ---
        class Enemy {
            constructor() {
                this.reset();
            }

            reset() {
                this.x = Math.random() * width;
                this.y = -50;
                this.speed = 2 + Math.random() * 3;
                this.size = 30;
                this.active = true;
                this.xOffset = Math.random() * 100;
            }
            update() {
                if (!this.active)
                    return;

                this.y += this.speed;
                this.x += Math.sin((this.y + this.xOffset) * 0.01) * 2;

                if (this.y > height + 50)
                    this.active = false;
            }

            draw() {
                if (!this.active)
                    return;

                ctx.strokeStyle = "#ff0000";
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.arc(this.x, this.y, 8, 0, Math.PI * 2);
                ctx.moveTo(this.x - 15, this.y - 15);
                ctx.lineTo(this.x - 15, this.y + 15);
                ctx.moveTo(this.x + 15, this.y - 15);
                ctx.lineTo(this.x + 15, this.y + 15);
                ctx.moveTo(this.x - 8, this.y);
                ctx.lineTo(this.x - 15, this.y);
                ctx.moveTo(this.x + 8, this.y);
                ctx.lineTo(this.x + 15, this.y);
                ctx.stroke();
            }
        }

        // --- LASER CLASS ---
        class Laser {
            constructor(x, y) {
                this.x = x;
                this.y = y;
                this.active = true;
            }

            update() {
                this.y -= 15;
                if (this.y < 0)
                    this.active = false;
            }

            draw() {
                ctx.strokeStyle = "#00ff00";
                ctx.lineWidth = 3;
                ctx.shadowBlur = 10;
                ctx.shadowColor = "#00ff00";
                ctx.beginPath();
                ctx.moveTo(this.x, this.y);
                ctx.lineTo(this.x, this.y + 20);
                ctx.stroke();
                ctx.shadowBlur = 0;
            }
        }

        // Loop
        function animate() {
            ctx.clearRect(0, 0, width, height);

            stars.forEach(star => {
                star.update();
                star.draw();
            });

            // GAME LOGIC
            if (gameActive) {
                if (Math.random() < 0.02) {
                    enemies.push(new Enemy());
                }

                // Update Enemies
                enemies.forEach((enemy, index) => {
                    enemy.update();
                    enemy.draw();
                    if (!enemy.active)
                        enemies.splice(index, 1);
                });

                // Update Lasers
                lasers.forEach((laser, lIndex) => {
                    laser.update();
                    laser.draw();

                    if (laser.active) {
                        enemies.forEach((enemy, eIndex) => {
                            if (enemy.active) {
                                const dx = laser.x - enemy.x;
                                const dy = laser.y - enemy.y;

                                if (Math.sqrt(dx * dx + dy * dy) < 20) {
                                    enemy.active = false;
                                    laser.active = false;
                                    score += 100;
                                }
                            }
                        });
                    }

                    if (!laser.active)
                        lasers.splice(lIndex, 1);
                });

                // DRAW SCORE
                ctx.fillStyle = "#ff0000";
                ctx.font = "20px Orbitron";
                ctx.fillText("SCORE: " + score, 20, 40);
                ctx.fillText("SYSTEM: COMBAT SIMULATION", 20, 70);

                // DRAW CROSSHAIR
                ctx.strokeStyle = "rgba(0, 255, 0, 0.5)";
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.arc(mouseX, mouseY, 20, 0, Math.PI * 2);
                ctx.moveTo(mouseX - 25, mouseY);
                ctx.lineTo(mouseX + 25, mouseY);
                ctx.moveTo(mouseX, mouseY - 25);
                ctx.lineTo(mouseX, mouseY + 25);
                ctx.stroke();

            }
            else {
                if (!warpMode) {
                    if (Math.random() > 0.995 && !meteor.active) {
                        meteor.trigger();
                    }

                    meteor.update();
                    meteor.draw();
                }
            }

            requestAnimationFrame(animate);
        }
        animate();

        // --- GAME CONTROLS (Inside Canvas Scope) ---
        window.addEventListener('mousemove', (e) => {
            mouseX = e.clientX;
            mouseY = e.clientY;
        });

        window.addEventListener('mousedown', (e) => {
            if (gameActive) {
                lasers.push(new Laser(mouseX, mouseY));
            }
        });

        // Start Button Logic
        const simBtn = document.getElementById('start-sim-btn');
        if (simBtn) {
            simBtn.addEventListener('click', () => {
                gameActive = !gameActive;
                if (gameActive) {
                    simBtn.querySelector('.btn-content').innerText = "TERMINATE SIMULATION";
                    score = 0;
                    enemies = [];
                    lasers = [];
                }
                else {
                    simBtn.querySelector('.btn-content').innerText = "COMBAT SIMULATION";
                }
            });
        }
    }


    // --- TEXT SCRAMBLE EFFECT ---
    const glitchTargets = document.querySelectorAll('.glitch-text');
    const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

    glitchTargets.forEach(target => {
        target.dataset.value = target.innerText;

        target.onmouseover = event => {
            let iteration = 0;

            const interval = setInterval(() => {

                event.target.innerText = event.target.innerText
                    .split("")
                    .map((letter, index) => {
                        if (index < iteration) {
                            return event.target.dataset.value[index];
                        }

                        return letters[Math.floor(Math.random() * 26)];
                    })
                    .join("");

                if (iteration >= event.target.dataset.value.length) {
                    clearInterval(interval);
                }

                iteration += 1 / 3;
            }, 30);
        }
    });

    // --- SYSTEM STATUS FLICKER ---
    const statusItems = document.querySelectorAll('.status-item');
    setInterval(() => {
        statusItems.forEach(item => {

            if (Math.random() > 0.9) {
                item.style.opacity = (Math.random() * 0.5) + 0.5;
            }
        });
    }, 100);


    // --- UI INTERACTION (SOUND/GLITCH) ---    
    const uiButtons = document.querySelectorAll('.hologram-btn, .nav-item');
    uiButtons.forEach(btn => {

        if (btn.id === 'start-sim-btn')
            return;

        btn.addEventListener('click', () => {

            document.body.style.textShadow = "0 0 5px rgba(255,255,255,0.8)";
            setTimeout(() => {
                document.body.style.textShadow = "none";
            }, 100);

            engageHyperspace();
        });
    });

    // --- HYPERSPACE LOGIC ---
    function engageHyperspace() {
        if (warpMode)
            return;

        warpMode = true;
        speedMultiplier = 2.0;

        let acceleration = setInterval(() => {

            speedMultiplier += 0.5;
            if (speedMultiplier > 5.0)
                clearInterval(acceleration);

        }, 100);

        setTimeout(() => {
            warpMode = false;
            speedMultiplier = 0.05;

            if (canvas) {
                const width = canvas.width;
                const height = canvas.height;
                const centerX = width / 2;
                const centerY = height / 2;

                stars.forEach(star => {

                    const dx = star.x - centerX;
                    const dy = star.y - centerY;
                    const dist = Math.sqrt(dx * dx + dy * dy);

                    if (dist < 250) {
                        star.x = Math.random() * width;
                        star.y = Math.random() * height;
                        star.z = Math.random() * 4;
                    }
                });
            }

        }, 1500);
    }

    // --- HYPERSPACE NAVIGATION ---

    function smoothScrollTo(element, duration) {
        const targetPosition = element.getBoundingClientRect().top + window.pageYOffset;
        const startPosition = window.pageYOffset;
        const distance = targetPosition - startPosition;
        let startTime = null;

        function animation(currentTime) {
            if (startTime === null)
                startTime = currentTime;

            const timeElapsed = currentTime - startTime;
            let run = easeInOutCubic(timeElapsed, startPosition, distance, duration);

            window.scrollTo(0, run);

            if (timeElapsed < duration) {
                requestAnimationFrame(animation);
            }
        }

        function easeInOutCubic(t, b, c, d) {
            t /= d / 2;
            if (t < 1) return c / 2 * t * t * t + b;
            t -= 2;
            return c / 2 * (t * t * t + 2) + b;
        }

        requestAnimationFrame(animation);
    }

    document.querySelectorAll('a').forEach(link => {
        link.addEventListener('click', (e) => {

            const href = link.getAttribute('href');
            if (href.startsWith('#') && href.length > 1) {
                e.preventDefault();

                const targetElement = document.querySelector(href);
                if (targetElement) {
                    engageHyperspace();
                    smoothScrollTo(targetElement, 1500);
                }
            }
            else if (href && !href.startsWith('#')) {
                engageHyperspace();
            }
        });
    });

    // --- 3D HOLOGRAPHIC TILT ---
    const cards = document.querySelectorAll('.hologram-card');
    cards.forEach(card => {
        card.addEventListener('mousemove', (e) => {

            const rect = card.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;

            const xPct = (x / rect.width) - 0.5;
            const yPct = (y / rect.height) - 0.5;

            const rotateX = yPct * -15;
            const rotateY = xPct * 15;

            card.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale(1.02)`;
        });

        card.addEventListener('mouseleave', () => {
            card.style.transform = `perspective(1000px) rotateX(0) rotateY(0) scale(1)`;
        });
    });

    console.log("IMPERIAL DATAPAD SYSTEM v2.5 :: INITIALIZED");
});
