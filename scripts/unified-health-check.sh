#!/bin/bash

# ===========================================================================
# unified-health-check.sh - Verificação Completa Unificada (1x por noite)
# ===========================================================================
# Coleta: Métricas do servidor + Saúde do storage + Espaço em disco
# Execução: 1x ao dia (cron noturno)
# ===========================================================================

# Forçar locale para usar ponto decimal
export LC_NUMERIC=C

# Configurações
API_BASE_URL="http://<DASHBOARD_IP>:8082/api"
LOG_FILE="/var/log/unified-health-check.log"
TIMEOUT=60

# Limiares
DISK_WARN=85
DISK_CRIT=95
SMART_WARN=50
SMART_CRIT=500

# Função para log
log_message() {
    echo "$(date '+%Y-%m-%d %H:%M:%S') - $1" | tee -a "$LOG_FILE"
}

# Verificar root
if [ "$EUID" -ne 0 ]; then
    log_message "ERRO: Este script deve ser executado como root"
    exit 1
fi

log_message "=== Iniciando verificação unificada de saúde ==="

# ===========================================================================
# PARTE 1: MÉTRICAS BÁSICAS DO SERVIDOR
# ===========================================================================
log_message "Coletando métricas básicas do servidor..."

# CPU Usage
CPU_USAGE=$(top -bn1 | grep "Cpu(s)" | awk '{print $2}' | cut -d'%' -f1)
if [ -z "$CPU_USAGE" ]; then
    CPU_USAGE=$(printf "%.2f" 0)
else
    CPU_USAGE=$(printf "%.2f" "$CPU_USAGE")
fi

# Memory Usage
MEMORY_INFO=$(free | grep Mem)
TOTAL_MEM=$(echo "$MEMORY_INFO" | awk '{print $2}')
USED_MEM=$(echo "$MEMORY_INFO" | awk '{print $3}')
MEMORY_USAGE=$(awk "BEGIN {printf \"%.2f\", ($USED_MEM/$TOTAL_MEM)*100}")

# Disk Usage (partição raiz)
DISK_USAGE=$(df -h / | awk 'NR==2 {print $5}' | sed 's/%//')
if [ -z "$DISK_USAGE" ]; then
    DISK_USAGE=0
fi

# Load Average
LOAD_AVG=$(uptime | awk -F'load average:' '{print $2}' | awk '{print $1}' | sed 's/,//')
if [ -z "$LOAD_AVG" ]; then
    LOAD_AVG=0
fi

# Uptime em segundos
UPTIME_SECONDS=$(cat /proc/uptime | awk '{print int($1)}')

# Network (bytes recebidos e transmitidos)
NETWORK_RX=$(cat /sys/class/net/$(ip route | grep default | awk '{print $5}' | head -1)/statistics/rx_bytes 2>/dev/null || echo 0)
NETWORK_TX=$(cat /sys/class/net/$(ip route | grep default | awk '{print $5}' | head -1)/statistics/tx_bytes 2>/dev/null || echo 0)

# IP do servidor (pegar IP da interface com rota padrão)
SERVER_IP=$(ip route get 1.1.1.1 2>/dev/null | awk '{print $7; exit}')
# Fallback: primeiro IP disponível
if [ -z "$SERVER_IP" ]; then
    SERVER_IP=$(hostname -I | awk '{print $1}')
fi

log_message "CPU: $CPU_USAGE%, MEM: $MEMORY_USAGE%, DISK: $DISK_USAGE%, LOAD: $LOAD_AVG"

# ===========================================================================
# PARTE 2: INFORMAÇÕES DE ESPAÇO EM DISCO
# ===========================================================================
log_message "Coletando informações de espaço em disco..."

DISKS_JSON="[]"
DISKS_ARRAY=""
CRITICAL_DISK_MOUNT=""
CRITICAL_DISK_USAGE=0
TOTAL_ALERTS=0
CRITICAL_ALERTS=0
WARNING_ALERTS=0

