FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production ACM_DATA=/data PORT=3000
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY *.js ./
COPY public ./public
RUN mkdir -p /data && chown node:node /data
USER node
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s CMD wget -qO- http://localhost:3000/api/health || exit 1
CMD ["node", "server.js"]
