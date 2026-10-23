import dns from "node:dns/promises";
import net from "node:net";

/**
 * Checks if an IPv4 address is within private, loopback, link-local, or reserved ranges.
 */
export function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split(".").map((p) => parseInt(p, 10));
  if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) {
    return true; // Malformed -> reject
  }

  const [a, b, c] = parts as [number, number, number, number];

  // 0.0.0.0/8 (Broadcast/Current network)
  if (a === 0) return true;

  // 10.0.0.0/8 (Private)
  if (a === 10) return true;

  // 100.64.0.0/10 (Carrier-grade NAT)
  if (a === 100 && b >= 64 && b <= 127) return true;

  // 127.0.0.0/8 (Loopback)
  if (a === 127) return true;

  // 169.254.0.0/16 (Link-local / Cloud metadata service e.g. 169.254.169.254)
  if (a === 169 && b === 254) return true;

  // 172.16.0.0/12 (Private: 172.16.0.0 - 172.31.255.255)
  if (a === 172 && b >= 16 && b <= 31) return true;

  // 192.0.0.0/24, 192.0.2.0/24 (IETF Protocol Assignments & Test-Net-1)
  if (a === 192 && b === 0) return true;

  // 192.168.0.0/16 (Private)
  if (a === 192 && b === 168) return true;

  // 198.18.0.0/15 (Benchmarking)
  if (a === 198 && (b === 18 || b === 19)) return true;

  // 198.51.100.0/24 (Test-Net-2)
  if (a === 198 && b === 51 && c === 100) return true;

  // 203.0.113.0/24 (Test-Net-3)
  if (a === 203 && b === 0 && c === 113) return true;

  // 224.0.0.0/4 (Multicast)
  if (a >= 224 && a <= 239) return true;

  // 240.0.0.0/4 (Reserved / Future use)
  if (a >= 240) return true;

  return false;
}

/**
 * Checks if an IPv6 address is within private, loopback, or reserved ranges.
 */
export function isPrivateIPv6(ip: string): boolean {
  const normalized = ip.toLowerCase();

  // Loopback / Unspecified
  if (normalized === "::1" || normalized === "::" || normalized === "0000::0001") {
    return true;
  }

  // IPv4-mapped IPv6 (::ffff:192.168.1.1)
  if (normalized.startsWith("::ffff:") || normalized.startsWith("0000:0000:0000:0000:0000:ffff:")) {
    const lastPart = ip.split(":").pop();
    if (lastPart && net.isIPv4(lastPart)) {
      return isPrivateIPv4(lastPart);
    }
  }

  // Unique local addresses (fc00::/7)
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) {
    return true;
  }

  // Link-local unicast (fe80::/10)
  if (
    normalized.startsWith("fe80:") ||
    normalized.startsWith("fe9") ||
    normalized.startsWith("fea") ||
    normalized.startsWith("feb")
  ) {
    return true;
  }

  return false;
}

export function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    return isPrivateIPv4(ip);
  }
  if (net.isIPv6(ip)) {
    return isPrivateIPv6(ip);
  }
  return true; // Not a recognized IP -> treat as unsafe
}

export interface SsrfValidationResult {
  valid: boolean;
  error?: string | undefined;
  resolvedIp?: string | undefined;
  url?: URL | undefined;
}

/**
 * Validates a target URL against SSRF vulnerabilities:
 * - Scheme must be http or https
 * - Hostname cannot be localhost or private IP unless allowLocal is explicitly enabled (e.g. testing)
 * - Resolves DNS and verifies all target IPs are public
 */
export async function validateUrlSsrf(
  urlString: string,
  options: { allowLocal?: boolean } = {}
): Promise<SsrfValidationResult> {
  const allowLocal =
    options.allowLocal ??
    (process.env["NODE_ENV"] === "test" || process.env["ALLOW_LOCAL_IMPORTS"] === "true");

  let parsed: URL;
  try {
    parsed = new URL(urlString);
  } catch {
    return { valid: false, error: "Invalid URL format" };
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return {
      valid: false,
      error: `Invalid protocol: "${parsed.protocol}". Only HTTP and HTTPS are allowed.`,
    };
  }

  const hostname = parsed.hostname.toLowerCase().trim();
  if (!hostname) {
    return { valid: false, error: "Empty hostname in URL" };
  }

  // Localhost checks
  if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1" || hostname.endsWith(".local")) {
    if (allowLocal) {
      return { valid: true, url: parsed, resolvedIp: "127.0.0.1" };
    }
    return {
      valid: false,
      error: "Access to localhost or private network is strictly forbidden.",
    };
  }

  // If hostname is directly an IP address
  if (net.isIP(hostname)) {
    if (isPrivateIp(hostname)) {
      if (allowLocal && (hostname === "127.0.0.1" || hostname === "::1")) {
        return { valid: true, url: parsed, resolvedIp: hostname };
      }
      return {
        valid: false,
        error: `Access to private IP address "${hostname}" is forbidden by SSRF security policy.`,
      };
    }
    return { valid: true, url: parsed, resolvedIp: hostname };
  }

  // Resolve DNS to verify public IP destination
  try {
    const records = await dns.lookup(hostname, { all: true });
    if (!records || records.length === 0) {
      return { valid: false, error: `Could not resolve hostname "${hostname}"` };
    }

    for (const rec of records) {
      if (isPrivateIp(rec.address)) {
        if (allowLocal && (rec.address === "127.0.0.1" || rec.address === "::1")) {
          continue;
        }
        return {
          valid: false,
          error: `Hostname "${hostname}" resolved to private IP "${rec.address}", which is blocked by SSRF policy.`,
        };
      }
    }

    return { valid: true, url: parsed, resolvedIp: records[0]?.address };
  } catch (err: any) {
    return {
      valid: false,
      error: `DNS resolution failed for "${hostname}": ${err?.message || "Unknown error"}`,
    };
  }
}
