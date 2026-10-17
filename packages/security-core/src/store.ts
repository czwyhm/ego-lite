import { DatabaseSync } from "node:sqlite";
import type {
  DastExecutionReport,
  NormalizedBrowserRequest,
  PassiveAnalysisReport,
  SecurityStore,
} from "./models.js";

type StoredReport = PassiveAnalysisReport | DastExecutionReport;

function readLimit(limit: number | undefined): number {
  if (limit === undefined) return 100;
  if (!Number.isFinite(limit) || limit < 1) throw new RangeError("Read limit must be a positive finite number.");
  return Math.min(1000, Math.floor(limit));
}

/**
 * Small local SQLite store backed by Node 22's built-in `node:sqlite` module.
 * Values should already be normalized/redacted before saving.
 */
export class SQLiteSecurityStore implements SecurityStore {
  private readonly database: DatabaseSync;
  private closed = false;

  constructor(path = ":memory:") {
    this.database = new DatabaseSync(path);
    this.database.exec(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS security_telemetry (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp INTEGER NOT NULL,
        payload TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS security_reports (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        created_at INTEGER NOT NULL,
        payload TEXT NOT NULL
      );
    `);
  }

  saveTelemetry(event: NormalizedBrowserRequest): void {
    this.ensureOpen();
    this.database
      .prepare("INSERT INTO security_telemetry (timestamp, payload) VALUES (?, ?)")
      .run(event.timestamp, JSON.stringify(event));
  }

  readTelemetry(limit?: number): NormalizedBrowserRequest[] {
    this.ensureOpen();
    const rows = this.database
      .prepare("SELECT payload FROM security_telemetry ORDER BY id DESC LIMIT ?")
      .all(readLimit(limit)) as Array<{ payload: string }>;
    return rows.flatMap((row) => {
      try {
        return [JSON.parse(row.payload) as NormalizedBrowserRequest];
      } catch {
        return [];
      }
    });
  }

  saveReport(report: StoredReport): void {
    this.ensureOpen();
    this.database
      .prepare("INSERT INTO security_reports (created_at, payload) VALUES (?, ?)")
      .run(Date.now(), JSON.stringify(report));
  }

  readReports(limit?: number): StoredReport[] {
    this.ensureOpen();
    const rows = this.database
      .prepare("SELECT payload FROM security_reports ORDER BY id DESC LIMIT ?")
      .all(readLimit(limit)) as Array<{ payload: string }>;
    return rows.flatMap((row) => {
      try {
        return [JSON.parse(row.payload) as StoredReport];
      } catch {
        return [];
      }
    });
  }

  close(): void {
    if (!this.closed) {
      this.database.close();
      this.closed = true;
    }
  }

  private ensureOpen() {
    if (this.closed) throw new Error("Security store is closed.");
  }
}

export function createSecurityStore(path = ":memory:"): SQLiteSecurityStore {
  return new SQLiteSecurityStore(path);
}
