-- ===========================================================================
-- Schema Completo - Sistema de Monitoramento de Servidores
-- ===========================================================================
-- Versão: 2.0 (Consolidado)
-- Data: 2026-02-25
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. TABELA DE SERVIDORES
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS servers (
    id SERIAL PRIMARY KEY,
    ip_address VARCHAR(15) UNIQUE NOT NULL,
    hostname VARCHAR(255),
    status VARCHAR(20) DEFAULT 'active',
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_servers_ip ON servers(ip_address);

-- Trigger para atualizar updated_at automaticamente
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_servers_updated_at ON servers;
CREATE TRIGGER update_servers_updated_at
    BEFORE UPDATE ON servers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ---------------------------------------------------------------------------
-- 2. TABELA DE MÉTRICAS DE SAÚDE (Histórico completo)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS health_metrics (
    id SERIAL PRIMARY KEY,
    server_id INTEGER REFERENCES servers(id) ON DELETE CASCADE,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- Métricas básicas
    cpu_usage DECIMAL(5,2),
    memory_usage DECIMAL(5,2),
    memory_total BIGINT,
    memory_used BIGINT,
    disk_usage DECIMAL(5,2),
    disk_total BIGINT,
    disk_used BIGINT,
    load_average DECIMAL(5,2),
    uptime BIGINT,

    -- Rede
    network_rx BIGINT,
    network_tx BIGINT,

    -- Processos
    processes_total INTEGER,
    processes_running INTEGER,

    -- Erros
    is_error BOOLEAN DEFAULT FALSE,
    error_message TEXT,

    -- Dados brutos
    raw_data JSONB
);

CREATE INDEX IF NOT EXISTS idx_health_metrics_server_timestamp
    ON health_metrics(server_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_health_metrics_timestamp
    ON health_metrics(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_health_metrics_errors
    ON health_metrics(is_error, timestamp DESC) WHERE is_error = TRUE;

-- ---------------------------------------------------------------------------
-- 3. TABELA DE MÉTRICAS ATUAIS (Última métrica de cada servidor)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS current_metrics (
    server_id INTEGER REFERENCES servers(id) ON DELETE CASCADE PRIMARY KEY,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    cpu_usage DECIMAL(5,2),
    memory_usage DECIMAL(5,2),
    memory_total BIGINT,
    memory_used BIGINT,
    disk_usage DECIMAL(5,2),
    disk_total BIGINT,
    disk_used BIGINT,
    load_average DECIMAL(5,2),
    uptime BIGINT,
    network_rx BIGINT,
    network_tx BIGINT,
    processes_total INTEGER,
    processes_running INTEGER,
    raw_data JSONB,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_current_metrics_timestamp
    ON current_metrics(timestamp DESC);

-- Função para atualizar métricas atuais (UPSERT)
CREATE OR REPLACE FUNCTION update_current_metrics()
RETURNS TRIGGER AS $$
BEGIN
    -- Apenas para registros bem-sucedidos
    IF NEW.is_error = FALSE THEN
        INSERT INTO current_metrics (
            server_id, timestamp, cpu_usage, memory_usage, memory_total, memory_used,
            disk_usage, disk_total, disk_used, load_average, uptime,
            network_rx, network_tx, processes_total, processes_running, raw_data
        ) VALUES (
            NEW.server_id, NEW.timestamp, NEW.cpu_usage, NEW.memory_usage,
            NEW.memory_total, NEW.memory_used, NEW.disk_usage, NEW.disk_total,
            NEW.disk_used, NEW.load_average, NEW.uptime, NEW.network_rx,
            NEW.network_tx, NEW.processes_total, NEW.processes_running, NEW.raw_data
        )
        ON CONFLICT (server_id) DO UPDATE SET
            timestamp = EXCLUDED.timestamp,
            cpu_usage = EXCLUDED.cpu_usage,
            memory_usage = EXCLUDED.memory_usage,
            memory_total = EXCLUDED.memory_total,
            memory_used = EXCLUDED.memory_used,
            disk_usage = EXCLUDED.disk_usage,
            disk_total = EXCLUDED.disk_total,
            disk_used = EXCLUDED.disk_used,
            load_average = EXCLUDED.load_average,
            uptime = EXCLUDED.uptime,
            network_rx = EXCLUDED.network_rx,
            network_tx = EXCLUDED.network_tx,
            processes_total = EXCLUDED.processes_total,
            processes_running = EXCLUDED.processes_running,
            raw_data = EXCLUDED.raw_data,
            updated_at = CURRENT_TIMESTAMP;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_current_metrics_trigger ON health_metrics;
CREATE TRIGGER update_current_metrics_trigger
    AFTER INSERT ON health_metrics
    FOR EACH ROW EXECUTE FUNCTION update_current_metrics();

-- ---------------------------------------------------------------------------
-- 4. TABELA DE STORAGE HEALTH (Histórico completo)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS storage_health (
    id SERIAL PRIMARY KEY,
    server_id INTEGER REFERENCES servers(id) ON DELETE CASCADE,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- Resumo de alertas
    total_alerts INTEGER DEFAULT 0,
    critical_alerts INTEGER DEFAULT 0,
    warning_alerts INTEGER DEFAULT 0,

    -- Disco mais crítico
    critical_disk_mount VARCHAR(255),
    critical_disk_usage DECIMAL(5,2),

    -- Discos críticos (JSON array com size, used, free)
    disks_over_threshold JSONB,

    -- Top 2 maiores pastas por partição
    top_folders JSONB,

    -- Status de componentes (true = OK, false = problema)
    raid_status BOOLEAN DEFAULT true,
    smart_status BOOLEAN DEFAULT true,
    filesystem_status BOOLEAN DEFAULT true,
    network_status BOOLEAN DEFAULT true,

    -- I/O Wait
    iowait_percent DECIMAL(5,2),

    -- Dados completos do relatório
    full_report JSONB,

    -- Sumário textual
    summary TEXT
);

CREATE INDEX IF NOT EXISTS idx_storage_health_server_timestamp
    ON storage_health(server_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_storage_health_critical
    ON storage_health(critical_alerts DESC, timestamp DESC)
    WHERE critical_alerts > 0;

-- ---------------------------------------------------------------------------
-- 5. TABELA DE STORAGE ATUAL (Última verificação de cada servidor)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS current_storage_health (
    server_id INTEGER REFERENCES servers(id) ON DELETE CASCADE PRIMARY KEY,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    total_alerts INTEGER DEFAULT 0,
    critical_alerts INTEGER DEFAULT 0,
    warning_alerts INTEGER DEFAULT 0,
    critical_disk_mount VARCHAR(255),
    critical_disk_usage DECIMAL(5,2),
    disks_over_threshold JSONB,
    top_folders JSONB,
    raid_status BOOLEAN DEFAULT true,
    smart_status BOOLEAN DEFAULT true,
    filesystem_status BOOLEAN DEFAULT true,
    network_status BOOLEAN DEFAULT true,
    iowait_percent DECIMAL(5,2),
    summary TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Função para atualizar current_storage_health
CREATE OR REPLACE FUNCTION update_current_storage_health()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO current_storage_health (
        server_id, timestamp, total_alerts, critical_alerts, warning_alerts,
        critical_disk_mount, critical_disk_usage, disks_over_threshold, top_folders,
        raid_status, smart_status, filesystem_status, network_status,
        iowait_percent, summary
    ) VALUES (
        NEW.server_id, NEW.timestamp, NEW.total_alerts, NEW.critical_alerts,
        NEW.warning_alerts, NEW.critical_disk_mount, NEW.critical_disk_usage,
        NEW.disks_over_threshold, NEW.top_folders, NEW.raid_status, NEW.smart_status,
        NEW.filesystem_status, NEW.network_status, NEW.iowait_percent, NEW.summary
    )
    ON CONFLICT (server_id) DO UPDATE SET
        timestamp = EXCLUDED.timestamp,
        total_alerts = EXCLUDED.total_alerts,
        critical_alerts = EXCLUDED.critical_alerts,
        warning_alerts = EXCLUDED.warning_alerts,
        critical_disk_mount = EXCLUDED.critical_disk_mount,
        critical_disk_usage = EXCLUDED.critical_disk_usage,
        disks_over_threshold = EXCLUDED.disks_over_threshold,
        top_folders = EXCLUDED.top_folders,
        raid_status = EXCLUDED.raid_status,
        smart_status = EXCLUDED.smart_status,
        filesystem_status = EXCLUDED.filesystem_status,
        network_status = EXCLUDED.network_status,
        iowait_percent = EXCLUDED.iowait_percent,
        summary = EXCLUDED.summary,
        updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_current_storage_health_trigger ON storage_health;
CREATE TRIGGER update_current_storage_health_trigger
    AFTER INSERT ON storage_health
    FOR EACH ROW EXECUTE FUNCTION update_current_storage_health();

-- ---------------------------------------------------------------------------
-- 6. FUNÇÕES AUXILIARES
-- ---------------------------------------------------------------------------

-- Função para limpeza periódica de histórico
-- Recomendação: Executar diariamente via cron do PostgreSQL
CREATE OR REPLACE FUNCTION cleanup_old_metrics()
RETURNS void AS $$
BEGIN
    -- Manter apenas os últimos 7 registros bem-sucedidos por servidor
    DELETE FROM health_metrics
    WHERE is_error = FALSE
    AND id NOT IN (
        SELECT id FROM (
            SELECT id, ROW_NUMBER() OVER (PARTITION BY server_id ORDER BY timestamp DESC) as rn
            FROM health_metrics
            WHERE is_error = FALSE
        ) ranked
        WHERE rn <= 7
    );

    -- Limpar registros de erro muito antigos (>30 dias)
    DELETE FROM health_metrics
    WHERE is_error = TRUE
    AND timestamp < NOW() - INTERVAL '30 days';

    -- Limpar storage_health antigo (manter últimos 7 registros por servidor)
    DELETE FROM storage_health
    WHERE id NOT IN (
        SELECT id FROM (
            SELECT id, ROW_NUMBER() OVER (PARTITION BY server_id ORDER BY timestamp DESC) as rn
            FROM storage_health
        ) ranked
        WHERE rn <= 7
    );

    RAISE NOTICE 'Limpeza de métricas antigas concluída';
END;
$$ LANGUAGE plpgsql;

-- ===========================================================================
-- FIM DO SCHEMA
-- ===========================================================================
-- Para executar este schema:
-- psql -h <host> -p <port> -U postgres -d healthcheck -f schema.sql
-- ===========================================================================
