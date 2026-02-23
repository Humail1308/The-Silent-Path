// Global variables
window.playerID = localStorage.getItem('silentPath_id') || 'id_' + Math.random().toString(36).substr(2, 9);
localStorage.setItem('silentPath_id', window.playerID);

window.playerName = localStorage.getItem('silentPath_name') || "Anonymous Knight";
window.userWallet = localStorage.getItem('silentPath_wallet') || null; 
window.personalBest = parseInt(localStorage.getItem('silentPath_pb')) || 0; 

// --- TOTAL ORBS TRACKING (Saved in LocalStorage) ---
window.totalOrbs = parseInt(localStorage.getItem('silentPath_orbs')) || 0;

// --- DISCORD AUTH GLOBALS ---
window.isLoggedIn = false;
window.mongoId = null; // To link socket with DB

// Global Music Reference
window.currentMusic = null;

// --- HELPER FUNCTION: HTML BACKGROUND VIDEO (HD Quality Fix) ---
function manageBgVideo(action) {
    const vidId = 'bg-cinematic-video';
    let vidElement = document.getElementById(vidId);

    if (action === 'play') {
        if (!vidElement) {
            vidElement = document.createElement('video');
            vidElement.id = vidId;
            vidElement.src = 'assets/menu_cinematic.mp4?v=2';
            vidElement.autoplay = true;
            vidElement.loop = true;
            vidElement.muted = true; // Muted visual only (Music handles audio)
            vidElement.playsInline = true;
            
            // CSS to make it Full Screen HD Background
            Object.assign(vidElement.style, {
                position: 'fixed',
                top: '50%',
                left: '50%',
                minWidth: '100%',
                minHeight: '100%',
                width: 'auto',
                height: 'auto',
                zIndex: '-1', // Behind the game
                transform: 'translate(-50%, -50%)',
                objectFit: 'cover'
            });
            
            document.body.appendChild(vidElement);
        }
        vidElement.play().catch(e => console.log("Video autoplay blocked:", e));
    } else if (action === 'stop') {
        if (vidElement) {
            vidElement.remove();
        }
    }
}

// --- 1. MAIN MENU SCENE ---
class MainMenu extends Phaser.Scene {
    constructor() { super("MainMenu"); }
    preload() {
        this.load.audio("menuMusic", "assets/music.mp3");
        this.load.audio("buttonSound", "assets/button.mp3");
        
        // UI Assets
        this.load.image("parchment", "assets/parchment.png");
        this.load.image("outfitOrange", "assets/outfit_orange.png");
        this.load.image("outfitShadow", "assets/outfit_shadow.png");
        this.load.image("outfitGhost", "assets/outfit_ghost.png");
        this.load.image("thumbLevel1", "assets/city_bg.png"); 
    }
    create() {
        // --- START HTML BACKGROUND VIDEO ---
        manageBgVideo('play');

        // --- MUSIC LOGIC ---
        this.sound.stopAll(); 
        if (!this.sound.get("menuMusic")) {
            this.music = this.sound.add("menuMusic", { loop: true, volume: 0.3 });
            this.music.play();
        } else {
            this.music = this.sound.add("menuMusic", { loop: true, volume: 0.3 });
            this.music.play();
        }

        // --- TITLE WITH PARCHMENT SCROLL ---
        this.add.image(400, 70, "parchment")
            .setDisplaySize(650, 100)
            .setAlpha(1);

        this.add.text(400, 70, "THE SILENT PATH", {
            fontSize: "60px", 
            fill: "#4a2c0a",
            fontFamily: "'MedievalSharp'", 
            fontWeight: 'bold',
            resolution: 2 // Sharp Text
        }).setOrigin(0.5);

        // --- AUTH: CHECK LOGIN STATUS ---
        this.checkLoginStatus();

        // --- AUTH LISTENER (Pop-up se message sunne ke liye) ---
        window.addEventListener('message', (event) => {
            if (event.data.type === 'AUTH_SUCCESS') {
                this.handleAuthSuccess(event.data.user);
            }
        });

        // --- CUSTOM BUTTON CREATOR FUNCTION ---
        const createParchmentButton = (x, y, text, callback, width = 320) => {
            let container = this.add.container(x, y);

            let bg = this.add.image(0, 0, "parchment")
                .setDisplaySize(width, 55)
                .setInteractive({ useHandCursor: true });

            let txt = this.add.text(0, 0, text, {
                fontSize: '24px',
                fill: '#4a2c0a',
                fontFamily: "'MedievalSharp'",
                fontWeight: 'bold',
                resolution: 2
            }).setOrigin(0.5);

            container.add([bg, txt]);

            bg.on('pointerover', () => {
                if (this.isPopupOpen()) return;
                bg.setTint(0xffeedd); 
                container.setScale(1.05);
                txt.setStyle({ fill: '#DAA520', stroke: '#000', strokeThickness: 1 });
            });

            bg.on('pointerout', () => {
                bg.clearTint();
                container.setScale(1);
                txt.setStyle({ fill: '#4a2c0a', strokeThickness: 0 }); 
            });

            bg.on('pointerdown', () => {
                if (this.isPopupOpen()) return;
                this.sound.play("buttonSound");
                container.setScale(0.95);
                if (callback) callback();
            });

            bg.on('pointerup', () => { container.setScale(1.05); });
        };

        // --- MENU BUTTONS ---
        createParchmentButton(400, 160, "START GAME", () => {
            // Check auth before starting
            if (!window.isLoggedIn) {
                alert("Please Connect Discord Account first in Settings!");
                this.showSettings();
                return;
            }
            this.sound.stopAll(); // Stop Menu Music
            manageBgVideo('stop'); // Stop HTML Video
            this.scene.start("GameScene", { meters: 0, orbs: 0 });
        });

        createParchmentButton(400, 225, "SETTINGS", () => {
            this.showSettings();
        });

        createParchmentButton(400, 290, "THE SILENT ARMORY", () => {
            this.showShop();
        });

        createParchmentButton(400, 355, "WORLD MAPS", () => {
            this.showMaps();
        });

        // Leaderboard Icon
        let lbContainer = this.add.container(750, 400);
        let lbBg = this.add.image(0, 0, "parchment").setDisplaySize(70, 70).setInteractive({ useHandCursor: true });
        let lbIcon = this.add.text(0, 0, "🏆", { fontSize: '40px', resolution: 2 }).setOrigin(0.5);
        
        lbContainer.add([lbBg, lbIcon]);

        lbBg.on('pointerover', () => { if(this.isPopupOpen()) return; lbContainer.setScale(1.1); });
        lbBg.on('pointerout', () => { lbContainer.setScale(1); });
        lbBg.on('pointerdown', () => { 
            if(this.isPopupOpen()) return;
            this.sound.play("buttonSound");
            this.showLeaderboard(); 
        });

        // --- POPUP CONTAINERS INIT ---
        this.createPopupContainers();
    }

