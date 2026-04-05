// frontend/src/components/layout/CenterPanel.jsx
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import ChatHistory from '../chat/ChatHistory';
import ChatInput from '../chat/ChatInput';
import PromptCoachModal from '../chat/PromptCoachModal.jsx';
import api from '../../services/api';
import { useAuth as useRegularAuth } from '../../hooks/useAuth';
import { useAppState } from '../../contexts/AppStateContext';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import DeepResearchPanel from '../research/DeepResearchPanel';
import ResearchHistory from '../research/ResearchHistory';
import {
    BookMarked,
    Code,
    Sparkles,
    ChevronRight,
    Flame,
    FileQuestion,
    ShieldCheck,
    GraduationCap,
    Target,
    Swords,
    Coins,
    Award,
    CheckCircle,
    XCircle,
    X,
    MapPin,
    History
} from 'lucide-react';

const features = [];

const glowStyles = {
    blue: "hover:border-blue-400 dark:hover:border-blue-500 hover:shadow-[0_0_20px_theme(colors.blue.500/40%)]",
    green: "hover:border-green-400 dark:hover:border-green-500 hover:shadow-[0_0_20px_theme(colors.green.500/40%)]",
    red: "hover:border-red-400 dark:hover:border-red-500 hover:shadow-[0_0_20px_theme(colors.red.500/40%)]",
    purple: "hover:border-purple-400 dark:hover:border-purple-500 hover:shadow-[0_0_20px_theme(colors.purple.500/40%)]",
    orange: "hover:border-orange-400 dark:hover:border-orange-500 hover:shadow-[0_0_20px_theme(colors.orange.500/40%)]",
    yellow: "hover:border-yellow-400 dark:hover:border-yellow-500 hover:shadow-[0_0_20px_theme(colors.yellow.500/40%)]",
    cyan: "hover:border-cyan-400 dark:hover:border-cyan-500 hover:shadow-[0_0_20px_theme(colors.cyan.500/40%)]",
    gray: ""
};

