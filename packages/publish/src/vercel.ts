export interface VercelDeployOptions {
  token: string;
  projectName: string;
  projectId?: string | undefined;
  files: Record<string, string>; // relativePath -> content
  teamId?: string | undefined;
  onProgress?: ((step: string, percent: number) => void) | undefined;
}

export interface VercelDeployResult {
  deploymentId: string;
  projectId?: string | undefined;
  url: string; // Production URL (<project>.vercel.app or alias)
  deploymentUrl: string; // Specific deployment URL
  inspectorUrl?: string | undefined;
  status: "READY" | "ERROR" | "BUILDING";
  hasDeploymentProtection?: boolean;
  error?: string | undefined;
}

export const VERCEL_API_BASE = "https://api.vercel.com";

export const VERCEL_EXPIRED_OR_REVOKED_MESSAGE =
  "Your Vercel connection has expired or was revoked. Reconnect Vercel in Settings → Integrations.";

/**
 * Checks whether an HTTP status or error string represents a Vercel authorization/token failure.
 */
export function isVercelAuthError(status?: number, message?: string): boolean {
  if (message) {
    const lower = message.toLowerCase();
    // Exclude domain registration/conflict errors
    if (lower.includes("registered to another") || lower.includes("already registered") || lower.includes("domain already in use")) {
      return false;
    }
    if (
      lower.includes("not authorized") ||
      lower.includes("unauthorized") ||
      lower.includes("invalid or unauthorized") ||
      lower.includes("invalid token") ||
      lower.includes("token expired") ||
      lower.includes("token revoked") ||
      (lower.includes("scope") && (lower.includes("authorized") || lower.includes("access") || lower.includes("invalid")))
    ) {
      return true;
    }
  }
  return status === 401;
}

/**
 * Formats a Vercel error message, transforming raw auth/scope errors into a user-friendly reconnect instruction.
 */
export function formatVercelErrorMessage(status?: number, rawMessage?: string): string {
  if (isVercelAuthError(status, rawMessage)) {
    return VERCEL_EXPIRED_OR_REVOKED_MESSAGE;
  }
  return rawMessage || "Vercel request failed.";
}

/**
 * Generates a safe, unique Vercel project name.
 * Requirements:
 * - lowercase
 * - letters, digits, '.', '_', '-' only
 * - collapse repeated dashes (never '---' or '--')
 * - max 100 characters
 * - short site-id suffix for uniqueness
 * - safe fallback if input is completely non-Latin / emojis
 */
export function generateSafeVercelProjectName(siteName: string, siteId: string): string {
  // Extract alphanumeric suffix from siteId (e.g. site_12345678 -> 12345678, last 6 chars)
  const cleanId = (siteId || "site").toLowerCase().replace(/[^a-z0-9]/g, "");
  const suffix = cleanId.length > 6 ? cleanId.slice(-6) : cleanId || "site01";
  const suffixPart = `-${suffix}`;

  // 1. Lowercase
  let base = (siteName || "").toLowerCase();

  // 2. Replace characters not in [a-z0-9._-] with '-'
  base = base.replace(/[^a-z0-9._-]/g, "-");

  // 3. Collapse repeated dashes
  base = base.replace(/-+/g, "-");

  // 4. Trim leading/trailing dashes, dots, underscores
  base = base.replace(/^[-._]+|[-._]+$/g, "");

  // Fallback if base became empty
  if (!base) {
    base = "site";
  }

  // 5. Max 100 characters total including suffix
  const maxBaseLen = 100 - suffixPart.length;
  base = base.slice(0, maxBaseLen).replace(/[-._]+$/, "");
  if (!base) {
    base = "site";
  }

  return `${base}${suffixPart}`;
}

/**
 * Checks whether an error or HTTP status is transient (network failure, 5xx, 429).
 */
