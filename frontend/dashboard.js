// Dashboard JavaScript - Gerenciamento de dados e interface
class Dashboard {
    constructor() {
        this.apiBaseUrl = '/api';
        this.refreshInterval = 60000; // 60 segundos
        this.autoRefreshEnabled = false; // PERMANENTEMENTE DESABILITADO - usuário atualizará manualmente
        this.refreshTimer = null;
        this.charts = {};
        this.currentData = {};
        
        this.init();
    }

    async init() {
        this.setupEventListeners();
        await this.loadInitialData();
        this.startAutoRefresh();
        this.updateLastUpdateTime();
    }

    setupEventListeners() {
        // Botão de refresh
        document.getElementById('refreshBtn').addEventListener('click', () => {
            this.loadInitialData();
        });

        // Fechar alertas
        document.getElementById('closeAlert').addEventListener('click', () => {
            this.hideAlert();
        });

        // Modal de histórico
        document.getElementById('closeHistoryModal').addEventListener('click', () => {
            this.closeHistoryModal();
        });

        // Período do histórico
        document.getElementById('historyPeriod').addEventListener('change', (e) => {
            this.loadServerHistory(this.currentSelectedServer, parseInt(e.target.value));
        });

        // Filtro de servidor na tabela de discos
        document.getElementById('diskServerFilter').addEventListener('change', (e) => {
            this.filterDisksByServer(e.target.value);
        });

        // Fechar modal ao clicar fora
        window.addEventListener('click', (e) => {
            const modal = document.getElementById('historyModal');
            if (e.target === modal) {
                this.closeHistoryModal();
            }
        });
    }

    async loadInitialData() {
        try {
            this.setRefreshLoading(true);
            await this.loadDashboardData();
            this.hideAlert();
        } catch (error) {
            console.error('Erro ao carregar dados:', error);
            this.showAlert('Erro ao carregar dados do dashboard');
        } finally {
            this.setRefreshLoading(false);
            this.updateLastUpdateTime();
        }
    }

    async loadDashboardData() {
        const response = await fetch(`${this.apiBaseUrl}/dashboard`);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        this.currentData = data.data;
        
        this.updateStats(data.data.stats);
        this.updateServersGrid(data.data.servers);
        this.updateErrorsTable(data.data.recent_errors);
        this.updateStorageAlerts(data.data.storage_alerts || []);
        this.updateDiskManagement(data.data.storage_alerts || []);
    }

    updateStats(stats) {
        document.getElementById('totalServers').textContent = stats.total_servers || 0;
        document.getElementById('serversOnline').textContent = stats.servers_online || 0;
        document.getElementById('errorsLastHour').textContent = stats.errors_last_hour || 0;

        // Calcular performance média (apenas servidores online)
        const servers = (this.currentData.servers || []).filter(s => s.is_online);
        if (servers.length === 0) {
            document.getElementById('avgPerformance').textContent = '--';
            return;
        }

        const avgCpu = servers.reduce((sum, s) => sum + parseFloat(s.cpu_usage || 0), 0) / servers.length;
        const avgMemory = servers.reduce((sum, s) => sum + parseFloat(s.memory_usage || 0), 0) / servers.length;
        const avgDisk = servers.reduce((sum, s) => sum + parseFloat(s.disk_usage || 0), 0) / servers.length;
        const avgPerformance = ((100 - avgCpu) + (100 - avgMemory) + (100 - avgDisk)) / 3;

        document.getElementById('avgPerformance').textContent = `${avgPerformance.toFixed(1)}%`;
    }

    updateServersGrid(servers) {
        const grid = document.getElementById('serversGrid');
        
        if (!servers || servers.length === 0) {
            grid.innerHTML = '<div class="loading">Nenhum servidor encontrado</div>';
            return;
        }

        grid.innerHTML = servers.map(server => this.createServerCard(server)).join('');
        
        // Adicionar event listeners para os cards
        servers.forEach(server => {
            const card = document.querySelector(`[data-server-id="${server.id}"]`);
            if (card) {
                card.addEventListener('click', () => {
                    this.showServerHistory(server);
                });
            }
        });
    }

