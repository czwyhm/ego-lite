import type {
  BrowserObservation,
  DataProvider,
  DastRequest,
  DastResult,
  Finding,
  FindingsQuery,
  HostConnection,
  ObservationQuery,
  PageAnalysis,
  PageAnalysisQuery,
  ReportExport,
  ReportQuery,
  Target,
  TelemetryEvent,
  TelemetryQuery,
} from './types.js';
import { redactHeaders, redactUrl } from './redaction.js';

/** A safe empty provider used by the stdio executable until the parent wires its stores. */
export class EmptyDataProvider implements DataProvider {
  listTargets(): readonly Target[] { return []; }
  async getObservation(_input: ObservationQuery): Promise<BrowserObservation | null> { return null; }
  getTelemetry(_input: TelemetryQuery): readonly TelemetryEvent[] { return []; }
  analyzePage(_input: PageAnalysisQuery): PageAnalysis | null { return null; }
  listFindings(_input: FindingsQuery): readonly Finding[] { return []; }
  async getHostConnections(): Promise<readonly HostConnection[]> { return []; }
  exportReport(input: ReportQuery): ReportExport {
    const generatedAt = new Date().toISOString();
    const content = input.format === 'markdown'
      ? '# Ego Lite security report\n\nNo findings were supplied by the connected provider.\n'
      : JSON.stringify({ generatedAt, targetId: input.targetId ?? null, findings: [] }, null, 2);
    return {
      filename: `ego-report-${generatedAt.replace(/[:.]/g, '-')}.${input.format === 'markdown' ? 'md' : 'json'}`,
      format: input.format ?? 'json',
      generatedAt,
      content,
    };
  }
}

/**
 * Small in-memory adapter useful for local smoke checks and embedding examples.
 * It applies the same metadata redaction expected from a real browser adapter.
 */
export class MemoryDataProvider extends EmptyDataProvider {
  constructor(
    private readonly targets: readonly Target[] = [],
    private readonly observations: readonly BrowserObservation[] = [],
    private readonly telemetry: readonly TelemetryEvent[] = [],
    private readonly analyses: readonly PageAnalysis[] = [],
    private readonly findings: readonly Finding[] = [],
  ) { super(); }

  override listTargets(): readonly Target[] { return this.targets; }

  override async getObservation(input: ObservationQuery): Promise<BrowserObservation | null> {
    return this.observations.find((item) => item.targetId === input.targetId && (!input.observationId || item.id === input.observationId)) ?? null;
  }

  override getTelemetry(input: TelemetryQuery): readonly TelemetryEvent[] {
    return this.telemetry
      .filter((item) => item.targetId === input.targetId && (!input.since || item.timestamp >= input.since))
      .slice(-(input.limit ?? 100))
      .map((item) => ({
        ...item,
        url: redactUrl(item.url),
        requestHeaders: redactHeaders(item.requestHeaders),
        responseHeaders: redactHeaders(item.responseHeaders),
      }));
  }

  override analyzePage(input: PageAnalysisQuery): PageAnalysis | null {
    return this.analyses.find((item) => item.targetId === input.targetId) ?? null;
  }

  override listFindings(input: FindingsQuery): readonly Finding[] {
    return this.findings
      .filter((item) => !input.targetId || item.targetId === input.targetId)
      .filter((item) => !input.severity || item.severity === input.severity)
      .slice(0, input.limit ?? 100);
  }

  override exportReport(input: ReportQuery): ReportExport {
    const findings = this.listFindings({ targetId: input.targetId });
    const generatedAt = new Date().toISOString();
    if (input.format === 'markdown') {
      const lines = [
        '# Ego Lite security report',
        '',
        `Generated: ${generatedAt}`,
        input.targetId ? `Target: ${input.targetId}` : 'Target: all',
        '',
        ...(findings.length ? findings.flatMap((finding) => [
          `## ${finding.severity.toUpperCase()}: ${finding.title}`,
          finding.description,
          input.includeEvidence && finding.evidence ? `Evidence: ${finding.evidence}` : '',
          '',
        ]) : ['No findings.']),
      ];
      return {
        filename: `ego-report-${generatedAt.replace(/[:.]/g, '-')}.md`,
        format: 'markdown',
        generatedAt,
        content: lines.join('\n'),
      };
    }
    return {
      filename: `ego-report-${generatedAt.replace(/[:.]/g, '-')}.json`,
      format: 'json',
      generatedAt,
      content: JSON.stringify({ generatedAt, targetId: input.targetId ?? null, findings }, null, 2),
    };
  }

  async runDast(_input: DastRequest): Promise<DastResult> {
    const now = new Date().toISOString();
    return {
      targetId: _input.targetId,
      startedAt: now,
      completedAt: now,
      requestCount: 0,
      findings: [],
      auditId: `dry-run-${Date.now()}`,
    };
  }
}
