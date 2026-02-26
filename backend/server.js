const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
require('dotenv').config();

const metricsRoutes = require('./routes/metrics');
const dashboardRoutes = require('./routes/dashboard');
const storageRoutes = require('./routes/storage');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware de segurança
app.use(helmet({
  contentSecurityPolicy: false,  // Desabilitado temporariamente para debug
  crossOriginOpenerPolicy: false
}));
app.use(cors());

// Rate limiting
const limiter = rateLimit({
  windowMs: (process.env.RATE_LIMIT_WINDOW || 15) * 60 * 1000, // 15 minutos
  max: process.env.RATE_LIMIT_MAX || 100, // limite de 100 requests por janela
  message: 'Muitas requisições, tente novamente mais tarde.'
});
app.use(limiter);

// Middleware para parsing JSON
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Servir arquivos estáticos do frontend
// No Docker: frontend está em ./public, localmente em ../frontend
const frontendPath = process.env.DOCKER === 'true'
  ? path.join(__dirname, 'public')
  : path.join(__dirname, '../frontend');

app.use(express.static(frontendPath));

// Rotas da API
app.use('/api/metrics', metricsRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/storage', storageRoutes);

// Rota para servir o frontend
app.get('/', (req, res) => {
  res.sendFile(path.join(frontendPath, 'index.html'));
});

// Middleware de tratamento de erros
app.use((err, req, res, next) => {
  console.error('Erro:', err.stack);
  res.status(500).json({ 
    error: 'Erro interno do servidor',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Algo deu errado'
  });
});

// Middleware para rotas não encontradas
app.use((req, res) => {
  res.status(404).json({ error: 'Rota não encontrada' });
});

// Iniciar servidor
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Servidor rodando na porta ${PORT}`);
  console.log(`Dashboard disponível em: http://localhost:${PORT}`);
});