    createServerCard(server) {
        const isOnline = server.is_online;
        const hasWarning = this.hasWarnings(server);
        const cardClass = isOnline ? (hasWarning ? 'warning' : 'online') : 'offline';
        const statusClass = isOnline ? (hasWarning ? 'warning' : 'online') : 'offline';
        const statusText = isOnline ? (hasWarning ? 'Alerta' : 'Online') : 'Offline';

        return `
            <div class="server-card ${cardClass}" data-server-id="${server.id}">
                <div class="server-header">
                    <div class="server-info">
                        <h3>${server.hostname || `Server ${server.ip_address}`}</h3>
                        <div class="server-ip">${server.ip_address}</div>
                    </div>
                    <div class="server-status status-${statusClass}">${statusText}</div>
                </div>
                
                ${isOnline ? `
                    <div class="server-metrics">
                        <div class="metric">
                            <div class="metric-label">CPU</div>
                            <div class="metric-value">${parseFloat(server.cpu_usage || 0).toFixed(1)}%</div>
                            <div class="metric-bar">
                                <div class="metric-fill ${this.getMetricColor(server.cpu_usage)}" 
                                     style="width: ${parseFloat(server.cpu_usage || 0)}%"></div>
                            </div>
                        </div>
                        
                        <div class="metric">
                            <div class="metric-label">Memória</div>
                            <div class="metric-value">${parseFloat(server.memory_usage || 0).toFixed(1)}%</div>
                            <div class="metric-bar">
                                <div class="metric-fill ${this.getMetricColor(server.memory_usage)}" 
                                     style="width: ${parseFloat(server.memory_usage || 0)}%"></div>
                            </div>
                        </div>
                        
                        <div class="metric">
                            <div class="metric-label">Disco</div>
                            <div class="metric-value">${parseFloat(server.disk_usage || 0).toFixed(1)}%</div>
                            <div class="metric-bar">
                                <div class="metric-fill ${this.getMetricColor(server.disk_usage)}" 
                                     style="width: ${parseFloat(server.disk_usage || 0)}%"></div>
                            </div>
                        </div>
                        
                        <div class="metric">
                            <div class="metric-label">Load Avg</div>
                            <div class="metric-value">${parseFloat(server.load_average || 0).toFixed(2)}</div>
                        </div>
                    </div>
                    
                    ${server.uptime_formatted ? `
                        <div class="server-uptime">
                            <i class="fas fa-clock"></i> Uptime: ${server.uptime_formatted}
                        </div>
                    ` : ''}
                ` : `
                    <div class="server-metrics">
                        <div style="text-align: center; color: #6a6a6a; padding: 20px;">
                            <i class="fas fa-exclamation-circle" style="font-size: 2rem; margin-bottom: 10px;"></i>
                            <div>Servidor não responde</div>
                            ${server.error_message ? `<small>${server.error_message}</small>` : ''}
                        </div>
                    </div>
                `}
            </div>
        `;
    }

    hasWarnings(server) {
        if (!server.is_online) return false;
        return server.cpu_usage > 80 || server.memory_usage > 80 || server.disk_usage > 80;
    }

    getMetricColor(value) {
        const numValue = parseFloat(value);
        if (!numValue || numValue <= 70) return 'fill-green';
        if (numValue <= 85) return 'fill-yellow';
        return 'fill-red';
    }

