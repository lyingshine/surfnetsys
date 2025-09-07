const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

// 用户验证函数，提取共用的登录验证逻辑
function validateUser(username, password, db) {
    const user = db.users[username];
    if (!user || user.password !== password) {
        return { valid: false, message: '用户名或密码错误' };
    }
    // 只对非管理员用户检查余额
    if (user.role !== 'admin' && user.balance <= 0) {
        return { valid: false, message: '余额不足' };
    }
    return { valid: true, user };
}

// 检查用户是否已登录
function checkUserAlreadyLoggedIn(username, activeClients) {
    return Array.from(activeClients.values()).some(c => c.user.username === username);
}

function startServer() {
    const app = express();
    app.use(express.json());
    app.use(express.static(__dirname));
    const server = http.createServer(app);
    const wss = new WebSocket.Server({ server });

    const broadcastLog = (message) => {
        const logData = { type: 'server_log', message };
        const logString = JSON.stringify(logData);
        wss.clients.forEach(client => {
            if (client.isAdmin) {
                client.send(logString);
            }
        });
    };

    const originalConsoleLog = console.log;
    console.log = (...args) => {
        const message = args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : String(arg)).join(' ');
        originalConsoleLog.apply(console, args);
        broadcastLog(message);
    };

    const originalConsoleError = console.error;
    console.error = (...args) => {
        const message = args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : String(arg)).join(' ');
        originalConsoleError.apply(console, args);
        broadcastLog(`ERROR: ${message}`);
    };

    const DB_PATH = path.join(__dirname, 'db.json');
    let db = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
    if (!db.session_logs) db.session_logs = [];

    const activeClients = new Map();

    function saveDb() {
        fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), 'utf8');
    }

    function broadcastAdminState() {
        try {
            const state = {
                type: 'admin_update',
                clients: Array.from(activeClients.values()).map(c => ({
                    username: c.user.username,
                    startTime: c.startTime,
                    balance: db.users[c.user.username] ? db.users[c.user.username].balance : null,
                    isLocked: c.isLocked
                })),
                allUsers: db.users,
                session_logs: db.session_logs.slice(0, 100), // 发送最新的100条日志
                modules: [
                    { name: '用户管理', status: '运行中', description: '管理用户账户和权限' },
                    { name: '计费系统', status: '运行中', description: '实时计费和余额管理' },
                    { name: '会话管理', status: '运行中', description: '管理用户登录会话' },
                    { name: '财务统计', status: '运行中', description: '营收和消费统计' },
                    { name: '系统日志', status: '运行中', description: '记录系统操作和事件' }
                ]
            };
            const stateString = JSON.stringify(state);
            wss.clients.forEach(client => {
                if (client.isAdmin) client.send(stateString);
            });
        } catch (error) {
            console.error("[CRITICAL] Failed to broadcast admin state:", error);
        }
    }

    // 处理客户端登录的通用函数
    function handleClientLogin(ws, username, db, activeClients) {
        const user = db.users[username];
        if (checkUserAlreadyLoggedIn(username, activeClients)) {
            ws.send(JSON.stringify({ type: 'login_error', message: '账号已在别处登录' }));
            ws.close();
            return false;
        }

        const clientData = { ws, user: { ...user, username }, startTime: new Date(), isLocked: false, sessionCost: 0 };
        activeClients.set(ws, clientData);
        startBilling(ws, username, clientData, db);
        ws.send(JSON.stringify({
            type: 'login_success',
            balance: user.balance,
            rate: user.rate,
            startTime: clientData.startTime.toISOString(),
            role: user.role // 添加角色信息
        }));
        return true;
    }

    function startBilling(ws, username, clientData, db) {
        if (!clientData) return;

        const currentUser = db.users[username];
        if (!currentUser || currentUser.role === 'admin') {
            return;
        }

        const hourlyRate = currentUser.rate || 0;
        const costPer10Seconds = (hourlyRate / 3600) * 10;
        const billingIntervalMs = 10000; // 10 seconds

        clientData.intervalId = setInterval(() => {
            if (clientData.isLocked) return;
            const user = db.users[username];
            if (!user) {
                ws.close();
                clearInterval(clientData.intervalId);
                return;
            }

            if (user.balance >= costPer10Seconds) {
                user.balance -= costPer10Seconds;
                clientData.sessionCost = (clientData.sessionCost || 0) + costPer10Seconds;
                ws.send(JSON.stringify({ type: 'balance_update', balance: user.balance, sessionCost: clientData.sessionCost }));
            } else {
                user.balance = 0;
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
                    const { username, password } = data;
                    const user = db.users[username];

                    if (user && user.password === password && user.role === 'admin') {
                        ws.isAdmin = true;
                        const clientData = { ws, user: { ...user, username }, startTime: new Date(), isLocked: false, sessionCost: 0 };
                        activeClients.set(ws, clientData);
                        ws.send(JSON.stringify({ type: 'login_success', role: 'admin' }));
                        broadcastAdminState();
                    } else {
                        ws.send(JSON.stringify({ type: 'login_error', message: '管理员验证失败' }));
                        ws.close();
                    }
                } else if (data.type === 'login') {
                    const { username, password } = data;
                    const validation = validateUser(username, password, db);

                    if (validation.valid) {
                        if (handleClientLogin(ws, username, db, activeClients)) {
                            broadcastAdminState();
                        }
                    } else {
                        ws.send(JSON.stringify({ type: 'login_error', message: validation.message }));
                        ws.close();
                    }
                } else if (data.type === 'client_reconnect') {
                    const { username } = data;
                    const user = db.users[username];

                    if (user) {
                        if (user.role !== 'admin' && user.balance <= 0) {
                            ws.send(JSON.stringify({ type: 'login_error', message: '余额不足' }));
                            ws.close();
                        } else if (handleClientLogin(ws, username, db, activeClients)) {
                            broadcastAdminState();
                        }
                    } else {
                        ws.send(JSON.stringify({ type: 'login_error', message: '用户不存在' }));
                        ws.close();
                    }
                } else if (data.type === 'pong') {
                    // 收到pong响应，连接保持活跃
                }
            } catch (error) {
                console.error("Failed to process message: ", error);
            }
        });

        ws.on('close', () => {
            try {
                clearInterval(heartbeat);
                if (!activeClients.has(ws)) return;

                const clientData = activeClients.get(ws);
                clearInterval(clientData.intervalId);

                const endTime = new Date();
                const duration = Math.round((endTime - clientData.startTime) / 60000);
                const finalCost = parseFloat((clientData.sessionCost || 0).toFixed(2));

                db.session_logs.unshift({ username: clientData.user.username, startTime: clientData.startTime.toISOString(), endTime: endTime.toISOString(), duration, cost: finalCost });
                
                const user = db.users[clientData.user.username];
                if (user) {
                    user.balance = parseFloat(user.balance.toFixed(2));
                }

                activeClients.delete(ws);
                saveDb();
                broadcastAdminState();
            } catch (error) {
                console.error("Error in ws.on('close'):", error);
            }
        });
    });

    app.post('/login', (req, res) => {
        const { username, password } = req.body;
        const validation = validateUser(username, password, db);

        if (validation.valid) {
            const user = validation.user;
            const page = user.role === 'admin' ? 'admin.html' : 'client.html';
            res.json({ success: true, page: page, username: username });
        } else {
            res.status(401).json({ success: false, message: validation.message });
        }
    });

    const apiRouter = express.Router();
    app.use('/api', apiRouter);

    apiRouter.post('/users', (req, res) => {
        const { username, password, rate } = req.body;
        if (!username || !password || rate === undefined) return res.status(400).json({ message: '缺少必要字段' });
        if (db.users[username]) return res.status(409).json({ message: '用户名已存在' });
        db.users[username] = { password, balance: 0, rate: parseFloat(rate), role: 'user' };
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
    server.listen(PORT, () => console.log(`服务器已启动，运行在 http://localhost:${PORT}`));
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

// 当文件被直接执行时，启动服务器
if (require.main === module) {
    startServer();
}