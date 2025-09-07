# 幻影在线网络管理系统

一个基于 Electron 和 Node.js 的网吧计费和管理系统，提供完整的用户管理、计费、设备监控功能。

## 功能特性

### 核心功能
- 🚀 **多窗口管理** - 登录窗口、客户端窗口、管理面板
- 🔐 **安全登录** - 用户验证和权限管理
- 💰 **实时计费** - 按时间计费，余额自动扣除
- 🛡️ **系统保护** - 键盘钩子阻止系统快捷键
- 📊 **数据统计** - 营收统计和会话记录

### 管理功能
- 👥 **用户管理** - 添加、编辑、删除用户账户
- 💳 **充值系统** - 用户余额在线充值
- 📈 **财务统计** - 按日/周/月/全部统计营收
- 🔧 **远程控制** - 锁定、解锁、重启、关机客户端
- 📋 **系统日志** - 完整的操作和会话记录

## 技术栈

- **前端**: HTML5, CSS3, JavaScript (ES6+)
- **后端**: Node.js, Express.js
- **桌面端**: Electron
- **实时通信**: WebSocket
- **原生模块**: C++ Native Addon (键盘钩子)
- **数据库**: JSON 文件存储

## 安装和运行

### 环境要求
- Node.js 16.0+
- npm 或 yarn
- Windows 操作系统 (支持键盘钩子功能)

### 安装步骤

1. 克隆项目
```bash
git clone <repository-url>
cd surfnetsys
```

2. 安装依赖
```bash
npm install
```

3. 构建原生模块
```bash
cd keyboard_hook
npm install
node-gyp configure
node-gyp build
cd ..
```

4. 运行应用
```bash
# 开发模式
npm run dev

# 生产模式
npm start

# 启动启动器
npm run launch
```

### 构建发布版本
```bash
npm run build
```

## 项目结构

```
surfnetsys/
├── main.js              # Electron 主进程
├── server.js           # Express 服务器
├── launcher.js         # 启动器应用
├── keyboard_hook/      # 键盘钩子原生模块
│   ├── keyboard_hook.cpp
│   └── binding.gyp
├── build/              # 构建输出
├── *.html             # 界面文件
├── *.js              # 渲染进程脚本
└── package.json       # 项目配置
```

## 安全特性

- ✅ 输入验证和过滤
- ✅ XSS 攻击防护
- ✅ SQL 注入防护
- ✅ 会话管理安全
- ✅ 权限控制

## 使用说明

### 默认账户
- **管理员**: username: `admin`, password: `admin`
- **普通用户**: 需要通过管理面板创建

### 主要界面

1. **登录界面** - 用户身份验证
2. **客户端界面** - 显示余额、会话信息
3. **管理面板** - 系统管理和监控
4. **启动器** - 服务器和客户端管理

## 开发指南

### 代码规范
- 使用 ES6+ 语法
- 遵循 JavaScript 最佳实践
- 保持代码注释清晰
- 使用语义化的提交信息

### 调试
```bash
# 启用开发工具
npm run dev
```

## 许可证

MIT License - 详见 LICENSE 文件

## 支持

如有问题或建议，请提交 Issue 或联系开发团队。

## 版本历史

- **v1.1.0** - 代码重构、安全优化、性能提升
- **v1.0.0** - 初始版本发布