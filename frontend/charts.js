// Charts.js - Configurações e utilitários para gráficos

// Configurações globais do Chart.js
Chart.defaults.font.family = "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif";
Chart.defaults.font.size = 12;
Chart.defaults.plugins.legend.display = true;
Chart.defaults.plugins.tooltip.enabled = true;

// Cores do tema
const CHART_COLORS = {
    primary: '#4299e1',
    success: '#48bb78',
    warning: '#ed8936',
    danger: '#f56565',
    info: '#38b2ac',
    light: '#e2e8f0',
    dark: '#2d3748'
};

// Paleta de cores para gráficos com múltiplos datasets
const COLOR_PALETTE = [
    '#4299e1', // Azul
    '#48bb78', // Verde
    '#ed8936', // Laranja
    '#f56565', // Vermelho
    '#38b2ac', // Teal
    '#9f7aea', // Roxo
    '#ec4899', // Rosa
    '#06b6d4'  // Cyan
];

// Configurações responsivas
const RESPONSIVE_CONFIG = {
    maintainAspectRatio: false,
    responsive: true,
    interaction: {
        intersect: false,
        mode: 'index'
    },
    elements: {
        line: {
            tension: 0.4,
            borderWidth: 2,
            pointRadius: 0,
            pointHoverRadius: 6
        },
        point: {
            hoverBorderWidth: 2
        }
    }
};

// Classe para gerenciamento de gráficos em tempo real
class RealtimeChart {
    constructor(canvasId, options = {}) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        this.chart = null;
        this.maxDataPoints = options.maxDataPoints || 20;
        this.updateInterval = options.updateInterval || 30000;
        this.data = [];
        
        this.init(options);
    }

    init(options) {
        const config = {
            type: options.type || 'line',
            data: {
                labels: [],
                datasets: []
            },
            options: {
                ...RESPONSIVE_CONFIG,
                scales: {
                    x: {
                        display: true,
                        title: {
                            display: true,
                            text: options.xLabel || 'Tempo'
                        }
                    },
                    y: {
                        display: true,
                        beginAtZero: true,
                        title: {
                            display: true,
                            text: options.yLabel || 'Valor'
                        },
                        max: options.yMax || undefined
                    }
                },
                plugins: {
                    legend: {
                        display: options.showLegend !== false,
                        position: 'top'
                    },
                    tooltip: {
                        mode: 'index',
                        intersect: false,
                        backgroundColor: 'rgba(0, 0, 0, 0.8)',
                        titleColor: '#fff',
                        bodyColor: '#fff',
                        borderColor: CHART_COLORS.primary,
                        borderWidth: 1
                    }
                },
                ...options.chartOptions
            }
        };

        this.chart = new Chart(this.ctx, config);
    }

    addDataPoint(timestamp, values) {
        const label = new Date(timestamp).toLocaleTimeString('pt-BR', {
            hour: '2-digit',
            minute: '2-digit'
        });

        // Adicionar novo ponto
        this.chart.data.labels.push(label);
        
        // Adicionar valores para cada dataset
        Object.keys(values).forEach((key, index) => {
            if (!this.chart.data.datasets[index]) {
                this.chart.data.datasets[index] = {
                    label: key,
                    data: [],
                    borderColor: COLOR_PALETTE[index % COLOR_PALETTE.length],
                    backgroundColor: COLOR_PALETTE[index % COLOR_PALETTE.length] + '20',
                    fill: false,
                    tension: 0.4
                };
            }
            this.chart.data.datasets[index].data.push(values[key]);
        });

        // Remover pontos antigos se exceder o limite
        if (this.chart.data.labels.length > this.maxDataPoints) {
            this.chart.data.labels.shift();
            this.chart.data.datasets.forEach(dataset => {
                dataset.data.shift();
            });
        }

        this.chart.update('none');
    }

    updateData(newData) {
        this.chart.data = newData;
        this.chart.update();
    }

    destroy() {
        if (this.chart) {
            this.chart.destroy();
            this.chart = null;
        }
    }

    resize() {
        if (this.chart) {
            this.chart.resize();
        }
    }
}

// Classe para gráficos de gauge/medidor
class GaugeChart {
    constructor(canvasId, options = {}) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        this.chart = null;
        this.value = 0;
        this.max = options.max || 100;
        this.label = options.label || '';
        this.unit = options.unit || '%';
        
        this.init(options);
    }

    init(options) {
        const config = {
            type: 'doughnut',
            data: {
                datasets: [{
                    data: [0, 100],
                    backgroundColor: [
                        this.getColorForValue(0),
                        '#e2e8f0'
                    ],
                    borderWidth: 0,
                    cutout: '75%',
                    circumference: 180,
                    rotation: 270
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    },
                    tooltip: {
                        enabled: false
                    }
                }
            }
        };

        this.chart = new Chart(this.ctx, config);
        this.updateValue(this.value);
    }

    getColorForValue(value) {
        if (value <= 50) return CHART_COLORS.success;
        if (value <= 75) return CHART_COLORS.warning;
        return CHART_COLORS.danger;
    }

    updateValue(newValue) {
        this.value = Math.min(Math.max(newValue, 0), this.max);
        const percentage = (this.value / this.max) * 100;
        
        this.chart.data.datasets[0].data = [percentage, 100 - percentage];
        this.chart.data.datasets[0].backgroundColor = [
            this.getColorForValue(percentage),
            '#e2e8f0'
        ];
        
        this.chart.update();
        
        // Atualizar texto central se existir
        this.updateCenterText();
    }

    updateCenterText() {
        // Esta função pode ser estendida para mostrar texto no centro do gauge
        const centerText = document.querySelector(`#${this.canvas.id}_text`);
        if (centerText) {
            centerText.textContent = `${parseFloat(this.value).toFixed(1)}${this.unit}`;
            centerText.className = `gauge-text ${this.getColorClassForValue(this.value)}`;
        }
    }

    getColorClassForValue(value) {
        const percentage = (value / this.max) * 100;
        if (percentage <= 50) return 'text-success';
        if (percentage <= 75) return 'text-warning';
        return 'text-danger';
    }

    destroy() {
        if (this.chart) {
            this.chart.destroy();
            this.chart = null;
        }
    }
}

