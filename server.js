const express = require('express');
const session = require('express-session');
const passport = require('passport');
// --- CHANGE: Using Discord Strategy ---
const DiscordStrategy = require('passport-discord').Strategy; 
const MongoStore = require('connect-mongo');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http);
const mongoose = require('mongoose');

// --- 1. CONFIGURATION ---
const MONGO_URI = "mongodb+srv://admin:gamepass123@cluster0.vt2bcgt.mongodb.net/?appName=Cluster0";

// ⚠️ IMPORTANT: Yahan Discord ki 'Client ID' aur 'Client Secret' dalni hai
const DISCORD_CLIENT_ID = "1477311047353503944"; 
const DISCORD_CLIENT_SECRET = "9bvHNV85Krb5VKskOp6Ns8My3xN1qHyX"; 
const CALLBACK_URL = "https://the-silent-path.onrender.com/auth/discord/callback";

// --- 2. DATABASE CONNECTION (Anti-Crash & Index Fix) ---
mongoose.connect(MONGO_URI)
    .then(async () => {
        console.log("✅ MongoDB Connected (Permanent Storage)");
        
        // 🛠️ FIX FOR "Internal Server Error" (Duplicate Key Error)
        // Yeh line purane "xId" ke unique rule ko database se delete kar degi
        try {
            await mongoose.connection.collection('players').dropIndex('xId_1');
            console.log("🧹 Cleaned up old xId rule! Friends can now login without errors.");
        } catch (err) { 
            // Agar index pehle hi drop ho chuka hai ya nahi mila, toh skip karega
        }
    })
    .catch(err => console.error("❌ MongoDB Connection Error:", err));

mongoose.connection.on('error', err => {
    console.error("❌ DB Runtime Error:", err);
});

// User Schema (Updated for Discord)
const playerSchema = new mongoose.Schema({
    discordId: { type: String, required: true, unique: true }, // Discord ID
    username: String, // Discord handle (e.g. user#1234 or user)
    displayName: String, // Global Name
    score: { type: Number, default: 0 }, 
    totalOrbs: { type: Number, default: 0 }, 
    wallet: { type: String, default: null } 
});

const Player = mongoose.model('Player', playerSchema);

// --- 3. SESSION & PASSPORT SETUP ---
app.use(express.static('public'));
app.use(express.json());

app.set('trust proxy', 1);

app.use(session({
    secret: 'silent_path_super_secret',
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({ 
        mongoUrl: MONGO_URI,
        collectionName: 'sessions',
        ttl: 24 * 60 * 60 // 1 Day expiry
    }),
    cookie: { 
        secure: true, 
        sameSite: 'none', 
        maxAge: 24 * 60 * 60 * 1000 
    }
}));

app.use(passport.initialize());
app.use(passport.session());

passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser(async (id, done) => {
    try {
        const user = await Player.findById(id);
        done(null, user);
    } catch (err) { done(err, null); }
});

// --- 4. DISCORD STRATEGY ---
passport.use(new DiscordStrategy({
    clientID: DISCORD_CLIENT_ID,
    clientSecret: DISCORD_CLIENT_SECRET,
    callbackURL: CALLBACK_URL,
    scope: ['identify'] // Sirf user ki basic profile details chahiye
}, async (accessToken, refreshToken, profile, done) => {
    try {
        let user = await Player.findOne({ discordId: profile.id });

        if (!user) {
            user = new Player({
                discordId: profile.id,
                username: profile.username,
                displayName: profile.global_name || profile.username,
                score: 0,
                totalOrbs: 0
            });
            await user.save();
            console.log("🆕 New User Created via Discord:", profile.username);
        } else {
            console.log("👋 Existing User Logged in:", profile.username);
        }
        return done(null, user);
    } catch (err) { return done(err, null); }
}));

// --- 5. AUTH ROUTES ---