    // --- AUTH HELPER FUNCTIONS ---
    checkLoginStatus() {
        fetch('/auth/user').then(res => res.json()).then(user => {
            if(user) this.handleAuthSuccess(user);
        }).catch(err => console.log("Not logged in"));
    }

    handleAuthSuccess(user) {
        window.isLoggedIn = true;
        window.mongoId = user._id; 
        window.playerName = user.username;
        window.totalOrbs = user.totalOrbs;
        window.personalBest = user.score;
        window.userWallet = user.wallet;
        
        // Refresh Settings UI if open
        if (this.settingsPopup && this.settingsPopup.visible) {
            this.showSettings(); 
        }
        console.log("Logged in as:", window.playerName);
    }

    // --- NEW: DISCONNECT DISCORD ---
    disconnectDiscord() {
        // Ping server to destroy session
        fetch('/auth/logout').then(() => {
            window.isLoggedIn = false;
            window.mongoId = null;
            window.playerName = "Anonymous Knight";
            window.personalBest = 0;
            // Optionally reset orbs to local, but setting to 0 ensures clean slate
            window.totalOrbs = parseInt(localStorage.getItem('silentPath_orbs')) || 0;
            
            console.log("Disconnected Discord Account.");
            this.showSettings(); // Refresh UI
        }).catch(err => console.log(err));
    }

    createPopupContainers() {
        const createOverlay = () => this.add.rectangle(400, 225, 800, 450, 0x000000, 0.5).setInteractive();

        this.settingsPopup = this.add.container(0, 0).setVisible(false).setDepth(40);
        this.setList = this.add.container(400, 225); 
        this.settingsPopup.add([createOverlay(), this.setList]);

        this.shopPopup = this.add.container(0, 0).setVisible(false).setDepth(50);
        this.shopList = this.add.container(400, 225);
        this.shopPopup.add([createOverlay(), this.shopList]);

        this.mapsPopup = this.add.container(0, 0).setVisible(false).setDepth(60);
        this.mapsList = this.add.container(400, 225);
        this.mapsPopup.add([createOverlay(), this.mapsList]);

        this.lbPopup = this.add.container(0, 0).setVisible(false).setDepth(30);
        this.lbList = this.add.container(400, 235); 
        this.lbPopup.add([this.add.rectangle(400, 225, 800, 450, 0x000000, 0.1).setInteractive(), this.lbList]);
    }

    isPopupOpen() {
        return (this.lbPopup.visible || this.settingsPopup.visible || this.shopPopup.visible || this.mapsPopup.visible);
    }

    updateWalletButtonText() {
        if (this.walletText) {
            if (window.userWallet) {
                this.walletText.setText(`WALLET: ${window.userWallet.substring(0,6)}...`);
            } else {
                this.walletText.setText("CONNECT PHANTOM");
            }
        }
    }

