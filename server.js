const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

// This is the main function that starts the server.
function startServer() {
    const app = express();
    app.use(express.json());
    const server = http.createServer(app);
    const wss = new WebSocket.Server({ server });

    // Define paths for data and settings files.
    const DB_PATH = path.join(__dirname, 'db.json');
    const SETTINGS_PATH = path.join(__dirname, 'settings.json');

    // Load database and settings from files.
    let db = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
    let settings = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8'));
    // Ensure session_logs array exists.
    if (!db.session_logs) db.session_logs = [];

    const activeClients = new Map();

    // Helper functions to save data.
    function saveDb() { fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), 'utf8'); }
    function saveSettings() { fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2), 'utf8'); }

    // Broadcasts the current state to all connected admin panels.
    function broadcastAdminState() {
        try {
            const state = {
                type: 'admin_update',
                clients: Array.from(activeClients.values()).map(c => ({
                    username: c.user.username,
                    startTime: c.startTime,
                    balance: db.users[c.user.username]?.balance,
                    isLocked: c.isLocked
                })),
                allUsers: db.users,
                session_logs: db.session_logs.slice(-100),
                settings: settings
            };
            const stateString = JSON.stringify(state);
            wss.clients.forEach(client => {
                if (client.isAdmin) {
                    client.send(stateString);
                }
            });
        } catch (error) {
            console.error("[CRITICAL] Failed to broadcast admin state:", error);
        }
    }

    // Manages the billing interval for a connected client.
    function startBilling(ws, username) {
        const clientData = activeClients.get(ws);
        if (!clientData) return;

        const userRate = db.users[username]?.rate || 0.1;
        const billingIntervalMs = (settings.billingIntervalMinutes || 1) * 60000;

        clientData.intervalId = setInterval(() => {
            if (clientData.isLocked) return;
            const currentUser = db.users[username];
            if (!currentUser) { ws.close(); clearInterval(clientData.intervalId); return; }

            const sessionCost = (clientData.sessionCost || 0) + userRate;
            clientData.sessionCost = sessionCost;

            if (currentUser.balance >= userRate) {
                currentUser.balance = parseFloat((currentUser.balance - userRate).toFixed(2));
                ws.send(JSON.stringify({ type: 'balance_update', balance: currentUser.balance, sessionCost }));
                broadcastAdminState();
            } else {
                currentUser.balance = 0;
                ws.send(JSON.stringify({ type: 'force_logout', message: '余额耗尽' }));
                ws.close();
            }
        }, billingIntervalMs);
    }

    // --- WebSocket Connection Logic ---
    wss.on('connection', (ws) => {
        ws.on('message', (message) => {
            try {
                const data = JSON.parse(message);
                if (data.type === 'admin_login') {
                    ws.isAdmin = true;
                    broadcastAdminState();
                } else if (data.type === 'login') {
                    const { username, password } = data;
                    const user = db.users[username];
                    if (user && user.password === password) {
                        if (user.balance <= 0) return ws.send(JSON.stringify({ type: 'login_error', message: '余额不足' })) && ws.close();
                        if (Array.from(activeClients.values()).some(c => c.user.username === username)) return ws.send(JSON.stringify({ type: 'login_error', message: '账号已在别处登录' })) && ws.close();
                        
                        const clientData = { ws, user: { username }, startTime: new Date(), isLocked: false, sessionCost: 0 };
                        activeClients.set(ws, clientData);
                        startBilling(ws, username);
                        ws.send(JSON.stringify({ type: 'login_success', balance: user.balance, rate: user.rate, startTime: clientData.startTime.toISOString() }));
                        broadcastAdminState();
                    } else { ws.send(JSON.stringify({ type: 'login_error', message: '用户名或密码错误' })) && ws.close(); }
                }
            } catch (error) {
                console.error("Failed to process message: ", error);
            }
        });

        ws.on('close', () => {
            if (!activeClients.has(ws)) return;
            const clientData = activeClients.get(ws);
            clearInterval(clientData.intervalId);
            const endTime = new Date();
            const duration = Math.round((endTime - clientData.startTime) / 60000);
            db.session_logs.unshift({ username: clientData.user.username, startTime: clientData.startTime.toISOString(), endTime: endTime.toISOString(), duration, cost: clientData.sessionCost || 0 });
            activeClients.delete(ws);
            saveDb();
            broadcastAdminState();
        });
    });

    // --- API Routes ---
    const apiRouter = express.Router();
    app.use('/api', apiRouter);

    // User CRUD
    apiRouter.post('/users', (req, res) => {
        const { username, password, rate } = req.body;
        if (!username || !password || rate === undefined) return res.status(400).json({ message: '缺少必要字段' });
        if (db.users[username]) return res.status(409).json({ message: '用户名已存在' });
        db.users[username] = { password, balance: 0, rate: parseFloat(rate) };
        saveDb();
        broadcastAdminState();
        res.status(201).json({ success: true, message: '用户创建成功' });
    });

    apiRouter.put('/users/:username', (req, res) => {
        const { username } = req.params;
        const { password, rate } = req.body;
        if (!db.users[username]) return res.status(404).json({ message: '用户不存在' });
        if (password) db.users[username].password = password;
        if (rate !== undefined) db.users[username].rate = parseFloat(rate);
        saveDb();
        broadcastAdminState();
        res.json({ success: true, message: '用户更新成功' });
    });

    apiRouter.delete('/users/:username', (req, res) => {
        const { username } = req.params;
        if (!db.users[username]) return res.status(404).json({ message: '用户不存在' });
        if (Array.from(activeClients.values()).some(c => c.user.username === username)) return res.status(400).json({ message: '用户在线，无法删除' });
        delete db.users[username];
        saveDb();
        broadcastAdminState();
        res.json({ success: true, message: '用户删除成功' });
    });

    // Settings
    apiRouter.put('/settings', (req, res) => {
        const { billingIntervalMinutes } = req.body;
        if (billingIntervalMinutes === undefined || isNaN(parseFloat(billingIntervalMinutes)) || parseFloat(billingIntervalMinutes) <= 0) {
            return res.status(400).json({ message: '无效的计费周期' });
        }
        settings.billingIntervalMinutes = parseFloat(billingIntervalMinutes);
        saveSettings();
        broadcastAdminState();
        res.json({ success: true, message: '设置已更新' });
    });

    // Client Control
    apiRouter.post('/control/:username', (req, res) => {
        const { username } = req.params;
        const { action, message } = req.body;
        const client = Array.from(activeClients.values()).find(c => c.user.username === username);
        if (!client) return res.status(404).json({ message: "客户端不在线" });
        switch (action) {
            case 'lock': client.isLocked = true; client.ws.send(JSON.stringify({ type: 'lock' })); break;
            case 'unlock': client.isLocked = false; client.ws.send(JSON.stringify({ type: 'unlock' })); break;
            case 'logout': client.ws.send(JSON.stringify({ type: 'force_logout', message: '管理员强制下机' })); client.ws.close(); break;
            case 'message': client.ws.send(JSON.stringify({ type: 'admin_message', message })); break;
            case 'reboot': client.ws.send(JSON.stringify({ type: 'reboot' })); break;
            case 'shutdown': client.ws.send(JSON.stringify({ type: 'shutdown' })); break;
            default: return res.status(400).json({ message: "无效的操作" });
        }
        broadcastAdminState();
        res.json({ success: true, message: `${action} 指令已发送给 ${username}` });
    });

    // Recharge
    app.post('/recharge', (req, res) => {
        const { username, amount } = req.body;
        const parsedAmount = parseFloat(amount);
        if (db.users[username] && !isNaN(parsedAmount) && parsedAmount > 0) {
            db.users[username].balance += parsedAmount;
            db.users[username].balance = parseFloat(db.users[username].balance.toFixed(2));
            saveDb();
            for (const client of activeClients.values()) {
                if (client.user.username === username) client.ws.send(JSON.stringify({ type: 'balance_update', balance: db.users[username].balance, sessionCost: client.sessionCost }));
            }
            broadcastAdminState();
            res.status(200).json({ success: true, message: '充值成功' });
        } else {
            res.status(400).json({ success: false, message: '无效的用户或金额' });
        }
    });

    const PORT = 3000;
    server.listen(PORT, () => console.log(`Server is now running on http://localhost:${PORT}`));
}

module.exports = { startServer };
