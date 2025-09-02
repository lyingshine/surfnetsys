const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

function startServer() {
    const app = express();
    app.use(express.json());
    const server = http.createServer(app);
    const wss = new WebSocket.Server({ server });

    const DB_PATH = path.join(__dirname, 'db.json');
    let db = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
    if (!db.session_logs) db.session_logs = [];

    const activeClients = new Map();

    function saveDb() { fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), 'utf8'); }

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
                session_logs: db.session_logs.slice(0, 100) // 发送最新的100条日志
            };
            const stateString = JSON.stringify(state);
            wss.clients.forEach(client => {
                if (client.isAdmin) client.send(stateString);
            });
        } catch (error) {
            console.error("[CRITICAL] Failed to broadcast admin state:", error);
        }
    }

    function startBilling(ws, username) {
        const clientData = activeClients.get(ws);
        if (!clientData) return;

        const hourlyRate = db.users[username]?.rate || 0;
        const costPer10Seconds = (hourlyRate / 3600) * 10;
        const billingIntervalMs = 10000; // 10 seconds

        clientData.intervalId = setInterval(() => {
            if (clientData.isLocked) return;
            const currentUser = db.users[username];
            if (!currentUser) {
                ws.close();
                clearInterval(clientData.intervalId);
                return;
            }

            if (currentUser.balance >= costPer10Seconds) {
                currentUser.balance -= costPer10Seconds;
                clientData.sessionCost = (clientData.sessionCost || 0) + costPer10Seconds;
                ws.send(JSON.stringify({ type: 'balance_update', balance: currentUser.balance, sessionCost: clientData.sessionCost }));
            } else {
                currentUser.balance = 0;
                ws.send(JSON.stringify({ type: 'force_logout', message: '余额耗尽' }));
                ws.close();
            }
        }, billingIntervalMs);
    }

    wss.on('connection', (ws) => {
        const heartbeat = setInterval(() => {
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'ping' }));
            }
        }, 10000);

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
            clearInterval(heartbeat); // 清除心跳
            if (!activeClients.has(ws)) return;
            const clientData = activeClients.get(ws);
            clearInterval(clientData.intervalId);
            const endTime = new Date();
            const duration = Math.round((endTime - clientData.startTime) / 60000);
            const finalCost = parseFloat((clientData.sessionCost || 0).toFixed(2));
            db.session_logs.unshift({ username: clientData.user.username, startTime: clientData.startTime.toISOString(), endTime: endTime.toISOString(), duration, cost: finalCost });
            if(db.users[clientData.user.username]) {
                db.users[clientData.user.username].balance = parseFloat(db.users[clientData.user.username].balance.toFixed(2));
            }
            activeClients.delete(ws);
            saveDb();
            broadcastAdminState();
        });
    });

    const apiRouter = express.Router();
    app.use('/api', apiRouter);

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

    apiRouter.get('/stats', (req, res) => {
        const { period } = req.query;
        const stats = getRevenueStats(db, period);
        res.json({ success: true, stats });
    });

    apiRouter.post('/recharge', (req, res) => {
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

function getRevenueStats(db, period = 'today') {
    const now = new Date();
    let startDate;
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    switch (period) {
        case 'week':
            const firstDayOfWeek = today.getDate() - today.getDay() + (today.getDay() === 0 ? -6 : 1);
            startDate = new Date(today.setDate(firstDayOfWeek));
            break;
        case 'month':
            startDate = new Date(today.getFullYear(), today.getMonth(), 1);
            break;
        case 'all':
            startDate = new Date(0);
            break;
        case 'today':
        default:
            startDate = today;
            break;
    }

    const logs = db.session_logs.filter(log => {
        if (!log.endTime) return false;
        const logDate = new Date(log.endTime);
        return logDate >= startDate;
    });

    const totalRevenue = logs.reduce((sum, log) => sum + (log.cost || 0), 0);
    const totalDuration = logs.reduce((sum, log) => sum + (log.duration || 0), 0);

    return {
        period,
        startDate: startDate.toISOString().slice(0, 10),
        endDate: new Date().toISOString().slice(0, 10),
        totalSessions: logs.length,
        totalDuration,
        totalRevenue: parseFloat(totalRevenue.toFixed(2))
    };
}

module.exports = { startServer };
