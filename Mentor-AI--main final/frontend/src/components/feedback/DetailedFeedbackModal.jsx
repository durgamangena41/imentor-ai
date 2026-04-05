import React, { useState } from 'react';
import Modal from '../core/Modal.jsx';
import Button from '../core/Button.jsx';
import { Star, MessageSquare, ShieldCheck, Zap, Layers } from 'lucide-react';
import toast from 'react-hot-toast';

const DetailedFeedbackModal = ({ isOpen, onClose, onSubmit, logId }) => {
    const [accuracy, setAccuracy] = useState(0);
    const [clarity, setClarity] = useState(0);
    const [completeness, setCompleteness] = useState(0);
    const [comment, setComment] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleStarClick = (category, value) => {
        if (category === 'accuracy') setAccuracy(value);
        if (category === 'clarity') setClarity(value);
        if (category === 'completeness') setCompleteness(value);
    };

    const handleSubmit = async () => {
        if (accuracy === 0 || clarity === 0 || completeness === 0) {
            toast.error("Please provide ratings for all categories.");
            return;
        }

        setIsSubmitting(true);
        try {
            await onSubmit({
                accuracy,
                clarity,
                completeness,
                comment
            });
            onClose();
        } catch (error) {
            toast.error("Failed to submit detailed feedback.");
        } finally {
            setIsSubmitting(false);
        }
    };

    const renderStars = (category, currentValue) => {
        return (
            <div className="flex items-center gap-1">
                {[1, 2, 3, 4, 5].map((star) => (
                    <button
                        key={star}
                        onClick={() => handleStarClick(category, star)}
                        className={`p-1 transition-all duration-200 transform hover:scale-125 ${star <= currentValue
                                ? 'text-orange-500 fill-orange-500'
                                : 'text-gray-300 dark:text-gray-600'
                            }`}
                    >
                        <Star size={20} />
                    </button>
                ))}
            </div>
        );
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title="Help Us Improve the AI Tutor"
            size="md"
        >
            <div className="space-y-6 pt-2">
                <p className="text-sm text-text-muted-light dark:text-text-muted-dark">
                    Your detailed feedback directly helps us fine-tune this subject-specific model for better accuracy and clarity.
                </p>

                <div className="space-y-4">
                    <div className="flex items-center justify-between p-3 rounded-xl bg-primary/5 dark:bg-primary/10 border border-primary/10">
                        <div className="flex items-center gap-3">
                            <ShieldCheck className="text-primary" size={20} />
                            <div>
                                <h4 className="text-sm font-semibold">Accuracy</h4>
                                <p className="text-xs text-text-muted-light dark:text-text-muted-dark">Factually correct information?</p>
                            </div>
                        </div>
                        {renderStars('accuracy', accuracy)}
                    </div>

                    <div className="flex items-center justify-between p-3 rounded-xl bg-orange-500/5 dark:bg-orange-500/10 border border-orange-500/10">
                        <div className="flex items-center gap-3">
                            <Zap className="text-orange-500" size={20} />
                            <div>
                                <h4 className="text-sm font-semibold">Clarity</h4>
                                <p className="text-xs text-text-muted-light dark:text-text-muted-dark">Easy to understand language?</p>
                            </div>
                        </div>
                        {renderStars('clarity', clarity)}
                    </div>

                    <div className="flex items-center justify-between p-3 rounded-xl bg-emerald-500/5 dark:bg-emerald-500/10 border border-emerald-500/10">
                        <div className="flex items-center gap-3">
                            <Layers className="text-emerald-500" size={20} />
                            <div>
                                <h4 className="text-sm font-semibold">Completeness</h4>
                                <p className="text-xs text-text-muted-light dark:text-text-muted-dark">Covered all your points?</p>
                            </div>
                        </div>
                        {renderStars('completeness', completeness)}
                    </div>
                </div>

                <div className="space-y-2">
                    <label className="text-xs font-semibold flex items-center gap-1 text-text-muted-light dark:text-text-muted-dark">
                        <MessageSquare size={14} /> Additional Comments (Optional)
                    </label>
                    <textarea
                        value={comment}
                        onChange={(e) => setComment(e.target.value)}
                        placeholder="What could be improved about this response?"
                        className="w-full h-24 p-3 rounded-xl border border-border-light dark:border-border-dark bg-background-light dark:bg-background-dark text-sm focus:ring-2 focus:ring-primary/50 transition-all outline-none resize-none"
                    />
                </div>

                <div className="flex justify-end gap-3 pt-2">
                    <Button variant="ghost" onClick={onClose} disabled={isSubmitting}>Cancel</Button>
                    <Button
                        variant="primary"
                        onClick={handleSubmit}
                        isLoading={isSubmitting}
                        className="px-8 shadow-lg shadow-primary/20"
                    >
                        Submit Detailed Feedback
                    </Button>
                </div>
            </div>
        </Modal>
    );
};

export default DetailedFeedbackModal;
