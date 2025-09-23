
import React, { useState, useRef, useLayoutEffect, ReactNode, useCallback } from 'react';

interface TooltipProps {
  content: ReactNode;
  children: ReactNode;
}

const Tooltip: React.FC<TooltipProps> = ({ content, children }) => {
  const [isHovered, setIsHovered] = useState(false);
  const triggerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  const handleMouseEnter = () => setIsHovered(true);
  const handleMouseLeave = () => setIsHovered(false);

  const updatePosition = useCallback(() => {
    const tooltip = tooltipRef.current;
    if (!tooltip || !triggerRef.current) return;

    const rect = triggerRef.current.getBoundingClientRect();
    const tooltipHeight = tooltip.offsetHeight;
    const tooltipWidth = tooltip.offsetWidth;
    
    let top, left;

    // Position above or below trigger element, relative to the viewport
    if (rect.top - tooltipHeight - 10 > 0) {
      top = rect.top - tooltipHeight - 10;
    } else {
      top = rect.bottom + 10;
    }

    // Center horizontally relative to the trigger
    left = rect.left + rect.width / 2;
    
    // Clamp to viewport edges to prevent overflow
    const calculatedLeftEdge = left - tooltipWidth / 2;
    const calculatedRightEdge = left + tooltipWidth / 2;

    if (calculatedLeftEdge < 5) {
      left = 5 + tooltipWidth / 2;
    } else if (calculatedRightEdge > window.innerWidth - 5) {
      left = window.innerWidth - 5 - tooltipWidth / 2;
    }
    
    tooltip.style.top = `${top}px`;
    tooltip.style.left = `${left}px`;
    tooltip.style.transform = 'translateX(-50%)';
  }, []);

  useLayoutEffect(() => {
    const tooltip = tooltipRef.current;
    if (isHovered && tooltip) {
      updatePosition();
      
      tooltip.style.opacity = '1';
      tooltip.style.visibility = 'visible';

      window.addEventListener('scroll', updatePosition, true);
      window.addEventListener('resize', updatePosition);

      return () => {
        window.removeEventListener('scroll', updatePosition, true);
        window.removeEventListener('resize', updatePosition);
      };
    } else if (tooltip) {
      tooltip.style.opacity = '0';
      tooltip.style.visibility = 'hidden';
    }
  }, [isHovered, content, updatePosition]);


  return (
    <>
      <div
        ref={triggerRef}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className="inline-block"
      >
        {children}
      </div>
      {/* The tooltip is rendered here but positioned relative to the viewport */}
      <div
        ref={tooltipRef}
        className="fixed z-50 p-3 bg-slate-800 text-white text-sm rounded-lg shadow-xl max-w-sm transition-opacity duration-200"
        style={{
          visibility: 'hidden',
          opacity: 0,
          pointerEvents: 'none',
        }}
      >
        {content}
      </div>
    </>
  );
};

export default Tooltip;