function CenterPanel({ messages, setMessages, currentSessionId, onChatProcessingChange, initialPromptForNewSession, setInitialPromptForNewSession, initialActivityForNewSession, setInitialActivityForNewSession }) {
    const { token: regularUserToken } = useRegularAuth();
    const {
        setSelectedSubject,
        systemPrompt,
        selectedDocumentForAnalysis,
        selectedSubject,
        tutorMode,
        setTutorMode,
        deepResearchMode,
        setDeepResearchMode
    } = useAppState();
    const navigate = useNavigate();
    const location = useLocation();

    const [useWebSearch, setUseWebSearch] = useState(false);
    const [useAcademicSearch, setUseAcademicSearch] = useState(false);
    const [criticalThinkingEnabled, setCriticalThinkingEnabled] = useState(false);
    const [isActuallySendingAPI, setIsActuallySendingAPI] = useState(false);
    const abortControllerRef = useRef(null);
    const [recommendations, setRecommendations] = useState([]);
    const [isLoadingRecs, setIsLoadingRecs] = useState(true);
    const [isCoachModalOpen, setIsCoachModalOpen] = useState(false);
    const [coachData, setCoachData] = useState(null);
    const [activeBountyId, setActiveBountyId] = useState(null);
    const [activeBountyMetadata, setActiveBountyMetadata] = useState(null);

    // Deep Research State
    const [isResearchActive, setIsResearchActive] = useState(false);
    const [researchData, setResearchData] = useState(null);
    const [researchQuery, setResearchQuery] = useState('');
    const [isHistoryOpen, setIsHistoryOpen] = useState(false);

    const handleStreamingSendMessage = useCallback(async (inputText, placeholderId, options) => {
        const payload = {
            query: inputText.trim(),
            sessionId: currentSessionId,
            useWebSearch: options.useWebSearch,
            useAcademicSearch: options.useAcademicSearch,
            systemPrompt,
            criticalThinkingEnabled: options.criticalThinkingEnabled,
            documentContextName: options.documentContextName,
            tutorMode,
        };

        // --- THIS IS THE FIX ---
        // Construct the full, correct API URL using the environment variable.
        const apiUrl = `${import.meta.env.VITE_API_BASE_URL || 'http://localhost:5001/api'}/chat/message`;

        const response = await fetch(apiUrl, {
            // --- END OF FIX ---
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${regularUserToken}` },
            body: JSON.stringify(payload),
            signal: abortControllerRef.current.signal,
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || `Server error: ${response.status}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let finalBotMessageObject = null;
        let accumulatedThinking = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split('\n\n').filter(line => line.startsWith('data: '));

            for (const line of lines) {
                const jsonString = line.replace('data: ', '');
                try {
                    const eventData = JSON.parse(jsonString);
                    if (eventData.type === 'thought') {
                        accumulatedThinking += eventData.content;
                        setMessages(prev => prev.map(msg => msg.id === placeholderId ? { ...msg, thinking: accumulatedThinking, _accumulatedContent: accumulatedThinking } : msg));
                    } else if (eventData.type === 'final_answer') {
                        finalBotMessageObject = eventData.content;
                    } else if (eventData.type === 'error') {
                        throw new Error(eventData.content);
                    }
                } catch (e) {
                    console.error("Error parsing SSE chunk:", jsonString, e);
                }
            }
        }

        if (finalBotMessageObject) {
            // --- THIS IS THE FIX ---
            // Create a new, correctly structured message object for the frontend state.
            // This aligns the streaming response with the format used by chat history loading.
            const finalMessage = {
                ...finalBotMessageObject, // Copy all properties like thinking, references, etc.
                id: finalBotMessageObject.id || placeholderId,
                sender: 'bot', // Ensure sender is set
                text: finalBotMessageObject.finalAnswer, // Map 'finalAnswer' to the 'text' property
                isStreaming: false // Explicitly mark streaming as complete
            };

            // Now, update the state with the correctly formatted final message.
            setMessages(prev => [
                ...prev.filter(msg => msg.id !== placeholderId),
                finalMessage
            ]);
            // --- END OF FIX ---

            if (finalBotMessageObject.action && finalBotMessageObject.action.type === 'DOWNLOAD_DOCUMENT') {
                toast.promise(
                    api.generateDocumentFromTopic(finalBotMessageObject.action.payload),
                    {
                        loading: `Generating your ${finalBotMessageObject.action.payload.docType.toUpperCase()}...`,
                        success: (data) => `Successfully downloaded '${data.filename}'!`,
                        error: (err) => `Download failed: ${err.message}`,
                    }
                );
            }
        }
    }, [currentSessionId, systemPrompt, regularUserToken, setMessages, tutorMode]);

    const handleBountyCompletion = useCallback((bountyResult) => {
        if (bountyResult.isCorrect) {
            toast.custom((t) => (
                <motion.div
                    initial={{ opacity: 0, scale: 0.5, y: 50 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.5, y: 50 }}
                    className="bg-gradient-to-br from-green-500 to-emerald-600 text-white px-6 py-4 rounded-lg shadow-2xl max-w-md"
                >
                    <div className="flex items-start gap-3">
                        <CheckCircle className="flex-shrink-0" size={32} />
                        <div>
                            <h3 className="font-bold text-xl mb-2">Bounty Completed! 🎉</h3>
                            <div className="flex items-center gap-4 text-sm">
                                <span className="flex items-center gap-1">
                                    <Coins size={18} />
                                    +{bountyResult.creditsAwarded} Credits
                                </span>
                                <span className="flex items-center gap-1">
                                    <Award size={18} />
                                    +{bountyResult.learningCreditsAwarded} Learning Credits
                                </span>
                            </div>
                            <p className="text-sm opacity-90 mt-2">
                                Total: {bountyResult.newCreditsBalance} credits
                            </p>
                        </div>
                    </div>
                </motion.div>
            ), { duration: 5000 });
        } else {
            toast.custom((t) => (
                <motion.div
                    initial={{ opacity: 0, scale: 0.5, y: 50 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.5, y: 50 }}
                    className="bg-gradient-to-br from-red-500 to-rose-600 text-white px-6 py-4 rounded-lg shadow-2xl max-w-md"
                >
                    <div className="flex items-start gap-3">
                        <XCircle className="flex-shrink-0" size={32} />
                        <div>
                            <h3 className="font-bold text-xl mb-2">Incorrect Answer</h3>
                            <p className="text-sm opacity-90">
                                {bountyResult.message || 'Try again with a different approach!'}
                            </p>
                        </div>
                    </div>
                </motion.div>
            ), { duration: 4000 });
        }
    }, []);

    const handleStandardSendMessage = useCallback(async (inputText, placeholderId, options) => {
        const payload = {
            query: inputText.trim(),
            history: messages.slice(0, -2),
            sessionId: currentSessionId,
            useWebSearch: options.useWebSearch,
            useAcademicSearch: options.useAcademicSearch,
            systemPrompt,
            criticalThinkingEnabled: options.criticalThinkingEnabled,
            documentContextName: options.documentContextName,
            tutorMode  // ✅ FIX: Added tutorMode to payload
        };

        // Add bounty information if this is a bounty answer
        if (activeBountyId && options.isBountyAnswer) {
            payload.bountyId = activeBountyId;
            payload.bountyAnswer = inputText.trim();
        }

        const response = await api.sendMessage(payload);

        if (response && response.reply) {
            setMessages(prev => [
                ...prev.filter(msg => msg.id !== placeholderId),
                { ...response.reply, id: response.reply.id || placeholderId }
            ]);

            // Handle bounty completion if present
            if (response.bountyResult) {
                handleBountyCompletion(response.bountyResult);
            }

            if (response.reply.action && response.reply.action.type === 'DOWNLOAD_DOCUMENT') {
                toast.promise(
                    api.generateDocumentFromTopic(response.reply.action.payload),
                    {
                        loading: `Generating your ${response.reply.action.payload.docType.toUpperCase()}...`,
                        success: (data) => `Successfully downloaded '${data.filename}'!`,
                        error: (err) => `Download failed: ${err.message}`,
                    }
                );
            }
        } else {
            throw new Error("Invalid response from AI service.");
        }
    }, [messages, currentSessionId, systemPrompt, setMessages, tutorMode]);


    const handleSendMessage = useCallback(async (inputText, options = {}) => {
        if (!inputText.trim() || !regularUserToken || !currentSessionId || isActuallySendingAPI) return;

        const effectiveUseWebSearch = options.useWebSearch ?? useWebSearch;
        const effectiveUseAcademicSearch = options.useAcademicSearch ?? useAcademicSearch;
        const effectiveCriticalThinking = options.criticalThinkingEnabled ?? criticalThinkingEnabled;
        const effectiveDocumentContext = options.documentContextName ?? selectedSubject ?? selectedDocumentForAnalysis;

        abortControllerRef.current = new AbortController();

        const userMessage = {
            id: `user-${Date.now()}`,
            sender: 'user',
            text: inputText.trim(),
            timestamp: new Date().toISOString(),
        };

        const streamingPlaceholderId = `bot-streaming-${Date.now()}`;
        const placeholderMessage = {
            id: streamingPlaceholderId,
            sender: 'bot',
            text: '',
            thinking: effectiveCriticalThinking ? '' : null,
            isStreaming: true,
            timestamp: new Date().toISOString(),
            _accumulatedContent: ''
        };

        setMessages(prev => [...prev, userMessage, placeholderMessage]);
        onChatProcessingChange(true);
        setIsActuallySendingAPI(true);

        try {
            const handlerOptions = {
                useWebSearch: effectiveUseWebSearch,
                useAcademicSearch: effectiveUseAcademicSearch,
                criticalThinkingEnabled: effectiveCriticalThinking,
                documentContextName: effectiveDocumentContext
            };

            // Add bounty flag to options if we have an active bounty
            const enrichedOptions = {
                ...handlerOptions,
                isBountyAnswer: !!activeBountyId
            };

            if (deepResearchMode) {
                await handleDeepResearch(inputText);
                return;
            }

            if (effectiveCriticalThinking) {
                await handleStreamingSendMessage(inputText, streamingPlaceholderId, enrichedOptions);
            } else {
                await handleStandardSendMessage(inputText, streamingPlaceholderId, enrichedOptions);
            }
        } catch (error) {
            console.error("Error in handleSendMessage:", error);

            const errorMessage = error.response?.data?.message || error.message || "An unknown error occurred.";

            setMessages(prev => prev.map(msg =>
                msg.id === streamingPlaceholderId
                    ? { ...msg, isStreaming: false, text: `Error: ${error.message}` }
                    : msg
            ));
            toast.error(errorMessage);
        } finally {
            setIsActuallySendingAPI(false);
            onChatProcessingChange(false);
            setUseWebSearch(false);
            setUseAcademicSearch(false);
            // Clear bounty state after message is sent
            if (activeBountyId) {
                setActiveBountyId(null);
                setActiveBountyMetadata(null);
            }
        }
    }, [
        handleStreamingSendMessage, handleStandardSendMessage, systemPrompt,
        deepResearchMode
    ]);

    const handleDeepResearch = async (query) => {
        setIsResearchActive(true);
        setResearchQuery(query);
        setResearchData(null);
        onChatProcessingChange(true);

        try {
            const response = await api.conductDeepResearch({
                query,
                depthLevel: 'standard',
                includeFactCheck: true
            });

            if (response.success) {
                setResearchData(response.data);
                toast.success("Deep Research Complete!");
            } else {
                throw new Error(response.message || "Research failed");
            }
        } catch (error) {
            console.error("Deep Research Error:", error);
            toast.error(`Deep Research Failed: ${error.message}`);
            setIsResearchActive(false);
        } finally {
            onChatProcessingChange(false);
        }
    };

    useEffect(() => {
        const fetchRecommendations = async () => {
            if (messages.length === 0 && currentSessionId) {
                setIsLoadingRecs(true);
                try {
                    const data = await api.getRecommendations(currentSessionId);
                    setRecommendations(data.recommendations || []);
                } catch (error) {
                    console.error("Failed to fetch recommendations:", error);
                    setRecommendations([]);
                } finally {
                    setIsLoadingRecs(false);
                }
            }
        };
        fetchRecommendations();
    }, [currentSessionId, messages.length]);

    // Handle bounty question from navigation state
    useEffect(() => {
        if (location.state?.bountyQuestion) {
            const bountyText = `🎯 Bounty Challenge (${location.state.bountyCredits} credits + ${location.state.bountyLearningCredits} Learning Credits)\n\n${location.state.bountyQuestion}`;
            setInitialPromptForNewSession(bountyText);

            // Store bounty metadata in component state
            setActiveBountyId(location.state.bountyId);
            setActiveBountyMetadata({
                credits: location.state.bountyCredits,
                learningCredits: location.state.bountyLearningCredits,
                topic: location.state.bountyTopic,
                difficulty: location.state.bountyDifficulty
            });

            // Clear the navigation state to prevent re-triggering
            navigate(location.pathname, { replace: true, state: {} });
        }
    }, [location.state, setInitialPromptForNewSession, navigate, location.pathname]);

    // Handle "Learn This" query from Challenges page
    useEffect(() => {
        if (location.state?.challengeQuery) {
            handleSendMessage(location.state.challengeQuery);
            navigate(location.pathname, { replace: true, state: {} });
        }
    }, [location.state, handleSendMessage, navigate, location.pathname]);

    const handleFeatureClick = (feature) => {
        if (feature.path) {
            navigate(feature.path);
        } else if (feature.action) {
            switch (feature.action) {
                case 'enableTutorMode':
                    setTutorMode(true);
                    toast.success("🎓 Tutor Mode activated!", { duration: 3000 });
                    break;
                case 'toggleAcademicSearch':
                    setUseAcademicSearch(true);
                    toast.success("Academic Search has been enabled for your next message.");
                    break;
                default:
                    break;
            }
        }
    };

    const handleRecommendationClick = async (rec) => {
        if (isActuallySendingAPI) return;
        setUseWebSearch(false);
        setUseAcademicSearch(false);

        const options = {
            useWebSearch: rec.actionType === 'web_search',
            useAcademicSearch: rec.actionType === 'academic_search',
            documentContextName: null
        };

        let query = rec.topic;

        switch (rec.actionType) {
            case 'direct_answer':
                query = `Regarding the topic of "${rec.topic}", please provide a detailed explanation. Elaborate on the key concepts and provide clear examples.`;
                break;
            case 'web_search':
                query = `Search the web for the latest information on: ${rec.topic}`;
                break;
            case 'academic_search':
                query = `Find and summarize academic papers about: ${rec.topic}`;
                break;
            case 'document_review': {
                toast.loading(`Finding the best document for "${rec.topic}"...`, { id: 'doc-find-toast' });
                try {
                    const { documentName } = await api.findDocumentForTopic(rec.topic);
                    toast.success(`Focus set to document: ${documentName}`, { id: 'doc-find-toast' });
                    setSelectedSubject(documentName);
                    options.documentContextName = documentName;
                    query = `Based on the document "${documentName}", please explain "${rec.topic}".`;
                } catch (error) {
                    toast.error(error.message || `Could not find a document for "${rec.topic}".`, { id: 'doc-find-toast' });
                    return;
                }
                break;
            }
            default:
                toast.error(`Unknown recommendation type: ${rec.actionType}`);
                return;
        }

        toast.success(`Exploring "${rec.topic}" for you...`);
        handleSendMessage(query, options);
    };

    const RecommendationCard = ({ rec, index }) => (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: index * 0.1, ease: "easeOut" }}
            className="relative p-[2px] rounded-lg group"
            style={{
                background: `conic-gradient(from var(--angle), #059669, #3b82f6, #9333ea, #059669)`,
                animation: 'spin-border 6s linear infinite',
            }}
        >
            <button
                onClick={() => handleRecommendationClick(rec)}
                disabled={isActuallySendingAPI}
                className="w-full h-full text-left bg-surface-light dark:bg-slate-800 rounded-[7px] p-4 flex flex-col justify-between transition-colors duration-300 hover:bg-gray-50 dark:hover:bg-slate-700 disabled:opacity-60"
            >
                <div>
                    <div className="flex items-center gap-2 mb-2">
                        <Sparkles size={16} className="text-primary dark:text-teal-400 flex-shrink-0 twinkling-text" />
                        <p className="text-sm font-semibold text-primary dark:text-primary-light uppercase tracking-wider truncate" title={rec.topic}>
                            {rec.topic}
                        </p>
                    </div>
                    <p className="text-sm text-text-muted-light dark:text-text-muted-dark mt-1 h-16">
                        {rec.suggestion_text}
                    </p>
                </div>
                <div className="mt-4 text-sm font-bold text-teal-500 dark:text-teal-400 self-start flex items-center gap-1.5 transition-transform duration-300 group-hover:translate-x-1">
                    Explore Now
                    <ChevronRight size={18} />
                </div>
            </button>
        </motion.div>
    );

    return (
        <div className="flex flex-col h-full bg-background-light dark:bg-background-dark rounded-lg shadow-inner relative overflow-hidden">
            {/* Deep Research Overlay */}
            <AnimatePresence>
                {isResearchActive && (
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 20 }}
                        className="absolute inset-0 z-50 bg-background-light dark:bg-background-dark p-4 md:p-6"
                    >
                        <div className="flex items-center justify-between mb-4">
                            <button
                                onClick={() => setIsHistoryOpen(true)}
                                className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border-light dark:border-border-dark text-xs font-bold text-text-muted-light dark:text-text-muted-dark hover:text-primary transition-all"
                            >
                                <History size={14} /> History
                            </button>
                            <button
                                onClick={() => setIsResearchActive(false)}
                                className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors"
                            >
                                <X size={20} className="text-text-muted-light dark:text-text-muted-dark" />
                            </button>
                        </div>
                        <div className="h-[calc(100%-3rem)]">
                            <DeepResearchPanel
                                isActive={isResearchActive}
                                researchData={researchData}
                                query={researchQuery}
                                onComplete={() => { }}
                            />
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Research History Modal Overlay */}
            <AnimatePresence>
                {isHistoryOpen && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="absolute inset-0 z-[60] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4"
                    >
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.95, opacity: 0 }}
                            className="w-full max-w-lg h-[600px] bg-white dark:bg-slate-900 rounded-2xl shadow-2xl overflow-hidden"
                        >
                            <ResearchHistory
                                onClose={() => setIsHistoryOpen(false)}
                                onSelect={(item) => {
                                    setResearchQuery(item.query);
                                    setResearchData(item);
                                    setIsResearchActive(true);
                                    setIsHistoryOpen(false);
                                }}
                            />
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
            {/* Tutor Mode Banner */}
            {tutorMode && (
                <div className="flex-shrink-0 bg-gradient-to-r from-primary/10 to-purple-500/10 border-b border-primary/30 px-4 py-2 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <div className="p-1.5 rounded-md bg-primary/20">
                            <GraduationCap size={16} className="text-primary" />
                        </div>
                        <span className="text-sm font-medium text-text-light dark:text-text-dark">
                            Tutor Mode Active
                        </span>
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-orange-500/20 text-orange-500 dark:text-orange-400">
                            Beta
                        </span>
                    </div>
                    <button
                        onClick={() => setTutorMode(false)}
                        className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md text-gray-600 dark:text-gray-400 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-500/10 transition-colors"
                        title="Exit Tutor Mode"
                    >
                        <X size={14} />
                        Exit Tutor Mode
                    </button>
                </div>
            )}
            {messages.length === 0 && !isActuallySendingAPI && currentSessionId ? (
                tutorMode ? (
                    /* Tutor Mode Welcome Screen */
                    <div className="flex-1 flex flex-col justify-center items-center p-3 sm:p-6 md:p-8 overflow-y-auto custom-scrollbar animate-fadeIn">
                        <div className="w-full max-w-3xl mx-auto text-center">
                            <motion.div
                                initial={{ scale: 0 }}
                                animate={{ scale: 1 }}
                                transition={{ type: "spring", duration: 0.6 }}
                                className="inline-flex p-4 rounded-full bg-gradient-to-br from-purple-500/20 to-blue-500/20 mb-6"
                            >
                                <GraduationCap size={48} className="text-purple-500" />
                            </motion.div>

                            <motion.h1
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.2 }}
                                className="text-2xl sm:text-3xl md:text-5xl font-extrabold bg-gradient-to-r from-purple-500 via-pink-500 to-blue-500 text-transparent bg-clip-text mb-4"
                            >
                                Welcome to Tutor Mode
                            </motion.h1>

                            <motion.p
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.3 }}
                                className="text-lg text-text-muted-light dark:text-text-muted-dark mb-8 max-w-xl mx-auto"
                            >
                                I teach through <span className="font-semibold text-purple-500">guided questioning</span>,
                                not direct answers. Tell me what you want to learn, and I'll help you discover the answers yourself!
                            </motion.p>

                            <motion.div
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.4 }}
                                className="bg-surface-light dark:bg-surface-dark/50 border border-border-light dark:border-border-dark rounded-xl p-6 mb-8"
                            >
                                <h3 className="text-sm font-semibold text-text-muted-light dark:text-text-muted-dark uppercase tracking-wider mb-4">
                                    How it works
                                </h3>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-left">
                                    <div className="flex items-start gap-3">
                                        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-purple-500/20 flex items-center justify-center text-purple-500 font-bold">1</div>
                                        <div>
                                            <p className="font-medium text-text-light dark:text-text-dark">Ask a topic</p>
                                            <p className="text-sm text-text-muted-light dark:text-text-muted-dark">Tell me what you want to learn</p>
                                        </div>
                                    </div>
                                    <div className="flex items-start gap-3">
                                        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-pink-500/20 flex items-center justify-center text-pink-500 font-bold">2</div>
                                        <div>
                                            <p className="font-medium text-text-light dark:text-text-dark">Answer questions</p>
                                            <p className="text-sm text-text-muted-light dark:text-text-muted-dark">I'll guide you with Socratic questions</p>
                                        </div>
                                    </div>
                                    <div className="flex items-start gap-3">
                                        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-500 font-bold">3</div>
                                        <div>
                                            <p className="font-medium text-text-light dark:text-text-dark">Achieve mastery</p>
                                            <p className="text-sm text-text-muted-light dark:text-text-muted-dark">Demonstrate understanding to unlock topics</p>
                                        </div>
                                    </div>
                                </div>
                            </motion.div>

                            <motion.div
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.5 }}
                            >
                                <h3 className="text-sm font-semibold text-text-muted-light dark:text-text-muted-dark uppercase tracking-wider mb-4">
                                    Try asking about
                                </h3>
                                <div className="flex flex-wrap justify-center gap-2">
                                    {['Machine Learning basics', 'Neural Networks', 'Data Structures', 'Algorithms', 'Python programming'].map((topic) => (
                                        <button
                                            key={topic}
                                            onClick={() => handleSendMessage(`Teach me about ${topic}`)}
                                            className="px-4 py-2 rounded-full bg-gradient-to-r from-purple-500/10 to-blue-500/10 border border-purple-500/30 text-sm font-medium text-purple-600 dark:text-purple-400 hover:border-purple-500 hover:shadow-lg hover:shadow-purple-500/20 transition-all duration-300"
                                        >
                                            {topic}
                                        </button>
                                    ))}
                                </div>
                            </motion.div>
                        </div>
                    </div>
                ) : (
                    /* Regular Welcome Screen */
                    <div className="flex-1 flex flex-col justify-center items-center p-3 sm:p-6 md:p-8 overflow-y-auto custom-scrollbar animate-fadeIn">
                        <div className="w-full max-w-4xl mx-auto">
                            <div className="text-center">
                                <h1 className="text-3xl sm:text-4xl md:text-6xl lg:text-7xl font-extrabold bg-gradient-to-r from-purple-500 to-blue-500 text-transparent bg-clip-text mb-4">
                                    Welcome to iMentor
                                </h1>
                                <p className="text-base sm:text-lg md:text-xl text-text-muted-light dark:text-text-muted-dark font-medium">
                                    Your personal AI-powered guide for learning and discovery.
                                </p>
                            </div>

                            <hr className="border-border-light dark:border-border-dark my-8" />

                            {features.length > 0 && (
                                <div className="text-center">
                                    <h2 className="text-2xl font-semibold mb-6 text-orange-500 animated-underline">
                                        What's New
                                    </h2>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 w-full max-w-2xl mx-auto px-2">
                                        {features.map((feature, index) => (
                                            <button
                                                key={index}
                                                onClick={() => handleFeatureClick(feature)}
                                                disabled={feature.status === 'soon'}
                                                className={`group relative text-left bg-surface-light dark:bg-surface-dark/50 border border-border-light dark:border-border-dark rounded-lg p-3 sm:p-4 transition-all duration-300 ease-in-out hover:scale-[1.02] active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed ${glowStyles[feature.glowColor]}`}
                                            >
                                                <div className="relative">
                                                    {feature.title === 'Academic Integrity & Analysis' && (
                                                        <div className="fire-tag-animation absolute -top-4 -right-3 flex items-center gap-1 bg-gradient-to-br from-red-500 to-orange-400 text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow-lg">
                                                            <Flame size={10} />
                                                            HOT
                                                        </div>
                                                    )}
                                                    {feature.status === 'soon' && <span className="absolute -top-2 -right-2 text-xs bg-yellow-400/20 text-yellow-600 dark:text-yellow-400 font-semibold px-2 py-0.5 rounded-full">Coming Soon</span>}
                                                    <div className="flex items-center gap-3 mb-2">
                                                        <feature.icon className="w-6 h-6 text-primary dark:text-primary-light" />
                                                        <h3 className="font-semibold text-text-light dark:text-text-dark">{feature.title}</h3>
                                                    </div>
                                                    <p className="text-sm text-text-muted-light dark:text-text-muted-dark">{feature.description}</p>
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {!isLoadingRecs && recommendations.length > 0 && (
                                <motion.div
                                    initial={{ opacity: 0, y: 30 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ duration: 0.8, delay: 0.5, ease: "easeOut" }}
                                    className="mt-12"
                                >
                                    <div className="relative text-center mb-6">
                                        <hr className="border-border-light dark:border-border-dark" />
                                        <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-background-light dark:bg-background-dark px-4">
                                            <h3 className="text-xl font-bold flex items-center gap-2 bg-gradient-to-r from-accent to-green-400 text-transparent bg-clip-text twinkling-text">
                                                <Sparkles size={20} /> Recommended For You
                                            </h3>
                                        </div>
                                    </div>
                                    <p className="text-center text-sm text-text-muted-light dark:text-text-muted-dark mb-6">
                                        Based on your recent activity, here are a few suggestions to explore next.
                                    </p>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 w-full max-w-4xl mx-auto px-2">
                                        {recommendations.map((rec, index) => (
                                            <RecommendationCard key={index} rec={rec} index={index} />
                                        ))}
                                    </div>
                                </motion.div>
                            )}
                        </div>
                    </div>
                )
            ) : (
                <ChatHistory messages={messages} onCueClick={handleSendMessage} />
            )}

            <ChatInput
                onSendMessage={handleSendMessage}
                isLoading={isActuallySendingAPI}
                useWebSearch={useWebSearch}
                setUseWebSearch={setUseWebSearch}
                useAcademicSearch={useAcademicSearch}
                setUseAcademicSearch={setUseAcademicSearch}
                criticalThinkingEnabled={criticalThinkingEnabled}
                setCriticalThinkingEnabled={setCriticalThinkingEnabled}
                initialPrompt={initialPromptForNewSession}
                setInitialPromptForNewSession={setInitialPromptForNewSession}
                openCoachModalWithData={setCoachData}
                setCoachModalOpen={setIsCoachModalOpen}
            />
            <PromptCoachModal
                isOpen={isCoachModalOpen}
                onClose={() => setIsCoachModalOpen(false)}
                onApply={(improvedPrompt) => {
                    setInitialPromptForNewSession(improvedPrompt);
                }}
                data={coachData}
            />
        </div>
    );
}

export default CenterPanel;