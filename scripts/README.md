# Scripts - Sistema de Monitoramento

## 📋 Scripts Ativos (Usar)

### ✅ `unified-health-check.sh` **[PRINCIPAL]**
**Script de coleta unificado** - Executa 1x por noite em cada servidor monitorado.

**O que coleta:**
- ✅ Métricas básicas (CPU, memória, disco, load, uptime)
- ✅ Saúde do storage (SMART, RAID, filesystem)
- ✅ Espaço em disco (df -h com todos os discos)
- ✅ Top 2 maiores pastas por partição

**Envia para:**
- POST `/api/metrics` - Métricas básicas
- POST `/api/storage` - Dados de storage

**Execução:**
```bash
sudo /usr/local/bin/unified-health-check.sh
```

**Cron recomendado:**
```
0 2 * * * /usr/local/bin/unified-health-check.sh
```

---

### ✅ `install-monitoring.sh` **[INSTALADOR]**
**Script de instalação automática** - Instala e configura o monitoramento em servidores.

**O que faz:**
- Instala dependências (curl, jq, smartmontools)
- Baixa o `unified-health-check.sh` do dashboard
- Configura cron para execução noturna
- Testa a execução

**Uso remoto (recomendado):**
```bash
curl -sSL http://<DASHBOARD_IP>:8082/scripts/install-monitoring.sh | sudo bash
```

**Uso local:**
```bash
sudo ./install-monitoring.sh [DASHBOARD_IP] [DASHBOARD_PORT]
# Exemplo:
sudo ./install-monitoring.sh <DASHBOARD_IP> 8082
```

---

### ✅ `setup-database.sh` **[SETUP INICIAL]**
**Configuração do PostgreSQL** - Setup inicial do banco de dados.

**O que faz:**
- Instala PostgreSQL
- Cria database `healthcheck`
- Cria usuário `healthcheck_app`
- Configura permissões

**Uso:**
```bash
sudo ./setup-database.sh
```

---

### ✅ `cleanup-database.sh` **[MANUTENÇÃO]**
**Limpeza do banco** - Remove métricas antigas para economizar espaço.

**O que faz:**
- Mantém últimos 7 registros de métricas por servidor
- Remove erros com mais de 30 dias
- Mantém últimos 7 registros de storage por servidor

**Uso:**
```bash
./cleanup-database.sh
```

**Cron recomendado (no servidor do dashboard):**
```
0 3 * * * /path/to/cleanup-database.sh
```

---

## ❌ Scripts Obsoletos (Deletar)

### `health-check.sh` ❌
**OBSOLETO** - Substituído pelo `unified-health-check.sh`

Antes executava a cada 5 minutos, agora tudo está consolidado no unified que roda 1x por noite.

### `daily-storage-check.sh` ❌
**OBSOLETO** - Substituído pelo `unified-health-check.sh`

Funcionalidade agora está integrada no unified.

### `send-storage-health.sh` ❌
**OBSOLETO** - Substituído pelo `unified-health-check.sh`

Funcionalidade agora está integrada no unified.

### `install-server.sh` ❌
**OBSOLETO** - Substituído pelo `install-monitoring.sh`

Versão antiga que instalava health-check.sh separado.

---

## 🐳 Para Docker

### Scripts necessários no container:

**Servidor monitorado (agente):**
```dockerfile
COPY scripts/unified-health-check.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/unified-health-check.sh
```

**Dashboard (servidor central):**
- Não precisa de scripts de coleta
- Backend Node.js serve os scripts via HTTP

---

## 🚀 Fluxo de Instalação Completo

### 1. Setup do Banco (uma vez)
```bash
# No servidor PostgreSQL (<DB_HOST>)
sudo ./setup-database.sh
psql -h localhost -U postgres -d healthcheck -f ../sql/schema.sql
```

### 2. Deploy do Dashboard (uma vez)
```bash
# No servidor dashboard (<DASHBOARD_IP>)
cd backend
npm install
pm2 start server.js --name healthcheck
```

### 3. Instalar Monitoramento nos Servidores
```bash
# Em cada servidor a monitorar (.8, .10, .12, .45, etc.)
curl -sSL http://<DASHBOARD_IP>:8082/scripts/install-monitoring.sh | sudo bash
```

### 4. Configurar Limpeza Automática
```bash
# No servidor dashboard (<DASHBOARD_IP>)
(crontab -l; echo "0 3 * * * /path/to/cleanup-database.sh") | crontab -
```

---

## 📊 Arquitetura

```
┌─────────────────────────────────────────────────────┐
│  Servidores Monitorados (.8, .10, .12, .45)        │
│  ┌──────────────────────────────────────┐          │
│  │ Cron: 0 2 * * *                      │          │
│  │ /usr/local/bin/unified-health-check  │          │
│  └───────────────┬──────────────────────┘          │
└──────────────────┼─────────────────────────────────┘
                   │ POST /api/metrics
                   │ POST /api/storage
                   ▼
┌─────────────────────────────────────────────────────┐
│  Dashboard Server (<DASHBOARD_IP>:8082)               │
│  ┌──────────────────────────────────────┐          │
│  │ Backend (Node.js + Express)          │          │
│  │ - Recebe métricas                    │          │
│  │ - Serve frontend                     │          │
│  │ - Serve scripts via HTTP             │          │
│  └───────────────┬──────────────────────┘          │
└──────────────────┼─────────────────────────────────┘
                   │ INSERT INTO
                   ▼
┌─────────────────────────────────────────────────────┐
│  PostgreSQL (<DB_HOST>:5434)                    │
│  - health_metrics, current_metrics                 │
│  - storage_health, current_storage_health          │
└─────────────────────────────────────────────────────┘
```

---

## 📝 Checklist de Limpeza

Para preparar para Docker, deletar:

```bash
cd scripts/
rm health-check.sh
rm daily-storage-check.sh
rm send-storage-health.sh
rm install-server.sh
```

Manter apenas:
- ✅ `unified-health-check.sh`
- ✅ `install-monitoring.sh`
- ✅ `setup-database.sh`
- ✅ `cleanup-database.sh`
