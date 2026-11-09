FROM node:24-slim
WORKDIR /app
ENV NODE_ENV=production EDITOR_DATA=/data PORT=4000
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY *.js ./
RUN mkdir -p /data && chown node:node /data
USER node
EXPOSE 4000
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s CMD node -e "fetch('http://localhost:4000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
