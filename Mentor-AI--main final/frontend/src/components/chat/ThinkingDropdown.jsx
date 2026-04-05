// frontend/src/components/chat/ThinkingDropdown.jsx
import React from 'react';
import { ChevronDown, BrainCircuit, ShieldCheck, AlertCircle, Info } from 'lucide-react';
import { motion } from 'framer-motion';
import { renderMarkdown } from '../../utils/markdownUtils';

const createMarkup = (markdownText) => {
    if (!markdownText) return { __html: '' };
    return renderMarkdown(markdownText);
};

const ReasoningStep = ({ step, index }) => {
    const confidence = Math.round((step.confidence_score || 0) * 100);
    const isLowConfidence = confidence < 70;
    const isAction = step.action && step.action !== 'none';

    return (
        <div className="mb-4 last:mb-0 bg-gray-50 dark:bg-gray-800/50 rounded-xl p-3 border border-gray-200 dark:border-gray-700 shadow-sm">
            <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                    <span className="w-6 h-6 flex items-center justify-center bg-primary/10 text-primary rounded-full text-[10px] font-bold">
                        {index + 1}
                    </span>
                    <h5 className="text-[11px] font-semibold text-text-light dark:text-text-dark uppercase tracking-wider">
                        {step.step_id?.replace('_', ' ') || `Step ${index + 1}`}
                    </h5>
                    {isAction && (
                        <span className="flex items-center gap-1 bg-purple-500/10 text-purple-500 text-[10px] px-1.5 py-0.5 rounded-full font-bold">
                            <BrainCircuit size={10} /> ACTION: {step.action.toUpperCase()}
                        </span>
                    )}
                    {step.corrected && (
                        <span className="flex items-center gap-1 bg-green-500/10 text-green-500 text-[10px] px-1.5 py-0.5 rounded-full font-bold">
                            <ShieldCheck size={10} /> SELF-CORRECTED
                        </span>
                    )}
                </div>
                <div className="flex flex-col items-end">
                    <span className={`text-[10px] font-bold ${isLowConfidence ? 'text-amber-500' : 'text-primary'}`}>
                        {confidence}% Confidence
                    </span>
                    <div className="w-16 h-1 bg-gray-200 dark:bg-gray-700 rounded-full mt-1 overflow-hidden">
                        <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${confidence}%` }}
                            className={`h-full ${isLowConfidence ? 'bg-amber-500' : 'bg-primary'}`}
                        />
                    </div>
                </div>
            </div>

            <div className="prose prose-xs dark:prose-invert max-w-none text-text-muted-light dark:text-text-muted-dark leading-relaxed">
                <div dangerouslySetInnerHTML={createMarkup(step.thought)} />
            </div>

            {step.final_answer && (
                <div className="mt-2 p-2 bg-primary/5 rounded-lg border border-primary/10">
                    <div className="text-[10px] font-bold text-primary uppercase mb-1 flex items-center gap-1">
                        <Info size={10} /> Conclusion
                    </div>
                    <div className="text-xs italic" dangerouslySetInnerHTML={createMarkup(step.final_answer)} />
                </div>
            )}

            {step.correction_reason && (
                <div className="mt-2 text-[10px] italic text-amber-600 dark:text-amber-400 flex items-start gap-1 p-2 bg-amber-500/5 rounded-lg border border-amber-500/10">
                    <AlertCircle size={12} className="shrink-0 mt-0.5" />
                    <span>Correction: {step.correction_reason}</span>
                </div>
            )}
        </div>
    );
};

function ThinkingDropdown({ children, isOpen, setIsOpen, isStreaming, reasoningSteps }) {
    const hasStructuredSteps = reasoningSteps && reasoningSteps.length > 0;

    return (
        <div className="w-full">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-400 transition-colors py-1 group"
                aria-expanded={isOpen}
            >
                <BrainCircuit size={14} className="text-gray-400 dark:text-gray-500 group-hover:text-gray-500 dark:group-hover:text-gray-400 transition-colors" />

                <span className={isStreaming ? 'shimmer-container' : ''}>
                    {hasStructuredSteps ? 'Detailed Reasoning Dashboard' : 'Thinking Process'}
                </span>

                <ChevronDown size={16} className={`transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
            </button>


            <motion.div
                animate={isOpen ? 'open' : 'collapsed'}
                variants={{
                    open: { opacity: 1, height: 'auto', marginTop: '0.25rem' },
                    collapsed: { opacity: 0, height: 0, marginTop: '0' }
                }}
                transition={{ duration: 0.3, ease: 'easeInOut' }}
                className="overflow-hidden"
            >
                <div className="pl-4 border-l-2 border-gray-300 dark:border-gray-600">
                    {hasStructuredSteps && !isStreaming ? (
                        <div className="py-2">
                            {reasoningSteps.map((step, idx) => (
                                <ReasoningStep key={idx} step={step} index={idx} />
                            ))}
                        </div>
                    ) : (
                        children
                    )}
                </div>
            </motion.div>
        </div>
    );
}

export default ThinkingDropdown;