// Login Button Click (Discord) - WITH 'prompt: consent' TO ALLOW ACCOUNT SWITCHING
app.get('/auth/discord', passport.authenticate('discord', { prompt: 'consent' }));

// Discord Login ke baad wapis
app.get('/auth/discord/callback', 
    passport.authenticate('discord', { failureRedirect: '/' }),
    (req, res) => {
        res.send(`
            <script>
                if (window.opener) {
                    window.opener.postMessage({ type: 'AUTH_SUCCESS', user: ${JSON.stringify(req.user)} }, '*');
                    window.close();
                } else {
                    window.location.href = '/';
                }
            </script>
        `);
    }
);

// --- NEW: LOGOUT ROUTE ---
app.get('/auth/logout', (req, res, next) => {
    req.logout((err) => {
        if (err) { return next(err); }
        res.json({ success: true, message: "Disconnected successfully" });
    });
});

// Game start honay par check karega
app.get('/auth/user', (req, res) => {
    res.json(req.user || null);
});

// --- 6. GAME LOGIC (Socket.io) ---
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
        dbUserId: null
    };

    // Link Socket to Discord User
    socket.on('linkDiscordSession', async (mongoID) => {
        try {
            const user = await Player.findById(mongoID);
            if (user) {
                activeSessions[socket.id].dbUserId = user._id; 
                socket.emit('syncData', { 
                    totalOrbs: user.totalOrbs,
                    highScore: user.score,
                    username: user.username,
                    wallet: user.wallet
                });
                console.log(`🔗 Socket linked to Discord User: ${user.username}`);
            }
        } catch (err) { console.error(err); }
    });

    // Game Loop
    const gameLoop = setInterval(() => {
        const session = activeSessions[socket.id];
        if (!session || !session.isAlive || session.isPaused) return;

        session.distance += 1;
        
        // --- UPDATED PERFECT SPEED FORMULA ---
        // Base speed 450 (slow start), barhaygi har 100 meters par, Max limit 1000.
        const speed = Math.min(450 + Math.floor(session.distance / 100) * 30, 1000);
        const now = Date.now();

        // --- DYNAMIC SPAWN RATE ---
        // Start mein obstacles aaram se ayenge (1200ms), jese speed barhegi obstacles ka gap kam hoga (Max 650ms)
        const minSpawnDelay = Math.max(1200 - Math.floor(session.distance / 100) * 50, 650);

        if (Math.random() > 0.9 && now - session.lastSpawn > minSpawnDelay) {
            socket.emit('spawnObstacle', { type: Math.random() > 0.4 ? 'barrel' : 'orb', speed });
            session.lastSpawn = now;
        }
        socket.emit('serverUpdate', { distance: session.distance, score: session.sessionOrbs });
    }, 100);

    // Actions
    socket.on('pauseGame', () => { if (activeSessions[socket.id]) activeSessions[socket.id].isPaused = true; });
    socket.on('resumeGame', () => { if (activeSessions[socket.id]) { activeSessions[socket.id].isPaused = false; activeSessions[socket.id].lastSpawn = Date.now(); }});
    
    // --- UPDATED JUMP ACTION (Reduced Cooldown for Double Jump) ---
    socket.on('jumpAction', () => {
        let session = activeSessions[socket.id];
        if (!session || !session.isAlive || session.isPaused) return;
        let now = Date.now();
        // Changed to 100ms to ensure very fast double taps never get missed
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

    // Save Score
    socket.on('saveLeaderboardScore', async ({ wallet }) => {
        const session = activeSessions[socket.id];
        if (!session || !session.dbUserId) return; 

        const verifiedScore = Math.floor(session.distance);
        const earnedOrbs = session.sessionOrbs;

        try {
            let user = await Player.findById(session.dbUserId);
            if (user) {
                if (wallet) user.wallet = wallet;
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
    console.log(`✅ DISCORD AUTH SERVER LIVE on Port ${PORT}`);
});