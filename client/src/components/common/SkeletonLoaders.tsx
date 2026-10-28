import type { CSSProperties } from 'react';

export interface TableSkeletonRowsProps {
  columns?: number;
  rows?: number;
}

/**
 * Renders skeleton `<tr>` rows inside an existing `<table><tbody>`.
 */
export function TableSkeletonRows({ columns = 6, rows = 5 }: TableSkeletonRowsProps) {
  return (
    <>
      {Array.from({ length: rows }).map((_, rowIdx) => (
        <tr key={rowIdx} className="pms-skeleton-tr">
          {Array.from({ length: columns }).map((__, colIdx) => {
            const widthPct =
              colIdx === 0 ? '55%' : colIdx === columns - 1 ? '60%' : `${65 + ((rowIdx + colIdx) % 3) * 10}%`;
            return (
              <td key={colIdx}>
                <div className="pms-skeleton-line" style={{ width: widthPct }} />
              </td>
            );
          })}
        </tr>
      ))}
    </>
  );
}

export interface TableSkeletonProps {
  columns?: number;
  rows?: number;
  showHeader?: boolean;
  style?: CSSProperties;
  className?: string;
}

/**
 * Renders a standalone skeleton table container (header bar + shimmer rows).
 */
export function TableSkeleton({
  columns = 6,
  rows = 6,
  showHeader = true,
  style,
  className = '',
}: TableSkeletonProps) {
  return (
    <div className={`pms-skeleton-table-wrap ${className}`.trim()} style={style} aria-busy="true">
      {showHeader && (
        <div
          className="pms-skeleton-table-header"
          style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
        >
          {Array.from({ length: columns }).map((_, idx) => (
            <div
              key={idx}
              className="pms-skeleton-line pms-skeleton-line-header"
              style={{ width: idx === 0 ? '50%' : '70%' }}
            />
          ))}
        </div>
      )}
      <div className="pms-skeleton-table-body">
        {Array.from({ length: rows }).map((_, rowIdx) => (
          <div
            key={rowIdx}
            className="pms-skeleton-table-row"
            style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
          >
            {Array.from({ length: columns }).map((__, colIdx) => {
              const widthPct =
                colIdx === 0 ? '55%' : colIdx === columns - 1 ? '60%' : `${65 + ((rowIdx + colIdx) % 3) * 10}%`;
              return <div key={colIdx} className="pms-skeleton-line" style={{ width: widthPct }} />;
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

export interface PageSkeletonProps {
  cards?: number;
  rows?: number;
  columns?: number;
  style?: CSSProperties;
  className?: string;
}

/**
 * Renders a full page/section skeleton with optional KPI stat cards + table rows.
 */
export function PageSkeleton({
  cards = 0,
  rows = 6,
  columns = 5,
  style,
  className = '',
}: PageSkeletonProps) {
  return (
    <div className={`pms-skeleton-page ${className}`.trim()} style={style} aria-busy="true">
      {cards > 0 && (
        <div className="pms-skeleton-stat-grid">
          {Array.from({ length: cards }).map((_, idx) => (
            <div key={idx} className="pms-skeleton-stat-card">
              <div className="pms-skeleton-line" style={{ width: '45%', height: 12 }} />
              <div className="pms-skeleton-line" style={{ width: '70%', height: 22, marginTop: 10 }} />
              <div className="pms-skeleton-line" style={{ width: '55%', height: 10, marginTop: 8 }} />
            </div>
          ))}
        </div>
      )}
      {rows > 0 && <TableSkeleton columns={columns} rows={rows} />}
    </div>
  );
}

export interface CardGridSkeletonProps {
  count?: number;
  tall?: boolean;
}

/**
 * Renders a responsive grid of card skeletons.
 */
export function CardGridSkeleton({ count = 6, tall = false }: CardGridSkeletonProps) {
  return (
    <div className="module-skeleton-grid" aria-busy="true">
      {Array.from({ length: count }).map((_, idx) => (
        <div
          key={idx}
          className={`module-skeleton-card${tall ? ' module-skeleton-tall' : ''}`}
        />
      ))}
    </div>
  );
}
