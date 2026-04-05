import React from 'react';

const Badge = ({ children, variant = 'primary', className = '', ...props }) => {
    const variants = {
        primary: 'bg-primary/10 text-primary border-primary/20',
        secondary: 'bg-secondary/10 text-secondary border-secondary/20',
        outline: 'bg-transparent border-border-light dark:border-border-dark text-text-muted-light dark:text-text-muted-dark',
        success: 'bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20',
        warning: 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/20',
        error: 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20',
    };

    return (
        <span
            className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${variants[variant] || variants.primary} ${className}`}
            {...props}
        >
            {children}
        </span>
    );
};

export default Badge;
