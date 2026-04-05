// frontend/src/components/admin/SyllabusGraphManager.jsx
import React, { useState, useRef } from 'react';
import { FlaskConical, Upload, Loader2, CheckCircle, AlertTriangle, FileSpreadsheet, Eye } from 'lucide-react';
import * as adminApi from '../../services/adminApi.js';
import Button from '../core/Button.jsx';
import CurriculumVisualizer from './CurriculumVisualizer.jsx';
import toast from 'react-hot-toast';

function SyllabusGraphManager() {
    const [selectedFile, setSelectedFile] = useState(null);
    const [courseName, setCourseName] = useState('');
    const [isUploading, setIsUploading] = useState(false);
    const [result, setResult] = useState(null);
    const [showVisualization, setShowVisualization] = useState(false);
    const [visualizedCourse, setVisualizedCourse] = useState('');
    const fileInputRef = useRef(null);

    const handleFileChange = (e) => {
        const file = e.target.files?.[0];
        if (file) {
            if (!file.name.toLowerCase().endsWith('.csv')) {
                toast.error('Please select a CSV file');
                return;
            }
            setSelectedFile(file);
            setResult(null);
        }
    };

    const handleUpload = async () => {
        if (!selectedFile) {
            toast.error('Please select a CSV file');
            return;
        }
        if (!courseName.trim()) {
            toast.error('Please enter a course name');
            return;
        }

        setIsUploading(true);
        setResult(null);
        const toastId = toast.loading('Building syllabus graph...');

        try {
            const formData = new FormData();
            formData.append('file', selectedFile);
            formData.append('courseName', courseName.trim());

            const response = await adminApi.uploadSyllabusGraph(formData);

            setResult({
                success: true,
                message: response.message,
                modulesCreated: response.modules_created,
                topicsCreated: response.topics_created,
                subtopicsCreated: response.subtopics_created,
                totalNodes: (response.modules_created || 0) + (response.topics_created || 0) + (response.subtopics_created || 0),
                totalEdges: (response.precedes_relationships || 0) + (response.has_topic_relationships || 0) + (response.prerequisite_of_relationships || 0)
            });

            const totalNodes = (response.modules_created || 0) + (response.topics_created || 0) + (response.subtopics_created || 0);
            const totalEdges = (response.precedes_relationships || 0) + (response.has_topic_relationships || 0) + (response.prerequisite_of_relationships || 0);
            toast.success(`Graph created: ${totalNodes} nodes (${response.modules_created} modules, ${response.topics_created} topics, ${response.subtopics_created} subtopics), ${totalEdges} relationships`, { id: toastId });

            // Auto-show visualization after successful upload
            setVisualizedCourse(courseName.trim());
            setShowVisualization(true);

            // Reset form
            setSelectedFile(null);
            if (fileInputRef.current) fileInputRef.current.value = null;

        } catch (error) {
            const errorMessage = error.message || 'Failed to build syllabus graph';
            setResult({ success: false, message: errorMessage });
            toast.error(errorMessage, { id: toastId });
        } finally {
            setIsUploading(false);
        }
    };

    const handleViewGraph = () => {
        if (courseName.trim()) {
            setVisualizedCourse(courseName.trim());
            setShowVisualization(true);
        } else {
            toast.error('Enter a course name to view its graph');
        }
    };

    return (
        <div className="card-base p-4">
            <h2 className="text-lg font-semibold mb-4 text-text-light dark:text-text-dark flex items-center gap-2">
                <FlaskConical size={20} className="text-emerald-500" />
                Syllabus Graph
                <span className="ml-auto text-xs px-2 py-0.5 bg-emerald-500/10 text-emerald-500 rounded-full font-medium">Beta</span>
            </h2>

            <p className="text-sm text-text-muted-light dark:text-text-muted-dark mb-4">
                Upload a syllabus CSV to build a curriculum graph in Neo4j. This enables prerequisite-aware tutoring.
            </p>

            <div className="space-y-4">
                {/* Course Name Input */}
                <div>
                    <label className="block text-sm font-medium text-text-light dark:text-text-dark mb-1">
                        Course Name
                    </label>
                    <div className="flex gap-2">
                        <input
                            type="text"
                            value={courseName}
                            onChange={(e) => setCourseName(e.target.value)}
                            placeholder="e.g., Machine Learning"
                            className="input-field flex-grow"
                            disabled={isUploading}
                        />
                        <Button
                            onClick={handleViewGraph}
                            disabled={!courseName.trim()}
                            leftIcon={<Eye size={16} />}
                            variant="secondary"
                            size="md"
                        >
                            View
                        </Button>
                    </div>
                </div>

                {/* File Upload */}
                <div>
                    <label className="block text-sm font-medium text-text-light dark:text-text-dark mb-1">
                        Syllabus CSV File
                    </label>
                    <div className="flex flex-col sm:flex-row gap-2">
                        <input
                            type="file"
                            ref={fileInputRef}
                            onChange={handleFileChange}
                            accept=".csv"
                            className="input-field flex-grow text-sm"
                            disabled={isUploading}
                        />
                    </div>
                    {selectedFile && (
                        <p className="text-xs mt-1 text-text-muted-light dark:text-text-muted-dark flex items-center gap-1">
                            <FileSpreadsheet size={12} />
                            {selectedFile.name} ({(selectedFile.size / 1024).toFixed(1)} KB)
                        </p>
                    )}
                </div>

                {/* Upload Button */}
                <Button
                    onClick={handleUpload}
                    isLoading={isUploading}
                    disabled={!selectedFile || !courseName.trim() || isUploading}
                    leftIcon={<Upload size={16} />}
                    className="w-full sm:w-auto"
                >
                    Upload & Build Graph
                </Button>

                {/* Result Display */}
                {result && (
                    <div className={`p-3 rounded-lg flex items-start gap-2 text-sm ${result.success
                        ? 'bg-green-500/10 text-green-600 dark:text-green-400'
                        : 'bg-red-500/10 text-red-600 dark:text-red-400'
                        }`}>
                        {result.success ? (
                            <CheckCircle size={18} className="flex-shrink-0 mt-0.5" />
                        ) : (
                            <AlertTriangle size={18} className="flex-shrink-0 mt-0.5" />
                        )}
                        <div>
                            <p className="font-medium">{result.message}</p>
                            {result.success && (
                                <p className="text-xs mt-1 opacity-80">
                                    Created {result.totalNodes} nodes ({result.modulesCreated} modules, {result.topicsCreated} topics, {result.subtopicsCreated} subtopics) •
                                    {result.totalEdges} relationships
                                </p>
                            )}
                        </div>
                    </div>
                )}

                {/* Curriculum Visualization */}
                {showVisualization && visualizedCourse && (
                    <div className="mt-4 pt-4 border-t border-border-light dark:border-border-dark">
                        <h3 className="text-sm font-semibold mb-3 text-text-light dark:text-text-dark">
                            Curriculum Graph: {visualizedCourse}
                        </h3>
                        <CurriculumVisualizer courseName={visualizedCourse} />
                    </div>
                )}

                {/* CSV Format Help */}
                <details className="text-xs text-text-muted-light dark:text-text-muted-dark">
                    <summary className="cursor-pointer hover:text-text-light dark:hover:text-text-dark">
                        CSV Format Requirements
                    </summary>
                    <div className="mt-2 p-2 bg-gray-100 dark:bg-gray-800 rounded text-xs font-mono">
                        <p className="mb-1">Required columns: <strong>Module</strong>, <strong>Lecture Topic</strong>, <strong>Subtopics</strong>, <strong>Resources</strong> (optional)</p>
                        <p className="opacity-70">Example:</p>
                        <pre className="mt-1 overflow-x-auto">
                            {`Module,Lecture Number,Lecture Topic,Subtopics,Resources
Module 1,1,Introduction,Definition; ML types; history,R1 Ch1; R4
Module 1,2,Learning Paradigms,Supervised; Unsupervised,R1 Ch2`}
                        </pre>
                    </div>
                </details>
            </div>
        </div>
    );
}

export default SyllabusGraphManager;

