const express = require('express');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http);
const mongoose = require('mongoose');

// --- 0. NETWORK FIX ---
require('dns').setDefaultResultOrder('ipv4first');

// --- 1. CONFIGURATION ---
const MONGO_URI = "mongodb+srv://admin:gamepass123@cluster0.vt2bcgt.mongodb.net/?appName=Cluster0";

// --- 2. DATABASE CONNECTION (Web3 Mode) ---
mongoose.connect(MONGO_URI)
    .then(() => console.log("✅ MongoDB Connected (Web3 Mode)"))
    .catch(err => console.error("❌ MongoDB Connection Error:", err));

// Naya Schema: Sirf Wallet Address ke basis par
const playerSchema = new mongoose.Schema({
    walletAddress: { type: String, required: true, unique: true }, 
    score: { type: Number, default: 0 }, 
    totalOrbs: { type: Number, default: 0 }
});

// Naya collection 'Web3Player' taake purane Discord data se clash na ho
const Player = mongoose.model('Web3Player', playerSchema);

// --- 3. SERVER SETUP ---
app.use(express.static('public'));
app.use(express.json());

// --- 4. GAME LOGIC (Socket.io) ---
let activeSessions = {};

io.on('connection', (socket) => {
    console.log('🚀 Socket Connected:', socket.id);

    activeSessions[socket.id] = {
        distance: 0,
        sessionOrbs: 0,
        isAlive: true,
        isPaused: false,
        lastSpawn: 0,
        lastJumpTime: 0,
        walletAddress: null // Discord ID ki jagah ab Wallet store hoga
    };

    // --- NEW: LINK PHANTOM WALLET ---
    socket.on('linkWallet', async (walletAddress) => {
        try {
            // Find user or create a new one if this wallet is connecting for the first time
            let user = await Player.findOneAndUpdate(
                { walletAddress: walletAddress },
                { $setOnInsert: { walletAddress: walletAddress, score: 0, totalOrbs: 0 } },
                { new: true, upsert: true }
            );

            if (user && activeSessions[socket.id]) {
                activeSessions[socket.id].walletAddress = user.walletAddress;
                
                // Send saved progress back to the game
                socket.emit('syncData', { 
                    totalOrbs: user.totalOrbs,
                    highScore: user.score
                });
                console.log(`🔗 Wallet Linked: ${walletAddress.substring(0,6)}...`);
            }
        } catch (err) { console.error(err); }
    });

    // --- GAME LOOP ---
    const gameLoop = setInterval(() => {
        const session = activeSessions[socket.id];
        if (!session || !session.isAlive || session.isPaused) return;

        session.distance += 1;
        const speed = Math.min(450 + Math.floor(session.distance / 100) * 30, 1000);
        const now = Date.now();
        const minSpawnDelay = Math.max(1200 - Math.floor(session.distance / 100) * 50, 650);

        if (Math.random() > 0.9 && now - session.lastSpawn > minSpawnDelay) {
            socket.emit('spawnObstacle', { type: Math.random() > 0.4 ? 'barrel' : 'orb', speed });
            session.lastSpawn = now;
        }
        socket.emit('serverUpdate', { distance: session.distance, score: session.sessionOrbs });
    }, 100);

    // --- ACTIONS ---
    socket.on('pauseGame', () => { if (activeSessions[socket.id]) activeSessions[socket.id].isPaused = true; });
    socket.on('resumeGame', () => { if (activeSessions[socket.id]) { activeSessions[socket.id].isPaused = false; activeSessions[socket.id].lastSpawn = Date.now(); }});
    
    socket.on('jumpAction', () => {
        let session = activeSessions[socket.id];
        if (!session || !session.isAlive || session.isPaused) return;
        let now = Date.now();
        if (now - session.lastJumpTime < 100) return; 
        session.lastJumpTime = now;
        session.isJumping = true;
        setTimeout(() => { if (activeSessions[socket.id]) activeSessions[socket.id].isJumping = false; }, 800);
    });

    socket.on('orbCollected', () => {
        let session = activeSessions[socket.id];
        if (session && session.isAlive && !session.isPaused) session.sessionOrbs += 10;
    });

    socket.on('playerDied', () => { if (activeSessions[socket.id]) activeSessions[socket.id].isAlive = false; });
    
    socket.on('requestRestart', () => {
        if (activeSessions[socket.id]) {
            Object.assign(activeSessions[socket.id], {
                isAlive: true, isPaused: false, distance: 0, sessionOrbs: 0, lastSpawn: 0, isJumping: false, lastJumpTime: 0
            });
        }
    });

    // --- SAVE SCORE (Based on Wallet) ---
    socket.on('saveLeaderboardScore', async () => {
        const session = activeSessions[socket.id];
        // Sirf tab save hoga jab wallet linked ho
        if (!session || !session.walletAddress) return; 

        const verifiedScore = Math.floor(session.distance);
        const earnedOrbs = session.sessionOrbs;

        try {
            let user = await Player.findOne({ walletAddress: session.walletAddress });
            if (user) {
                user.totalOrbs += earnedOrbs;
                if (verifiedScore > user.score) user.score = verifiedScore;
                
                await user.save();
                socket.emit('syncData', { totalOrbs: user.totalOrbs });

                const top10 = await Player.find().sort({ score: -1 }).limit(10);
                io.emit('leaderboardUpdate', top10);
            }
        } catch (err) { console.error("Save Error:", err); }
    });

    socket.on('getLeaderboard', async () => {
        const top10 = await Player.find().sort({ score: -1 }).limit(10);
        socket.emit('leaderboardUpdate', top10);
    });

    socket.on('disconnect', () => {
        clearInterval(gameLoop);
        delete activeSessions[socket.id];
    });
});

// --- SERVER START ---
const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
    console.log(`✅ WEB3 SERVER LIVE on Port ${PORT}`);
});