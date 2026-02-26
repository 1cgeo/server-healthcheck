#!/bin/bash

# ===========================================================================
# install-monitoring.sh - Instala monitoramento unificado em servidores
# ===========================================================================
# Uso: curl -sSL http://DASHBOARD_IP:8082/scripts/install-monitoring.sh | sudo bash
# Ou:  sudo ./install-monitoring.sh [DASHBOARD_IP] [DASHBOARD_PORT]
# ===========================================================================

set -e

# Configurações (pode passar via argumentos)
DASHBOARD_IP="${1:-<DASHBOARD_IP>}"
DASHBOARD_PORT="${2:-8082}"
API_BASE_URL="http://${DASHBOARD_IP}:${DASHBOARD_PORT}/api"

SCRIPT_NAME="unified-health-check.sh"
SCRIPT_PATH="/usr/local/bin/${SCRIPT_NAME}"
LOG_FILE="/var/log/unified-health-check.log"

# Cron: executar às 2h da manhã todos os dias
CRON_SCHEDULE="0 2 * * *"

echo "==========================================="
echo "  Instalador - Sistema de Monitoramento"
echo "==========================================="
echo "Dashboard: ${DASHBOARD_IP}:${DASHBOARD_PORT}"
echo "Script: ${SCRIPT_PATH}"
echo "Cron: ${CRON_SCHEDULE}"
echo ""

# Verificar root
if [[ $EUID -ne 0 ]]; then
   echo "❌ ERRO: Este script deve ser executado como root (sudo)"
   exit 1
fi

# Detectar OS
if [ -f /etc/os-release ]; then
    . /etc/os-release
    OS=$ID
else
    OS=$(uname -s)
fi

echo "🔍 Sistema detectado: $OS"

# Função para verificar comando
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# 1. Instalar dependências
echo ""
echo "📦 Instalando dependências..."

if command_exists apt-get; then
    apt-get update -qq
    apt-get install -y curl jq smartmontools lsof 2>/dev/null || echo "⚠️  Algumas dependências podem não estar disponíveis"
elif command_exists yum; then
    yum install -y curl jq smartmontools lsof
elif command_exists dnf; then
    dnf install -y curl jq smartmontools lsof
else
    echo "⚠️  Gerenciador de pacotes não reconhecido. Instale manualmente: curl, jq, smartmontools"
fi

# Verificar se jq foi instalado
if ! command_exists jq; then
    echo "⚠️  jq não pôde ser instalado via apt/yum. Baixando binário..."
    curl -L https://github.com/jqlang/jq/releases/download/jq-1.7.1/jq-linux-amd64 \
        -o /usr/local/bin/jq 2>/dev/null || echo "⚠️  Falha ao baixar jq"
    chmod +x /usr/local/bin/jq
fi

# 2. Baixar script de monitoramento
echo ""
echo "📥 Baixando script de monitoramento..."

curl -sSL "http://${DASHBOARD_IP}:${DASHBOARD_PORT}/scripts/${SCRIPT_NAME}" \
    -o "${SCRIPT_PATH}" \
    --noproxy '*' \
    --max-time 30

if [ ! -f "${SCRIPT_PATH}" ]; then
    echo "❌ ERRO: Falha ao baixar o script"
    exit 1
fi

# Ajustar permissões e line endings
chmod +x "${SCRIPT_PATH}"
sed -i 's/\r$//' "${SCRIPT_PATH}" 2>/dev/null || dos2unix "${SCRIPT_PATH}" 2>/dev/null || true

# Atualizar API_BASE_URL no script
sed -i "s|API_BASE_URL=.*|API_BASE_URL=\"${API_BASE_URL}\"|" "${SCRIPT_PATH}"

echo "✅ Script instalado: ${SCRIPT_PATH}"

# 3. Configurar cron
echo ""
echo "⏰ Configurando cron..."

# Remover crons antigos
crontab -l 2>/dev/null | grep -v "health-check.sh" | grep -v "daily-storage-check.sh" | grep -v "unified-health-check.sh" | crontab - 2>/dev/null || true

# Adicionar novo cron
(crontab -l 2>/dev/null; echo "${CRON_SCHEDULE} ${SCRIPT_PATH}") | crontab -

echo "✅ Cron configurado: ${CRON_SCHEDULE}"

# 4. Testar execução
echo ""
echo "🧪 Testando execução..."

${SCRIPT_PATH}

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Instalação concluída com sucesso!"
    echo ""
    echo "📋 Logs: tail -f ${LOG_FILE}"
    echo "🔄 Cron: crontab -l"
    echo "🧪 Testar: sudo ${SCRIPT_PATH}"
else
    echo ""
    echo "⚠️  Script instalado, mas o teste falhou. Verifique os logs:"
    echo "   tail -20 ${LOG_FILE}"
fi
