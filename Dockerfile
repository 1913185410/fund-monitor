# 单容器同时托管前端构建产物 + 基金数据代理，适合 Render / Fly.io / VPS 等一键公网部署
FROM node:20-alpine

WORKDIR /app

# 先装依赖以利用缓存
COPY package.json package-lock.json ./
RUN npm install --no-audit --no-fund

# 拷贝源码并构建前端
COPY . .
RUN npm run build

# 对外端口（数据代理 + 前端均由该进程提供）
ENV PORT=8080
EXPOSE 8080

CMD ["npm", "start"]