export function isTransientVercelError(err: unknown, status?: number): boolean {
  if (status !== undefined && (status >= 500 || status === 429)) {
    return true;
  }
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    if (
      msg.includes("fetch failed") ||
      msg.includes("econnreset") ||
      msg.includes("etimedout") ||
      msg.includes("network") ||
      msg.includes("rate limit") ||
      msg.includes("429") ||
      msg.includes("socket hang up")
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Gets or creates a Vercel project by name or ID, ensuring project exists and returning its ID.
 */
export async function getOrCreateVercelProject(options: {
  token: string;
  projectName: string;
  projectId?: string | undefined;
  teamId?: string | undefined;
}): Promise<{ id: string; name: string; hasDeploymentProtection?: boolean }> {
  const { token, projectName, projectId, teamId } = options;
  const teamQuery = teamId ? `?teamId=${encodeURIComponent(teamId)}` : "";

  // 1. Try fetching existing project by ID if provided, otherwise by projectName
  const lookupTarget = projectId || projectName;
  try {
    const getRes = await fetch(`${VERCEL_API_BASE}/v9/projects/${encodeURIComponent(lookupTarget)}${teamQuery}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (getRes.status === 401 || getRes.status === 403) {
      throw new Error(VERCEL_EXPIRED_OR_REVOKED_MESSAGE);
    }
    if (getRes.ok) {
      const proj = (await getRes.json()) as any;
      const hasDeploymentProtection = !!(
        proj.ssoProtection ||
        proj.passwordProtection ||
        proj.deploymentProtection?.enabled
      );
      return { id: proj.id, name: proj.name, hasDeploymentProtection };
    }
  } catch (err) {
    if (err instanceof Error && err.message === VERCEL_EXPIRED_OR_REVOKED_MESSAGE) {
      throw err;
    }
  }

  // 2. If looking up by projectId failed, try by projectName
  if (projectId && projectId !== projectName) {
    try {
      const getRes = await fetch(`${VERCEL_API_BASE}/v9/projects/${encodeURIComponent(projectName)}${teamQuery}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (getRes.status === 401 || getRes.status === 403) {
        throw new Error(VERCEL_EXPIRED_OR_REVOKED_MESSAGE);
      }
      if (getRes.ok) {
        const proj = (await getRes.json()) as any;
        const hasDeploymentProtection = !!(
          proj.ssoProtection ||
          proj.passwordProtection ||
          proj.deploymentProtection?.enabled
        );
        return { id: proj.id, name: proj.name, hasDeploymentProtection };
      }
    } catch (err) {
      if (err instanceof Error && err.message === VERCEL_EXPIRED_OR_REVOKED_MESSAGE) {
        throw err;
      }
    }
  }

  // 3. Create project
  const createRes = await fetch(`${VERCEL_API_BASE}/v9/projects${teamQuery}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: projectName,
      framework: null,
    }),
  });

  if (!createRes.ok) {
    if (createRes.status === 401 || createRes.status === 403) {
      throw new Error(VERCEL_EXPIRED_OR_REVOKED_MESSAGE);
    }
    if (createRes.status === 409) {
      // Conflict: project already exists, fetch again
      const retryRes = await fetch(`${VERCEL_API_BASE}/v9/projects/${encodeURIComponent(projectName)}${teamQuery}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (retryRes.status === 401 || retryRes.status === 403) {
        throw new Error(VERCEL_EXPIRED_OR_REVOKED_MESSAGE);
      }
      if (retryRes.ok) {
        const proj = (await retryRes.json()) as any;
        const hasDeploymentProtection = !!(
          proj.ssoProtection ||
          proj.passwordProtection ||
          proj.deploymentProtection?.enabled
        );
        return { id: proj.id, name: proj.name, hasDeploymentProtection };
      }
    }
    const errText = await createRes.text();
    if (isVercelAuthError(createRes.status, errText)) {
      throw new Error(VERCEL_EXPIRED_OR_REVOKED_MESSAGE);
    }
    throw new Error(`Failed to create Vercel project (${createRes.status}): ${errText}`);
  }

  const newProj = (await createRes.json()) as any;
  return { id: newProj.id, name: newProj.name, hasDeploymentProtection: false };
}

export interface VercelTokenVerification {
  valid: boolean;
  username?: string | undefined;
  teamId?: string | undefined;
  teamSlug?: string | undefined;
  teamName?: string | undefined;
  error?: string | undefined;
}

/**
 * Validates a customer's Vercel access token against the Vercel user endpoint
 * and inspects team membership via /v2/teams to detect team-scoped tokens.
 */
export async function verifyVercelToken(token: string): Promise<VercelTokenVerification> {
  if (!token || token.trim() === "") {
    return { valid: false, error: "Vercel access token is empty." };
  }

  try {
    const res = await fetch(`${VERCEL_API_BASE}/v2/user`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (res.status === 401 || res.status === 403) {
      return { valid: false, error: VERCEL_EXPIRED_OR_REVOKED_MESSAGE };
    }

    if (!res.ok) {
      return { valid: false, error: `Vercel API returned status ${res.status}.` };
    }

    const data = (await res.json()) as any;
    const username = data?.user?.username || data?.user?.email;

    // Detect team if token is scoped to or has access to a team
    let teamId: string | undefined;
    let teamSlug: string | undefined;
    let teamName: string | undefined;

    try {
      const teamsRes = await fetch(`${VERCEL_API_BASE}/v2/teams`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (teamsRes.ok) {
        const teamsData = (await teamsRes.json()) as any;
        if (Array.isArray(teamsData?.teams) && teamsData.teams.length > 0) {
          const firstTeam = teamsData.teams[0];
          teamId = firstTeam.id;
          teamSlug = firstTeam.slug;
          teamName = firstTeam.name;
        }
      }
    } catch {
      // Ignore: personal-only tokens may not have teams or access to /v2/teams
    }

    return {
      valid: true,
      username,
      teamId,
      teamSlug,
      teamName,
    };
  } catch (err: any) {
    return { valid: false, error: err?.message || "Failed to reach Vercel API." };
  }
}

/**
 * Promotes a deployment to production using Vercel's instant promote API.
 */
export async function promoteDeployment(
  token: string,
  deploymentId: string,
  teamId?: string
): Promise<{ success: boolean; error?: string }> {
  const teamQuery = teamId ? `?teamId=${encodeURIComponent(teamId)}` : "";
  try {
    const res = await fetch(
      `${VERCEL_API_BASE}/v13/deployments/${encodeURIComponent(deploymentId)}/promote${teamQuery}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      }
    );

    if (res.ok) {
      return { success: true };
    }

    if (res.status === 401 || res.status === 403) {
      return {
        success: false,
        error: VERCEL_EXPIRED_OR_REVOKED_MESSAGE,
      };
    }

    const data = (await res.json().catch(() => ({}))) as any;
    if (isVercelAuthError(res.status, data?.error?.message)) {
      return {
        success: false,
        error: VERCEL_EXPIRED_OR_REVOKED_MESSAGE,
      };
    }
    return {
      success: false,
      error: data?.error?.message || `Vercel promote failed (${res.status})`,
    };
  } catch (err: any) {
    if (err instanceof Error && err.message === VERCEL_EXPIRED_OR_REVOKED_MESSAGE) {
      return { success: false, error: VERCEL_EXPIRED_OR_REVOKED_MESSAGE };
    }
    return {
      success: false,
      error: err?.message || "Failed to promote Vercel deployment.",
    };
  }
}

/**
 * Uploads static site files and creates a production deployment on Vercel via their REST API.
 * Retries transient errors (5xx, 429, network) with backoff; fails immediately on permanent errors.
 */
export async function deployToVercel(options: VercelDeployOptions): Promise<VercelDeployResult> {
  const { token, projectName, projectId, files, teamId, onProgress } = options;

  onProgress?.("Authenticating with Vercel...", 10);

  const teamQuery = teamId ? `?teamId=${encodeURIComponent(teamId)}` : "";

  // 1. Ensure project exists or create it
  onProgress?.("Checking Vercel project...", 20);
  let vercelProjectId = projectId;
  let hasDeploymentProtection = false;
  let resolvedProjectName = projectName;
  try {
    const project = await getOrCreateVercelProject({ token, projectName, projectId, teamId });
    vercelProjectId = project.id;
    resolvedProjectName = project.name;
    hasDeploymentProtection = !!project.hasDeploymentProtection;
  } catch (projErr) {
    // If project creation fails with a transient error, retry once
    if (isTransientVercelError(projErr)) {
      await new Promise((r) => setTimeout(r, 1000));
      const project = await getOrCreateVercelProject({ token, projectName, projectId, teamId });
      vercelProjectId = project.id;
      resolvedProjectName = project.name;
      hasDeploymentProtection = !!project.hasDeploymentProtection;
    } else {
      throw projErr;
    }
  }

  // 2. Format files for Vercel Deployments API
  const vercelFiles = Object.entries(files).map(([file, data]) => ({
    file,
    data,
    encoding: "utf-8",
  }));

  onProgress?.("Uploading site distribution...", 35);

  // 3. Create deployment with transient error retry
  let deployRes: Response | null = null;
  let deployAttempts = 0;
  while (deployAttempts < 3) {
    deployAttempts++;
    try {
      deployRes = await fetch(`${VERCEL_API_BASE}/v13/deployments${teamQuery}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: resolvedProjectName,
          project: vercelProjectId,
          files: vercelFiles,
          projectSettings: {
            framework: null,
          },
          target: "production",
        }),
      });

      if (!deployRes.ok) {
        if (deployRes.status === 401 || deployRes.status === 403) {
          throw new Error(VERCEL_EXPIRED_OR_REVOKED_MESSAGE);
        }
        if (isTransientVercelError(null, deployRes.status) && deployAttempts < 3) {
          const backoffMs = deployAttempts * 1000;
          onProgress?.(`Vercel edge busy (${deployRes.status}), retrying in ${backoffMs / 1000}s...`, 40);
          await new Promise((r) => setTimeout(r, backoffMs));
          continue;
        }
        const errBody = await deployRes.text();
        if (isVercelAuthError(deployRes.status, errBody)) {
          throw new Error(VERCEL_EXPIRED_OR_REVOKED_MESSAGE);
        }
        throw new Error(`Vercel deployment creation failed (${deployRes.status}): ${errBody}`);
      }
      break;
    } catch (fetchErr) {
      if (fetchErr instanceof Error && fetchErr.message === VERCEL_EXPIRED_OR_REVOKED_MESSAGE) {
        throw fetchErr;
      }
      if (isTransientVercelError(fetchErr) && deployAttempts < 3) {
        const backoffMs = deployAttempts * 1000;
        await new Promise((r) => setTimeout(r, backoffMs));
        continue;
      }
      throw fetchErr;
    }
  }

  if (!deployRes || !deployRes.ok) {
    throw new Error("Vercel deployment creation failed: Unable to connect to Vercel API.");
  }

  const deployData = (await deployRes.json()) as any;
  const deploymentId = deployData.id;
  const deploymentUrl = deployData.url ? `https://${deployData.url}` : "";
  if (!vercelProjectId && deployData.projectId) {
    vercelProjectId = deployData.projectId;
  }

  onProgress?.("Deployment queued on Vercel edge...", 60);

  // 4. Poll for readiness (max 30 seconds)
  let status = deployData.readyState || "BUILDING";
  let finalDeploymentUrl = deploymentUrl;
  let aliasList: string[] = Array.isArray(deployData.alias) ? deployData.alias : [];
  let attempts = 0;

  while ((status === "BUILDING" || status === "INITIALIZING" || status === "QUEUED") && attempts < 15) {
    attempts++;
    await new Promise((r) => setTimeout(r, 2000));
    onProgress?.(`Building on Vercel (polling step ${attempts})...`, 60 + attempts * 2);

    try {
      const pollRes = await fetch(`${VERCEL_API_BASE}/v13/deployments/${deploymentId}${teamQuery}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (pollRes.ok) {
        const pollData = (await pollRes.json()) as any;
        status = pollData.readyState;
        if (pollData.url) {
          finalDeploymentUrl = `https://${pollData.url}`;
        }
        if (Array.isArray(pollData.alias) && pollData.alias.length > 0) {
          aliasList = pollData.alias;
        }
      }
    } catch {}
  }

  // Determine production URL: alias if available, otherwise <project>.vercel.app
  const productionUrl =
    aliasList.length > 0
      ? `https://${aliasList[0]}`
      : `https://${resolvedProjectName}.vercel.app`;

  onProgress?.(status === "READY" ? "Deployment live!" : `Deployment status: ${status}`, 100);

  return {
    deploymentId,
    projectId: vercelProjectId,
    url: productionUrl,
    deploymentUrl: finalDeploymentUrl || productionUrl,
    inspectorUrl: deployData.inspectorUrl,
    status: status === "READY" ? "READY" : status === "ERROR" ? "ERROR" : "BUILDING",
    hasDeploymentProtection,
  };
}

