# ===========================================================================
# Dockerfile - Backend do Sistema de Monitoramento
# ===========================================================================
# Build: docker build -t healthcheck-backend .
# Run:   docker run -d -p 8082:8082 --name healthcheck healthcheck-backend
# ===========================================================================

FROM node:18-alpine

# Metadados
LABEL maintainer="healthcheck"
LABEL description="Backend do sistema de monitoramento de servidores"

# Proxy para build (opcional) — passe via --build-arg se necessário
# Exemplo: docker build --build-arg HTTP_PROXY=http://usuario:senha@proxy:porta .
ARG HTTP_PROXY
ARG HTTPS_PROXY
ENV http_proxy=$HTTP_PROXY
ENV https_proxy=$HTTPS_PROXY

# Diretório de trabalho
WORKDIR /app

# Copiar package.json e package-lock.json
COPY backend/package*.json ./

# Instalar dependências de produção
RUN npm ci --only=production && \
    npm cache clean --force

# Remover proxy após instalação (não ficará na imagem final)
ENV http_proxy=
ENV https_proxy=

# Copiar código do backend
COPY backend/ ./

# Copiar frontend (servido pelo Express)
COPY frontend/ ./public/

# Copiar scripts (servidos via HTTP)
COPY scripts/ ./public/scripts/

# Criar usuário não-root
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 && \
    chown -R nodejs:nodejs /app

# Mudar para usuário não-root
USER nodejs

# Expor porta
EXPOSE 8082

# Healthcheck
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
    CMD node -e "require('http').get('http://localhost:8082/api/dashboard', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Comando de inicialização
CMD ["node", "server.js"]
