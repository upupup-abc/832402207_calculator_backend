# 计算器后端 Dockerfile
#
# 多阶段构建在这里没有必要：项目没有任何第三方依赖，
# 不需要 build 阶段，镜像里也不存在 node_modules。
#
# 构建：docker build -t calculator-backend .
# 运行：docker run -p 3000:3000 -v <宿主目录>:/app/data calculator-backend

FROM node:24-alpine

# 时区设为东八区，保证日志时间与本机一致（数据库内仍统一存 UTC）。
ENV TZ=Asia/Shanghai
ENV NODE_ENV=production
ENV PORT=3000

WORKDIR /app

# 先复制依赖描述文件，便于后续加入依赖时利用镜像层缓存。
COPY package.json ./

# 复制源码与前端静态资源副本。
# 注意：public/ 是前端资源的部署副本，由 `npm run sync:public` 从
# 832402207_calculator_frontend/src 同步而来，已提交到仓库，所以这里能直接 COPY。
COPY src ./src
COPY public ./public

# 数据目录（建议通过 -v 挂载到宿主机以实现持久化）。
#
# ⚠️ 这里必须 chown：上面所有 COPY 和 mkdir 都是以 root 身份执行的，
# 如果不在切换用户前把 /app 交给 node 用户，那么以 USER node 运行时就
# 无法在 /app/data 下创建 calculator.db，容器会因 EACCES 启动失败。
RUN mkdir -p /app/data && chown -R node:node /app

# 以非 root 用户运行，符合容器安全最佳实践。
USER node

EXPOSE 3000

# 容器级健康检查，与 /api/health 接口对应。
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "--disable-warning=ExperimentalWarning", "src/server.js"]