export interface VercelDnsRecord {
  type: "A" | "CNAME" | "TXT";
  name: string;
  value: string;
  reason?: string;
}

export interface VercelDomainStatus {
  name: string;
  apexName?: string;
  verified: boolean;
  verification?: Array<{
    type?: string;
    domain?: string;
    value: string;
    reason?: string;
  }>;
  records: VercelDnsRecord[];
  sslStatus: "pending" | "ready" | "error";
  status?: "Pending DNS" | "Verified & SSL ready" | "Error" | string;
  error?: string;
}

/**
 * Extracts required DNS records and verification challenges returned by the Vercel API.
 * Never hardcodes arbitrary IP addresses or CNAME targets; returns only exact records/challenges
 * returned by Vercel for the given domain.
 */
export function computeDnsRecords(
  domainOrResponse: string | any,
  rawVerification?: any[],
  domainConfig?: any
): VercelDnsRecord[] {
  const records: VercelDnsRecord[] = [];
  const resp = typeof domainOrResponse === "object" && domainOrResponse !== null ? domainOrResponse : {};
  const domain = typeof domainOrResponse === "string" ? domainOrResponse : resp.name || resp.domain || "";
  const apexName = resp.apexName || (domain.includes(".") ? domain.split(".").slice(-2).join(".") : domain);

  // Determine host label for subdomains vs apex
  let subName = "@";
  if (domain && apexName && domain !== apexName && domain.endsWith("." + apexName)) {
    subName = domain.slice(0, -(apexName.length + 1));
  } else if (domain && domain.split(".").length > 2) {
    subName = domain.split(".").slice(0, -2).join(".");
  }

  const verificationList = [
    ...(Array.isArray(rawVerification) ? rawVerification : []),
    ...(Array.isArray(resp.verification) ? resp.verification : []),
    ...(Array.isArray(resp.verificationChallenges) ? resp.verificationChallenges : []),
    ...(Array.isArray(domainConfig?.verification) ? domainConfig.verification : []),
    ...(Array.isArray(domainConfig?.verificationChallenges) ? domainConfig.verificationChallenges : []),
  ];

  // 1. Process verification challenges returned by Vercel API
  for (const v of verificationList) {
    if (v && (v.value || v.domain)) {
      records.push({
        type: (v.type?.toUpperCase() as any) || "TXT",
        name: v.domain || v.name || "_vercel",
        value: v.value || "",
        reason: v.reason || "Domain ownership verification challenge",
      });
    }
  }

  // 2. Process explicit DNS records returned by Vercel API
  const apiRecords = [
    ...(Array.isArray(resp.records) ? resp.records : []),
    ...(Array.isArray(domainConfig?.records) ? domainConfig.records : []),
    ...(Array.isArray(domainConfig?.recommended?.records) ? domainConfig.recommended.records : []),
  ];
  for (const r of apiRecords) {
    if (r && r.value) {
      records.push({
        type: (r.type?.toUpperCase() as any) || "CNAME",
        name: r.name || (domain === apexName ? "@" : subName),
        value: r.value,
        reason: r.reason || "DNS record required by Vercel",
      });
    }
  }

  // 3. Process CNAMEs returned by Vercel API (including recommendedCNAME and recommended.cnames)
  const cnames = [
    ...(Array.isArray(resp.cnames) ? resp.cnames : []),
    ...(Array.isArray(resp.recommendedCNAME) ? resp.recommendedCNAME : []),
    ...(Array.isArray(resp.recommended?.cnames) ? resp.recommended.cnames : []),
    ...(Array.isArray(domainConfig?.cnames) ? domainConfig.cnames : []),
    ...(Array.isArray(domainConfig?.recommendedCNAME) ? domainConfig.recommendedCNAME : []),
    ...(Array.isArray(domainConfig?.recommended?.cnames) ? domainConfig.recommended.cnames : []),
  ];
  for (const cn of cnames) {
    if (cn) {
      const val = typeof cn === "object" ? cn.value : String(cn);
      if (!val) continue;
      const hostName = typeof cn === "object" && cn.name ? cn.name : (domain === apexName ? "@" : subName);
      records.push({
        type: "CNAME",
        name: hostName,
        value: val,
        reason: typeof cn === "object" && cn.reason ? cn.reason : "Subdomain CNAME returned by Vercel",
      });
    }
  }

  // 4. Process A values returned by Vercel API (including recommendedIPv4 and recommended.aValues)
  const aValues = [
    ...(Array.isArray(resp.aValues) ? resp.aValues : []),
    ...(Array.isArray(resp.recommendedIPv4) ? resp.recommendedIPv4 : []),
    ...(Array.isArray(resp.recommended?.aValues) ? resp.recommended.aValues : []),
    ...(Array.isArray(domainConfig?.aValues) ? domainConfig.aValues : []),
    ...(Array.isArray(domainConfig?.recommendedIPv4) ? domainConfig.recommendedIPv4 : []),
    ...(Array.isArray(domainConfig?.recommended?.aValues) ? domainConfig.recommended.aValues : []),
  ];
  for (const a of aValues) {
    if (a) {
      const val = typeof a === "object" ? a.value : String(a);
      if (!val) continue;
      const hostName = typeof a === "object" && a.name ? a.name : "@";
      records.push({
        type: "A",
        name: hostName,
        value: val,
        reason: typeof a === "object" && a.reason ? a.reason : "A record returned by Vercel",
      });
    }
  }

  // Deduplicate records by type, name and value
  const seen = new Set<string>();
  const uniqueRecords: VercelDnsRecord[] = [];
  for (const r of records) {
    const key = `${r.type}:${r.name}:${r.value}`;
    if (!seen.has(key)) {
      seen.add(key);
      uniqueRecords.push(r);
    }
  }

  return uniqueRecords;
}

