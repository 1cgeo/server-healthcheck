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

// Validação de entrada
function validateMetrics(data) {
  const errors = [];
  
  if (!data.server_ip) errors.push('IP do servidor é obrigatório');
  if (typeof data.cpu_usage !== 'number' || data.cpu_usage < 0 || data.cpu_usage > 100) {
    errors.push('Uso de CPU deve ser um número entre 0 e 100');
  }
  if (typeof data.memory_usage !== 'number' || data.memory_usage < 0 || data.memory_usage > 100) {
    errors.push('Uso de memória deve ser um número entre 0 e 100');
  }
  if (typeof data.disk_usage !== 'number' || data.disk_usage < 0 || data.disk_usage > 100) {
    errors.push('Uso de disco deve ser um número entre 0 e 100');
  }
  
  return errors;
}

// POST /api/metrics - Receber métricas de saúde
router.post('/', async (req, res) => {
  const client = await pool.connect();
  
  try {
    const {
      server_ip,
      cpu_usage,
      memory_usage,
      memory_total,
      memory_used,
      disk_usage,
      disk_total,
      disk_used,
      load_average,
      uptime,
      network_rx,
      network_tx,
      processes_total,
      processes_running,
      error_message
    } = req.body;

    // Validação
    const validationErrors = validateMetrics(req.body);
    if (validationErrors.length > 0) {
      return res.status(400).json({ 
        error: 'Dados inválidos', 
        details: validationErrors 
      });
    }

    // Buscar ou criar servidor
    let serverResult = await client.query(
      'SELECT id FROM servers WHERE ip_address = $1',
      [server_ip]
    );

    let serverId;
    if (serverResult.rows.length === 0) {
      // Criar novo servidor
      const insertResult = await client.query(
        'INSERT INTO servers (ip_address, hostname) VALUES ($1, $2) RETURNING id',
        [server_ip, `server-${server_ip.split('.').slice(-1)[0]}`]
      );
      serverId = insertResult.rows[0].id;
    } else {
      serverId = serverResult.rows[0].id;
    }

    // Detectar erros automáticos baseado em thresholds críticos
    let autoErrorMessage = null;
    const errors = [];

    if (cpu_usage >= 95) errors.push(`CPU crítica: ${cpu_usage.toFixed(1)}%`);
    if (memory_usage >= 95) errors.push(`Memória crítica: ${memory_usage.toFixed(1)}%`);
    if (disk_usage >= 95) errors.push(`Disco crítico: ${disk_usage.toFixed(1)}%`);
    if (load_average && load_average >= 8) errors.push(`Load alto: ${load_average.toFixed(2)}`);

    if (errors.length > 0) {
      autoErrorMessage = errors.join(' | ');
    }

    const finalErrorMessage = error_message || autoErrorMessage;
    const isError = !!finalErrorMessage;

    // Inserir métricas
    const insertQuery = `
      INSERT INTO health_metrics (
        server_id, cpu_usage, memory_usage, memory_total, memory_used,
        disk_usage, disk_total, disk_used, load_average, uptime,
        network_rx, network_tx, processes_total, processes_running,
        is_error, error_message, raw_data
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
      RETURNING id, timestamp
    `;

    const result = await client.query(insertQuery, [
      serverId,
      cpu_usage,
      memory_usage,
      memory_total || null,
      memory_used || null,
      disk_usage,
      disk_total || null,
      disk_used || null,
      load_average || null,
      uptime || null,
      network_rx || null,
      network_tx || null,
      processes_total || null,
      processes_running || null,
      isError,
      finalErrorMessage,
      JSON.stringify(req.body)
    ]);

    res.status(201).json({
      success: true,
      message: 'Métricas recebidas com sucesso',
      data: {
        id: result.rows[0].id,
        timestamp: result.rows[0].timestamp,
        server_id: serverId
      }
    });

  } catch (error) {
    console.error('Erro ao salvar métricas:', error);
    res.status(500).json({ 
      error: 'Erro interno do servidor',
      message: 'Não foi possível salvar as métricas'
    });
  } finally {
    client.release();
  }
});

// GET /api/metrics/:serverId - Obter métricas de um servidor específico
router.get('/:serverId', async (req, res) => {
  const client = await pool.connect();
  
  try {
    const { serverId } = req.params;
    const { limit = 50, offset = 0 } = req.query;

    const result = await client.query(`
      SELECT * FROM health_metrics 
      WHERE server_id = $1 
      ORDER BY timestamp DESC 
      LIMIT $2 OFFSET $3
    `, [serverId, limit, offset]);

    res.json({
      success: true,
      data: result.rows,
      total: result.rows.length
    });

  } catch (error) {
    console.error('Erro ao buscar métricas:', error);
    res.status(500).json({ 
      error: 'Erro interno do servidor',
      message: 'Não foi possível buscar as métricas'
    });
  } finally {
    client.release();
  }
});

module.exports = router;