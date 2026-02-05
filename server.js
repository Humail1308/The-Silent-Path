const express = require('express');
const session = require('express-session'); // Session manage karne ke liye
const passport = require('passport'); // X Auth ke liye
const TwitterStrategy = require('passport-twitter-oauth2').Strategy;
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http);
const mongoose = require('mongoose'); // Database ke liye

// --- 1. CONFIGURATION (Yahan Apni Keys Daalo) ---
// Note: Inko baad mai .env file mai rakhna secure rehta hai
const MONGO_URI = "mongodb+srv://admin:gamepass123@cluster0.vt2bcgt.mongodb.net/?appName=Cluster0"; // MongoDB Atlas se mili hui link
const TWITTER_CLIENT_ID = "WXUtSHNWQXZFWjBwVnhXb3Q3SzE6MTpjaQ";       // X Portal se mili ID
const TWITTER_CLIENT_SECRET = "7rcARBgNcQosk1CeDbFqjQozmT3ZfUqLcVrovto0kSWselI1fU"; // X Portal se mila Secret
const CALLBACK_URL = "https://the-silent-path.onrender.com/auth/twitter/callback"; // Hosting par change karna hoga

// --- 2. DATABASE CONNECTION ---
mongoose.connect(MONGO_URI)
    .then(() => console.log("✅ MongoDB Connected (Permanent Storage)"))
    .catch(err => console.error("❌ MongoDB Error:", err));

// User Schema (Database Design)
const playerSchema = new mongoose.Schema({
    xId: { type: String, required: true, unique: true }, // Twitter ki unique ID
    username: String, // @handle
    displayName: String, // Screen Name
    score: { type: Number, default: 0 }, // High Score
    totalOrbs: { type: Number, default: 0 }, // Total Orbs
    wallet: { type: String, default: null } // Phantom Wallet
});

const Player = mongoose.model('Player', playerSchema);

// --- 3. SESSION & PASSPORT SETUP ---
app.use(express.static('public'));
app.use(express.json());

app.use(session({
    secret: 'silent_path_super_secret', // Kuch bhi random likh do
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false } // HTTPS par true karna hota hai (Render par handle hojata hai)
}));

app.use(passport.initialize());
app.use(passport.session());

// Passport: User ko session mai save/load karna
passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser(async (id, done) => {
    try {
        const user = await Player.findById(id);
        done(null, user);
    } catch (err) { done(err, null); }
});

// --- 4. X (TWITTER) STRATEGY ---
passport.use(new TwitterStrategy({
    clientID: TWITTER_CLIENT_ID,
    clientSecret: TWITTER_CLIENT_SECRET,
    callbackURL: CALLBACK_URL,
    scope: ['users.read', 'tweet.read', 'offline.access'],
}, async (accessToken, refreshToken, profile, done) => {
    try {
        // Check karo agar user pehle se database mai hai
        let user = await Player.findOne({ xId: profile.id });

        if (!user) {
            // Agar naya user hai, toh create karo
            user = new Player({
                xId: profile.id,
                username: profile.username,
                displayName: profile.displayName,
                score: 0,
                totalOrbs: 0
            });
            await user.save();
            console.log("🆕 New User Created via X:", profile.username);
        } else {
            console.log("👋 Existing User Logged in:", profile.username);
        }
        return done(null, user);
    } catch (err) { return done(err, null); }
}));

// --- 5. AUTH ROUTES (Frontend Calls) ---

// Login Button Click par yahan ayega
app.get('/auth/twitter', passport.authenticate('twitter'));

// X Login ke baad wapis yahan ayega
app.get('/auth/twitter/callback', 
    passport.authenticate('twitter', { failureRedirect: '/' }),
    (req, res) => {
        // Popup window ko band karo aur main game ko batao ke login hogya
        res.send(`
            <script>
                window.opener.postMessage({ type: 'AUTH_SUCCESS', user: ${JSON.stringify(req.user)} }, '*');
                window.close();
            </script>
        `);
    }
);

// Game start honay par check karega ke user logged in hai ya nahi
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
        dbUserId: null // Yahan hum MongoDB ka ID save karenge login ke baad
    };

    // --- LINK SOCKET TO X USER ---
    // Frontend (Game.js) login honay ke baad ye event bhejega
    socket.on('linkXSession', async (mongoID) => {
        try {
            const user = await Player.findById(mongoID);
            if (user) {
                activeSessions[socket.id].dbUserId = user._id; // Link established
                
                // Wapis data bhejo taake game update hojaye (Orbs, Score, etc)
                socket.emit('syncData', { 
                    totalOrbs: user.totalOrbs,
                    highScore: user.score,
                    username: user.username,
                    wallet: user.wallet
                });
                console.log(`🔗 Socket linked to User: @${user.username}`);
            }
        } catch (err) { console.error(err); }
    });

    // --- GAME LOOP ---
    const gameLoop = setInterval(() => {
        const session = activeSessions[socket.id];
        if (!session || !session.isAlive || session.isPaused) return;

        session.distance += 1;
        const speed = Math.min(400 + Math.floor(session.distance / 100) * 15, 850);
        const now = Date.now();

        if (Math.random() > 0.9 && now - session.lastSpawn > 1200) {
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
        if (now - session.lastJumpTime < 400) return;
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

    // --- SAVE SCORE (ONLY IF LOGGED IN WITH X) ---
    socket.on('saveLeaderboardScore', async ({ wallet }) => {
        const session = activeSessions[socket.id];
        if (!session || !session.dbUserId) return; // Agar login nahi hai, save mat karo

        const verifiedScore = Math.floor(session.distance);
        const earnedOrbs = session.sessionOrbs;

        try {
            // Database se user uthao
            let user = await Player.findById(session.dbUserId);
            
            if (user) {
                // Update Stats
                if (wallet) user.wallet = wallet; // Wallet update karo agar aya hai
                user.totalOrbs += earnedOrbs; // Orbs add karo
                if (verifiedScore > user.score) user.score = verifiedScore; // High Score check
                
                await user.save(); // Save to MongoDB

                // Client ko naya data bhejo
                socket.emit('syncData', { totalOrbs: user.totalOrbs });

                // Leaderboard Update (Top 10 from DB)
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
    console.log(`✅ X-AUTH & DB SERVER LIVE on Port ${PORT}`);
});