while IFS= read -r line; do
    # Pular linha de cabeçalho
    if echo "$line" | grep -q "Filesystem\|Size\|Avail"; then
        continue
    fi

    DEV=$(echo "$line" | awk '{print $1}')
    SIZE=$(echo "$line" | awk '{print $2}')
    USED=$(echo "$line" | awk '{print $3}')
    AVAIL=$(echo "$line" | awk '{print $4}')
    PCT=$(echo "$line" | awk '{print $5}' | tr -d '%')
    MOUNT=$(echo "$line" | awk '{print $6}')

    # Pular se não for número válido
    if ! [[ "$PCT" =~ ^[0-9]+$ ]]; then
        continue
    fi

    # Pular montagens Docker e temporárias
    if echo "$MOUNT" | grep -qE "docker|overlay|run|snap"; then
        continue
    fi

    # Adicionar ao JSON
    DISK_OBJ="{\"device\":\"$DEV\",\"mount\":\"$MOUNT\",\"size\":\"$SIZE\",\"used\":\"$USED\",\"free\":\"$AVAIL\",\"usage\":$PCT}"

    if [ -z "$DISKS_ARRAY" ]; then
        DISKS_ARRAY="$DISK_OBJ"
    else
        DISKS_ARRAY="$DISKS_ARRAY,$DISK_OBJ"
    fi

    # Verificar alertas
    if [ "$PCT" -ge "$DISK_CRIT" ]; then
        ((CRITICAL_ALERTS++))
        ((TOTAL_ALERTS++))
    elif [ "$PCT" -ge "$DISK_WARN" ]; then
        ((WARNING_ALERTS++))
        ((TOTAL_ALERTS++))
    fi

    # Disco mais crítico
    if [ "$PCT" -gt "$CRITICAL_DISK_USAGE" ]; then
        CRITICAL_DISK_MOUNT="$MOUNT"
        CRITICAL_DISK_USAGE="$PCT"
    fi
done < <(df -h --output=source,size,used,avail,pcent,target 2>/dev/null | grep -E '^/dev/' | grep -v '/boot')

if [ -n "$DISKS_ARRAY" ]; then
    DISKS_JSON="[$DISKS_ARRAY]"
fi

log_message "Encontrados $(echo "$DISKS_JSON" | jq 'length' 2>/dev/null || echo "?") discos"

# ===========================================================================
# PARTE 3: TOP 2 MAIORES PASTAS POR PARTIÇÃO
# ===========================================================================
log_message "Identificando maiores pastas por partição..."

TOP_FOLDERS_JSON="[]"
TOP_FOLDERS_ARRAY=""

# Processar apenas partições relevantes
PARTITIONS=$(df --output=target 2>/dev/null | grep -E '^/' | grep -v '/boot' | grep -v '/dev' | grep -v '/sys' | grep -v '/proc' | grep -v '/run' | grep -v 'docker' | grep -v 'overlay')

