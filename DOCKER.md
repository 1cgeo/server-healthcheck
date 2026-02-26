# 🐳 Guia de Migração para Docker

## Contexto

Você já tem:
- ✅ PostgreSQL rodando em <DB_HOST>:<DB_PORT>
- ✅ Scripts de monitoramento nos servidores
- ✅ Backend rodando com PM2 na máquina

**Objetivo:** Dockerizar apenas o backend, mantendo tudo funcionando.

---

## Passo a Passo

### 1. Parar PM2 (não deletar ainda)

```bash
# No servidor dashboard (<DASHBOARD_IP>)
cd /root/server-healthcheck/backend
pm2 stop healthcheck
pm2 save
```

### 2. Verificar se o .env está correto

```bash
cat /root/server-healthcheck/backend/.env
```

Deve ter:
```env
DB_HOST=<DB_HOST>
DB_PORT=<DB_PORT>
DB_NAME=healthcheck
DB_USER=healthcheck_app
DB_PASSWORD=sua_senha_aqui
PORT=8082
NODE_ENV=production
```

### 3. Instalar Docker (se não tiver)

```bash
# Ubuntu/Debian
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Adicionar usuário ao grupo docker
sudo usermod -aG docker $USER

# Reiniciar sessão ou executar:
newgrp docker

# Instalar Docker Compose
sudo apt-get update
sudo apt-get install docker-compose-plugin
```

### 4. Build e Run do Container

```bash
cd /root/server-healthcheck

# Build da imagem
docker build -t healthcheck-backend .

# Ou usar docker-compose (RECOMENDADO)
docker compose up -d
```

### 5. Verificar se está rodando

```bash
# Ver logs
docker compose logs -f

# Verificar status
docker compose ps

# Testar API
curl http://localhost:8082/api/dashboard
```

### 6. Acessar o Dashboard

Abra no navegador:
```
http://<DASHBOARD_IP>:8082
```

### 7. Se tudo funcionar, deletar PM2

```bash
# Remover do PM2
pm2 delete healthcheck
pm2 save

# Opcional: Desinstalar PM2
npm uninstall -g pm2
```

---

## Comandos Úteis

### Gerenciamento

```bash
# Iniciar
docker compose up -d

# Parar
docker compose down

# Reiniciar
docker compose restart

# Ver logs
docker compose logs -f

# Ver logs das últimas 100 linhas
docker compose logs --tail=100

# Atualizar após mudanças no código
docker compose up -d --build
```

### Troubleshooting

```bash
# Entrar no container
docker exec -it healthcheck sh

# Ver todas as variáveis de ambiente
docker exec healthcheck env

# Testar conexão com PostgreSQL de dentro do container
docker exec healthcheck node -e "const {Pool}=require('pg'); const p=new Pool({host:'<DB_HOST>',port:<DB_PORT>,database:'healthcheck',user:'healthcheck_app',password:process.env.DB_PASSWORD}); p.query('SELECT NOW()', (e,r)=>{console.log(e||r.rows); process.exit()})"

# Ver uso de recursos
docker stats healthcheck
```

### Logs e Monitoramento

```bash
# Healthcheck status
docker inspect healthcheck | grep -A 10 Health

# Logs em tempo real
docker compose logs -f --tail=50

# Logs de erro
docker compose logs | grep -i error
```

---

## Auto-start no Boot

### Opção 1: Docker Compose (Recomendado)

O `restart: unless-stopped` no docker-compose.yml já garante que o container inicie automaticamente.

### Opção 2: Systemd Service

Crie `/etc/systemd/system/healthcheck.service`:

```ini
[Unit]
Description=Healthcheck Dashboard
Requires=docker.service
After=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/root/server-healthcheck
ExecStart=/usr/bin/docker compose up -d
ExecStop=/usr/bin/docker compose down
TimeoutStartSec=0

[Install]
WantedBy=multi-user.target
```

Ativar:
```bash
sudo systemctl daemon-reload
sudo systemctl enable healthcheck
sudo systemctl start healthcheck
```

---

## Atualizar o Código

Quando fizer alterações:

```bash
cd /root/server-healthcheck

# Pull das alterações
git pull

# Rebuild e restart
docker compose up -d --build

# Ou manualmente:
docker build -t healthcheck-backend .
docker compose down
docker compose up -d
```

---

## Backup e Restore

### Exportar Imagem

```bash
docker save healthcheck-backend:latest | gzip > healthcheck-backend.tar.gz
```

### Importar Imagem

```bash
docker load < healthcheck-backend.tar.gz
```

---

## Rollback para PM2 (se necessário)

Se algo der errado:

```bash
# Parar Docker
docker compose down

# Voltar para PM2
cd /root/server-healthcheck/backend
pm2 start server.js --name healthcheck
pm2 save
```

---

## Diferenças PM2 vs Docker

| Aspecto | PM2 | Docker |
|---------|-----|--------|
| Auto-restart | ✅ pm2 | ✅ restart policy |
| Logs | ~/.pm2/logs/ | docker logs |
| Isolamento | ❌ | ✅ Container |
| Portabilidade | ❌ | ✅ Imagem |
| Recursos | Sem limite | Configurável |
| Deploy | Manual | docker-compose |

---

## Network Mode: Host

O `network_mode: host` no docker-compose.yml faz o container usar a rede do host diretamente.

**Vantagens:**
- Sem NAT, acessa PostgreSQL em <DB_HOST> diretamente
- Mesma porta 8082 acessível externamente

**Alternativa (se quiser bridge):**

```yaml
# docker-compose.yml
services:
  healthcheck:
    ports:
      - "8082:8082"
    # Remover network_mode: host
```

---

## Problemas Comuns

### Container não inicia

```bash
# Ver logs de erro
docker compose logs

# Verificar .env
docker exec healthcheck env | grep DB_
```

### Não conecta no PostgreSQL

```bash
# Testar conexão de dentro do container
docker exec -it healthcheck sh
apk add postgresql-client
psql -h <DB_HOST> -p <DB_PORT> -U healthcheck_app -d healthcheck
```

### Porta 8082 já em uso

```bash
# Ver o que está usando
sudo lsof -i :8082

# Se for PM2, parar:
pm2 stop healthcheck
```

---

## Performance

Docker tem overhead mínimo (~2-3% CPU/RAM). Para este caso de uso (API leve), a diferença é imperceptível.

**Recursos sugeridos (adicionar ao docker-compose.yml se necessário):**

```yaml
services:
  healthcheck:
    deploy:
      resources:
        limits:
          cpus: '1'
          memory: 512M
        reservations:
          memory: 256M
```

---

## Pronto! 🎉

Agora seu backend roda em Docker, conectando no PostgreSQL existente e servindo o frontend + scripts.

**Próximos passos (opcional):**
- Adicionar Docker ao pipeline CI/CD
- Configurar logs externos (ELK, Grafana Loki)
- Criar imagens multi-stage para reduzir tamanho
