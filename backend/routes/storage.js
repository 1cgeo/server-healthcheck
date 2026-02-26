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

// POST /api/storage - Receber dados de health check de storage
router.post('/', async (req, res) => {
  const client = await pool.connect();

  try {
    const {
      server_ip,
      total_alerts,
      critical_alerts,
      warning_alerts,
      critical_disk_mount,
      critical_disk_usage,
      disks_over_threshold,
      top_folders,
      raid_status,
      smart_status,
      filesystem_status,
      network_status,
      iowait_percent,
      summary,
      full_report
    } = req.body;

    // Validação básica
    if (!server_ip) {
      return res.status(400).json({
        error: 'Dados inválidos',
        details: ['IP do servidor é obrigatório']
      });
    }

    // Buscar ou criar servidor
    let serverResult = await client.query(
      'SELECT id FROM servers WHERE ip_address = $1',
      [server_ip]
    );

    let serverId;
    if (serverResult.rows.length === 0) {
      const insertResult = await client.query(
        'INSERT INTO servers (ip_address, hostname) VALUES ($1, $2) RETURNING id',
        [server_ip, `server-${server_ip.split('.').slice(-1)[0]}`]
      );
      serverId = insertResult.rows[0].id;
    } else {
      serverId = serverResult.rows[0].id;
    }

    // Inserir métricas de storage
    const insertQuery = `
      INSERT INTO storage_health (
        server_id, total_alerts, critical_alerts, warning_alerts,
        critical_disk_mount, critical_disk_usage, disks_over_threshold, top_folders,
        raid_status, smart_status, filesystem_status, network_status,
        iowait_percent, summary, full_report
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      RETURNING id, timestamp
    `;

    const result = await client.query(insertQuery, [
      serverId,
      total_alerts || 0,
      critical_alerts || 0,
      warning_alerts || 0,
      critical_disk_mount || null,
      critical_disk_usage || null,
      disks_over_threshold ? JSON.stringify(disks_over_threshold) : null,
      top_folders ? JSON.stringify(top_folders) : null,
      raid_status !== false,
      smart_status !== false,
      filesystem_status !== false,
      network_status !== false,
      iowait_percent || null,
      summary || null,
      full_report ? JSON.stringify(full_report) : null
    ]);

    res.status(201).json({
      success: true,
      message: 'Dados de storage recebidos com sucesso',
      data: {
        id: result.rows[0].id,
        timestamp: result.rows[0].timestamp,
        server_id: serverId
      }
    });

  } catch (error) {
    console.error('Erro ao salvar dados de storage:', error);
    res.status(500).json({
      error: 'Erro interno do servidor',
      message: 'Não foi possível salvar os dados de storage'
    });
  } finally {
    client.release();
  }
});

// GET /api/storage/:serverId - Obter histórico de storage de um servidor
router.get('/:serverId', async (req, res) => {
  const client = await pool.connect();

  try {
    const { serverId } = req.params;
    const { limit = 10 } = req.query;

    const result = await client.query(`
      SELECT * FROM storage_health
      WHERE server_id = $1
      ORDER BY timestamp DESC
      LIMIT $2
    `, [serverId, limit]);

    res.json({
      success: true,
      data: result.rows
    });

  } catch (error) {
    console.error('Erro ao buscar dados de storage:', error);
    res.status(500).json({
      error: 'Erro interno do servidor',
      message: 'Não foi possível buscar os dados de storage'
    });
  } finally {
    client.release();
  }
});

module.exports = router;