    updateErrorsTable(errors) {
        const tbody = document.getElementById('errorsTableBody');
        
        if (!errors || errors.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="7" style="text-align: center; padding: 40px; color: #6a6a6a;">
                        <i class="fas fa-check-circle" style="font-size: 2rem; margin-bottom: 10px; color: #48bb78;"></i><br>
                        Nenhum erro crítico detectado (CPU, Memória ou Disco &gt;= 95%)
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = errors.map(error => `
            <tr>
                <td class="error-timestamp">${this.formatDate(error.timestamp)}</td>
                <td>${error.hostname || `Server ${error.ip_address}`}</td>
                <td><code>${error.ip_address}</code></td>
                <td class="error-message" title="${error.error_message}">${error.error_message}</td>
                <td class="metric-cell ${this.getMetricClass(error.cpu_usage)}">${parseFloat(error.cpu_usage || 0).toFixed(1)}%</td>
                <td class="metric-cell ${this.getMetricClass(error.memory_usage)}">${parseFloat(error.memory_usage || 0).toFixed(1)}%</td>
                <td class="metric-cell ${this.getMetricClass(error.disk_usage)}">${parseFloat(error.disk_usage || 0).toFixed(1)}%</td>
            </tr>
        `).join('');
    }

    getMetricClass(value) {
        const numValue = parseFloat(value);
        if (!numValue || numValue <= 70) return 'metric-normal';
        if (numValue <= 85) return 'metric-warning';
        return 'metric-critical';
    }

    updateStorageAlerts(alerts) {
        const section = document.getElementById('storageSection');
        const grid = document.getElementById('storageAlertsGrid');

        if (!alerts || alerts.length === 0) {
            section.style.display = 'none';
            return;
        }

        section.style.display = 'block';

        grid.innerHTML = alerts.map(alert => {
            const severityClass = alert.critical_alerts > 0 ? 'critical' : 'warning';
            const severityIcon = alert.critical_alerts > 0 ? 'fa-exclamation-circle' : 'fa-exclamation-triangle';

            let disksHtml = '';
            if (alert.disks_over_threshold && Array.isArray(alert.disks_over_threshold)) {
                disksHtml = alert.disks_over_threshold.map(disk => `
                    <div class="disk-item">
                        <i class="fas fa-hdd"></i>
                        <span class="disk-mount">${disk.mount || disk.device}</span>
                        <span class="disk-usage ${disk.usage >= 95 ? 'critical' : 'warning'}">${disk.usage}%</span>
                    </div>
                `).join('');
            }

            const statusIcons = `
                <div class="status-icons">
                    ${!alert.raid_status ? '<i class="fas fa-database status-bad" title="RAID com problema"></i>' : ''}
                    ${!alert.smart_status ? '<i class="fas fa-hard-drive status-bad" title="SMART com problema"></i>' : ''}
                    ${!alert.filesystem_status ? '<i class="fas fa-file-alt status-bad" title="Filesystem com erro"></i>' : ''}
                </div>
            `;

            return `
                <div class="storage-alert-card ${severityClass}">
                    <div class="alert-header">
                        <div class="alert-server">
                            <i class="fas ${severityIcon}"></i>
                            <strong>${alert.hostname || alert.ip_address}</strong>
                            <span class="server-ip">(${alert.ip_address})</span>
                        </div>
                        ${statusIcons}
                    </div>
                    <div class="alert-summary">
                        ${alert.summary || ''}
                    </div>
                    <div class="alert-stats">
                        <span class="stat-badge critical">${alert.critical_alerts} Críticos</span>
                        <span class="stat-badge warning">${alert.warning_alerts} Avisos</span>
                    </div>
                    ${alert.critical_disk_mount ? `
                        <div class="critical-disk">
                            <i class="fas fa-hdd"></i>
                            <strong>Disco mais crítico:</strong> ${alert.critical_disk_mount}
                            <span class="disk-usage-badge">${parseFloat(alert.critical_disk_usage).toFixed(1)}%</span>
                        </div>
                    ` : ''}
                    ${disksHtml ? `<div class="disks-list">${disksHtml}</div>` : ''}
                    <div class="alert-timestamp">
                        <i class="fas fa-clock"></i> ${this.formatDate(alert.timestamp)}
                    </div>
                </div>
            `;
        }).join('');
    }

    updateDiskManagement(storageAlerts) {
        const tbody = document.getElementById('disksTableBody');
        const serverFilter = document.getElementById('diskServerFilter');

        if (!storageAlerts || storageAlerts.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="7" style="text-align: center; padding: 40px; color: #6a6a6a;">
                        <i class="fas fa-info-circle" style="font-size: 2rem; margin-bottom: 10px; color: #4299e1;"></i><br>
                        Nenhum dado de disco disponível. Execute o script check_storage.sh nos servidores.
                    </td>
                </tr>
            `;
            return;
        }

        // Atualizar filtro de servidores
        const servers = ['<option value="all">Todos os Servidores</option>'];
        const allDisks = [];

        storageAlerts.forEach(alert => {
            servers.push(`<option value="${alert.ip_address}">${alert.hostname || alert.ip_address}</option>`);

            if (alert.disks_over_threshold && Array.isArray(alert.disks_over_threshold)) {
                alert.disks_over_threshold.forEach(disk => {
                    allDisks.push({
                        server: alert.hostname || alert.ip_address,
                        ip: alert.ip_address,
                        device: disk.device || 'N/A',
                        mount: disk.mount || disk.device,
                        usage: parseFloat(disk.usage) || 0,
                        size: disk.size || 'N/A',
                        used: disk.used || 'N/A',
                        free: disk.free || 'N/A'
                    });
                });
            }
        });

        serverFilter.innerHTML = servers.join('');

        // Ordenar por uso
        allDisks.sort((a, b) => b.usage - a.usage);

        tbody.innerHTML = allDisks.map(disk => {
            const statusClass = disk.usage >= 95 ? 'critical' : disk.usage >= 85 ? 'warning' : 'ok';
            const statusIcon = disk.usage >= 95 ? 'fa-exclamation-circle' : disk.usage >= 85 ? 'fa-exclamation-triangle' : 'fa-check-circle';
            const statusText = disk.usage >= 95 ? 'CRÍTICO' : disk.usage >= 85 ? 'ATENÇÃO' : 'OK';

            return `
                <tr class="disk-row ${statusClass}" data-server-ip="${disk.ip}">
                    <td>
                        <strong>${disk.server}</strong><br>
                        <small>${disk.ip}</small>
                    </td>
                    <td>
                        <code>${disk.device}</code><br>
                        <small>${disk.mount}</small>
                    </td>
                    <td>${disk.size}</td>
                    <td>${disk.used}</td>
                    <td>${disk.free}</td>
                    <td>
                        <div class="usage-bar-container">
                            <div class="usage-bar ${statusClass}" style="width: ${disk.usage}%"></div>
                            <span class="usage-text">${disk.usage.toFixed(1)}%</span>
                        </div>
                    </td>
                    <td class="status-${statusClass}">
                        <i class="fas ${statusIcon}"></i> ${statusText}
                    </td>
                </tr>
            `;
        }).join('');
    }

    filterDisksByServer(serverIp) {
        const rows = document.querySelectorAll('#disksTableBody .disk-row');

        rows.forEach(row => {
            if (serverIp === 'all') {
                row.style.display = '';
            } else {
                const rowServerIp = row.getAttribute('data-server-ip');
                row.style.display = rowServerIp === serverIp ? '' : 'none';
            }
        });
    }

    updateChart(chartId, title, data) {
        const ctx = document.getElementById(chartId);

        // Se o gráfico já existe, apenas atualizar os dados
        if (this.charts[chartId]) {
            const chart = this.charts[chartId];
            chart.data.labels = data.map(d => d.label);
            chart.data.datasets[0].data = data.map(d => parseFloat(d.value));
            chart.data.datasets[0].backgroundColor = data.map(d => this.getChartColor(parseFloat(d.value), title.includes('Load') ? 4 : 100));
            chart.update('none'); // Update sem animação para melhor performance
            return;
        }

        // Criar novo gráfico apenas se não existir
        this.charts[chartId] = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: data.map(d => d.label),
                datasets: [{
                    data: data.map(d => d.value),
                    backgroundColor: data.map(d => this.getChartColor(d.value, title.includes('Load') ? 4 : 100)),
                    borderWidth: 2,
                    borderColor: '#fff'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            padding: 15,
                            font: { size: 11 },
                            generateLabels: function(chart) {
                                const original = Chart.defaults.plugins.legend.labels.generateLabels;
                                const labels = original.call(this, chart);
                                const chartData = chart.data.datasets[0].data;
                                const chartLabels = chart.data.labels;
                                labels.forEach((label, i) => {
                                    const serverName = chartLabels[i] || 'Servidor';
                                    const value = chartData[i] || 0;
                                    label.text = `${serverName}: ${parseFloat(value).toFixed(1)}${title.includes('Load') ? '' : '%'}`;
                                });
                                return labels;
                            }
                        }
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                return `${context.label}: ${parseFloat(context.parsed).toFixed(1)}${title.includes('Load') ? '' : '%'}`;
                            }
                        }
                    }
                }
            }
        });
    }

    getChartColor(value, max = 100) {
        const percentage = (value / max) * 100;
        if (percentage <= 50) return '#48bb78';
        if (percentage <= 75) return '#ed8936';
        return '#f56565';
    }

    async showServerHistory(server) {
        this.currentSelectedServer = server.id;
        document.getElementById('historyModalTitle').textContent = 
            `Histórico - ${server.hostname || server.ip_address}`;
        
        const modal = document.getElementById('historyModal');
        modal.style.display = 'block';
        
        const period = document.getElementById('historyPeriod').value;
        await this.loadServerHistory(server.id, parseInt(period));
    }

    async loadServerHistory(serverId, hours = 24) {
        try {
            const response = await fetch(`${this.apiBaseUrl}/dashboard/history/${serverId}?hours=${hours}`);
            if (!response.ok) throw new Error('Erro ao carregar histórico');
            
            const data = await response.json();
            this.renderHistoryChart(data.data);
        } catch (error) {
            console.error('Erro ao carregar histórico:', error);
            this.showAlert('Erro ao carregar histórico do servidor');
        }
    }

    renderHistoryChart(historyData) {
        const ctx = document.getElementById('historyChart');
        
        if (this.charts.historyChart) {
            this.charts.historyChart.destroy();
        }

        const labels = historyData.map(d => new Date(d.timestamp).toLocaleTimeString('pt-BR'));
        
        this.charts.historyChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'CPU (%)',
                        data: historyData.map(d => d.cpu_usage),
                        borderColor: '#4299e1',
                        backgroundColor: 'rgba(66, 153, 225, 0.1)',
                        tension: 0.4
                    },
                    {
                        label: 'Memória (%)',
                        data: historyData.map(d => d.memory_usage),
                        borderColor: '#48bb78',
                        backgroundColor: 'rgba(72, 187, 120, 0.1)',
                        tension: 0.4
                    },
                    {
                        label: 'Disco (%)',
                        data: historyData.map(d => d.disk_usage),
                        borderColor: '#ed8936',
                        backgroundColor: 'rgba(237, 137, 54, 0.1)',
                        tension: 0.4
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    intersect: false,
                    mode: 'index'
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        max: 100,
                        ticks: {
                            callback: function(value) {
                                return value + '%';
                            }
                        }
                    }
                },
                plugins: {
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                return `${context.dataset.label}: ${parseFloat(context.parsed.y).toFixed(1)}%`;
                            }
                        }
                    }
                }
            }
        });
    }

    closeHistoryModal() {
        document.getElementById('historyModal').style.display = 'none';
        if (this.charts.historyChart) {
            this.charts.historyChart.destroy();
        }
    }

    showAlert(message) {
        const alertContainer = document.getElementById('alertsContainer');
        const alertText = document.getElementById('alertText');
        
        alertText.textContent = message;
        alertContainer.style.display = 'block';
    }

    hideAlert() {
        const alertContainer = document.getElementById('alertsContainer');
        alertContainer.style.display = 'none';
    }

    setRefreshLoading(loading) {
        const btn = document.getElementById('refreshBtn');
        const icon = btn.querySelector('i');
        
        if (loading) {
            btn.classList.add('loading');
            btn.disabled = true;
            icon.className = 'fas fa-sync-alt';
        } else {
            btn.classList.remove('loading');
            btn.disabled = false;
            icon.className = 'fas fa-sync-alt';
        }
    }

    updateLastUpdateTime() {
        const now = new Date();
        document.getElementById('lastUpdate').textContent = 
            now.toLocaleString('pt-BR');
    }

    startAutoRefresh() {
        if (!this.autoRefreshEnabled) {
            console.log('Auto-refresh desabilitado para debug');
            return;
        }

        if (this.refreshTimer) {
            clearInterval(this.refreshTimer);
        }

        this.refreshTimer = setInterval(() => {
            this.loadInitialData();
        }, this.refreshInterval);
    }

    formatDate(dateString) {
        const date = new Date(dateString);
        return date.toLocaleString('pt-BR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
    }
}

// Inicializar dashboard quando a página carregar
let dashboardInstance;
document.addEventListener('DOMContentLoaded', () => {
    // Prevenir múltiplas instâncias
    if (dashboardInstance) {
        console.warn('Dashboard já foi inicializado');
        return;
    }
    dashboardInstance = new Dashboard();
});

// Limpar recursos ao sair da página
window.addEventListener('beforeunload', () => {
    if (dashboardInstance) {
        if (dashboardInstance.refreshTimer) {
            clearInterval(dashboardInstance.refreshTimer);
        }
        Object.values(dashboardInstance.charts).forEach(chart => {
            if (chart) chart.destroy();
        });
    }
});