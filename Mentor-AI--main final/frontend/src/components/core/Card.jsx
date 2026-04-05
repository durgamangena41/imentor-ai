import React from 'react';

const Card = ({ children, className = '', ...props }) => {
    return (
        <div
            className={`bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark rounded-xl shadow-sm ${className}`}
            {...props}
        >
            {children}
        </div>
    );
};

export default Card;
