import { TableSkeletonRows } from '../../../components/common/SkeletonLoaders';
import { useState, useMemo } from 'react';
import {
  Clock, Play, Pause, Settings, RefreshCw, CheckCircle2,
  XCircle, AlertTriangle, History, Calendar, Search, X, Zap
} from 'lucide-react';
import toast from 'react-hot-toast';
import {
  useGetCronJobsQuery,
  useUpdateCronJobMutation,
  useRunCronJobNowMutation,
  useGetCronJobLogsQuery,
} from '../../../store/api/integrationsApi';
import { TableScrollWrapper } from '../../../components/TableScrollWrapper';
import './CronJobsPage.css';

interface CronJobItem {
  id: string;
  jobKey: string;
  name: string;
  category: string;
  description: string;
  cronExpression: string;
  timezone: string;
  isEnabled: boolean;
  isScheduled: boolean;
  isRunning: boolean;
  lastRunAt: string | null;
  lastStatus: 'success' | 'failed' | 'running' | null;
  lastDurationMs: number | null;
  lastError: string | null;
  updatedBy: string | null;
  updatedAt: string | null;
  supportsManualTrigger: boolean;
}

// Convert cron expression to human readable preview
function getHumanSchedule(expr: string, tz: string): string {
  const parts = expr.trim().split(/\s+/);
  if (parts.length === 5) {
    const [min, hour, dom, mon, dow] = parts;
    if (min === '*' && hour === '*' && dom === '*' && mon === '*' && dow === '*') {
      return 'Every minute';
    }
    if (min.startsWith('*/') && hour === '*' && dom === '*' && mon === '*' && dow === '*') {
      return `Every ${min.replace('*/', '')} minutes`;
    }
    if (min === '0' && hour === '*' && dom === '*' && mon === '*' && dow === '*') {
      return 'Hourly at :00';
    }
    if (!isNaN(Number(min)) && hour === '*' && dom === '*' && mon === '*' && dow === '*') {
      return `Hourly at :${min.padStart(2, '0')}`;
    }
    if (hour.startsWith('*/') && dom === '*' && mon === '*' && dow === '*') {
      return `Every ${hour.replace('*/', '')} hours at minute :${min.padStart(2, '0')}`;
    }
    if (!isNaN(Number(min)) && !isNaN(Number(hour)) && dom === '*' && mon === '*' && dow === '*') {
      const h = Number(hour);
      const m = Number(min);
      const ampm = h >= 12 ? 'PM' : 'AM';
      const displayH = h % 12 === 0 ? 12 : h % 12;
      return `Daily at ${displayH}:${m.toString().padStart(2, '0')} ${ampm}`;
    }
    if (!isNaN(Number(min)) && !isNaN(Number(hour)) && !isNaN(Number(dom)) && mon === '*' && dow === '*') {
      const h = Number(hour);
      const m = Number(min);
      const ampm = h >= 12 ? 'PM' : 'AM';
      const displayH = h % 12 === 0 ? 12 : h % 12;
      return `Monthly on Day ${dom} at ${displayH}:${m.toString().padStart(2, '0')} ${ampm}`;
    }
  }
  return `${expr} (${tz})`;
}

