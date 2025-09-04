// 单独启动服务器的脚本
const { startServer } = require('./server.js');

console.log('正在启动服务器...');
startServer();
console.log('服务器已启动，运行在 http://localhost:3000');