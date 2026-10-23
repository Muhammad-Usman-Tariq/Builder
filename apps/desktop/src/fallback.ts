/**
 * Offline / Server Unreachable fallback screen for Builder Desktop.
 */

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function renderFallbackHtml(targetUrl: string, errorDescription?: string): string {
  const safeTargetUrl = escapeHtml(targetUrl);
  const safeError = errorDescription ? escapeHtml(errorDescription) : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Builder - Server Unreachable</title>
  <style>
    :root {
      color-scheme: light dark;
      --bg: #09090b;
      --card-bg: #18181b;
      --text: #f4f4f5;
      --muted: #a1a1aa;
      --border: #27272a;
      --primary: #2563eb;
      --primary-hover: #1d4ed8;
    }
    @media (prefers-color-scheme: light) {
      :root {
        --bg: #f8fafc;
        --card-bg: #ffffff;
        --text: #0f172a;
        --muted: #64748b;
        --border: #e2e8f0;
        --primary: #2563eb;
        --primary-hover: #1d4ed8;
      }
    }
    body {
      margin: 0;
      padding: 0;
      height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      background-color: var(--bg);
      color: var(--text);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      user-select: none;
      -webkit-user-select: none;
    }
    .container {
      max-width: 480px;
      padding: 32px;
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 12px;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
      text-align: center;
    }
    .icon {
      width: 48px;
      height: 48px;
      margin: 0 auto 16px;
      color: var(--muted);
    }
    h1 {
      font-size: 20px;
      font-weight: 600;
      margin: 0 0 8px;
    }
    p {
      font-size: 14px;
      color: var(--muted);
      line-height: 1.5;
      margin: 0 0 20px;
    }
    .url-badge {
      display: inline-block;
      max-width: 100%;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 12px;
      padding: 6px 12px;
      background: rgba(125, 125, 125, 0.1);
      border-radius: 6px;
      margin-bottom: 20px;
    }
    .error-msg {
      font-size: 12px;
      color: #ef4444;
      margin-bottom: 20px;
    }
    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 10px 24px;
      font-size: 14px;
      font-weight: 500;
      color: #ffffff;
      background-color: var(--primary);
      border: none;
      border-radius: 6px;
      cursor: pointer;
      transition: background-color 0.15s ease;
      text-decoration: none;
    }
    .btn:hover {
      background-color: var(--primary-hover);
    }
  </style>
</head>
<body>
  <div class="container">
    <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="12" cy="12" r="10"></circle>
      <line x1="12" y1="8" x2="12" y2="12"></line>
      <line x1="12" y1="16" x2="12.01" y2="16"></line>
    </svg>
    <h1>Unable to reach Builder</h1>
    <p>Could not connect to the server. Check your connection or verify that the Builder service is running.</p>
    <div class="url-badge">${safeTargetUrl}</div>
    ${safeError ? `<div class="error-msg">Error: ${safeError}</div>` : ""}
    <div>
      <button class="btn" id="retry-btn" data-target="${safeTargetUrl}">Retry Connection</button>
    </div>
  </div>
  <script>
    document.getElementById('retry-btn').addEventListener('click', function() {
      var target = this.getAttribute('data-target');
      if (target) {
        window.location.href = target;
      }
    });
  </script>
</body>
</html>`;
}

export function renderMissingUrlHtml(message = "Builder address is not configured — set APP_URL"): string {
  const safeMessage = escapeHtml(message);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Builder - Configuration Error</title>
  <style>
    :root {
      color-scheme: light dark;
      --bg: #09090b;
      --card-bg: #18181b;
      --text: #f4f4f5;
      --muted: #a1a1aa;
      --border: #27272a;
      --warning: #f59e0b;
    }
    @media (prefers-color-scheme: light) {
      :root {
        --bg: #f8fafc;
        --card-bg: #ffffff;
        --text: #0f172a;
        --muted: #64748b;
        --border: #e2e8f0;
        --warning: #d97706;
      }
    }
    body {
      margin: 0;
      padding: 0;
      height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      background-color: var(--bg);
      color: var(--text);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      user-select: none;
      -webkit-user-select: none;
    }
    .container {
      max-width: 520px;
      padding: 36px 32px;
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 12px;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
      text-align: center;
    }
    .icon {
      width: 48px;
      height: 48px;
      margin: 0 auto 16px;
      color: var(--warning);
    }
    h1 {
      font-size: 18px;
      font-weight: 600;
      margin: 0 0 12px;
      line-height: 1.4;
    }
    p {
      font-size: 14px;
      color: var(--muted);
      line-height: 1.5;
      margin: 0 0 20px;
    }
    code {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 13px;
      background: rgba(125, 125, 125, 0.15);
      padding: 2px 6px;
      border-radius: 4px;
    }
  </style>
</head>
<body>
  <div class="container">
    <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
    <h1 data-testid="missing-url-heading">${safeMessage}</h1>
    <p>Please configure the Builder server URL by setting <code>APP_URL</code> in your root <code>.env</code> file or environment variables.</p>
  </div>
</body>
</html>`;
}