/**
 * Adds a custom domain to a Vercel project and returns required DNS records and verification status.
 */
export async function addProjectDomain(
  token: string,
  projectName: string,
  domain: string,
  teamId?: string
): Promise<VercelDomainStatus> {
  const teamQuery = teamId ? `?teamId=${encodeURIComponent(teamId)}` : "";
  const cleanDomain = domain.toLowerCase().trim().replace(/^https?:\/\//, "").replace(/\/+$/, "");

  const res = await fetch(`${VERCEL_API_BASE}/v10/projects/${encodeURIComponent(projectName)}/domains${teamQuery}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ name: cleanDomain }),
  });

  const data = (await res.json().catch(() => ({}))) as any;

  if (!res.ok) {
    if (res.status === 401 || isVercelAuthError(res.status, data?.error?.message)) {
      throw new Error(VERCEL_EXPIRED_OR_REVOKED_MESSAGE);
    }
    const errorMsg = data?.error?.message || `Failed to add domain to Vercel (${res.status})`;
    throw new Error(errorMsg);
  }

  // Inspect domain configuration and DNS propagation via Vercel config endpoint
  const config = await getDomainConfig(token, cleanDomain, teamId);
  const isVerified = Boolean(data.verified) && !config.misconfigured;
  const records = computeDnsRecords(data, undefined, config);

  return {
    name: cleanDomain,
    apexName: data.apexName || cleanDomain,
    verified: isVerified,
    verification: data.verification || [],
    records,
    sslStatus: isVerified ? "ready" : "pending",
    status: isVerified ? "Verified & SSL ready" : "Pending DNS",
  };
}

/**
 * Inspects domain configuration and DNS propagation via Vercel config endpoint.
 */
export async function getDomainConfig(
  token: string,
  domain: string,
  teamId?: string
): Promise<{
  misconfigured: boolean;
  configuredBy?: string | null;
  cnames?: string[];
  aValues?: string[];
  recommended?: {
    cnames?: string[];
    aValues?: string[];
    [key: string]: any;
  };
  [key: string]: any;
}> {
  const teamQuery = teamId ? `?teamId=${encodeURIComponent(teamId)}` : "";
  const cleanDomain = domain.toLowerCase().trim();

  try {
    const res = await fetch(`${VERCEL_API_BASE}/v6/domains/${encodeURIComponent(cleanDomain)}/config${teamQuery}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      return { misconfigured: true };
    }

    const data = (await res.json().catch(() => ({}))) as any;
    return {
      misconfigured: !!data.misconfigured,
      configuredBy: data.configuredBy || null,
      cnames: data.cnames,
      aValues: data.aValues,
      recommended: data.recommended,
      ...data,
    };
  } catch {
    return { misconfigured: true };
  }
}

