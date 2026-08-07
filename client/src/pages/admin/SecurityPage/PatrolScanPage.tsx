import '../MaintenancePage/MaintenancePage.css';
import { useState, useRef, useEffect } from 'react';
import {
  useScanCheckpointMutation, useGetPatrolLogsQuery,
} from '../../../store/api/securityApi';
import {
  QrCode, Loader2, CheckCircle2, MapPin, Clock,
  Camera, Send, Shield, AlertTriangle,
} from 'lucide-react';
import toast from 'react-hot-toast';

export default function PatrolScanPage() {
  const [qrCode, setQrCode] = useState('');
  const [notes, setNotes] = useState('');
  const [scanning, setScanning] = useState(false);
  const [lastScan, setLastScan] = useState<any>(null);
  const [geoStatus, setGeoStatus] = useState<'idle' | 'loading' | 'granted' | 'denied'>('idle');
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [scanCheckpoint, { isLoading: isSending }] = useScanCheckpointMutation();
  const { data: logsResp } = useGetPatrolLogsQuery({ limit: 10 });
  const recentLogs = logsResp?.data || [];

  // Request geolocation on mount
  useEffect(() => {
    if ('geolocation' in navigator) {
      setGeoStatus('loading');
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
          setGeoStatus('granted');
        },
        () => setGeoStatus('denied'),
        { enableHighAccuracy: true, timeout: 10000 }
      );
    }
  }, []);

  const handleScan = async () => {
    if (!qrCode.trim()) { toast.error('Enter or scan a QR code'); return; }
    setScanning(true);
    try {
      const result = await scanCheckpoint({
        qrCode: qrCode.trim(),
        lat: coords?.lat,
        lng: coords?.lng,
        notes: notes || undefined,
      }).unwrap();
      setLastScan(result.data || result);
      toast.success('Checkpoint scanned successfully!');
      setQrCode('');
      setNotes('');
      // Refresh GPS
      if ('geolocation' in navigator) {
        navigator.geolocation.getCurrentPosition(
          (pos) => setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
          () => {},
          { enableHighAccuracy: true }
        );
      }
    } catch (err: any) {
      const msg = err?.data?.message || err?.message || 'Invalid QR code';
      toast.error(msg);
    } finally {
      setScanning(false);
      inputRef.current?.focus();
    }
  };

  return (
    <div className="maint-page">
      {/* Header */}
      <div className="page-header">
        <div className="page-title-row">
          <div className="page-icon-lg" style={{ background: 'rgba(99,102,241,0.15)' }}><QrCode size={22} color="#818cf8" /></div>
          <div>
            <h1>Patrol Checkpoint Scan</h1>
            <p>Scan QR codes at patrol checkpoints to log your rounds</p>
          </div>
        </div>
      </div>

      {/* Scan Card */}
      <div className="scan-card">
        <div className="scan-icon-ring">
          <QrCode size={40} color="#818cf8" />
        </div>

        <h2 style={{ margin: '12px 0 4px', fontSize: '18px', fontWeight: 700, textAlign: 'center' }}>
          Scan Checkpoint
        </h2>
        <p style={{ fontSize: '12px', color: 'var(--text-tertiary)', textAlign: 'center', marginBottom: '20px' }}>
          Enter the QR code from the checkpoint label or use your device camera
        </p>

        {/* GPS Status */}
        <div className="scan-gps-status">
          {geoStatus === 'loading' && <><Loader2 size={12} className="spin" /> Getting location...</>}
          {geoStatus === 'granted' && <><MapPin size={12} color="#10b981" /> Location: {coords?.lat.toFixed(4)}, {coords?.lng.toFixed(4)}</>}
          {geoStatus === 'denied' && <><AlertTriangle size={12} color="#f59e0b" /> Location unavailable</>}
          {geoStatus === 'idle' && <><MapPin size={12} /> Location not requested</>}
        </div>

        {/* QR Input */}
        <div className="scan-input-group">
          <div className="scan-input-wrap">
            <QrCode size={16} color="var(--text-tertiary)" />
            <input ref={inputRef} className="scan-input"
              placeholder="CHKPT-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
              value={qrCode} onChange={(e) => setQrCode(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleScan()}
              autoFocus />
          </div>
          <textarea className="scan-notes"
            placeholder="Optional notes (e.g. 'All clear', 'Door left open')..."
            value={notes} onChange={(e) => setNotes(e.target.value)}
            rows={2} />
          <button className="btn btn-primary scan-btn" onClick={handleScan}
            disabled={isSending || scanning || !qrCode.trim()}>
            {(isSending || scanning) ? <Loader2 size={16} className="spin" /> : <Send size={16} />}
            {(isSending || scanning) ? 'Scanning...' : 'Log Checkpoint'}
          </button>
        </div>

        {/* Last Scan Success */}
        {lastScan && (
          <div className="scan-success">
            <CheckCircle2 size={20} color="#10b981" />
            <div>
              <strong>Checkpoint logged!</strong>
              <span style={{ fontSize: '11px', color: 'var(--text-tertiary)', display: 'block' }}>
                {new Date(lastScan.scannedAt || lastScan.createdAt).toLocaleTimeString()}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Recent Scans */}
      <div style={{ marginTop: '24px' }}>
        <h3 style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '14px', fontWeight: 600, marginBottom: '12px' }}>
          <Clock size={15} /> Recent Scans
        </h3>
        {recentLogs.length === 0 ? (
          <div className="maint-empty" style={{ padding: '30px' }}>
            <Shield size={30} />
            <p>No patrol logs yet</p>
          </div>
        ) : (
          <div className="maint-table-wrap">
            <table className="maint-table">
              <thead>
                <tr>
                  <th>Checkpoint</th>
                  <th>Location</th>
                  <th>Guard</th>
                  <th>Time</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {recentLogs.map((log: any) => (
                  <tr key={log.id}>
                    <td style={{ fontWeight: 600 }}>{log.checkpoint?.name || '—'}</td>
                    <td>
                      <span className="cell-secondary">
                        {log.checkpoint?.location || '—'}
                        {log.checkpoint?.floor && ` · F${log.checkpoint.floor}`}
                      </span>
                    </td>
                    <td>
                      {log.guard?.profile
                        ? `${log.guard.profile.firstName} ${log.guard.profile.lastName}`
                        : '—'}
                    </td>
                    <td>
                      <span className="ace-time">
                        <Clock size={11} />
                        {new Date(log.scannedAt).toLocaleString(undefined, {
                          month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
                        })}
                      </span>
                    </td>
                    <td>
                      <span className="cell-secondary">{log.notes || '—'}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