    showSettings() {
        this.settingsPopup.setVisible(true);
        this.setList.removeAll(true);
        this.setList.setScale(0.5);
        this.setList.setAlpha(0);

        let scrollBg = this.add.image(0, 0, "parchment").setDisplaySize(500, 420);
        this.setList.add(scrollBg);

        let setTitle = this.add.text(0, -150, "SETTINGS", { fontSize: '30px', fill: '#4a2c0a', fontFamily: "'MedievalSharp'", fontWeight: 'bold', resolution: 2 }).setOrigin(0.5);
        
        this.soundStatus = this.add.text(0, -90, this.sound.mute ? "SOUND: OFF" : "SOUND: ON", { fontSize: '22px', fill: '#2e1a05', fontFamily: "'MedievalSharp'", fontWeight: 'bold', resolution: 2 }).setOrigin(0.5).setInteractive({ useHandCursor: true });
        this.soundStatus.on('pointerdown', () => {
            this.sound.play("buttonSound");
            this.sound.mute = !this.sound.mute;
            this.soundStatus.setText(this.sound.mute ? "SOUND: OFF" : "SOUND: ON");
        });

        // --- DISCORD CONNECTION BUTTON ---
        let discordStatusText = window.isLoggedIn ? `CONNECTED: ${window.playerName}` : "CONNECT DISCORD";
        let discordColor = window.isLoggedIn ? '#00aa00' : '#5865F2'; 
        
        // Adjusted Y position to make room for disconnect
        let discordBtn = this.add.text(0, -35, discordStatusText, { fontSize: '20px', fill: '#ffffff', backgroundColor: discordColor, padding: 8, fontFamily: "'MedievalSharp'", resolution: 2 }).setInteractive({ useHandCursor: true }).setOrigin(0.5);
        
        discordBtn.on('pointerdown', () => {
            if (!window.isLoggedIn) {
                this.sound.play("buttonSound");
                window.open('/auth/discord', 'discord_auth_popup', 'width=500,height=700');
            }
        });
        
        this.setList.add([setTitle, this.soundStatus, discordBtn]);

        // --- NEW: DISCONNECT BUTTON (Only shows if logged in) ---
        if (window.isLoggedIn) {
            let disconnectBtn = this.add.text(0, 5, "DISCONNECT ACCOUNT", { fontSize: '14px', fill: '#ff4444', fontFamily: "'MedievalSharp'", stroke: '#000', strokeThickness: 1, resolution: 2 }).setInteractive({ useHandCursor: true }).setOrigin(0.5);
            
            disconnectBtn.on('pointerover', () => disconnectBtn.setScale(1.05));
            disconnectBtn.on('pointerout', () => disconnectBtn.setScale(1));
            disconnectBtn.on('pointerdown', () => {
                this.sound.play("buttonSound");
                this.disconnectDiscord();
            });
            this.setList.add(disconnectBtn);
        }

        // Adjusted Y position for wallet
        this.walletText = this.add.text(0, 50, "", { fontSize: '18px', fill: '#ffffff', backgroundColor: '#9945FF', padding: 8, fontFamily: "'MedievalSharp'", resolution: 2 }).setInteractive({ useHandCursor: true }).setOrigin(0.5).on('pointerdown', () => { this.sound.play("buttonSound"); this.connectWallet(); });
        this.updateWalletButtonText();

        let setBack = this.add.text(0, 150, "CLOSE", { fontSize: '24px', fill: '#ff4444', fontFamily: "'MedievalSharp'", stroke: '#000', strokeThickness: 2, resolution: 2 }).setOrigin(0.5).setInteractive({ useHandCursor: true }).on('pointerdown', () => {
              this.sound.play("buttonSound");
              this.tweens.add({ targets: this.setList, scale: 0.7, alpha: 0, duration: 400, ease: 'Cubic.easeIn', onComplete: () => this.settingsPopup.setVisible(false) });
          });
          
        this.setList.add([this.walletText, setBack]);
        this.tweens.add({ targets: this.setList, scale: 1, alpha: 1, duration: 800, ease: 'Cubic.easeOut' });
    }

    // --- SHOP LOGIC ---
    showShop() {
        this.shopPopup.setVisible(true);
        this.shopList.removeAll(true);
        this.shopList.setScale(0.5);
        this.shopList.setAlpha(0);

        let scrollBg = this.add.image(0, 0, "parchment").setDisplaySize(550, 420);
        this.shopList.add(scrollBg);

        let shopTitle = this.add.text(0, -150, "THE SILENT ARMORY", { fontSize: '30px', fill: '#4a2c0a', fontFamily: "'MedievalSharp'", fontWeight: 'bold', resolution: 2 }).setOrigin(0.5);
        
        let orbDisplay = this.add.text(0, -115, `🔮 ORBS: ${window.totalOrbs}`, { 
            fontSize: '20px', fill: '#4b0082', fontFamily: "'MedievalSharp'", fontWeight: 'bold', resolution: 2 
        }).setOrigin(0.5);
        
        this.shopList.add([shopTitle, orbDisplay]);

        const outfits = [
            { key: "outfitOrange", name: "ORANGE HOODIE\n(EQUIPPED)", tint: 0xffffff, alpha: 1 },
            { key: "outfitShadow", name: "SHADOW SHROUD\n(Coming Soon)", tint: 0x111111, alpha: 0.9 },
            { key: "outfitGhost", name: "GHOST ARMOR\n(Coming Soon)", tint: 0x111111, alpha: 0.9 }
        ];
        
        let currentIndex = 0;
        const sliderContainer = this.add.container(0, 0);
        this.shopList.add(sliderContainer);

        const updateOutfitView = (index, direction) => {
            sliderContainer.removeAll(true);
            let outfit = outfits[index];
            let outfitImg = this.add.image(0, -20, outfit.key).setScale(0.3).setTint(outfit.tint).setAlpha(outfit.alpha);
            let outfitTxt = this.add.text(0, 70, outfit.name, { fontSize: '20px', fill: '#2e1a05', fontFamily: "'MedievalSharp'", fontWeight: 'bold', align: 'center', resolution: 2 }).setOrigin(0.5);
            sliderContainer.add([outfitImg, outfitTxt]);
            sliderContainer.x = direction === 'right' ? 100 : -100;
            sliderContainer.alpha = 0;
            this.tweens.add({ targets: sliderContainer, x: 0, alpha: 1, duration: 300, ease: 'Power2' });
            leftArrow.setVisible(index > 0);
            rightArrow.setVisible(index < outfits.length - 1);
        };

        let arrowStyle = { fontSize: '50px', fill: '#4a2c0a', fontFamily: 'serif', fontWeight: 'bold', resolution: 2 };
        let leftArrow = this.add.text(-220, 0, "◀", arrowStyle).setOrigin(0.5).setInteractive({ useHandCursor: true });
        let rightArrow = this.add.text(220, 0, "▶", arrowStyle).setOrigin(0.5).setInteractive({ useHandCursor: true });

        leftArrow.on('pointerdown', () => { if (currentIndex > 0) { this.sound.play("buttonSound"); currentIndex--; updateOutfitView(currentIndex, 'left'); } });
        rightArrow.on('pointerdown', () => { if (currentIndex < outfits.length - 1) { this.sound.play("buttonSound"); currentIndex++; updateOutfitView(currentIndex, 'right'); } });

        this.shopList.add([leftArrow, rightArrow]);
        let shopBack = this.add.text(0, 160, "CLOSE", { fontSize: '24px', fill: '#ff4444', fontFamily: "'MedievalSharp'", stroke: '#000', strokeThickness: 2, resolution: 2 }).setOrigin(0.5).setInteractive({ useHandCursor: true }).on('pointerdown', () => {
            this.sound.play("buttonSound");
            this.tweens.add({ targets: this.shopList, scale: 0.7, alpha: 0, duration: 400, ease: 'Cubic.easeIn', onComplete: () => this.shopPopup.setVisible(false) });
        });
        this.shopList.add(shopBack);
        updateOutfitView(0, 'right');
        this.tweens.add({ targets: this.shopList, scale: 1, alpha: 1, duration: 800, ease: 'Cubic.easeOut' });
    }