/**
 * Requests Vercel to re-verify domain ownership and SSL issuance.
 */
export async function verifyProjectDomain(
  token: string,
  projectName: string,
  domain: string,
  teamId?: string
): Promise<VercelDomainStatus> {
  const teamQuery = teamId ? `?teamId=${encodeURIComponent(teamId)}` : "";
  const cleanDomain = domain.toLowerCase().trim().replace(/^https?:\/\//, "").replace(/\/+$/, "");

  const res = await fetch(
    `${VERCEL_API_BASE}/v9/projects/${encodeURIComponent(projectName)}/domains/${encodeURIComponent(cleanDomain)}/verify${teamQuery}`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    }
  );

  const data = (await res.json().catch(() => ({}))) as any;

  if (!res.ok) {
    if (res.status === 401 || isVercelAuthError(res.status, data?.error?.message)) {
      return {
        name: cleanDomain,
        verified: false,
        records: [],
        sslStatus: "error",
        status: "Error",
        error: VERCEL_EXPIRED_OR_REVOKED_MESSAGE,
      };
    }
    const errorMsg = data?.error?.message || `Domain verification failed (${res.status})`;
    return {
      name: cleanDomain,
      verified: false,
      records: [],
      sslStatus: "error",
      status: "Error",
      error: errorMsg,
    };
  }

  // Inspect domain configuration and DNS propagation via Vercel config endpoint
  const config = await getDomainConfig(token, cleanDomain, teamId);
  const isVerified = Boolean(data.verified) && !config.misconfigured;
  const records = computeDnsRecords(data, undefined, config);

  return {
    name: cleanDomain,
    apexName: data.apexName || cleanDomain,
    verified: isVerified,
    verification: data.verification || [],
    records,
    sslStatus: isVerified ? "ready" : "pending",
    status: isVerified ? "Verified & SSL ready" : "Pending DNS",
  };
}

/**
 * Removes a custom domain from a Vercel project.
 */
export async function removeProjectDomain(
  token: string,
  projectName: string,
  domain: string,
  teamId?: string
): Promise<{ success: boolean }> {
  const teamQuery = teamId ? `?teamId=${encodeURIComponent(teamId)}` : "";
  const cleanDomain = domain.toLowerCase().trim().replace(/^https?:\/\//, "").replace(/\/+$/, "");

  const res = await fetch(
    `${VERCEL_API_BASE}/v9/projects/${encodeURIComponent(projectName)}/domains/${encodeURIComponent(cleanDomain)}${teamQuery}`,
    {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    }
  );

  if (!res.ok && res.status !== 404) {
    const data = (await res.json().catch(() => ({}))) as any;
    if (res.status === 401 || isVercelAuthError(res.status, data?.error?.message)) {
      throw new Error(VERCEL_EXPIRED_OR_REVOKED_MESSAGE);
    }
    throw new Error(data?.error?.message || `Failed to remove domain from Vercel (${res.status})`);
  }

  return { success: true };
}