for PARTITION in $PARTITIONS; do
    log_message "Analisando $PARTITION..."

    # Encontrar as 2 maiores pastas (timeout 30s)
    TOP_DIRS=$(timeout 30 du -sh "$PARTITION"/*/ 2>/dev/null | sort -rh | head -2)

    if [ -z "$TOP_DIRS" ]; then
        continue
    fi

    while IFS= read -r dir_line; do
        DIR_SIZE=$(echo "$dir_line" | awk '{print $1}')
        DIR_PATH=$(echo "$dir_line" | awk '{print $2}' | sed "s|$PARTITION/||")

        FOLDER_OBJ="{\"partition\":\"$PARTITION\",\"path\":\"$DIR_PATH\",\"size\":\"$DIR_SIZE\"}"

        if [ -z "$TOP_FOLDERS_ARRAY" ]; then
            TOP_FOLDERS_ARRAY="$FOLDER_OBJ"
        else
            TOP_FOLDERS_ARRAY="$TOP_FOLDERS_ARRAY,$FOLDER_OBJ"
        fi
    done <<< "$TOP_DIRS"
done

if [ -n "$TOP_FOLDERS_ARRAY" ]; then
    TOP_FOLDERS_JSON="[$TOP_FOLDERS_ARRAY]"
fi

log_message "Encontradas $(echo "$TOP_FOLDERS_JSON" | jq 'length' 2>/dev/null || echo "?") pastas pesadas"

# ===========================================================================
# PARTE 4: VERIFICAÇÃO DE SAÚDE - SMART
# ===========================================================================
log_message "Verificando saúde dos discos (SMART)..."

SMART_STATUS=true
SMART_ISSUES=""

if command -v smartctl &>/dev/null; then
    # Detectar MegaRAID
    if lspci 2>/dev/null | grep -qi "megaraid\|PERC"; then
        RAID_DEV="/dev/sda"
        for SLOT in $(seq 0 12); do
            SMART_OUT=$(smartctl -a -d megaraid,$SLOT "$RAID_DEV" 2>&1)
            if echo "$SMART_OUT" | grep -q "failed\|No such device"; then
                continue
            fi

            GROWN=$(echo "$SMART_OUT" | grep "grown defect" | awk '{print $NF}')
            if [ -n "$GROWN" ] && [ "$GROWN" -gt "$SMART_CRIT" ] 2>/dev/null; then
                SMART_STATUS=false
                SMART_ISSUES="Slot $SLOT: $GROWN grown defects; "
                ((CRITICAL_ALERTS++))
                ((TOTAL_ALERTS++))
            elif [ -n "$GROWN" ] && [ "$GROWN" -gt "$SMART_WARN" ] 2>/dev/null; then
                SMART_ISSUES="Slot $SLOT: $GROWN grown defects (atenção); "
                ((WARNING_ALERTS++))
                ((TOTAL_ALERTS++))
            fi
        done
    else
        # Discos normais
        for DISK in $(lsblk -dpno NAME 2>/dev/null | grep -E '/dev/sd|/dev/nvme'); do
            HEALTH=$(smartctl -H "$DISK" 2>/dev/null | grep -i "result\|health" | awk -F: '{print $2}' | xargs)
            if [ -n "$HEALTH" ] && echo "$HEALTH" | grep -qvi "PASSED\|OK"; then
                SMART_STATUS=false
                SMART_ISSUES="$DISK: $HEALTH; "
                ((CRITICAL_ALERTS++))
                ((TOTAL_ALERTS++))
            fi
        done
    fi
fi

# ===========================================================================
# PARTE 5: VERIFICAÇÃO DE RAID
# ===========================================================================
RAID_STATUS=true
RAID_ISSUES=""

if [ -f /proc/mdstat ]; then
    if grep -q "_" /proc/mdstat; then
        RAID_STATUS=false
        RAID_ISSUES="RAID degradado detectado"
        ((CRITICAL_ALERTS++))
        ((TOTAL_ALERTS++))
    fi
fi

# ===========================================================================
# PARTE 6: VERIFICAÇÃO DE FILESYSTEM
# ===========================================================================
FILESYSTEM_STATUS=true
FS_ISSUES=""

for PART in $(df --output=source 2>/dev/null | grep -E '^/dev/' | sort -u); do
    FSTYPE=$(blkid -o value -s TYPE "$PART" 2>/dev/null)
    if [ "$FSTYPE" != "ext4" ] && [ "$FSTYPE" != "ext3" ]; then
        continue
    fi

    ERROR_COUNT=$(tune2fs -l "$PART" 2>/dev/null | grep "FS Error count:" | awk '{print $NF}')
    if [ -n "$ERROR_COUNT" ] && [ "$ERROR_COUNT" -gt 0 ] 2>/dev/null; then
        FILESYSTEM_STATUS=false
        MOUNT=$(df --output=target "$PART" 2>/dev/null | tail -1)
        FS_ISSUES="$MOUNT: $ERROR_COUNT erros; "
        ((CRITICAL_ALERTS++))
        ((TOTAL_ALERTS++))
    fi
done

# ===========================================================================
# PARTE 7: MONTAR SUMÁRIO
# ===========================================================================
SUMMARY="$TOTAL_ALERTS alertas"
if [ "$CRITICAL_ALERTS" -gt 0 ] || [ "$WARNING_ALERTS" -gt 0 ]; then
    SUMMARY="$TOTAL_ALERTS alertas ($CRITICAL_ALERTS críticos, $WARNING_ALERTS avisos)"
fi

if [ "$SMART_STATUS" = false ]; then
    SUMMARY="$SUMMARY | SMART: $SMART_ISSUES"
fi
if [ "$RAID_STATUS" = false ]; then
    SUMMARY="$SUMMARY | RAID: $RAID_ISSUES"
fi
if [ "$FILESYSTEM_STATUS" = false ]; then
    SUMMARY="$SUMMARY | FS: $FS_ISSUES"
fi

# ===========================================================================
# PARTE 8: ENVIAR MÉTRICAS BÁSICAS
# ===========================================================================
log_message "Enviando métricas básicas para API..."

METRICS_JSON=$(cat <<EOF
{
    "server_ip": "$SERVER_IP",
    "cpu_usage": $CPU_USAGE,
    "memory_usage": $MEMORY_USAGE,
    "disk_usage": $DISK_USAGE,
    "load_average": $LOAD_AVG,
    "uptime": $UPTIME_SECONDS,
    "network_rx": $NETWORK_RX,
    "network_tx": $NETWORK_TX,
    "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF
)

metrics_response=$(curl -X POST "$API_BASE_URL/metrics" \
    --noproxy '*' \
    --max-time $TIMEOUT \
    --silent \
    --write-out "HTTPSTATUS:%{http_code}" \
    -H "Content-Type: application/json" \
    -d "$METRICS_JSON")

metrics_http_code=$(echo $metrics_response | tr -d '\n' | sed -e 's/.*HTTPSTATUS://')

if [[ $metrics_http_code -eq 201 ]]; then
    log_message "✓ Métricas básicas enviadas com sucesso"
else
    log_message "✗ Falha ao enviar métricas. HTTP: $metrics_http_code"
fi

# ===========================================================================
# PARTE 9: ENVIAR DADOS DE STORAGE
# ===========================================================================
log_message "Enviando dados de storage para API..."

STORAGE_JSON=$(cat <<EOF
{
    "server_ip": "$SERVER_IP",
    "total_alerts": $TOTAL_ALERTS,
    "critical_alerts": $CRITICAL_ALERTS,
    "warning_alerts": $WARNING_ALERTS,
    "critical_disk_mount": $([ -n "$CRITICAL_DISK_MOUNT" ] && echo "\"$CRITICAL_DISK_MOUNT\"" || echo "null"),
    "critical_disk_usage": $([ "$CRITICAL_DISK_USAGE" -gt 0 ] && echo "$CRITICAL_DISK_USAGE" || echo "null"),
    "disks_over_threshold": $DISKS_JSON,
    "top_folders": $TOP_FOLDERS_JSON,
    "raid_status": $RAID_STATUS,
    "smart_status": $SMART_STATUS,
    "filesystem_status": $FILESYSTEM_STATUS,
    "summary": "$SUMMARY",
    "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF
)

storage_response=$(curl -X POST "$API_BASE_URL/storage" \
    --noproxy '*' \
    --max-time $TIMEOUT \
    --silent \
    --write-out "HTTPSTATUS:%{http_code}" \
    -H "Content-Type: application/json" \
    -d "$STORAGE_JSON")

storage_http_code=$(echo $storage_response | tr -d '\n' | sed -e 's/.*HTTPSTATUS://')

if [[ $storage_http_code -eq 201 ]]; then
    log_message "✓ Dados de storage enviados com sucesso"
else
    log_message "✗ Falha ao enviar storage. HTTP: $storage_http_code"
fi

# ===========================================================================
# RESULTADO FINAL
# ===========================================================================
if [[ $metrics_http_code -eq 201 ]] && [[ $storage_http_code -eq 201 ]]; then
    log_message "✓ VERIFICAÇÃO COMPLETA - CPU: $CPU_USAGE%, MEM: $MEMORY_USAGE%, DISK: $DISK_USAGE% | Alertas: $TOTAL_ALERTS ($CRITICAL_ALERTS críticos)"
    exit 0
else
    log_message "✗ VERIFICAÇÃO INCOMPLETA - Verifique os logs acima"
    exit 1
fi
