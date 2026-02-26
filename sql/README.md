# SQL - Estrutura do Banco de Dados

## Arquivos Principais

### ✅ `schema.sql` (CONSOLIDADO - v2.0)
**Schema completo do sistema** - Execute este arquivo para criar toda a estrutura.

Contém:
- Tabela `servers` - Cadastro de servidores
- Tabela `health_metrics` - Histórico completo de métricas
- Tabela `current_metrics` - Última métrica de cada servidor
- Tabela `storage_health` - Histórico de storage/saúde dos discos
- Tabela `current_storage_health` - Última verificação de storage
- Triggers automáticos para atualização de current_*
- Funções auxiliares de limpeza

### ✅ `init.sql`
**Dados iniciais** - Insere servidores iniciais e instruções para criar usuário.

---

## ⚠️ Arquivos Obsoletos (podem ser deletados)

- ❌ `storage-health-schema.sql` - Agora está consolidado no `schema.sql`
- ❌ `update-storage-add-top-folders.sql` - Já incluído no `schema.sql`

---

## Como Usar

### 1. Primeira instalação (banco novo)

```bash
# Criar banco
psql -h <DB_HOST> -p <DB_PORT> -U postgres -c "CREATE DATABASE healthcheck;"

# Executar schema completo
psql -h <DB_HOST> -p <DB_PORT> -U postgres -d healthcheck -f sql/schema.sql

# Inserir dados iniciais (opcional)
psql -h <DB_HOST> -p <DB_PORT> -U postgres -d healthcheck -f sql/init.sql
```

### 2. Atualizar banco existente

```bash
# Apenas recriar funções e triggers (safe)
psql -h <DB_HOST> -p <DB_PORT> -U postgres -d healthcheck -f sql/schema.sql
```

O schema usa `CREATE TABLE IF NOT EXISTS` e `CREATE OR REPLACE FUNCTION`, então é **seguro executar múltiplas vezes** sem perder dados.

### 3. Criar usuário da aplicação

```sql
CREATE USER healthcheck_app WITH PASSWORD '<SUA_SENHA_SEGURA>';
GRANT CONNECT ON DATABASE healthcheck TO healthcheck_app;
GRANT USAGE ON SCHEMA public TO healthcheck_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO healthcheck_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO healthcheck_app;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO healthcheck_app;
```

---

## Estrutura de Tabelas

### 📊 Métricas Básicas
```
health_metrics (histórico) → current_metrics (última)
   ↓ trigger automático
```

### 💾 Storage/Saúde dos Discos
```
storage_health (histórico) → current_storage_health (última)
   ↓ trigger automático
```

### 🔄 Limpeza Automática

Execute periodicamente para manter o banco limpo:

```sql
SELECT cleanup_old_metrics();
```

Mantém:
- Últimos 7 registros de métricas bem-sucedidas por servidor
- Últimos 7 registros de storage por servidor
- Erros dos últimos 30 dias

**Recomendação:** Adicionar ao cron do PostgreSQL para rodar diariamente.

---

## Campos JSONB

### `disks_over_threshold`
```json
[
  {
    "device": "/dev/sda1",
    "mount": "/",
    "size": "50G",
    "used": "41G",
    "free": "9G",
    "usage": 82
  }
]
```

### `top_folders`
```json
[
  {
    "partition": "/",
    "path": "var",
    "size": "15G"
  },
  {
    "partition": "/",
    "path": "usr",
    "size": "12G"
  }
]
```

---

## Versão

**Versão atual:** 2.0 (2026-02-25)
- Schema consolidado único
- Suporte completo a storage health
- Top folders por partição
- Triggers automáticos
- Funções de limpeza
