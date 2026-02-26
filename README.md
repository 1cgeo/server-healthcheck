# Server Healthcheck

Sistema de monitoramento de saúde para servidores Linux. Coleta métricas noturnas de CPU, memória, disco, rede e saúde do storage (SMART, RAID, filesystem) e exibe tudo em um dashboard web centralizado.

---

## Arquitetura

```
┌─────────────────────────────────────────────────────┐
│  Servidores Monitorados                             │
│  Cron: 0 2 * * *                                    │
│  /usr/local/bin/unified-health-check.sh             │
└──────────────────────┬──────────────────────────────┘
                       │ POST /api/metrics
                       │ POST /api/storage
                       ▼
┌─────────────────────────────────────────────────────┐
│  Dashboard Server                                   │
│  Backend Node.js + Express                          │
│  Porta: 8082                                        │
└──────────────────────┬──────────────────────────────┘
                       │ INSERT INTO
                       ▼
┌─────────────────────────────────────────────────────┐
│  PostgreSQL                                         │
│  health_metrics · current_metrics                   │
│  storage_health · current_storage_health            │
└─────────────────────────────────────────────────────┘
```

- **Agente** (`unified-health-check.sh`): roda em cada servidor monitorado via cron, coleta as métricas e envia para a API.
- **Backend** (`Node.js + Express`): recebe os dados, persiste no banco e serve o frontend + os scripts de instalação via HTTP.
- **Frontend** (HTML/JS/CSS puro): dashboard com gráficos e alertas, servido pelo próprio backend.
- **Banco de dados** (PostgreSQL): armazena histórico e estado atual de cada servidor.

---

## Pré-requisitos

| Componente | Versão mínima |
|---|---|
| Node.js | 18+ |
| PostgreSQL | 13+ |
| Docker / Docker Compose | (opcional) |
| Bash | 4+ (nos servidores monitorados) |
| curl, jq, smartmontools | (nos servidores monitorados) |

---

## Instalação

### 1. Banco de dados

```bash
# Criar o banco
psql -h <DB_HOST> -p <DB_PORT> -U postgres -c "CREATE DATABASE healthcheck;"

# Aplicar o schema
psql -h <DB_HOST> -p <DB_PORT> -U postgres -d healthcheck -f sql/schema.sql

# (Opcional) Inserir servidores iniciais
# Edite sql/init.sql com os IPs reais antes de executar
psql -h <DB_HOST> -p <DB_PORT> -U postgres -d healthcheck -f sql/init.sql
```

Criar o usuário da aplicação:

```sql
CREATE USER healthcheck_app WITH PASSWORD '<SUA_SENHA_SEGURA>';
GRANT CONNECT ON DATABASE healthcheck TO healthcheck_app;
GRANT USAGE ON SCHEMA public TO healthcheck_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO healthcheck_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO healthcheck_app;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO healthcheck_app;
```

Ou use o script automatizado (requer variáveis de ambiente):

```bash
export DB_PASSWORD=<SUA_SENHA_SEGURA>
export DB_NETWORK=<CIDR_DA_SUA_REDE>   # ex: 192.168.1.0/24
sudo -E ./scripts/setup-database.sh
```

---

### 2. Backend (Docker — recomendado)

```bash
# Copiar e preencher o arquivo de ambiente
cp backend/.env.example backend/.env
nano backend/.env
```

Conteúdo do `.env`:

```env
DB_HOST=<IP_DO_SERVIDOR_DB>
DB_PORT=5432
DB_NAME=healthcheck
DB_USER=healthcheck_app
DB_PASSWORD=<SUA_SENHA_SEGURA>
PORT=8082
NODE_ENV=production
```

Subir o container:

```bash
docker compose up -d
```

Se seu ambiente exige proxy para baixar pacotes no build:

```bash
docker build \
  --build-arg HTTP_PROXY=http://usuario:senha@proxy:porta \
  --build-arg HTTPS_PROXY=http://usuario:senha@proxy:porta \
  -t healthcheck-backend .
```

---

### 2. Backend (manual com Node.js)

```bash
cd backend
npm install
npm start          # produção
npm run dev        # desenvolvimento (nodemon)
```

---

### 3. Instalar o agente nos servidores monitorados

**Via HTTP (recomendado)** — após o dashboard estar no ar:

```bash
curl -sSL http://<DASHBOARD_IP>:8082/scripts/install-monitoring.sh | sudo bash
```

**Ou localmente**, passando o IP do dashboard:

```bash
sudo ./scripts/install-monitoring.sh <DASHBOARD_IP> 8082
```

