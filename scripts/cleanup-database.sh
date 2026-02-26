#!/bin/bash

# Script para limpeza periódica do banco de dados
# Execute via cron uma vez por dia: 0 3 * * * /path/to/cleanup-database.sh

DB_HOST="${DB_HOST:-<DB_HOST>}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-healthcheck}"
DB_USER="${DB_USER:-postgres}"

LOG_FILE="/var/log/database-cleanup.log"

# Função para log
log_message() {
    echo "$(date '+%Y-%m-%d %H:%M:%S') - $1" | tee -a "$LOG_FILE"
}

log_message "Iniciando limpeza do banco de dados"

# Verificar se psql está disponível
if ! command -v psql &> /dev/null; then
    log_message "ERRO: psql não está instalado"
    exit 1
fi

# Executar limpeza
PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" << EOF
-- Executar função de limpeza
SELECT cleanup_old_metrics();

-- Verificar estatísticas após limpeza
SELECT 
    'health_metrics' as tabela,
    COUNT(*) as total_registros,
    COUNT(*) FILTER (WHERE is_error = false) as registros_sucesso,
    COUNT(*) FILTER (WHERE is_error = true) as registros_erro
FROM health_metrics;

SELECT
    'current_metrics' as tabela,
    COUNT(*) as total_registros
FROM current_metrics;

SELECT
    'storage_health' as tabela,
    COUNT(*) as total_registros
FROM storage_health;

SELECT
    'current_storage_health' as tabela,
    COUNT(*) as total_registros
FROM current_storage_health;

-- VACUUM para liberar espaço
VACUUM ANALYZE health_metrics;
VACUUM ANALYZE current_metrics;
VACUUM ANALYZE storage_health;
VACUUM ANALYZE current_storage_health;
EOF

if [ $? -eq 0 ]; then
    log_message "Limpeza concluída com sucesso"
else
    log_message "ERRO: Falha na limpeza do banco"
    exit 1
fi

log_message "Fim da limpeza"