export default function CronJobsPage() {
  const { data: res, isLoading, isFetching, refetch } = useGetCronJobsQuery();
  const [isManualRefreshing, setIsManualRefreshing] = useState<boolean>(false);
  const [updateCronJob, { isLoading: isUpdating }] = useUpdateCronJobMutation();
  const [runCronJobNow, { isLoading: isRunningNow }] = useRunCronJobNowMutation();

  const [activeCategory, setActiveCategory] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Modal States
  const [editingJob, setEditingJob] = useState<CronJobItem | null>(null);
  const [runConfirmJob, setRunConfirmJob] = useState<CronJobItem | null>(null);
  const [logsJob, setLogsJob] = useState<CronJobItem | null>(null);

  // Edit Form States
  const [presetType, setPresetType] = useState<'daily' | 'interval' | 'hourly' | 'monthly'>('daily');
  const [dailyTime, setDailyTime] = useState<string>('02:00');
  const [intervalMins, setIntervalMins] = useState<string>('15');
  const [hourlyMinute, setHourlyMinute] = useState<string>('0');
  const [monthlyDay, setMonthlyDay] = useState<string>('1');
  const [monthlyTime, setMonthlyTime] = useState<string>('03:00');
  const [selectedTimezone, setSelectedTimezone] = useState<string>('Asia/Yangon');
  const [editEnabled, setEditEnabled] = useState<boolean>(true);

  const jobs: CronJobItem[] = res?.data || [];

  // Summary Metrics
  const totalJobs = jobs.length;
  const activeJobs = jobs.filter(j => j.isEnabled).length;
  const pausedJobs = jobs.filter(j => !j.isEnabled).length;
  const failedJobs = jobs.filter(j => j.lastStatus === 'failed').length;

  const categories = useMemo(() => {
    const set = new Set(jobs.map(j => j.category));
    return ['All', ...Array.from(set)];
  }, [jobs]);

  // Filtered List
  const filteredJobs = useMemo(() => {
    return jobs.filter(job => {
      const matchCategory = activeCategory === 'All' || job.category === activeCategory;
      const matchSearch =
        searchQuery === '' ||
        job.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        job.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        job.jobKey.toLowerCase().includes(searchQuery.toLowerCase());
      const matchStatus =
        statusFilter === 'all' ||
        (statusFilter === 'active' && job.isEnabled) ||
        (statusFilter === 'paused' && !job.isEnabled);

      return matchCategory && matchSearch && matchStatus;
    });
  }, [jobs, activeCategory, searchQuery, statusFilter]);

  // Open Edit Modal
  const handleOpenEdit = (job: CronJobItem) => {
    setEditingJob(job);
    setSelectedTimezone(job.timezone || 'Asia/Yangon');
    setEditEnabled(job.isEnabled);

    // Parse existing expression to preset
    const parts = job.cronExpression.trim().split(/\s+/);
    if (parts.length === 5) {
      const [m, h, dom] = parts;
      if (m.startsWith('*/') && h === '*') {
        setPresetType('interval');
        setIntervalMins(m.replace('*/', ''));
      } else if (!isNaN(Number(m)) && h === '*' && dom === '*') {
        setPresetType('hourly');
        setHourlyMinute(m);
      } else if (!isNaN(Number(m)) && !isNaN(Number(h)) && dom === '*') {
        setPresetType('daily');
        setDailyTime(`${h.padStart(2, '0')}:${m.padStart(2, '0')}`);
      } else if (!isNaN(Number(m)) && !isNaN(Number(h)) && !isNaN(Number(dom))) {
        setPresetType('monthly');
        setMonthlyDay(dom);
        setMonthlyTime(`${h.padStart(2, '0')}:${m.padStart(2, '0')}`);
      } else {
        setPresetType('daily');
        setDailyTime('02:00');
      }
    } else {
      setPresetType('daily');
      setDailyTime('02:00');
    }
  };

  // Build target cron expression from preset
  const calculateResultCron = (): string => {
    if (presetType === 'daily') {
      const [h, m] = dailyTime.split(':').map(Number);
      return `${m || 0} ${h || 0} * * *`;
    }
    if (presetType === 'interval') {
      return `*/${intervalMins} * * * *`;
    }
    if (presetType === 'hourly') {
      return `${Number(hourlyMinute) || 0} * * * *`;
    }
    if (presetType === 'monthly') {
      const [h, m] = monthlyTime.split(':').map(Number);
      return `${m || 0} ${h || 0} ${monthlyDay} * *`;
    }
    return '0 2 * * *';
  };

  // Save Schedule Change
  const handleSaveEdit = async () => {
    if (!editingJob) return;
    const finalCron = calculateResultCron();

    try {
      await updateCronJob({
        jobKey: editingJob.jobKey,
        data: {
          cronExpression: finalCron,
          timezone: selectedTimezone,
          isEnabled: editEnabled,
        },
      }).unwrap();

      toast.success(`Updated schedule for "${editingJob.name}"`);
      setEditingJob(null);
    } catch (err: any) {
      toast.error(err?.data?.message || err?.data?.errors?.[0]?.message || err?.message || 'Failed to update cron job');
    }
  };

  // Toggle Active/Inactive directly
  const handleToggle = async (job: CronJobItem) => {
    try {
      await updateCronJob({
        jobKey: job.jobKey,
        data: { isEnabled: !job.isEnabled },
      }).unwrap();
      toast.success(`${job.name} is now ${!job.isEnabled ? 'Active' : 'Paused'}`);
    } catch (err: any) {
      toast.error(err?.data?.message || err?.data?.errors?.[0]?.message || err?.message || 'Failed to toggle status');
    }
  };

  // Run Now Execution
  const handleConfirmRunNow = async () => {
    if (!runConfirmJob) return;
    const toastId = toast.loading(`Executing "${runConfirmJob.name}" in background...`);
    try {
      const res = await runCronJobNow(runConfirmJob.jobKey).unwrap();
      if (res.success) {
        toast.success(res.message || `Successfully completed in ${res.data?.durationMs || 0}ms`, { id: toastId });
      } else {
        toast.error(res.message || 'Job finished with errors', { id: toastId });
      }
      setRunConfirmJob(null);
    } catch (err: any) {
      toast.error(err?.data?.message || err?.data?.errors?.[0]?.message || err?.message || 'Execution error', { id: toastId });
    }
  };

  // Dedicated refresh handler with visual spinning and toast confirmation
  const handleRefresh = async () => {
    setIsManualRefreshing(true);
    try {
      await refetch().unwrap();
      toast.success('Job status refreshed');
    } catch {
      // RTK Query refetch may return void or reject if cached
      refetch();
      toast.success('Job status refreshed');
    } finally {
      setIsManualRefreshing(false);
    }
  };

  const isRefreshingNow = isLoading || isFetching || isManualRefreshing;

  return (
    <div className="cron-page">
      {/* Page Header */}
      <div className="page-header">
        <div className="page-title-row">
          <div className="page-icon-lg">
            <Clock size={22} />
          </div>
          <div>
            <h1>Background Cron Jobs</h1>
            <p>
              {totalJobs} total job{totalJobs !== 1 ? 's' : ''} · Monitor, reschedule, pause/resume, and manually trigger system background tasks
            </p>
          </div>
        </div>
        <button
          className="cron-btn"
          onClick={handleRefresh}
          disabled={isRefreshingNow}
          title="Refresh job status"
        >
          <RefreshCw size={14} className={isRefreshingNow ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* Metric Cards */}
      <div className="cron-stats">
        <div className="cron-stat-card">
          <div className="cron-stat-icon blue">
            <Clock size={22} />
          </div>
          <div className="cron-stat-info">
            <h3>{totalJobs}</h3>
            <span>Total Registered Tasks</span>
          </div>
        </div>

        <div className="cron-stat-card">
          <div className="cron-stat-icon green">
            <CheckCircle2 size={22} />
          </div>
          <div className="cron-stat-info">
            <h3>{activeJobs}</h3>
            <span>Active & Scheduled</span>
          </div>
        </div>

        <div className="cron-stat-card">
          <div className="cron-stat-icon amber">
            <Pause size={22} />
          </div>
          <div className="cron-stat-info">
            <h3>{pausedJobs}</h3>
            <span>Paused / Inactive</span>
          </div>
        </div>

        <div className="cron-stat-card">
          <div className="cron-stat-icon red">
            <AlertTriangle size={22} />
          </div>
          <div className="cron-stat-info">
            <h3>{failedJobs}</h3>
            <span>Failed in Last Run</span>
          </div>
        </div>
      </div>

      {/* 1. Category Navigation Pills */}
      <div className="cron-category-nav">
        {categories.map(cat => {
          const count = cat === 'All' ? jobs.length : jobs.filter(j => j.category === cat).length;
          return (
            <button
              key={cat}
              type="button"
              className={`cron-tab-btn ${activeCategory === cat ? 'active' : ''}`}
              onClick={() => setActiveCategory(cat)}
            >
              {cat}
              <span className="cron-tab-badge">{count}</span>
            </button>
          );
        })}
      </div>

      {/* 2. Dedicated Search & Status Filter Toolbar */}
      <div className="cron-toolbar">
        <div className="cron-search-input-wrap">
          <Search size={16} className="cron-search-icon" />
          <input
            type="text"
            placeholder="Search by job name, description, or key..."
            className="cron-search-input"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button
              type="button"
              className="cron-search-clear-btn"
              onClick={() => setSearchQuery('')}
              title="Clear search"
            >
              <X size={14} />
            </button>
          )}
        </div>

        <div className="cron-toolbar-actions">
          <select
            className="cron-select-filter"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="all">All Statuses</option>
            <option value="active">Active Only</option>
            <option value="paused">Paused Only</option>
          </select>

          <span className="cron-count-badge">
            Showing <strong>{filteredJobs.length}</strong> of {totalJobs} jobs
          </span>
        </div>
      </div>

      {/* ── Modern Card Grid View ── */}
      <div className="cron-cards-grid">
        {isLoading ? (
          <div className="cron-empty-state">
            <RefreshCw size={24} className="animate-spin" />
            <p>Loading cron job definitions...</p>
          </div>
        ) : filteredJobs.length === 0 ? (
          <div className="cron-empty-state">
            <p>No cron jobs matched your search criteria.</p>
          </div>
        ) : (
          filteredJobs.map(job => (
            <div
              key={job.jobKey}
              className={`cron-card ${job.isEnabled ? 'active-card' : 'paused-card'}`}
            >
              {/* Card Top: Category Badge & Status Switch */}
              <div className="cron-card-top">
                <span className={`cron-cat-badge cron-cat-${job.category}`}>
                  {job.category}
                </span>

                <div className="cron-card-status-toggle">
                  <label className="cron-switch" title={job.isEnabled ? 'Active - Click to pause' : 'Paused - Click to activate'}>
                    <input
                      type="checkbox"
                      checked={job.isEnabled}
                      onChange={() => handleToggle(job)}
                      disabled={isUpdating}
                    />
                    <span className="cron-slider"></span>
                  </label>
                  <span className={`cron-toggle-label ${job.isEnabled ? 'active' : 'paused'}`}>
                    {job.isEnabled ? 'Active' : 'Paused'}
                  </span>
                </div>
              </div>

              {/* Card Middle: Title & Description */}
              <div className="cron-card-body">
                <div className="cron-card-title-row">
                  <h3 className="cron-card-title" title={job.name}>{job.name}</h3>
                  {job.isRunning && (
                    <span className="cron-status-badge running" title="Job is running right now">
                      <Zap size={11} className="animate-pulse" /> Running
                    </span>
                  )}
                </div>
                <p className="cron-card-desc" title={job.description}>
                  {job.description}
                </p>
              </div>

              {/* Card Schedule Pill */}
              <div
                className="cron-card-schedule"
                title={`Expression: ${job.cronExpression} (${job.timezone})`}
              >
                <Clock size={13} className="cron-card-schedule-icon" />
                <span className="cron-card-schedule-text">
                  {getHumanSchedule(job.cronExpression, job.timezone)}
                </span>
              </div>

              {/* Card Footer: Last Run & Quick Actions */}
              <div className="cron-card-footer">
                <div className="cron-card-lastrun">
                  {job.lastStatus === 'success' ? (
                    <span
                      className="cron-status-badge success"
                      title={job.lastRunAt ? `Last run: ${new Date(job.lastRunAt).toLocaleString()}${job.lastDurationMs ? ` (${job.lastDurationMs}ms)` : ''}` : 'Success'}
                    >
                      <CheckCircle2 size={12} /> Success
                      {job.lastDurationMs ? ` (${job.lastDurationMs}ms)` : ''}
                    </span>
                  ) : job.lastStatus === 'failed' ? (
                    <span
                      className="cron-status-badge failed"
                      title={`${job.lastError || 'Run failed'}${job.lastRunAt ? ` at ${new Date(job.lastRunAt).toLocaleString()}` : ''}`}
                    >
                      <XCircle size={12} /> Failed
                    </span>
                  ) : job.lastStatus === 'running' ? (
                    <span className="cron-status-badge running">
                      <RefreshCw size={12} className="animate-spin" /> In Progress
                    </span>
                  ) : (
                    <span className="cron-status-badge never" title="This job has not been executed yet">
                      Never run
                    </span>
                  )}
                </div>

                <div className="cron-icon-actions">
                  <button
                    type="button"
                    className="cron-action-icon-btn edit"
                    onClick={() => handleOpenEdit(job)}
                    title="Edit schedule & timing"
                    aria-label="Edit schedule"
                  >
                    <Settings size={15} />
                  </button>

                  {job.supportsManualTrigger ? (
                    <button
                      type="button"
                      className="cron-action-icon-btn run"
                      onClick={() => setRunConfirmJob(job)}
                      disabled={job.isRunning || isRunningNow}
                      title="Run job immediately in background"
                      aria-label="Run job now"
                    >
                      <Play size={15} />
                    </button>
                  ) : (
                    <span className="cron-action-icon-placeholder" title="Automatic schedule only" />
                  )}

                  <button
                    type="button"
                    className="cron-action-icon-btn logs"
                    onClick={() => setLogsJob(job)}
                    title="View execution log history"
                    aria-label="View logs"
                  >
                    <History size={15} />
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* ─── MODAL 1: EDIT SCHEDULE MODAL (HYBRID) ─── */}
      {editingJob && (
        <div className="cron-modal-backdrop" onClick={() => setEditingJob(null)}>
          <div className="cron-modal" onClick={e => e.stopPropagation()}>
            <div className="cron-modal-header">
              <h2>
                <Settings size={20} className="cron-modal-header-icon" />
                Edit Schedule: {editingJob.name}
              </h2>
              <button className="cron-modal-close" onClick={() => setEditingJob(null)} title="Close">
                <X size={18} />
              </button>
            </div>

            <div className="cron-modal-body">
              <div className="cron-field-group">
                <label>Schedule Frequency</label>
                <div className="cron-radio-grid">
                  <div
                    className={`cron-radio-card ${presetType === 'daily' ? 'selected' : ''}`}
                    onClick={() => setPresetType('daily')}
                  >
                    <input type="radio" checked={presetType === 'daily'} onChange={() => setPresetType('daily')} />
                    <Calendar size={18} className="cron-preset-icon" />
                    <div className="cron-radio-card-content">
                      <span className="cron-radio-title">Daily</span>
                      <div className="cron-radio-sub">Runs once per day at specified time</div>
                    </div>
                  </div>

                  <div
                    className={`cron-radio-card ${presetType === 'interval' ? 'selected' : ''}`}
                    onClick={() => setPresetType('interval')}
                  >
                    <input type="radio" checked={presetType === 'interval'} onChange={() => setPresetType('interval')} />
                    <Zap size={18} className="cron-preset-icon" />
                    <div className="cron-radio-card-content">
                      <span className="cron-radio-title">Interval</span>
                      <div className="cron-radio-sub">Repeats every X minutes</div>
                    </div>
                  </div>

                  <div
                    className={`cron-radio-card ${presetType === 'hourly' ? 'selected' : ''}`}
                    onClick={() => setPresetType('hourly')}
                  >
                    <input type="radio" checked={presetType === 'hourly'} onChange={() => setPresetType('hourly')} />
                    <Clock size={18} className="cron-preset-icon" />
                    <div className="cron-radio-card-content">
                      <span className="cron-radio-title">Hourly</span>
                      <div className="cron-radio-sub">Runs every hour at minute :XX</div>
                    </div>
                  </div>

                  <div
                    className={`cron-radio-card ${presetType === 'monthly' ? 'selected' : ''}`}
                    onClick={() => setPresetType('monthly')}
                  >
                    <input type="radio" checked={presetType === 'monthly'} onChange={() => setPresetType('monthly')} />
                    <History size={18} className="cron-preset-icon" />
                    <div className="cron-radio-card-content">
                      <span className="cron-radio-title">Monthly</span>
                      <div className="cron-radio-sub">Runs once a month on specific day</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Preset Detail Fields */}
              {presetType === 'daily' && (
                <div className="cron-field-group">
                  <label>Run Time (24-Hour)</label>
                  <input
                    type="time"
                    className="cron-input"
                    value={dailyTime}
                    onChange={(e) => setDailyTime(e.target.value)}
                  />
                </div>
              )}

              {presetType === 'interval' && (
                <div className="cron-field-group">
                  <label>Repeat Every</label>
                  <select
                    className="cron-select"
                    value={intervalMins}
                    onChange={(e) => setIntervalMins(e.target.value)}
                  >
                    <option value="5">Every 5 minutes</option>
                    <option value="10">Every 10 minutes</option>
                    <option value="15">Every 15 minutes</option>
                    <option value="30">Every 30 minutes</option>
                  </select>
                </div>
              )}

              {presetType === 'hourly' && (
                <div className="cron-field-group">
                  <label>At Minute of the Hour</label>
                  <select
                    className="cron-select"
                    value={hourlyMinute}
                    onChange={(e) => setHourlyMinute(e.target.value)}
                  >
                    <option value="0">:00 (Top of the hour)</option>
                    <option value="5">:05</option>
                    <option value="10">:10</option>
                    <option value="15">:15 (Quarter past)</option>
                    <option value="20">:20</option>
                    <option value="30">:30 (Half past)</option>
                    <option value="40">:40</option>
                    <option value="45">:45 (Quarter to)</option>
                    <option value="50">:50</option>
                    <option value="55">:55</option>
                  </select>
                </div>
              )}

              {presetType === 'monthly' && (
                <div className="cron-field-group">
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                    <div>
                      <label style={{ display: 'block', marginBottom: '0.35rem' }}>Day of Month (1 - 31)</label>
                      <input
                        type="number"
                        min="1"
                        max="31"
                        className="cron-input"
                        value={monthlyDay}
                        onChange={(e) => setMonthlyDay(e.target.value)}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', marginBottom: '0.35rem' }}>Run Time</label>
                      <input
                        type="time"
                        className="cron-input"
                        value={monthlyTime}
                        onChange={(e) => setMonthlyTime(e.target.value)}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Timezone & Enabled */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div className="cron-field-group">
                  <label>Execution Timezone</label>
                  <select
                    className="cron-select"
                    value={selectedTimezone}
                    onChange={(e) => setSelectedTimezone(e.target.value)}
                  >
                    <option value="Asia/Yangon">Asia/Yangon (GMT+6:30 Myanmar)</option>
                    <option value="UTC">UTC (Coordinated Universal Time)</option>
                    <option value="Asia/Bangkok">Asia/Bangkok (GMT+7)</option>
                    <option value="Asia/Singapore">Asia/Singapore (GMT+8)</option>
                    <option value="Asia/Tokyo">Asia/Tokyo (GMT+9)</option>
                  </select>
                </div>

                <div className="cron-field-group">
                  <label>Status</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', height: '38px' }}>
                    <label className="cron-switch">
                      <input
                        type="checkbox"
                        checked={editEnabled}
                        onChange={(e) => setEditEnabled(e.target.checked)}
                      />
                      <span className="cron-slider"></span>
                    </label>
                    <span style={{ fontSize: '0.85rem', fontWeight: 500 }}>
                      {editEnabled ? 'Active (Running)' : 'Paused (Disabled)'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Live Preview Box */}
              <div className="cron-preview-box">
                <div className="cron-preview-header">
                  <Clock size={14} className="cron-preview-icon" />
                  <span className="cron-preview-title">Calculated Execution Preview</span>
                </div>
                <div className="cron-preview-text">
                  <span className="cron-preview-human">{getHumanSchedule(calculateResultCron(), selectedTimezone)}</span>
                  <span className="cron-raw-tag" title="Standard 5-part cron syntax">
                    {calculateResultCron()}
                  </span>
                </div>
              </div>
            </div>

            <div className="cron-modal-footer">
              <button className="cron-btn cron-btn-cancel" onClick={() => setEditingJob(null)}>
                Cancel
              </button>
              <button
                className="cron-btn primary cron-btn-save"
                onClick={handleSaveEdit}
                disabled={isUpdating}
              >
                {isUpdating ? (
                  <>
                    <RefreshCw size={14} className="animate-spin" /> Saving Changes...
                  </>
                ) : (
                  <>
                    <CheckCircle2 size={14} /> Save Schedule
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL 2: RUN NOW CONFIRMATION MODAL ─── */}
      {runConfirmJob && (
        <div className="cron-modal-backdrop" onClick={() => setRunConfirmJob(null)}>
          <div className="cron-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '460px' }}>
            <div className="cron-modal-header">
              <h2>
                <Play size={18} className="text-primary" />
                Run Cron Job Now?
              </h2>
              <button className="cron-modal-close" onClick={() => setRunConfirmJob(null)}>
                <X size={18} />
              </button>
            </div>

            <div className="cron-modal-body">
              <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-primary)', lineHeight: 1.5 }}>
                Are you sure you want to manually trigger <strong>"{runConfirmJob.name}"</strong> right now?
              </p>
              <div className="cron-helper-box">
                {runConfirmJob.description}
              </div>
              <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                This job will execute in the background and record the output in the execution logs.
              </p>
            </div>

            <div className="cron-modal-footer">
              <button className="cron-btn" onClick={() => setRunConfirmJob(null)}>
                Cancel
              </button>
              <button
                className="cron-btn run-now"
                onClick={handleConfirmRunNow}
                disabled={isRunningNow}
              >
                {isRunningNow ? 'Executing...' : 'Yes, Run Now'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL 3: EXECUTION LOGS MODAL ─── */}
      {logsJob && (
        <CronJobLogsModal job={logsJob} onClose={() => setLogsJob(null)} />
      )}
    </div>
  );
}

// ── Execution Logs Modal Component ──
function CronJobLogsModal({ job, onClose }: { job: CronJobItem; onClose: () => void }) {
  const { data: logsRes, isLoading, refetch } = useGetCronJobLogsQuery({ jobKey: job.jobKey });
  const logs = logsRes?.logs || [];

  return (
    <div className="cron-modal-backdrop" onClick={onClose}>
      <div className="cron-modal wide" onClick={e => e.stopPropagation()}>
        <div className="cron-modal-header">
          <h2>
            <History size={18} />
            Execution Logs: {job.name}
          </h2>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <button className="cron-btn" onClick={() => refetch()} disabled={isLoading}>
              <RefreshCw size={13} className={isLoading ? 'animate-spin' : ''} />
            </button>
            <button className="cron-modal-close" onClick={onClose}>
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="cron-modal-body" style={{ padding: 0 }}>
          <TableScrollWrapper>
          <table className="cron-table">
            <thead>
              <tr>
                <th>Started At</th>
                <th>Triggered By</th>
                <th>Duration</th>
                <th>Status</th>
                <th>Message / Details</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <TableSkeletonRows columns={5} />
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                    No execution logs recorded yet for this job.
                  </td>
                </tr>
              ) : (
                logs.map((log: any) => (
                  <tr key={log.id}>
                    <td>
                      {new Date(log.startedAt).toLocaleDateString()}{' '}
                      {new Date(log.startedAt).toLocaleTimeString()}
                    </td>
                    <td>
                      <span className="cron-raw-tag">{log.triggeredBy}</span>
                    </td>
                    <td>{log.durationMs ? `${log.durationMs}ms` : '—'}</td>
                    <td>
                      {log.status === 'success' ? (
                        <span className="cron-status-badge success">Success</span>
                      ) : log.status === 'failed' ? (
                        <span className="cron-status-badge failed">Failed</span>
                      ) : (
                        <span className="cron-status-badge running">Running</span>
                      )}
                    </td>
                    <td>
                      {log.message && <div style={{ fontSize: '0.8rem' }}>{log.message}</div>}
                      {log.error && (
                        <div style={{ fontSize: '0.75rem', color: 'var(--error)', fontFamily: 'monospace' }}>
                          {log.error}
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          </TableScrollWrapper>
        </div>

        <div className="cron-modal-footer">
          <button className="cron-btn" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
