# slim (glibc) y no alpine: el motor del modelo de vectores (onnxruntime) no tiene binarios para musl
FROM node:24-slim
WORKDIR /app
ENV NODE_ENV=production ACM_DATA=/data PORT=3000 ACM_MODELS=/app/models
COPY package.json package-lock.json ./
# solo lo de Linux x64 y sin GPU: de ~700 MB a ~60 MB
RUN npm ci --omit=dev && npm cache clean --force \
 && cd node_modules/onnxruntime-node/bin/napi-v3 && rm -rf darwin win32 linux/arm64 linux/x64/libonnxruntime_providers_cuda.so linux/x64/libonnxruntime_providers_tensorrt.so \
 && rm -rf /app/node_modules/onnxruntime-web
COPY tools/bajar-modelo.mjs tools/
# el modelo va dentro de la imagen: ACM busca sin depender de internet
RUN node tools/bajar-modelo.mjs
COPY *.js ./
COPY public ./public
RUN mkdir -p /data && chown node:node /data
USER node
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s CMD node -e "fetch('http://localhost:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