    // --- MAPS LOGIC ---
    showMaps() {
        this.mapsPopup.setVisible(true);
        this.mapsList.removeAll(true);
        this.mapsList.setScale(0.5);
        this.mapsList.setAlpha(0);

        let scrollBg = this.add.image(0, 0, "parchment").setDisplaySize(600, 450);
        this.mapsList.add(scrollBg);

        let mapTitle = this.add.text(0, -160, "THE KNOWN LANDS", { fontSize: '32px', fill: '#4a2c0a', fontFamily: "'MedievalSharp'", fontWeight: 'bold', resolution: 2 }).setOrigin(0.5);
        
        let orbDisplay = this.add.text(0, -125, `🔮 ORBS: ${window.totalOrbs}`, { 
            fontSize: '20px', fill: '#4b0082', fontFamily: "'MedievalSharp'", fontWeight: 'bold', resolution: 2 
        }).setOrigin(0.5);

        this.mapsList.add([mapTitle, orbDisplay]);

        const levels = [
            { id: 1, name: "THE SILENT ASCENT", img: "thumbLevel1", locked: false },
            { id: 2, name: "COMING SOON", img: "thumbLevel1", locked: true },
            { id: 3, name: "COMING SOON", img: "thumbLevel1", locked: true }
        ];

        let currentIndex = 0;
        const sliderContainer = this.add.container(0, 0);
        this.mapsList.add(sliderContainer);

        const updateLevelView = (index, direction) => {
            sliderContainer.removeAll(true);
            let lvl = levels[index];

            let frame = this.add.graphics();
            frame.lineStyle(4, 0x4a2c0a);
            frame.strokeRect(-120, -70, 240, 140);
            
            let levelImg = this.add.image(0, 0, lvl.img).setDisplaySize(232, 132);
            
            if (lvl.locked) {
                levelImg.setTint(0x000000);
                let lockText = this.add.text(0, 0, "🔒 LOCKED", { fontSize: '28px', fill: '#888', fontFamily: "'MedievalSharp'", fontWeight: 'bold', resolution: 2 }).setOrigin(0.5);
                sliderContainer.add([levelImg, frame, lockText]);
            } else {
                levelImg.clearTint();
                let playTag = this.add.text(0, 0, "▶ PLAY", { fontSize: '24px', fill: '#fff', stroke: '#000', strokeThickness: 4, fontFamily: "'MedievalSharp'", resolution: 2 }).setOrigin(0.5).setAlpha(0.8);
                sliderContainer.add([levelImg, frame, playTag]);
                
                levelImg.setInteractive({ useHandCursor: true }).on('pointerdown', () => {
                    this.sound.play("buttonSound");
                    this.sound.stopAll(); // STOP MENU MUSIC
                    manageBgVideo('stop'); // STOP HTML VIDEO
                    this.scene.start("GameScene", { level: lvl.id });
                });
            }

            let nameTxt = this.add.text(0, 90, lvl.name, { fontSize: '24px', fill: '#2e1a05', fontFamily: "'MedievalSharp'", fontWeight: 'bold', resolution: 2 }).setOrigin(0.5);
            sliderContainer.add(nameTxt);

            sliderContainer.x = direction === 'right' ? 100 : -100;
            sliderContainer.alpha = 0;
            this.tweens.add({ targets: sliderContainer, x: 0, alpha: 1, duration: 300, ease: 'Power2' });

            leftArrow.setVisible(index > 0);
            rightArrow.setVisible(index < levels.length - 1);
        };

        let arrowStyle = { fontSize: '60px', fill: '#4a2c0a', fontFamily: 'serif', fontWeight: 'bold', resolution: 2 };
        let leftArrow = this.add.text(-240, 0, "◀", arrowStyle).setOrigin(0.5).setInteractive({ useHandCursor: true });
        let rightArrow = this.add.text(240, 0, "▶", arrowStyle).setOrigin(0.5).setInteractive({ useHandCursor: true });

        leftArrow.on('pointerdown', () => { if (currentIndex > 0) { this.sound.play("buttonSound"); currentIndex--; updateLevelView(currentIndex, 'left'); } });
        rightArrow.on('pointerdown', () => { if (currentIndex < levels.length - 1) { this.sound.play("buttonSound"); currentIndex++; updateLevelView(currentIndex, 'right'); } });

        this.mapsList.add([leftArrow, rightArrow]);

        let closeBtn = this.add.text(0, 160, "CLOSE", { fontSize: '24px', fill: '#ff4444', fontFamily: "'MedievalSharp'", stroke: '#000', strokeThickness: 2, resolution: 2 }).setOrigin(0.5).setInteractive({ useHandCursor: true }).on('pointerdown', () => {
            this.sound.play("buttonSound");
            this.tweens.add({ targets: this.mapsList, scale: 0.7, alpha: 0, duration: 400, ease: 'Cubic.easeIn', onComplete: () => this.mapsPopup.setVisible(false) });
        });
        this.mapsList.add(closeBtn);

        updateLevelView(0, 'right');
        this.tweens.add({ targets: this.mapsList, scale: 1, alpha: 1, duration: 800, ease: 'Cubic.easeOut' });
    }