O instalador:
- Instala dependências (`curl`, `jq`, `smartmontools`, `lsof`)
- Copia `unified-health-check.sh` para `/usr/local/bin/`
- Configura cron para executar às 2h da madrugada
- Executa um teste imediato

---

## Estrutura do Projeto

```
server-healthcheck/
├── backend/
│   ├── server.js               # Entrada principal da API
│   ├── package.json
│   ├── .env.example            # Modelo de configuração
│   └── routes/
│       ├── dashboard.js        # GET /api/dashboard
│       ├── metrics.js          # POST/GET /api/metrics
│       └── storage.js          # POST/GET /api/storage
├── frontend/
│   ├── index.html              # Dashboard web
│   ├── dashboard.js            # Lógica do dashboard
│   ├── charts.js               # Gráficos (Chart.js)
│   └── style.css
├── scripts/
│   ├── unified-health-check.sh # Agente de coleta (roda nos servidores)
│   ├── install-monitoring.sh   # Instalador do agente
│   ├── setup-database.sh       # Setup inicial do PostgreSQL
│   └── cleanup-database.sh     # Limpeza periódica do banco
├── sql/
│   ├── schema.sql              # Schema completo (v2.0)
│   └── init.sql                # Dados iniciais (servidores)
├── Dockerfile
├── docker-compose.yml
└── .env.example
```

---

## API

### `POST /api/metrics`
Recebe métricas de saúde de um servidor.

**Body:**
```json
{
  "server_ip": "192.168.1.10",
  "cpu_usage": 45.2,
  "memory_usage": 60.1,
  "disk_usage": 72.0,
  "load_average": 1.5,
  "uptime": 864000,
  "network_rx": 123456789,
  "network_tx": 987654321
}
```

---

### `POST /api/storage`
Recebe dados de saúde do storage (discos, SMART, RAID, filesystem).

**Body:**
```json
{
  "server_ip": "192.168.1.10",
  "total_alerts": 1,
  "critical_alerts": 0,
  "warning_alerts": 1,
  "raid_status": true,
  "smart_status": true,
  "filesystem_status": true,
  "disks_over_threshold": [
    { "device": "/dev/sda1", "mount": "/", "size": "50G", "used": "44G", "free": "6G", "usage": 88 }
  ],
  "top_folders": [
    { "partition": "/", "path": "var", "size": "15G" }
  ],
  "summary": "1 alertas (0 críticos, 1 avisos)"
}
```

---

### `GET /api/dashboard`
Retorna o estado completo do dashboard: servidores, métricas atuais, alertas de storage e estatísticas gerais.

---

### `GET /api/dashboard/history/:serverId?hours=24`
Histórico de métricas de um servidor específico.

---

### `GET /api/metrics/:serverId?limit=50&offset=0`
Métricas paginadas de um servidor.

---

### `GET /api/storage/:serverId?limit=10`
Histórico de storage de um servidor.

---

## Banco de Dados

| Tabela | Descrição |
|---|---|
| `servers` | Cadastro de servidores monitorados |
| `health_metrics` | Histórico completo de métricas de CPU/memória/disco |
| `current_metrics` | Última métrica de cada servidor (atualizada por trigger) |
| `storage_health` | Histórico de saúde do storage |
| `current_storage_health` | Último estado de storage de cada servidor (atualizada por trigger) |

A função `cleanup_old_metrics()` mantém o banco enxuto:
- Últimos **7 registros** de métricas por servidor
- Erros dos últimos **30 dias**
- Últimos **7 registros** de storage por servidor

Configure no cron do servidor de banco:

```
0 3 * * * /path/to/scripts/cleanup-database.sh
```

---

## O que o agente coleta

O `unified-health-check.sh` executa uma vez por noite em cada servidor monitorado e coleta:

| Categoria | Dados |
|---|---|
| CPU | Percentual de uso |
| Memória | Percentual de uso |
| Disco (raiz) | Percentual de uso |
| Load average | Média de carga do sistema |
| Uptime | Tempo ligado em segundos |
| Rede | Bytes recebidos e transmitidos |
| Discos (todos) | Uso de cada partição montada |
| Top pastas | As 2 maiores pastas por partição |
| SMART | Saúde dos discos físicos |
| RAID | Status de arrays md |
| Filesystem | Contagem de erros ext3/ext4 |

**Alertas automáticos no backend** (sem configuração adicional):
- CPU ≥ 95%
- Memória ≥ 95%
- Disco ≥ 95%
- Load average ≥ 8

---

## Gerenciamento Docker

```bash
# Iniciar
docker compose up -d

# Parar
docker compose down

# Ver logs
docker compose logs -f

# Reconstruir após mudanças
docker compose up -d --build

# Entrar no container
docker exec -it healthcheck sh
```

---

## Licença

MIT
