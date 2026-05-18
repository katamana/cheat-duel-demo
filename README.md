# 信使 — The Courier (Web Demo)

一个关于赌博、修辞与一封信的星际旅程。

## 如何运行

无需安装任何依赖。推荐用任意项目级静态文件服务器打开 `index.html`：

- **推荐**：在项目根目录启动 VS Code Live Server，或运行 `python -m http.server 8000` 后访问 `http://localhost:8000/`。
- **可尝试**：双击 `index.html` 用浏览器打开；如果浏览器拦截本地 ES Modules 或 `fetch()` 读取 JSON，请改用上面的静态服务器方式。

## 项目结构

```
/
├── index.html              # 入口页面
├── IMPLEMENTATION_NOTES.md # 实现决策记录
├── README.md               # 本文件
├── .nojekyll               # GitHub Pages 配置
├── css/
│   ├── theme.css           # 调色板、字体、基础样式
│   └── main.css            # 布局、组件、响应式
├── js/
│   ├── main.js             # 启动入口与游戏控制器
│   ├── engine/
│   │   ├── deck.js         # 牌堆与发牌
│   │   ├── handEvaluator.js# 五张换牌扑克牌型判定
│   │   ├── cheats.js       # 暗手系统
│   │   ├── tells.js        # 流露与噪声生成
│   │   ├── betting.js      # 下注逻辑
│   │   └── matchState.js   # 比赛状态机
│   ├── ai/
│   │   ├── opponent.js     # AI 基类
│   │   ├── lighthouseKeeper.js
│   │   ├── luca.js
│   │   └── namelessCourier.js
│   └── ui/
│       └── renderer.js     # DOM 渲染与交互
└── data/
    ├── balance.json        # 数值平衡参数
    ├── cheats.json         # 暗手定义
    ├── characters.json     # 对手配置
    ├── dialogue.json       # 台词与剧情文本
    └── tells.json          # 流露与噪声池
```

## 调试

在浏览器控制台输入 `DEBUG` 可访问：
- `DEBUG.controller` — 游戏控制器
- `DEBUG.state` — 当前公共状态快照
- `DEBUG.forceState(stateName)` — 强制切换状态（用于测试）

## GitHub Pages 部署

项目是纯静态站点，不需要构建步骤：

1. 将仓库推送到 GitHub。
2. 在仓库 `Settings -> Pages` 中选择 `Deploy from a branch`。
3. Source 选择 `main` 分支和 `/root` 目录。
4. 等待 Pages 部署完成后访问生成的站点地址。

注意：项目内脚本、样式和数据都使用相对路径，适合部署在 `username.github.io/repo/` 这样的子路径下。

## 技术栈

- 纯 HTML5 + CSS3 + Vanilla JavaScript (ES Modules)
- 无构建步骤，无 npm 依赖
- 所有路径为相对路径
