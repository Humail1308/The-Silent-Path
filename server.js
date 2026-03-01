const express = require('express');
const session = require('express-session');
const passport = require('passport');
const MongoStore = require('connect-mongo');
const axios = require('axios'); // 🛠️ Manual API calls ke liye
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http);
const mongoose = require('mongoose');

// --- 0. NETWORK FIX ---
require('dns').setDefaultResultOrder('ipv4first');

// --- 1. CONFIGURATION ---
const MONGO_URI = "mongodb+srv://admin:gamepass123@cluster0.vt2bcgt.mongodb.net/?appName=Cluster0";
const DISCORD_CLIENT_ID = "1477311047353503944"; 
const DISCORD_CLIENT_SECRET = "9bvHNV85Krb5VKskOp6Ns8My3xN1qHyX"; 
const CALLBACK_URL = "https://the-silent-path.onrender.com/auth/discord/callback";

// --- 2. DATABASE CONNECTION ---
mongoose.connect(MONGO_URI)
    .then(async () => {
        console.log("✅ MongoDB Connected (Permanent Storage)");
        try {
            await mongoose.connection.collection('players').dropIndex('xId_1');
            console.log("🧹 Cleaned up old xId rule!");
        } catch (err) { /* Index doesn't exist, ignore */ }
    })
    .catch(err => console.error("❌ MongoDB Connection Error:", err));

const playerSchema = new mongoose.Schema({
    discordId: { type: String, required: true, unique: true },
    username: String,
    displayName: String,
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
        ttl: 24 * 60 * 60 
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

// --- 4. MANUAL DISCORD AUTH LOGIC ---

// Login Start: Redirect to Discord
app.get('/auth/discord', (req, res) => {
    const discordUrl = `https://discord.com/api/oauth2/authorize?client_id=${DISCORD_CLIENT_ID}&redirect_uri=${encodeURIComponent(CALLBACK_URL)}&response_type=code&scope=identify&prompt=consent`;
    res.redirect(discordUrl);
});

// Callback: Handle Code Exchange & User Profile manually
app.get('/auth/discord/callback', async (req, res) => {
    const code = req.query.code;
    if (!code) return res.redirect('/');

    try {
        // 1. Exchange Code for Access Token
        const tokenResponse = await axios.post('https://discord.com/api/oauth2/token', new URLSearchParams({
            client_id: DISCORD_CLIENT_ID,
            client_secret: DISCORD_CLIENT_SECRET,
            grant_type: 'authorization_code',
            code: code,
            redirect_uri: CALLBACK_URL,
        }), {
            headers: { 
                'Content-Type': 'application/x-www-form-urlencoded',
                'User-Agent': 'TheSilentPath-ManualAuth/1.0'
            }
        });

        const accessToken = tokenResponse.data.access_token;

        // 2. Get User Profile using Access Token
        const userResponse = await axios.get('https://discord.com/api/users/@me', {
            headers: { 
                Authorization: `Bearer ${accessToken}`,
                'User-Agent': 'TheSilentPath-ManualAuth/1.0'
            }
        });

        const profile = userResponse.data;

        // 3. Find or Create User in DB
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
            console.log("🆕 New User Created via Manual Auth:", profile.username);
        } else {
            console.log("👋 Existing User Logged in:", profile.username);
        }

        // 4. Manually Log In the user into Passport session
        req.logIn(user, (err) => {
            if (err) throw err;
            return res.send(`
                <script>
                    if (window.opener) {
                        window.opener.postMessage({ type: 'AUTH_SUCCESS', user: ${JSON.stringify(user)} }, '*');
                        window.close();
                    } else {
                        window.location.href = '/';
                    }
                </script>
            `);
        });

    } catch (error) {
        console.error("🚨 MANUAL AUTH ERROR:", error.response ? error.response.data : error.message);
        res.status(500).send(`
            <h3>Discord is blocking the connection (Error 429/1015).</h3>
            <p>Please wait 5-10 minutes and try again. This is a temporary limit on Render's network.</p>
            <a href="/">Back to Game</a>
        `);
    }
});

app.get('/auth/logout', (req, res, next) => {
    req.logout((err) => {
        if (err) return next(err);
        res.json({ success: true, message: "Disconnected successfully" });
    });
});

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
                console.log(`🔗 Linked: ${user.username}`);
            }
        } catch (err) { console.error(err); }
    });

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