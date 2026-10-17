import { execFile } from "node:child_process";
import type { HostCommandExecutor, HostConnectionMetadata, HostPlatform } from "./models.js";

type ParsedEndpoint = { address?: string; port?: number };

function endpoint(value: string): ParsedEndpoint {
  let text = value.trim();
  if (!text || text === "*" || text === "*:*" || text === "-") return {};
  if (text.startsWith("[")) {
    const close = text.indexOf("]");
    if (close >= 0) {
      const address = text.slice(1, close);
      const port = text.slice(close + 1).replace(/^:/, "");
      return { address, port: /^\d+$/.test(port) ? Number(port) : undefined };
    }
  }
  const lastColon = text.lastIndexOf(":");
  if (lastColon > 0 && /^\d+$/.test(text.slice(lastColon + 1))) {
    return { address: text.slice(0, lastColon), port: Number(text.slice(lastColon + 1)) };
  }
  if (/^\d+$/.test(text)) return { port: Number(text) };
  return { address: text };
}

function protocol(value: string): "tcp" | "udp" | string {
  return value.toLowerCase().startsWith("tcp") ? "tcp" : value.toLowerCase().startsWith("udp") ? "udp" : value.toLowerCase();
}

function processFields(tokens: readonly string[]): { pid?: number; processName?: string } {
  const joined = tokens.join(" ");
  const pidMatch = joined.match(/(?:^|pid[= ]|\s)(\d{1,10})(?:[,)]|\s|$)/i);
  const nameMatch = joined.match(/\(\(\"([^\"]+)\"/);
  return {
    pid: pidMatch ? Number(pidMatch[1]) : undefined,
    processName: nameMatch?.[1],
  };
}

function metadata(
  platform: HostPlatform,
  source: HostConnectionMetadata["source"],
  proto: string,
  localValue: string,
  remoteValue: string,
  state: string | undefined,
  extra: readonly string[],
): HostConnectionMetadata {
  const local = endpoint(localValue);
  const remote = endpoint(remoteValue);
  const process = processFields(extra);
  return {
    platform,
    protocol: protocol(proto),
    localAddress: local.address,
    localPort: local.port,
    remoteAddress: remote.address,
    remotePort: remote.port,
    state: state?.toUpperCase(),
    pid: process.pid,
    processName: process.processName,
    source,
  };
}

/** Parse `netstat -ano` output without invoking a command. */
export function parseWindowsNetstat(output: string): HostConnectionMetadata[] {
  const entries: HostConnectionMetadata[] = [];
  for (const line of output.split(/\r?\n/)) {
    const tokens = line.trim().split(/\s+/);
    if (tokens.length < 4 || !/^(tcp|udp)/i.test(tokens[0])) continue;
    const proto = tokens[0];
    const local = tokens[1];
    const remote = tokens[2];
    const hasState = /^(LISTENING|ESTABLISHED|TIME_WAIT|CLOSE_WAIT|SYN_SENT|SYN_RECEIVED|FIN_WAIT\d*|CLOSED|BOUND)$/i.test(tokens[3]);
    const state = hasState ? tokens[3] : undefined;
    const extra = hasState ? tokens.slice(4) : tokens.slice(3);
    entries.push(metadata("windows", "netstat", proto, local, remote, state, extra));
  }
  return entries;
}

/** Parse `ss -tunap` (and common Linux netstat) output without invoking a command. */
export function parseLinuxConnections(output: string, source: "ss" | "netstat" = "ss"): HostConnectionMetadata[] {
  const entries: HostConnectionMetadata[] = [];
  const states = /^(ESTAB|ESTABLISHED|LISTEN|LISTENING|UNCONN|TIME-WAIT|TIME_WAIT|CLOSE-WAIT|CLOSE_WAIT|SYN-SENT|SYN_SENT|SYN-RECV|SYN_RECEIVED|FIN-WAIT-\d|CLOSED|BOUND)$/i;
  for (const line of output.split(/\r?\n/)) {
    const tokens = line.trim().split(/\s+/);
    if (tokens.length < 5 || !/^(tcp|udp)/i.test(tokens[0]) || /^(netid|proto)$/i.test(tokens[0])) continue;
    const hasSsState = states.test(tokens[1]);
    const localIndex = hasSsState ? 4 : 3;
    const remoteIndex = localIndex + 1;
    if (!tokens[localIndex] || !tokens[remoteIndex]) continue;
    entries.push(metadata(
      "linux",
      source,
      tokens[0],
      tokens[localIndex],
      tokens[remoteIndex],
      hasSsState ? tokens[1] : tokens[5],
      tokens.slice(remoteIndex + 1),
    ));
  }
  return entries;
}

function runFile(command: string, args: readonly string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(command, [...args], { encoding: "utf8", maxBuffer: 2 * 1024 * 1024 }, (error, stdout) => {
      if (error) reject(error);
      else resolve(stdout);
    });
  });
}

export interface HostConnectionAdapter {
  platform: HostPlatform;
  collect(): Promise<HostConnectionMetadata[]>;
}

/** Create an injectable Windows/Linux adapter; collection failures return an empty list. */
export function createHostConnectionAdapter(
  platform: HostPlatform,
  execute: HostCommandExecutor = runFile,
): HostConnectionAdapter {
  if (platform !== "windows" && platform !== "linux") throw new RangeError(`Unsupported host platform: ${platform}`);
  return {
    platform,
    async collect() {
      try {
        if (platform === "windows") return parseWindowsNetstat(await execute("netstat", ["-ano"]));
        try {
          return parseLinuxConnections(await execute("ss", ["-tunap"]));
        } catch {
          return parseLinuxConnections(await execute("netstat", ["-tunap"]), "netstat");
        }
      } catch {
        return [];
      }
    },
  };
}

/** Best-effort collection using the current Node platform. */
export async function collectHostConnections(
  execute?: HostCommandExecutor,
): Promise<HostConnectionMetadata[]> {
  const platform = process.platform === "win32" ? "windows" : process.platform === "linux" ? "linux" : undefined;
  if (!platform) return [];
  return createHostConnectionAdapter(platform, execute).collect();
}

export const parseWindowsConnections = parseWindowsNetstat;
export const parseLinuxNetstat = parseLinuxConnections;
