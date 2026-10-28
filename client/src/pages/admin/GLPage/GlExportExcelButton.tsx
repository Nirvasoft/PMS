import { useState } from 'react';
import toast from 'react-hot-toast';
import { useAppSelector } from '../../../store';

export interface GlExportExcelButtonProps {
  url: string;
  filename: string;
  errorMessage?: string;
}

export function GlExportExcelButton({
  url,
  filename,
  errorMessage = 'Failed to export Excel',
}: GlExportExcelButtonProps) {
  const accessToken = useAppSelector((s) => s.auth.accessToken);
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    setExporting(true);
    try {
      const res = await fetch(url, {
        credentials: 'include',
        headers: {
          'X-Requested-With': 'XMLHttpRequest',
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
      });
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(objectUrl);
    } catch {
      toast.error(errorMessage);
    } finally {
      setExporting(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleExport}
      disabled={exporting}
      style={{
        padding: '6px 14px',
        borderRadius: 8,
        fontSize: 13,
        fontWeight: 600,
        background: 'var(--bg-tertiary)',
        color: 'var(--text-primary)',
        border: '1px solid var(--border-color)',
        cursor: exporting ? 'wait' : 'pointer',
        display: 'flex',
        alignItems: 'center',
        opacity: exporting ? 0.7 : 1,
      }}
    >
      {exporting ? 'Exporting…' : 'Export Excel'}
    </button>
  );
}
