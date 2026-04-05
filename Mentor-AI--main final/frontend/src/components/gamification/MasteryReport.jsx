import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { CheckCircle2, AlertTriangle, ArrowRight, BookOpen, Target, RotateCcw } from 'lucide-react';
import {
    Chart as ChartJS,
    RadialLinearScale,
    PointElement,
    LineElement,
    Filler,
    Tooltip,
    Legend,
} from 'chart.js';
import { Radar } from 'react-chartjs-2';
import { useNavigate } from 'react-router-dom';
import Button from '../core/Button';
import Card from '../core/Card';
import Badge from '../core/Badge';

ChartJS.register(
    RadialLinearScale,
    PointElement,
    LineElement,
    Filler,
    Tooltip,
    Legend
);

const MasteryReport = ({ reports }) => {
    const navigate = useNavigate();

    // 1. Process Data: Get latest report per topic to avoid duplicates in chart
    const processedData = useMemo(() => {
        const topicMap = new Map();
        reports.forEach(r => {
            // If topic already exists, only overwrite if this report is newer (assuming reports sorted by date desc)
            // Actually reports are passed in sorted desc order from backend usually, so first one is latest.
            if (!topicMap.has(r.topic)) {
                topicMap.set(r.topic, r);
            }
        });
        return Array.from(topicMap.values());
    }, [reports]);

    // 2. Calculate Overall Score
    const overallScore = Math.round(
        processedData.reduce((acc, curr) => acc + curr.score, 0) / (processedData.length || 1)
    );

    // 3. Prepare Chart Data
    const chartData = {
        labels: processedData.map(r => r.topic),
        datasets: [
            {
                label: 'Proficiency',
                data: processedData.map(r => r.score),
                backgroundColor: 'rgba(16, 185, 129, 0.2)', // Green-500 equivalent with opacity
                borderColor: 'rgba(16, 185, 129, 1)',
                borderWidth: 2,
                pointBackgroundColor: 'rgba(16, 185, 129, 1)',
                pointBorderColor: '#fff',
                pointHoverBackgroundColor: '#fff',
                pointHoverBorderColor: 'rgba(16, 185, 129, 1)',
            },
        ],
    };

    const chartOptions = {
        scales: {
            r: {
                angleLines: { color: 'rgba(255, 255, 255, 0.1)' },
                grid: { color: 'rgba(255, 255, 255, 0.1)' },
                pointLabels: {
                    color: '#9ca3af', // text-muted
                    font: { size: 10 }
                },
                suggestedMin: 0,
                suggestedMax: 100,
                ticks: { stepSize: 20, display: false }
            },
        },
        plugins: {
            legend: { display: false },
        },
        maintainAspectRatio: false,
    };

    // 4. Categorize Areas
    const strengths = processedData.filter(r => r.score >= 75);
    const growthAreas = processedData.filter(r => r.score < 75);

    const handleRedirect = (sessionId, topic, recommendation) => {
        // If a specific bridge prompt (recommendation) exists, use it as the query
        if (recommendation) {
            navigate('/', { state: { challengeQuery: recommendation } });
        } else if (sessionId) {
            // Navigate to home with state to trigger session load
            // Assuming layout or LandingPage handles this state
            navigate('/', { state: { loadSessionId: sessionId, autoMessage: `I'd like to review my performance on ${topic}.` } });
        } else {
            // Fallback query
            navigate('/', { state: { challengeQuery: `Help me understand ${topic} better.` } });
        }
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
        >
            {/* Header Section */}
            <div className="relative overflow-hidden rounded-2xl bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark p-6 sm:p-10 shadow-2xl">
                <div className="absolute top-0 right-0 -mt-10 -mr-10 w-64 h-64 bg-primary/10 rounded-full blur-3xl pointer-events-none"></div>
                <div className="absolute bottom-0 left-0 -mb-10 -ml-10 w-64 h-64 bg-secondary/10 rounded-full blur-3xl pointer-events-none"></div>

                <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-8">
                    <div>
                        <h2 className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-primary to-purple-600 mb-2">
                            Mastery Snapshot
                        </h2>
                        <p className="text-text-muted-light dark:text-text-muted-dark max-w-md">
                            Your personalized proficiency report based on recent challenges.
                            {overallScore >= 80 ? " You're crushing it! 🚀" : overallScore >= 60 ? " Good progress, looking solid! 👍" : " Keep pushing, you're learning! 💪"}
                        </p>
                    </div>

                    <div className="flex items-center justify-center p-1 rounded-full bg-gradient-to-tr from-primary/20 to-purple-500/20 backdrop-blur-sm">
                        <div className="w-32 h-32 rounded-full bg-surface-light dark:bg-surface-dark flex items-center justify-center border-4 border-surface-light dark:border-surface-dark shadow-inner relative">
                            <svg className="absolute w-full h-full transform -rotate-90">
                                <circle cx="64" cy="64" r="56" stroke="currentColor" strokeWidth="8" fill="transparent" className="text-gray-200 dark:text-gray-800" />
                                <circle cx="64" cy="64" r="56" stroke="currentColor" strokeWidth="8" fill="transparent" className="text-primary" strokeDasharray={351.86} strokeDashoffset={351.86 - (351.86 * overallScore) / 100} strokeLinecap="round" />
                            </svg>
                            <div className="text-center">
                                <span className="text-3xl font-black block leading-none">{overallScore}%</span>
                                <span className="text-[10px] uppercase font-bold text-text-muted-light dark:text-text-muted-dark">Overall</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Radar Chart Column */}
                <Card className="lg:col-span-1 p-6 flex flex-col items-center justify-center min-h-[300px]">
                    <h3 className="text-sm font-bold uppercase tracking-wider mb-4 flex items-center gap-2">
                        <Target size={16} className="text-primary" /> Skill Distribution
                    </h3>
                    <div className="w-full h-64">
                        {processedData.length > 2 ? (
                            <Radar data={chartData} options={chartOptions} />
                        ) : (
                            <div className="h-full flex items-center justify-center text-center text-xs text-text-muted-light">
                                Need more data points for radar chart.
                            </div>
                        )}
                    </div>
                </Card>

                {/* Strengths & Weaknesses */}
                <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-6">

                    {/* Mastered Concepts */}
                    <Card className="p-0 overflow-hidden border-green-500/20">
                        <div className="bg-green-500/10 p-3 border-b border-green-500/10">
                            <h3 className="text-sm font-bold text-green-600 dark:text-green-400 flex items-center gap-2">
                                <CheckCircle2 size={16} /> Mastered Corridors
                            </h3>
                        </div>
                        <div className="p-4 space-y-3">
                            {strengths.length > 0 ? (
                                strengths.map((item, idx) => (
                                    <div key={idx} className="flex items-center justify-between p-2 rounded-lg hover:bg-green-500/5 transition-colors group">
                                        <span className="text-sm font-medium">{item.topic}</span>
                                        <Badge variant="success" className="text-xs">{item.score}%</Badge>
                                    </div>
                                ))
                            ) : (
                                <p className="text-xs text-text-muted-light italic p-2">No mastery zones yet. Keep practicing!</p>
                            )}
                        </div>
                    </Card>

                    {/* Growth Zones */}
                    <Card className="p-0 overflow-hidden border-amber-500/20">
                        <div className="bg-amber-500/10 p-3 border-b border-amber-500/10">
                            <h3 className="text-sm font-bold text-amber-600 dark:text-amber-400 flex items-center gap-2">
                                <AlertTriangle size={16} /> Growth Zones
                            </h3>
                        </div>
                        <div className="p-4 space-y-4">
                            {growthAreas.length > 0 ? (
                                growthAreas.map((item, idx) => (
                                    <div key={idx} className="bg-surface-light dark:bg-black/20 rounded-xl p-3 border border-border-light dark:border-border-dark relative overflow-hidden group">
                                        <div className="absolute left-0 top-0 bottom-0 w-1 bg-amber-500"></div>
                                        <div className="flex justify-between items-start mb-2">
                                            <h4 className="font-bold text-sm">{item.topic}</h4>
                                            <span className="text-xs font-mono font-bold text-amber-500">{item.score}%</span>
                                        </div>
                                        <p className="text-[11px] text-text-muted-light dark:text-text-muted-dark mb-3 leading-snug">
                                            {item.improvementsNeeded?.[0]?.reason || "Analysis indicates a need for concept reinforcement."}
                                        </p>

                                        <Button
                                            size="xs"
                                            variant="outline"
                                            className="w-full justify-center group-hover:bg-primary group-hover:text-white group-hover:border-primary transition-all"
                                            onClick={() => handleRedirect(item.sourceSessionId, item.topic, item.improvementsNeeded?.[0]?.recommendation)}
                                            rightIcon={<RotateCcw size={12} />}
                                        >
                                            Bridge Gap
                                        </Button>
                                    </div>
                                ))
                            ) : (
                                <p className="text-xs text-text-muted-light italic p-2">No critical gaps detected. Excellent work!</p>
                            )}
                        </div>
                    </Card>

                </div>
            </div>
        </motion.div>
    );
};

export default MasteryReport;