    // --- LEADERBOARD LOGIC ---
    showLeaderboard() {
        this.input.setTopOnly(true);
        this.lbPopup.setVisible(true);
        this.lbList.removeAll(true);
        this.lbList.setScale(0.5);
        this.lbList.setAlpha(0);

        let scrollBg = this.add.image(0, 0, "parchment").setDisplaySize(620, 420);
        this.lbList.add(scrollBg);

        let lbTitle = this.add.text(0, -160, "TOP CRUSADERS", { fontSize: '34px', fill: '#4a2c0a', fontFamily: "'MedievalSharp'", fontWeight: 'bold', resolution: 2 }).setOrigin(0.5);
        this.lbList.add(lbTitle);

        const headerStyle = { fontSize: '18px', fill: '#4a2c0a', fontFamily: "'MedievalSharp'", fontWeight: 'bold', resolution: 2 };
        this.lbList.add(this.add.text(-185, -110, "RANK", headerStyle).setOrigin(0.5));
        this.lbList.add(this.add.text(-115, -110, "CRUSADER", headerStyle).setOrigin(0, 0.5));
        this.lbList.add(this.add.text(65, -110, "DISTANCE", headerStyle).setOrigin(1, 0.5));
        this.lbList.add(this.add.text(110, -110, "SEAL", headerStyle).setOrigin(0, 0.5));

        let line = this.add.graphics();
        line.lineStyle(2, 0x4a2c0a, 0.4);
        line.lineBetween(-200, -90, 205, -90);
        this.lbList.add(line);

        let lbClose = this.add.text(0, 160, "CLOSE", { fontSize: '24px', fill: '#ff4444', fontFamily: "'MedievalSharp'", stroke: '#000', strokeThickness: 3, resolution: 2 }).setOrigin(0.5).setInteractive({ useHandCursor: true }).on('pointerdown', () => { 
            this.sound.play("buttonSound");
            this.tweens.add({ targets: this.lbList, scale: 0.7, alpha: 0, duration: 400, ease: 'Cubic.easeIn', onComplete: () => { this.lbPopup.setVisible(false); } });
        });
        this.lbList.add(lbClose);

        this.tweens.add({ targets: this.lbList, scale: 1, alpha: 1, duration: 800, ease: 'Cubic.easeOut' });

        if(typeof io !== 'undefined') {
            const tempSocket = io();
            tempSocket.emit('getLeaderboard');
            tempSocket.once('leaderboardUpdate', (data) => {
                data.forEach((entry, i) => {
                    let y = i * 32 - 60; 
                    let rowStyle = { fontSize: '16px', fill: '#2e1a05', fontFamily: "'MedievalSharp'", fontWeight: 'bold', resolution: 2 };
                    this.lbList.add(this.add.text(-185, y, `${i+1}`, rowStyle).setOrigin(0.5));
                    let displayName = entry.name ? entry.name : entry.username;
                    if(displayName.length > 10) displayName = displayName.substring(0, 9) + "..";
                    this.lbList.add(this.add.text(-115, y, displayName, rowStyle).setOrigin(0, 0.5));
                    this.lbList.add(this.add.text(55, y, `${entry.score}m`, rowStyle).setOrigin(1, 0.5));
                    let walletShort = entry.wallet ? `${entry.wallet.substring(0, 4)}...${entry.wallet.substring(entry.wallet.length-4)}` : "NONE";
                    this.lbList.add(this.add.text(110, y, walletShort, { fontSize: '11px', fill: '#4b0082', fontFamily: 'monospace', resolution: 2 }).setOrigin(0, 0.5));
                });
                tempSocket.disconnect();
            });
        }
    }

    async connectWallet() {
        if (window.solana && window.solana.isPhantom) {
            try {
                if (window.solana.isConnected) { await window.solana.disconnect(); }
                const resp = await window.solana.connect();
                window.userWallet = resp.publicKey.toString();
                localStorage.setItem('silentPath_wallet', window.userWallet);
                this.updateWalletButtonText();
                alert("Wallet connected!");
            } catch (err) { console.log("Cancelled"); }
        } else { alert("Phantom Wallet not found!"); }
    }
}

