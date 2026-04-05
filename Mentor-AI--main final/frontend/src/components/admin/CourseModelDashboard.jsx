// frontend/src/components/admin/CourseModelDashboard.jsx
import React, { useState, useEffect } from 'react';
import * as adminApi from '../../services/adminApi.js';
import { Database, Activity, RefreshCw, CheckCircle, AlertCircle, BarChart2, ShieldCheck } from 'lucide-react';
import Button from '../core/Button.jsx';
import toast from 'react-hot-toast';

const CourseModelDashboard = () => {
    const [registries, setRegistries] = useState([]);
    const [isLoading, setIsLoading] = useState(true);

    const fetchRegistries = async () => {
        setIsLoading(true);
        try {
            // This API call would need to be added to adminApi.js
            const data = await adminApi.getCourseModelRegistries();
            setRegistries(data);
        } catch (error) {
            toast.error("Failed to load course model registries.");
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchRegistries();
    }, []);

    const handleRunSyntheticGen = async (subject) => {
        const toastId = toast.loading(`Generating synthetic data for ${subject}...`);
        try {
            await adminApi.generateSyntheticData(subject);
            toast.success(`Synthetic data generated for ${subject}`, { id: toastId });
        } catch (error) {
            toast.error(error.message, { id: toastId });
        }
    };

    const handleAuditSync = async (subject) => {
        const toastId = toast.loading(`Auditing curriculum alignment for ${subject}...`);
        try {
            const report = await adminApi.auditCurriculumAlignment(subject);
            toast.success(`Audit result: ${report.coverage_percentage.toFixed(1)}% coverage. Synced ${report.missing_topics.length} gaps.`, { id: toastId, duration: 5000 });
        } catch (error) {
            toast.error(error.message, { id: toastId });
        }
    };

    if (isLoading) return <div className="p-8 text-center text-text-muted-light dark:text-text-muted-dark"><RefreshCw className="animate-spin inline-block mr-2" /> Loading Registry...</div>;

    return (
        <div className="card-base p-6">
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold flex items-center">
                    <Database className="mr-2 text-primary" /> Multi-Course Model Management
                </h2>
                <Button variant="outline" size="sm" onClick={fetchRegistries} leftIcon={<RefreshCw size={14} />}>
                    Refresh
                </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {registries.map(reg => (
                    <div key={reg.subject} className="card-base p-5 border border-border-light dark:border-border-dark bg-gray-50/50 dark:bg-gray-800/30">
                        <div className="flex justify-between items-start mb-4">
                            <div>
                                <h3 className="text-lg font-bold text-primary">{reg.subject}</h3>
                                <p className="text-xs text-text-muted-light dark:text-text-muted-dark">
                                    Last Fine-tuned: {reg.lastFinetunedAt ? new Date(reg.lastFinetunedAt).toLocaleDateString() : 'Never'}
                                </p>
                            </div>
                            <span className={`px-2 py-1 rounded-full text-[10px] uppercase font-bold ${reg.abTest?.isEnabled ? 'bg-orange-100 text-orange-700' : 'bg-green-100 text-green-700'}`}>
                                {reg.abTest?.isEnabled ? 'A/B Testing Active' : 'Stable'}
                            </span>
                        </div>

                        <div className="space-y-3 mb-5">
                            <div className="flex justify-between items-center p-2 bg-white dark:bg-gray-900 rounded-lg border border-border-light dark:border-border-dark">
                                <span className="text-xs font-semibold flex items-center"><CheckCircle size={14} className="mr-1 text-green-500" /> Production</span>
                                <code className="text-xs text-primary font-mono">{reg.activeModelTag}</code>
                            </div>

                            {reg.abTest?.isEnabled && (
                                <div className="flex justify-between items-center p-2 bg-orange-50 dark:bg-orange-900/10 rounded-lg border border-orange-200 dark:border-orange-800/30">
                                    <span className="text-xs font-semibold flex items-center text-orange-600"><AlertCircle size={14} className="mr-1" /> Candidate ({reg.abTest.trafficSplit * 100}%)</span>
                                    <code className="text-xs text-orange-600 font-mono">{reg.abTest.candidateModelTag}</code>
                                </div>
                            )}
                        </div>

                        <div className="grid grid-cols-2 gap-2 mt-4">
                            <Button
                                size="sm"
                                variant="outline"
                                leftIcon={<ShieldCheck size={14} />}
                                onClick={() => handleAuditSync(reg.subject)}
                                title="Checks if training data covers all syllabus topics"
                            >
                                Audit Curriculum
                            </Button>
                            <Button
                                size="sm"
                                variant="outline"
                                leftIcon={<Activity size={14} />}
                                onClick={() => handleRunSyntheticGen(reg.subject)}
                            >
                                Augment
                            </Button>
                        </div>
                    </div>
                ))}

                {registries.length === 0 && (
                    <div className="col-span-full py-12 text-center text-text-muted-light dark:text-text-muted-dark border-2 border-dashed border-border-light dark:border-border-dark rounded-xl">
                        <Database className="mx-auto mb-3 opacity-20" size={48} />
                        <p>No subject registries found. Start by tagging documents with a subject in the document manager.</p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default CourseModelDashboard;
