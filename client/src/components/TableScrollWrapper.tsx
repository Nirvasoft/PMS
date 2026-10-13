import React, { useRef, useState, useEffect } from 'react';

interface TableScrollWrapperProps {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * TableScrollWrapper
 * Dynamically detects whether the enclosed table requires a horizontal scrollbar.
 * - When horizontal scrollbar is present: applies in-viewport scroll container
 *   (max-height: calc(100vh - 350px)) and sticky headers so the scrollbar and
 *   headers are directly visible within the viewport.
 * - When no horizontal scrollbar is needed: allows the table to expand naturally.
 */
export const TableScrollWrapper: React.FC<TableScrollWrapperProps> = ({
  children,
  className = '',
  style,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [hasOverflow, setHasOverflow] = useState(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const checkOverflow = () => {
      // scrollWidth > clientWidth indicates horizontal overflow is present
      const isOverflowing = el.scrollWidth - el.clientWidth > 2;
      setHasOverflow(isOverflowing);
    };

    checkOverflow();

    // Check on next frame after paint
    const rafId = requestAnimationFrame(checkOverflow);

    // Observe size changes of both container and table
    const ro = new ResizeObserver(() => {
      checkOverflow();
    });

    ro.observe(el);
    const tableEl = el.querySelector('table');
    if (tableEl) {
      ro.observe(tableEl);
    }

    window.addEventListener('resize', checkOverflow);

    return () => {
      cancelAnimationFrame(rafId);
      ro.disconnect();
      window.removeEventListener('resize', checkOverflow);
    };
  }, [children]);

  return (
    <div
      ref={containerRef}
      className={`table-scroll-container billing-table-scroll ${hasOverflow ? 'has-overflow' : 'no-overflow'} ${className}`.trim()}
      style={style}
    >
      {children}
    </div>
  );
};

export default TableScrollWrapper;