// --- 2. GAME SCENE ---
class GameScene extends Phaser.Scene {
    constructor() { super("GameScene"); }
    init(data) { 
        this.meters = 0; 
        this.orbScore = 0; 
        this.isGameOver = false; 
        this.isPaused = false;
        this.currentLevel = data.level || 1;
    }
    preload() {
        this.load.spritesheet("playerRun", "assets/player_run.png", { frameWidth: 336, frameHeight: 543 });
        this.load.image("ground", "assets/ground.png"); 
        this.load.image("city", "assets/city_bg.png");
        this.load.image("barrel", "assets/barrel.png");
        this.load.image("orb", "assets/orb.png");
        this.load.audio("jumpSound", "assets/jump.mp3");
        this.load.audio("deathSound", "assets/death.mp3");
        this.load.audio("collectSound", "assets/collect.mp3");
        this.load.audio("btnClick", "assets/button.mp3");
        this.load.audio("level1Music", "assets/level1_music.mp3");
    }
    create() {
        manageBgVideo('stop');
        if (this.currentLevel === 1) {
            this.sound.stopAll();
            this.bgMusic = this.sound.add("level1Music", { loop: true, volume: 0.3 });
            this.bgMusic.play();
            window.currentMusic = this.bgMusic;
        }

        if (this.socket) { this.socket.disconnect(); }
        this.socket = io(); 
        
        // --- NEW: LINK SOCKET TO DISCORD USER ---
        if (window.isLoggedIn && window.mongoId) {
            this.socket.emit('linkDiscordSession', window.mongoId);
        }
        
        this.socket.emit('requestRestart');

        this.socket.on('serverUpdate', (data) => {
            if (!this.isGameOver && !this.isPaused) {
                this.meters = data.distance;
                this.orbScore = data.score;
                this.distanceText.setText(`Distance: ${this.meters}m`);
                this.scoreText.setText(`Orbs: ${this.orbScore}`);
            }
        });

        this.socket.on('syncData', (data) => {
            window.totalOrbs = data.totalOrbs;
            localStorage.setItem('silentPath_orbs', window.totalOrbs);
        });

        this.socket.on('spawnObstacle', (data) => {
            if (this.isGameOver || this.isPaused) return;
            let obstacleSpeed = data.speed || 400;
            if (data.type === 'barrel') {
                let barrel = this.obstacles.create(850, 425, "barrel");
                barrel.setOrigin(0.5, 1).setDisplaySize(65, 80).setVelocityX(-obstacleSpeed).body.setAllowGravity(false);
                barrel.setDepth(1).body.setSize(barrel.width * 0.7, barrel.height * 0.8);
            } else {
                let yPos = Math.random() > 0.5 ? 220 : 340; 
                let orb = this.orbs.create(850, yPos, "orb");
                orb.setDisplaySize(45, 45).setVelocityX(-obstacleSpeed).body.setAllowGravity(false);
                orb.setOrigin(0.5, 0.5).setDepth(1);
            }
        });

        this.bg = this.add.tileSprite(400, 260, 800, 450, "city").setScrollFactor(0).setDisplaySize(800, 450).setDepth(0);
        this.ground = this.add.tileSprite(400, 450, 800, 314, "ground").setOrigin(0.5, 1);
        this.ground.setDisplaySize(800, 140).setDepth(1); 
        this.physics.add.existing(this.ground, true);
        this.ground.body.setSize(800, 30).setOffset(0, 110); 

        this.player = this.physics.add.sprite(150, 400, "playerRun").setOrigin(0.5, 1).setDisplaySize(90, 130).setDepth(2);
        this.player.body.setSize(160, 450).setOffset(90, 40);

        if(!this.anims.exists('run')) {
            this.anims.create({ key: 'run', frames: this.anims.generateFrameNumbers('playerRun', { start: 0, end: 3 }), frameRate: 12, repeat: -1 });
        }
        this.player.play('run');

        this.obstacles = this.physics.add.group();
        this.orbs = this.physics.add.group();

        const uiStyle = { fontSize: '24px', fill: '#fff', stroke: '#000', strokeThickness: 3, fontFamily: "'MedievalSharp'", resolution: 2 };
        this.distanceText = this.add.text(20, 20, `Distance: 0m`, uiStyle);
        this.scoreText = this.add.text(20, 55, `Orbs: 0`, { ...uiStyle, fill: '#DAA520' });

        this.pauseBtn = this.add.text(760, 20, "⏸", { fontSize: '40px', fill: '#fff', resolution: 2 })
            .setOrigin(0.5).setInteractive({ useHandCursor: true }).setDepth(100)
            .on('pointerdown', () => this.togglePause());

        this.physics.add.collider(this.player, this.ground);
        this.physics.add.overlap(this.player, this.obstacles, this.hitObstacle, null, this);
        this.physics.add.overlap(this.player, this.orbs, this.collectOrb, null, this);
        this.cursors = this.input.keyboard.createCursorKeys();

        this.input.on('pointerdown', () => { if (!this.isPaused && !this.isGameOver) this.jump(); });

        this.createPauseMenu();
        this.playLevelAnimation(1, "THE SILENT ASCENT");
    }

