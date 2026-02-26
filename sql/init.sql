-- Inicialização do banco de dados
-- Inserir servidores iniciais

-- Exemplo: insira os IPs reais dos seus servidores abaixo
-- INSERT INTO servers (ip_address, hostname, description) VALUES
-- ('<IP_DASHBOARD>', 'dashboard-server', 'Servidor do dashboard e API'),
-- ('<IP_SERVER_1>', 'server-01', 'Servidor de aplicação 1'),
-- ('<IP_SERVER_2>', 'server-02', 'Servidor de aplicação 2'),
-- ('<IP_SERVER_3>', 'server-03', 'Servidor de aplicação 3');

-- Criar usuário para a aplicação (ajustar senha conforme necessário)
-- IMPORTANTE: Execute isso manualmente com senha segura
-- CREATE USER healthcheck_app WITH PASSWORD 'sua_senha_segura_aqui';
-- GRANT CONNECT ON DATABASE healthcheck TO healthcheck_app;
-- GRANT USAGE ON SCHEMA public TO healthcheck_app;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO healthcheck_app;
-- GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO healthcheck_app;
-- GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO healthcheck_app;