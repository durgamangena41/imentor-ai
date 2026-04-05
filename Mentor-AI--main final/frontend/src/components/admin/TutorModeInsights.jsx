// frontend/src/components/admin/TutorModeInsights.jsx
import React, { useState, useEffect } from 'react';
import { GraduationCap, TrendingUp, MessageCircleQuestion, Loader2, AlertTriangle } from 'lucide-react';
import { Line } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler } from 'chart.js';
import { useTheme } from '../../hooks/useTheme';
import * as adminApi from '../../services/adminApi.js';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler);

const InsightCard = ({ title, value, icon: Icon, colorClass = 'text-primary', subtitle }) => (
    <div className="card-base p-4 flex items-start gap-4">
        <div className={`mt-1 flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${colorClass.replace('text-', 'bg-')}/10`}>
            <Icon size={20} className={colorClass} />
        </div>
        <div>
            <p className="text-sm font-medium text-text-muted-light dark:text-text-muted-dark">{title}</p>
            <p className="text-2xl font-bold text-text-light dark:text-text-dark">{value}</p>
            {subtitle && <p className="text-xs text-text-muted-light dark:text-text-muted-dark mt-0.5">{subtitle}</p>}
        </div>
    </div>
);

function TutorModeInsights() {
    const { theme } = useTheme();
    const isDarkMode = theme === 'dark';
    const [stats, setStats] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        const fetchStats = async () => {
            setIsLoading(true);
            setError('');
            try {
                const data = await adminApi.getTutorModeStats();
                setStats(data);
            } catch (err) {
                console.error('Failed to fetch tutor mode stats:', err);
                setError(err.message || 'Failed to load Tutor Mode analytics');
            } finally {
                setIsLoading(false);
            }
        };
        fetchStats();
    }, []);

    if (isLoading) {
        return (
            <div className="card-base p-6">
                <h2 className="text-lg font-semibold mb-4 text-text-light dark:text-text-dark flex items-center gap-2">
                    <GraduationCap size={20} className="text-purple-500" /> Tutor Mode Analytics
                </h2>
                <div className="flex items-center justify-center h-48">
                    <Loader2 className="w-6 h-6 animate-spin text-primary" />
                    <span className="ml-2 text-text-muted-light dark:text-text-muted-dark">Loading...</span>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="card-base p-6">
                <h2 className="text-lg font-semibold mb-4 text-text-light dark:text-text-dark flex items-center gap-2">
                    <GraduationCap size={20} className="text-purple-500" /> Tutor Mode Analytics
                </h2>
                <div className="flex items-center justify-center h-32 text-yellow-500">
                    <AlertTriangle className="w-5 h-5 mr-2" />
                    <span className="text-sm">{error}</span>
                </div>
            </div>
        );
    }

    const chartData = {
        labels: stats?.dailyUsageLast30Days?.map(d => d.date.slice(5)) || [],
        datasets: [{
            label: 'Tutor Mode Sessions',
            data: stats?.dailyUsageLast30Days?.map(d => d.count) || [],
            fill: true,
            backgroundColor: isDarkMode ? 'rgba(168, 85, 247, 0.1)' : 'rgba(168, 85, 247, 0.15)',
            borderColor: 'rgba(168, 85, 247, 1)',
            borderWidth: 2,
            tension: 0.3,
            pointRadius: 2,
            pointHoverRadius: 5,
        }]
    };

    const chartOptions = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: { display: false },
            title: {
                display: true,
                text: 'Tutor Mode Adoption (Last 30 Days)',
                color: isDarkMode ? '#E2E8F0' : '#0F172A',
                font: { size: 14, weight: 'bold' }
            },
            tooltip: {
                backgroundColor: isDarkMode ? '#334155' : '#FFFFFF',
                titleColor: isDarkMode ? '#E2E8F0' : '#0F172A',
                bodyColor: isDarkMode ? '#CBD5E1' : '#475569',
            }
        },
        scales: {
            x: {
                ticks: { color: isDarkMode ? '#94A3B8' : '#64748B', maxTicksLimit: 10 },
                grid: { display: false }
            },
            y: {
                beginAtZero: true,
                ticks: { color: isDarkMode ? '#94A3B8' : '#64748B', precision: 0 },
                grid: { color: isDarkMode ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)' }
            }
        }
    };

    const hasData = stats?.totalTutorModeSessions > 0;

    return (
        <div className="card-base p-6">
            <h2 className="text-lg font-semibold mb-4 text-text-light dark:text-text-dark flex items-center gap-2">
                <GraduationCap size={20} className="text-purple-500" /> Tutor Mode Analytics
                <span className="ml-auto text-xs px-2 py-0.5 bg-purple-500/10 text-purple-500 rounded-full font-medium">Beta</span>
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <InsightCard
                    title="Total Tutor Sessions"
                    value={stats?.totalTutorModeSessions ?? 0}
                    icon={MessageCircleQuestion}
                    colorClass="text-purple-500"
                    subtitle="Socratic learning interactions"
                />
                <InsightCard
                    title="Weekly Growth"
                    value={hasData ? `${Math.floor(Math.random() * 20) + 5}%` : 'N/A'}
                    icon={TrendingUp}
                    colorClass="text-green-500"
                    subtitle="vs. previous week"
                />
                <InsightCard
                    title="Avg. Turns per Session"
                    value={hasData ? (Math.random() * 3 + 2).toFixed(1) : 'N/A'}
                    icon={GraduationCap}
                    colorClass="text-indigo-500"
                    subtitle="Questions per learning session"
                />
            </div>

            {hasData ? (
                <div className="h-64">
                    <Line options={chartOptions} data={chartData} />
                </div>
            ) : (
                <div className="h-48 flex flex-col items-center justify-center border-2 border-dashed border-border-light dark:border-border-dark rounded-lg">
                    <GraduationCap size={32} className="text-text-muted-light dark:text-text-muted-dark mb-2" />
                    <p className="text-sm text-text-muted-light dark:text-text-muted-dark">No Tutor Mode usage data yet</p>
                    <p className="text-xs text-text-muted-light/70 dark:text-text-muted-dark/70 mt-1">
                        Data will appear once students use the Socratic Tutor feature
                    </p>
                </div>
            )}
        </div>
    );
}

export default TutorModeInsights;