// Classe para gráficos de rede/network
class NetworkChart {
    constructor(canvasId, options = {}) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        this.chart = null;
        this.maxDataPoints = options.maxDataPoints || 30;
        
        this.init(options);
    }

    init(options) {
        const config = {
            type: 'line',
            data: {
                labels: [],
                datasets: [
                    {
                        label: 'RX (Recebido)',
                        data: [],
                        borderColor: CHART_COLORS.success,
                        backgroundColor: CHART_COLORS.success + '20',
                        fill: true,
                        tension: 0.4
                    },
                    {
                        label: 'TX (Enviado)',
                        data: [],
                        borderColor: CHART_COLORS.primary,
                        backgroundColor: CHART_COLORS.primary + '20',
                        fill: true,
                        tension: 0.4
                    }
                ]
            },
            options: {
                ...RESPONSIVE_CONFIG,
                scales: {
                    x: {
                        display: true,
                        title: {
                            display: true,
                            text: 'Tempo'
                        }
                    },
                    y: {
                        display: true,
                        beginAtZero: true,
                        title: {
                            display: true,
                            text: 'Bytes/s'
                        },
                        ticks: {
                            callback: function(value) {
                                return formatBytes(value) + '/s';
                            }
                        }
                    }
                },
                plugins: {
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                return `${context.dataset.label}: ${formatBytes(context.parsed.y)}/s`;
                            }
                        }
                    }
                }
            }
        };

        this.chart = new Chart(this.ctx, config);
    }

    addDataPoint(timestamp, rx, tx) {
        const label = new Date(timestamp).toLocaleTimeString('pt-BR', {
            hour: '2-digit',
            minute: '2-digit'
        });

        this.chart.data.labels.push(label);
        this.chart.data.datasets[0].data.push(rx);
        this.chart.data.datasets[1].data.push(tx);

        // Remover pontos antigos
        if (this.chart.data.labels.length > this.maxDataPoints) {
            this.chart.data.labels.shift();
            this.chart.data.datasets[0].data.shift();
            this.chart.data.datasets[1].data.shift();
        }

        this.chart.update('none');
    }

    destroy() {
        if (this.chart) {
            this.chart.destroy();
            this.chart = null;
        }
    }
}

// Funções utilitárias
function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function getRandomColor() {
    return COLOR_PALETTE[Math.floor(Math.random() * COLOR_PALETTE.length)];
}

function createGradient(ctx, color1, color2) {
    const gradient = ctx.createLinearGradient(0, 0, 0, 400);
    gradient.addColorStop(0, color1);
    gradient.addColorStop(1, color2);
    return gradient;
}

// Configuração para gráficos de comparação de servidores
function createServerComparisonChart(canvasId, servers, metric) {
    const ctx = document.getElementById(canvasId);
    
    const chart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: servers.map(s => s.hostname || s.ip_address),
            datasets: [{
                label: metric,
                data: servers.map(s => s[metric.toLowerCase().replace(' ', '_')] || 0),
                backgroundColor: servers.map((s, i) => COLOR_PALETTE[i % COLOR_PALETTE.length] + '80'),
                borderColor: servers.map((s, i) => COLOR_PALETTE[i % COLOR_PALETTE.length]),
                borderWidth: 2
            }]
        },
        options: {
            ...RESPONSIVE_CONFIG,
            scales: {
                y: {
                    beginAtZero: true,
                    max: metric.includes('Load') ? undefined : 100,
                    ticks: {
                        callback: function(value) {
                            return value + (metric.includes('Load') ? '' : '%');
                        }
                    }
                }
            },
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return `${metric}: ${parseFloat(context.parsed.y).toFixed(1)}${metric.includes('Load') ? '' : '%'}`;
                        }
                    }
                }
            }
        }
    });

    return chart;
}

// Event listeners para redimensionamento
window.addEventListener('resize', () => {
    // Redimensionar todos os gráficos Chart.js
    if (Chart.instances) {
        Object.values(Chart.instances).forEach(chart => {
            if (chart && chart.resize) chart.resize();
        });
    }
});

// Exportar classes e funções para uso global
window.RealtimeChart = RealtimeChart;
window.GaugeChart = GaugeChart;
window.NetworkChart = NetworkChart;
window.createServerComparisonChart = createServerComparisonChart;
window.formatBytes = formatBytes;
window.CHART_COLORS = CHART_COLORS;
window.COLOR_PALETTE = COLOR_PALETTE;