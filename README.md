---
title: 投资监控
emoji: 📈
colorFrom: blue
colorTo: purple
sdk: docker
pinned: false
app_port: 8080
---

# 投资监控（多资产行情 · K线 · MACD · 资金流向）

股票、ETF、场外基金、指数的统一监控终端。支持按代码/名称搜索添加，查看日/周/月 K 线、MACD/MA/RSI/KDJ 指标与资金流向，并内置访问口令保护。

## 本地开发

```bash
pnpm install
pnpm dev            # 前端（Vite，端口 5173）
pnpm dev:api        # 数据代理（端口 8080，另开终端）
```

访问 `http://localhost:5173`。

> 可选：设置环境变量 `ACCESS_TOKEN=你的口令` 后重启数据代理，即可开启访问保护（页面需输口令才能进入）。

## 数据源（均为公开接口）

| 数据 | 来源 |
|---|---|
| 统一搜索（股票/ETF/基金/指数） | 腾讯 smartbox（东财联想兜底） |
| 股票/ETF 日周月K线、实时行情 | 腾讯 fqkline / qt |
| 股票/ETF 日级资金流向 | 新浪 MoneyFlow |
| 场外基金净值/季度规模 | 东方财富 |

K 线请求会同时返回服务端计算的指标：MA(5/10/20/60)、MACD(12,26,9)、RSI(14)、KDJ(9,3,3)。

## 对外接口（数据代理）

```
GET /api/search-all?keyword=           统一搜索
GET /api/quote?symbols=sh600519,...    批量实时行情
GET /api/kline?symbol=&kind=&code=&klt=day|week|month&count=   K线+指标
GET /api/flow?symbol=&kind=&code=&days=  资金流（基金返回季度规模）
GET /api/funds?codes=...               场外基金实时（沿用）
GET /api/auth?token=...                访问口令登录
```

## 部署（免费，手机/电脑任意访问）

### 方式一：Cloudflare Pages（推荐，不休眠、全球快）

本仓库已适配 Cloudflare Pages：`/api/*` 由 `functions/api/[[path]].js`（云函数）提供，前端为静态站点。

1. 代码推到 **GitHub** 仓库；
2. 到 `dash.cloudflare.com` → **Workers 和 Pages** → **创建** → **连接到 Git**，选择本仓库（私有仓库需在授权时勾选）；
3. 构建设置填：构建命令 `npm run build`，输出目录 `dist`；
4. 部署后进入项目的 **设置 → 变量和机密**，添加 `ACCESS_TOKEN`（你的访问口令）；
5. 打开 `https://<项目名>.pages.dev`，输入口令即可使用；以后推送代码会自动更新。

> 静态页面由前端登录门校验口令（`/api/auth` 种 Cookie），未登录只能看到登录页。

### 方式二：Render / 自建服务器（常驻版）

1. 把代码推到 **GitLab.com**（免费）私有仓库；
2. 到 **Render.com** → New Blueprint，选择该仓库（Render 官方支持 GitLab）；
3. 在 Service 的环境变量里设置 `ACCESS_TOKEN`（你的访问口令）与 `PORT=8080`；
4. 部署完成后访问 `https://xxx.onrender.com`，输入口令即可使用；
5. 手机浏览器可"添加到主屏幕"，全屏使用、便于日常查看。

> 免费实例闲置约 15 分钟会休眠，再次打开需等 30 秒左右冷启动；数据源在浏览器内 60 秒自动刷新（仅页面打开时）。

## 构建与运行

```bash
pnpm build        # 产出 dist
pnpm start        # 单进程托管前端 + 数据代理（默认 8080）
```

> 云函数版无需常驻进程：`server/api-core.mjs` 是纯 Web API 逻辑，Cloudflare Functions 与本地 Node 共用同一份代码。