    playLevelAnimation(levelNum, levelName) {
        this.currentLevel = levelNum;
        this.levelTransitioning = true;
        let levelContainer = this.add.container(400, 225).setDepth(1000);
        let blackBar = this.add.rectangle(0, 0, 800, 120, 0x000000, 0.7).setScale(1, 0);
        let txt1 = this.add.text(0, -25, `LEVEL ${levelNum}`, { fontSize: '22px', fill: '#DAA520', fontFamily: "'MedievalSharp'", resolution: 2 }).setOrigin(0.5).setAlpha(0);
        let txt2 = this.add.text(0, 20, levelName, { fontSize: '45px', fill: '#ffffff', fontFamily: "'MedievalSharp'", fontWeight: 'bold', resolution: 2 }).setOrigin(0.5).setAlpha(0);
        levelContainer.add([blackBar, txt1, txt2]);
        this.tweens.add({ targets: blackBar, scaleY: 1, duration: 500, ease: 'Power2' });
        this.tweens.add({ targets: [txt1, txt2], alpha: 1, duration: 800, delay: 500 });
        this.time.delayedCall(3000, () => {
            this.tweens.add({ targets: levelContainer, alpha: 0, duration: 1000, onComplete: () => { levelContainer.destroy(); } });
        });
    }

    jump() {
        if (this.player.body.touching.down) {
            this.player.setVelocityY(-850); 
            this.sound.play("jumpSound", {volume: 0.3});
            this.socket.emit('jumpAction');
        }
    }

    createPauseMenu() {
        this.pauseOverlay = this.add.rectangle(400, 225, 800, 450, 0x000000, 0.5).setDepth(199).setVisible(false).setAlpha(0).setInteractive(); 
        this.pauseMenu = this.add.container(400, 225).setDepth(200).setVisible(false).setScale(0.5).setAlpha(0);
        let scrollBg = this.add.image(0, 0, "parchment").setDisplaySize(450, 410);
        let title = this.add.text(0, -110, "CRUSADE PAUSED", { fontSize: '32px', fill: '#4a2c0a', fontFamily: "'MedievalSharp'", fontWeight: 'bold', resolution: 2 }).setOrigin(0.5);
        const btnStyle = { fontSize: '22px', fill: '#2e1a05', fontFamily: "'MedievalSharp'", fontWeight: 'bold', padding: 10, resolution: 2 };
        const addHoverEffect = (btn) => { btn.on('pointerover', () => { btn.setStyle({ fill: '#DAA520' }); btn.setScale(1.1); }); btn.on('pointerout', () => { btn.setStyle({ fill: '#2e1a05' }); btn.setScale(1.0); }); };
        let resumeBtn = this.add.text(0, -30, "CONTINUE", btnStyle).setOrigin(0.5).setInteractive({ useHandCursor: true }).on('pointerdown', () => { this.sound.play("btnClick"); this.togglePause(); }); addHoverEffect(resumeBtn);
        
        let restartBtn = this.add.text(0, 30, "RESTART", btnStyle).setOrigin(0.5).setInteractive({ useHandCursor: true }).on('pointerdown', () => { 
            this.sound.play("btnClick"); 
            this.sound.stopAll(); 
            this.socket.emit('requestRestart'); 
            this.scene.restart(); 
        }); addHoverEffect(restartBtn);
        
        let menuBtn = this.add.text(0, 90, "MAIN MENU", btnStyle).setOrigin(0.5).setInteractive({ useHandCursor: true }).on('pointerdown', () => { 
            this.sound.play("btnClick"); 
            this.socket.emit('playerDied'); 
            this.sound.stopAll(); 
            this.scene.start("MainMenu"); 
        }); addHoverEffect(menuBtn);
        
        this.pauseMenu.add([scrollBg, title, resumeBtn, restartBtn, menuBtn]);
    }

    togglePause() {
        if (this.isGameOver) return;
        this.isPaused = !this.isPaused;
        if (this.isPaused) {
            this.physics.pause(); 
            this.player.anims.pause();
            this.socket.emit('pauseGame'); 
            this.pauseOverlay.setVisible(true); this.tweens.add({ targets: this.pauseOverlay, alpha: 1, duration: 300 });
            this.pauseMenu.setVisible(true); this.tweens.add({ targets: this.pauseMenu, scale: 1, alpha: 1, duration: 500, ease: 'Cubic.easeOut' });
        } else {
            this.socket.emit('resumeGame');
            this.tweens.add({ targets: this.pauseOverlay, alpha: 0, duration: 300, onComplete: () => this.pauseOverlay.setVisible(false) });
            this.tweens.add({ targets: this.pauseMenu, scale: 0.7, alpha: 0, duration: 300, ease: 'Cubic.easeIn', onComplete: () => { this.pauseMenu.setVisible(false); this.physics.resume(); this.player.anims.resume(); } });
        }
    }

    update() {
        if (this.isGameOver || this.isPaused) return;
        let currentScroll = 4 + (this.meters / 1000);
        this.bg.tilePositionX += currentScroll; this.ground.tilePositionX += currentScroll;
        let onGround = this.player.body.touching.down;
        if (Phaser.Input.Keyboard.JustDown(this.cursors.up)) { this.jump(); }
        if (!onGround) { this.player.anims.stop(); this.player.setFrame(1); } else if (!this.player.anims.isPlaying) { this.player.play('run'); }
        this.obstacles.getChildren().forEach(obs => { if(obs.x < -100) obs.destroy(); });
        this.orbs.getChildren().forEach(orb => { if(orb.x < -100) orb.destroy(); });
    }

    collectOrb(player, orb) {
        orb.destroy();
        this.sound.play("collectSound", {volume: 0.4});
        window.totalOrbs += 10;
        localStorage.setItem('silentPath_orbs', window.totalOrbs);
        this.socket.emit('orbCollected'); 
    }

