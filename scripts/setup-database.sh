#!/bin/bash

# Script para configurar o banco PostgreSQL no servidor IP.12
# Uso: sudo ./setup-database.sh

DB_NAME="healthcheck"
DB_USER="healthcheck_app"
DB_PASSWORD="${DB_PASSWORD:-}"  # Defina via variável de ambiente: export DB_PASSWORD=sua_senha_segura
if [ -z "$DB_PASSWORD" ]; then
    echo "ERRO: Defina a variável DB_PASSWORD antes de executar este script."
    echo "Exemplo: export DB_PASSWORD=sua_senha_segura && sudo -E ./setup-database.sh"
    exit 1
fi

echo "=== Configuração do Banco PostgreSQL ==="
echo "Database: $DB_NAME"
echo "User: $DB_USER"

# Verificar se está rodando como root
if [[ $EUID -ne 0 ]]; then
   echo "Este script deve ser executado como root (sudo)"
   exit 1
fi

# 1. Instalar PostgreSQL
echo "Instalando PostgreSQL..."
if command -v apt-get >/dev/null 2>&1; then
    apt-get update
    apt-get install -y postgresql postgresql-contrib
elif command -v yum >/dev/null 2>&1; then
    yum install -y postgresql-server postgresql-contrib
    postgresql-setup initdb
elif command -v dnf >/dev/null 2>&1; then
    dnf install -y postgresql-server postgresql-contrib
    postgresql-setup --initdb
else
    echo "Gerenciador de pacotes não suportado"
    exit 1
fi

# 2. Iniciar e habilitar PostgreSQL
echo "Iniciando PostgreSQL..."
if command -v systemctl >/dev/null 2>&1; then
    systemctl start postgresql
    systemctl enable postgresql
elif command -v service >/dev/null 2>&1; then
    service postgresql start
fi

# 3. Configurar banco de dados
echo "Configurando banco de dados..."
sudo -u postgres psql << EOF
-- Criar banco de dados
CREATE DATABASE $DB_NAME;

-- Criar usuário
CREATE USER $DB_USER WITH PASSWORD '$DB_PASSWORD';

-- Conceder privilégios
GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;

-- Conceder privilégios para schema public
\c $DB_NAME
GRANT ALL ON SCHEMA public TO $DB_USER;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO $DB_USER;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO $DB_USER;

\q
EOF

# 4. Executar schema SQL
echo "Executando schema do banco..."
if [[ -f "../sql/schema.sql" ]]; then
    sudo -u postgres psql -d "$DB_NAME" -f "../sql/schema.sql"
else
    echo "Arquivo schema.sql não encontrado. Execute manualmente após copiar os arquivos SQL."
fi

if [[ -f "../sql/init.sql" ]]; then
    sudo -u postgres psql -d "$DB_NAME" -f "../sql/init.sql"
else
    echo "Arquivo init.sql não encontrado. Execute manualmente após copiar os arquivos SQL."
fi

# 5. Configurar acesso remoto
echo "Configurando acesso remoto..."

# Encontrar arquivo de configuração do PostgreSQL
PG_VERSION=$(sudo -u postgres psql -t -c "SELECT version();" | grep -oE '[0-9]+\.[0-9]+' | head -1)
PG_CONFIG_DIR="/etc/postgresql/$PG_VERSION/main"

if [[ ! -d "$PG_CONFIG_DIR" ]]; then
    PG_CONFIG_DIR="/var/lib/pgsql/data"
fi

if [[ ! -d "$PG_CONFIG_DIR" ]]; then
    echo "Diretório de configuração do PostgreSQL não encontrado. Configure manualmente:"
    echo "1. Edite postgresql.conf: listen_addresses = '*'"
    echo "2. Edite pg_hba.conf: adicione linha para permitir conexões dos IPs da sua rede interna"
    exit 1
fi

# Backup dos arquivos de configuração
cp "$PG_CONFIG_DIR/postgresql.conf" "$PG_CONFIG_DIR/postgresql.conf.backup"
cp "$PG_CONFIG_DIR/pg_hba.conf" "$PG_CONFIG_DIR/pg_hba.conf.backup"

# Configurar postgresql.conf
echo "Configurando postgresql.conf..."
sed -i "s/#listen_addresses = 'localhost'/listen_addresses = '*'/g" "$PG_CONFIG_DIR/postgresql.conf"

# Configurar pg_hba.conf
echo "Configurando pg_hba.conf..."
echo "" >> "$PG_CONFIG_DIR/pg_hba.conf"
echo "# Permitir conexões da rede interna para monitoramento" >> "$PG_CONFIG_DIR/pg_hba.conf"
echo "host    $DB_NAME    $DB_USER    ${DB_NETWORK:-10.0.0.0/24}    md5" >> "$PG_CONFIG_DIR/pg_hba.conf"

# 6. Configurar firewall (se existir)
echo "Configurando firewall..."
if command -v ufw >/dev/null 2>&1; then
    ufw allow from "${DB_NETWORK:-10.0.0.0/24}" to any port 5432
elif command -v firewall-cmd >/dev/null 2>&1; then
    firewall-cmd --permanent --add-rich-rule="rule family='ipv4' source address='${DB_NETWORK:-10.0.0.0/24}' port protocol='tcp' port='5432' accept"
    firewall-cmd --reload
fi

# 7. Reiniciar PostgreSQL
echo "Reiniciando PostgreSQL..."
if command -v systemctl >/dev/null 2>&1; then
    systemctl restart postgresql
elif command -v service >/dev/null 2>&1; then
    service postgresql restart
fi

# 8. Teste de conexão
echo "Testando conexão..."
sleep 3
if sudo -u postgres psql -d "$DB_NAME" -c "SELECT 1;" >/dev/null 2>&1; then
    echo "✅ Banco de dados configurado com sucesso!"
else
    echo "❌ Erro na configuração do banco de dados"
    exit 1
fi

echo ""
echo "=== Configuração Concluída ==="
echo "Database: $DB_NAME"
echo "User: $DB_USER"
echo "Host: <IP_DO_SERVIDOR_DB>"
echo "Port: 5432"
echo ""
echo "String de conexão:"
echo "postgresql://$DB_USER:<senha>@<IP_DO_SERVIDOR_DB>:5432/$DB_NAME"
echo ""
echo "⚠️  IMPORTANTE: Altere a senha padrão antes de usar em produção!"
echo "⚠️  Configure backup do banco de dados regularmente!"