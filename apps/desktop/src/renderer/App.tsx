import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactElement } from 'react';
import type { DesktopFinding, DesktopHostConnection, DesktopReport, DesktopTarget, DesktopTrafficEvent } from '../backend.js';

type Panel = 'targets' | 'traffic' | 'host' | 'findings' | 'reports';

const panels: readonly { id: Panel; label: string; icon: string }[] = [
  { id: 'targets', label: 'Targets', icon: '◎' },
  { id: 'traffic', label: 'Live traffic', icon: '⌁' },
  { id: 'host', label: 'Host connections', icon: '⌘' },
  { id: 'findings', label: 'Findings', icon: '◇' },
  { id: 'reports', label: 'Reports', icon: '▤' },
];

export function App(): ReactElement {
  const [panel, setPanel] = useState<Panel>('targets');
  const [targets, setTargets] = useState<readonly DesktopTarget[]>([]);
  const [traffic, setTraffic] = useState<readonly DesktopTrafficEvent[]>([]);
  const [hostConnections, setHostConnections] = useState<readonly DesktopHostConnection[]>([]);
  const [findings, setFindings] = useState<readonly DesktopFinding[]>([]);
  const [reports, setReports] = useState<readonly DesktopReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [nextTargets, nextTraffic, nextHostConnections, nextFindings, nextReports] = await Promise.all([
        window.egoDesktop.listTargets(),
        window.egoDesktop.listTraffic(),
        window.egoDesktop.listHostConnections(),
        window.egoDesktop.listFindings(),
        window.egoDesktop.listReports(),
      ]);
      setTargets(nextTargets);
      setTraffic(nextTraffic);
      setHostConnections(nextHostConnections);
      setFindings(nextFindings);
      setReports(nextReports);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to load console data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const counts = useMemo(() => ({ targets: targets.length, traffic: traffic.length, host: hostConnections.length, findings: findings.length, reports: reports.length }), [targets, traffic, hostConnections, findings, reports]);
  const current = panels.find((item) => item.id === panel)!;

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark">E</span><span>Ego Lite</span></div>
        <div className="workspace-label">SECURITY CONSOLE</div>
        <nav aria-label="Primary">
          {panels.map((item) => (
            <button className={`nav-item ${item.id === panel ? 'active' : ''}`} key={item.id} onClick={() => setPanel(item.id)}>
              <span className="nav-icon">{item.icon}</span><span>{item.label}</span><span className="nav-count">{counts[item.id]}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-footer"><span className="status-dot" /> Read-only telemetry<br /><small>Provider connected locally</small></div>
      </aside>
      <main className="content">
        <header className="topbar">
          <div><div className="eyebrow">OBSERVABILITY / SECURITY</div><h1>{current.label}</h1></div>
          <button className="refresh" onClick={() => void refresh()} disabled={loading}>{loading ? 'Refreshing…' : '↻  Refresh'}</button>
        </header>
        {error && <div className="error-banner" role="alert">{error}</div>}
        <section className="summary-grid">
          <Summary label="Targets" value={counts.targets} detail="known browser targets" />
          <Summary label="Live events" value={counts.traffic} detail="redacted request metadata" />
          <Summary label="Host links" value={counts.host} detail="local connection metadata" />
          <Summary label="Open findings" value={counts.findings} detail="from connected analysis" />
          <Summary label="Reports" value={counts.reports} detail="available exports" />
        </section>
        <section className="panel-card">
          {panel === 'targets' && <TargetsView items={targets} />}
          {panel === 'traffic' && <TrafficView items={traffic} />}
          {panel === 'host' && <HostConnectionsView items={hostConnections} />}
          {panel === 'findings' && <FindingsView items={findings} />}
          {panel === 'reports' && <ReportsView items={reports} />}
        </section>
      </main>
    </div>
  );
}

function Summary({ label, value, detail }: { label: string; value: number; detail: string }): ReactElement {
  return <div className="summary"><div className="summary-label">{label}</div><div className="summary-value">{value}</div><div className="summary-detail">{detail}</div></div>;
}

function Empty({ message }: { message: string }): ReactElement {
  return <div className="empty"><div className="empty-mark">·</div><strong>{message}</strong><span>Connect the parent security-core provider to populate this view.</span></div>;
}

function TargetsView({ items }: { items: readonly DesktopTarget[] }): ReactElement {
  return <div><div className="card-heading"><div><div className="section-kicker">BROWSER TARGETS</div><h2>Authorized environments</h2></div><span className="pill">READ ONLY</span></div>{items.length === 0 ? <Empty message="No targets connected" /> : <div className="table">{items.map((item) => <div className="row" key={item.id}><div className="target-name"><span className="status-dot" /> <strong>{item.name}</strong><small>{item.id}</small></div><span>{item.url}</span><span className="tag">{item.environment ?? 'unknown'}</span><span className="muted">{item.status ?? 'idle'}</span></div>)}</div>}</div>;
}

function TrafficView({ items }: { items: readonly DesktopTrafficEvent[] }): ReactElement {
  return <div><div className="card-heading"><div><div className="section-kicker">NETWORK TELEMETRY</div><h2>Recent browser events</h2></div><span className="live-pill"><span className="status-dot" /> LIVE</span></div>{items.length === 0 ? <Empty message="No traffic yet" /> : <div className="table">{items.map((item) => <div className="row" key={item.id}><time>{new Date(item.timestamp).toLocaleTimeString()}</time><strong className="method">{item.method}</strong><span className="truncate">{item.url}</span><span className={item.status && item.status >= 400 ? 'danger' : 'success'}>{item.status ?? '—'}</span><span className="muted">{item.durationMs ? `${item.durationMs} ms` : '—'}</span></div>)}</div>}</div>;
}

function HostConnectionsView({ items }: { items: readonly DesktopHostConnection[] }): ReactElement {
  return <div><div className="card-heading"><div><div className="section-kicker">HOST TELEMETRY</div><h2>Local connection metadata</h2></div><span className="pill">NO PAYLOADS</span></div>{items.length === 0 ? <Empty message="No host connections reported" /> : <div className="table">{items.map((item, index) => <div className="row" key={`${item.protocol}-${item.localAddress}-${item.localPort}-${index}`}><strong className="method">{item.protocol.toUpperCase()}</strong><span>{item.localAddress ?? '—'}:{item.localPort ?? '—'}</span><span>{item.remoteAddress ?? '—'}:{item.remotePort ?? '—'}</span><span className="muted">{item.state ?? '—'} · {item.processName ?? item.pid ?? item.source}</span></div>)}</div>}</div>;
}

function FindingsView({ items }: { items: readonly DesktopFinding[] }): ReactElement {
  return <div><div className="card-heading"><div><div className="section-kicker">SECURITY ANALYSIS</div><h2>Findings requiring attention</h2></div><span className="pill">ANALYSIS</span></div>{items.length === 0 ? <Empty message="No findings reported" /> : <div className="finding-list">{items.map((item) => <article className="finding" key={item.id}><span className={`severity ${item.severity}`}>{item.severity}</span><div><h3>{item.title}</h3><p>{item.description}</p><small>{item.targetId} · {new Date(item.createdAt).toLocaleString()}</small></div><span className="muted">{item.status ?? 'open'}</span></article>)}</div>}</div>;
}

function ReportsView({ items }: { items: readonly DesktopReport[] }): ReactElement {
  return <div><div className="card-heading"><div><div className="section-kicker">EXPORTS</div><h2>Security reports</h2></div><span className="pill">LOCAL</span></div>{items.length === 0 ? <Empty message="No reports exported" /> : <div className="table">{items.map((item) => <div className="row" key={item.id}><strong>{item.name}</strong><span>{item.targetId ?? 'all targets'}</span><span className="tag">{item.format}</span><span className="muted">{new Date(item.generatedAt).toLocaleString()}</span><span className="muted">{item.sizeBytes ? `${item.sizeBytes} B` : '—'}</span></div>)}</div>}</div>;
}