    hitObstacle() {
        if (this.isGameOver) return;
        this.isGameOver = true;
        
        // --- SAVE SCORE WITH WALLET INFO ---
        this.socket.emit('saveLeaderboardScore', { wallet: window.userWallet });
        this.socket.emit('playerDied'); 
        
        this.physics.pause(); this.sound.play("deathSound", {volume: 0.2});
        this.player.setTint(0xff0000); this.player.anims.stop(); this.showGameOverScreen();
    }

    showGameOverScreen() {
        this.add.rectangle(400, 225, 800, 450, 0x000000, 0.6).setDepth(10).setInteractive();
        let goContainer = this.add.container(400, 225).setDepth(11).setScale(0.5).setAlpha(0);

        let scrollBg = this.add.image(0, 0, "parchment").setDisplaySize(480, 460);
        let title = this.add.text(0, -150, "CRUSADE ENDED", { fontSize: '38px', fill: '#4a2c0a', fontFamily: "'MedievalSharp'", fontWeight: 'bold', resolution: 2 }).setOrigin(0.5);
        let scoreResult = this.add.text(0, -100, `${this.meters} METERS`, { fontSize: '32px', fill: '#DAA520', fontFamily: "'MedievalSharp'", fontWeight: 'bold', stroke: '#000', strokeThickness: 3, resolution: 2 }).setOrigin(0.5);

        const createBtn = (y, text, color, bgColor, callback) => {
            let btn = this.add.text(0, y, text, { fontSize: '18px', fill: color, backgroundColor: bgColor, padding: { x: 10, y: 12 }, fontFamily: "'MedievalSharp'", fixedWidth: 280, align: 'center', resolution: 2 }).setInteractive({ useHandCursor: true }).setOrigin(0.5);
            btn.on('pointerover', () => { btn.setTint(0xcccccc).setScale(1.02); }); btn.on('pointerout', () => { btn.clearTint().setScale(1); });
            btn.on('pointerdown', () => { this.sound.play("btnClick"); if (callback) callback(); });
            return btn;
        };

        // --- DISCORD COPY SCORE BUTTON ---
        let shareBtn = createBtn(-35, "📋 COPY SCORE", "#fff", "#5865F2", () => { this.copyScoreToClipboard(this.meters); });
        
        let restartBtn = createBtn(25, "RESTART CRUSADE", "#fff", "#444", () => { 
            this.sound.stopAll(); 
            this.socket.emit('requestRestart'); 
            this.scene.restart(); 
        });
        let reviveBtn = createBtn(85, "REVIVE ($5 SR2C)", "#0f0", "#111", () => { this.handleSolanaPayment(); });
        let menuBtn = this.add.text(0, 150, "RETURN TO MAIN MENU", { fontSize: '18px', fill: '#5e3e1a', fontFamily: "'MedievalSharp'", fontWeight: 'bold', resolution: 2 }).setInteractive({ useHandCursor: true }).setOrigin(0.5).on('pointerdown', () => { 
            this.sound.play("btnClick"); 
            this.socket.emit('playerDied'); 
            this.sound.stopAll(); 
            this.scene.start("MainMenu"); 
        });
        menuBtn.on('pointerover', () => menuBtn.setScale(1.1).setStyle({fill: '#DAA520'})); menuBtn.on('pointerout', () => menuBtn.setScale(1).setStyle({fill: '#5e3e1a'}));

        goContainer.add([scrollBg, title, scoreResult, shareBtn, restartBtn, reviveBtn, menuBtn]);
        this.tweens.add({ targets: goContainer, scale: 1, alpha: 1, duration: 600, ease: 'Back.easeOut' });
    }

    // --- NEW: COPY SCORE FUNCTION FOR DISCORD ---
    copyScoreToClipboard(finalScore) {
        const gameLink = "https://thesilentpath.onrender.com"; 
        const textToCopy = `I just survived ${finalScore}m in The Silent Path! ⚔️🛡️\nCan you beat my score? Play here: ${gameLink}`;
        
        navigator.clipboard.writeText(textToCopy).then(() => {
            alert("Score copied to clipboard! Paste it in your Discord server.");
        }).catch(err => {
            console.log("Copy failed", err);
            alert("Failed to copy. Try again!");
        });
    }

    async handleSolanaPayment() {
        if (!window.solana || !window.userWallet) { alert("Connect Phantom Wallet!"); return; }
        try {
            const provider = window.solana;
            const connection = new solanaWeb3.Connection("https://api.mainnet-beta.solana.com");
            const transaction = new solanaWeb3.Transaction().add(solanaWeb3.SystemProgram.transfer({ fromPubkey: new solanaWeb3.PublicKey(window.userWallet), toPubkey: new solanaWeb3.PublicKey("YOUR_WALLET_ADDRESS"), lamports: 0.01 * solanaWeb3.LAMPORTS_PER_SOL }));
            transaction.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
            transaction.feePayer = new solanaWeb3.PublicKey(window.userWallet);
            const { signature } = await provider.signAndSendTransaction(transaction);
            await connection.confirmTransaction(signature);
            this.socket.emit('requestRestart'); this.scene.restart();
        } catch (err) { alert("Failed: " + err.message); }
    }
}

const config = {
    type: Phaser.AUTO,
    width: 800,
    height: 450,
    backgroundColor: 'rgba(0,0,0,0)', 
    transparent: true,
    scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH
    },
    resolution: window.devicePixelRatio || 2, 
    render: {
        pixelArt: false,
        antialias: true
    },
    physics: { default: "arcade", arcade: { gravity: { y: 1900 }, debug: false } },
    scene: [MainMenu, GameScene]
};
const game = new Phaser.Game(config);