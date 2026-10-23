/**
 * Robots.txt checker to ensure crawler compliance.
 */
export async function checkRobotsTxt(
  urlString: string,
  userAgent = "BuilderImporter"
): Promise<{ allowed: boolean; reason?: string }> {
  try {
    const parsed = new URL(urlString);
    const robotsUrl = `${parsed.protocol}//${parsed.host}/robots.txt`;

    let content = "";
    try {
      const resp = await fetch(robotsUrl, {
        headers: { "User-Agent": userAgent },
        signal: AbortSignal.timeout(5000),
      });
      if (resp.status === 404) {
        // No robots.txt -> allowed
        return { allowed: true };
      }
      if (!resp.ok) {
        // 5xx or other -> fail safe or allow
        return { allowed: true };
      }
      content = await resp.text();
    } catch {
      // Timeout or network error fetching robots.txt -> permit crawl
      return { allowed: true };
    }

    const lines = content.split("\n").map((l) => l.trim());
    let currentAgentApplies = false;
    const disallowedPaths: string[] = [];

    for (const line of lines) {
      if (!line || line.startsWith("#")) continue;

      const lower = line.toLowerCase();
      if (lower.startsWith("user-agent:")) {
        const agent = line.slice("user-agent:".length).trim().toLowerCase();
        if (agent === "*" || agent === userAgent.toLowerCase()) {
          currentAgentApplies = true;
        } else {
          currentAgentApplies = false;
        }
      } else if (currentAgentApplies && lower.startsWith("disallow:")) {
        const disallowPath = line.slice("disallow:".length).trim();
        if (disallowPath) {
          disallowedPaths.push(disallowPath);
        }
      }
    }

    const path = parsed.pathname || "/";
    for (const disallow of disallowedPaths) {
      if (disallow === "/" || path.startsWith(disallow)) {
        return {
          allowed: false,
          reason: `Crawling this URL is disallowed by robots.txt (rule: Disallow: ${disallow})`,
        };
      }
    }

    return { allowed: true };
  } catch {
    return { allowed: true };
  }
}
