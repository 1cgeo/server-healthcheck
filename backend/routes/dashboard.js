const express = require('express');
const { Pool } = require('pg');
const router = express.Router();

// Configuração do pool de conexões PostgreSQL
const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

// GET /api/dashboard - Dados completos do dashboard
router.get('/', async (req, res) => {
  const client = await pool.connect();
  
  try {
    // Buscar lista de servidores com métricas atuais
    const serversQuery = `
      SELECT 
        s.id,
        s.ip_address,
        s.hostname,
        s.status,
        s.description,
        cm.timestamp as last_update,
        cm.cpu_usage,
        cm.memory_usage,
        cm.disk_usage,
        cm.load_average,
        cm.uptime,
        CASE WHEN cm.timestamp IS NULL THEN true ELSE false END as is_error,
        CASE WHEN cm.timestamp IS NULL THEN 'Sem dados recentes' ELSE null END as error_message
      FROM servers s
      LEFT JOIN current_metrics cm ON s.id = cm.server_id
      ORDER BY s.ip_address
    `;

    const servers = await client.query(serversQuery);

    // Buscar erros recentes (últimas 25 horas - coleta noturna)
    const errorsQuery = `
      SELECT
        hm.id,
        hm.timestamp,
        hm.error_message,
        hm.cpu_usage,
        hm.memory_usage,
        hm.disk_usage,
        s.ip_address,
        s.hostname
      FROM health_metrics hm
      JOIN servers s ON hm.server_id = s.id
      WHERE hm.is_error = true
        AND hm.timestamp > NOW() - INTERVAL '25 hours'
      ORDER BY hm.timestamp DESC
      LIMIT 50
    `;

    const errors = await client.query(errorsQuery);

    // Estatísticas gerais (dados são coletados 1x por noite)
    const statsQuery = `
      SELECT
        COUNT(DISTINCT s.id) as total_servers,
        COUNT(DISTINCT CASE
          WHEN (cm.timestamp > NOW() - INTERVAL '25 hours'
                OR csh.timestamp > NOW() - INTERVAL '25 hours')
          THEN s.id
        END) as servers_online,
        (SELECT COUNT(*) FROM health_metrics WHERE is_error = true AND timestamp > NOW() - INTERVAL '25 hours') as errors_last_hour
      FROM servers s
      LEFT JOIN current_metrics cm ON s.id = cm.server_id
      LEFT JOIN current_storage_health csh ON s.id = csh.server_id
    `;

    const stats = await client.query(statsQuery);

    // Buscar dados de storage health
    const storageQuery = `
      SELECT
        s.id,
        s.ip_address,
        s.hostname,
        csh.total_alerts,
        csh.critical_alerts,
        csh.warning_alerts,
        csh.critical_disk_mount,
        csh.critical_disk_usage,
        csh.disks_over_threshold,
        csh.top_folders,
        csh.raid_status,
        csh.smart_status,
        csh.filesystem_status,
        csh.summary,
        csh.timestamp
      FROM servers s
      LEFT JOIN current_storage_health csh ON s.id = csh.server_id
      WHERE csh.timestamp IS NOT NULL
      ORDER BY csh.critical_alerts DESC, csh.total_alerts DESC, s.ip_address
    `;

    const storage = await client.query(storageQuery);

    res.json({
      success: true,
      data: {
        servers: servers.rows.map(server => ({
          ...server,
          is_online: server.last_update &&
            new Date(server.last_update) > new Date(Date.now() - 25 * 60 * 60 * 1000), // 25 horas
          uptime_formatted: server.uptime ? formatUptime(server.uptime) : null
        })),
        recent_errors: errors.rows,
        storage_alerts: storage.rows,
        stats: stats.rows[0] || { total_servers: 0, servers_online: 0, errors_last_hour: 0 }
      }
    });

  } catch (error) {
    console.error('Erro ao buscar dados do dashboard:', error);
    res.status(500).json({ 
      error: 'Erro interno do servidor',
      message: 'Não foi possível carregar os dados do dashboard'
    });
  } finally {
    client.release();
  }
});

// GET /api/dashboard/servers - Lista de servidores
router.get('/servers', async (req, res) => {
  const client = await pool.connect();
  
  try {
    const result = await client.query(`
      SELECT 
        s.*,
        COUNT(hm.id) as total_metrics,
        COUNT(CASE WHEN hm.is_error = true THEN 1 END) as total_errors,
        MAX(hm.timestamp) as last_metric
      FROM servers s
      LEFT JOIN health_metrics hm ON s.id = hm.server_id
      GROUP BY s.id
      ORDER BY s.ip_address
    `);

    res.json({
      success: true,
      data: result.rows
    });

  } catch (error) {
    console.error('Erro ao buscar servidores:', error);
    res.status(500).json({ 
      error: 'Erro interno do servidor',
      message: 'Não foi possível buscar a lista de servidores'
    });
  } finally {
    client.release();
  }
});

// GET /api/dashboard/history/:serverId - Histórico de um servidor
router.get('/history/:serverId', async (req, res) => {
  const client = await pool.connect();
  
  try {
    const { serverId } = req.params;
    const { hours = 24 } = req.query;

    const result = await client.query(`
      SELECT 
        timestamp,
        cpu_usage,
        memory_usage,
        disk_usage,
        load_average,
        network_rx,
        network_tx,
        is_error,
        error_message
      FROM health_metrics
      WHERE server_id = $1 
        AND timestamp > NOW() - INTERVAL '${hours} hours'
      ORDER BY timestamp ASC
    `, [serverId]);

    res.json({
      success: true,
      data: result.rows
    });

  } catch (error) {
    console.error('Erro ao buscar histórico:', error);
    res.status(500).json({ 
      error: 'Erro interno do servidor',
      message: 'Não foi possível buscar o histórico'
    });
  } finally {
    client.release();
  }
});

// Função auxiliar para formatar uptime
function formatUptime(seconds) {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  
  if (days > 0) {
    return `${days}d ${hours}h ${minutes}m`;
  } else if (hours > 0) {
    return `${hours}h ${minutes}m`;
  } else {
    return `${minutes}m`;
  }
}

module.exports = router;