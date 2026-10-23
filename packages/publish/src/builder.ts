import type { SiteDocument } from "@builder/document";
import { compileFullCSS, getGoogleFontsUrl } from "@builder/renderer";
import { renderPageToStaticMarkup } from "@builder/renderer/server";

export interface BuildStaticSiteOptions {
  siteId: string;
  domainUrl?: string | undefined;
  apiPublicUrl?: string | undefined;
  assetImages?: Record<string, string> | undefined;
  cmsEntries?: Record<string, any>[] | undefined;
}

export interface StaticSiteBuild {
  files: Record<string, string>; // relativePath -> file string content
  pageCount: number;
  totalSizeBytes: number;
  pages: Array<{ pageId: string; slug: string; path: string }>;
  warnings: string[];
}

/**
 * Builds the complete static site distribution matching Architecture Section 11.2:
 * - HTML files for each page (index.html, [slug]/index.html)
 * - Compiled CSS (assets/site.css)
 * - Image assets copied into output (assets/img/*)
 * - Form submission client script (assets/forms.js)
 * - sitemap.xml and robots.txt (when real domainUrl is configured)
 * - vercel.json with security headers and clean URLs
 */
export function buildStaticSite(
  doc: SiteDocument,
  options: BuildStaticSiteOptions
): StaticSiteBuild {
  const files: Record<string, string> = {};
  const warnings: string[] = [];
  const domainUrl = options.domainUrl?.trim();
  const apiUrl = (options.apiPublicUrl || process.env.API_PUBLIC_URL || process.env.APP_URL || "").trim();
  if (!apiUrl) {
    warnings.push("API URL is not configured: form submissions will use relative paths.");
  }

  // Deep copy document to avoid mutating input during asset rewriting
  const buildDoc: SiteDocument = JSON.parse(JSON.stringify(doc));
  const imageMap = new Map<string, string>();

  // Register all document assets in imageMap if they exist
  if (buildDoc.assets) {
    for (const [astId, ast] of Object.entries(buildDoc.assets)) {
      if (ast?.url) {
        imageMap.set(astId, ast.url);
      }
    }
  }

  // Copy explicit asset images passed in options
  if (options.assetImages) {
    for (const [key, content] of Object.entries(options.assetImages)) {
      const cleanKey = key.replace(/^\/+/, "").replace(/^assets\/img\//, "");
      const imgPath = `assets/img/${cleanKey}`;
      files[imgPath] = content;
      imageMap.set(key, `/${imgPath}`);
      imageMap.set(`/${imgPath}`, `/${imgPath}`);
      imageMap.set(cleanKey, `/${imgPath}`);
    }
  }

  // Extract and copy inline data URIs and referenced images into assets/img/
  for (const [elId, el] of Object.entries(buildDoc.elements)) {
    if (el.type === "Image" && el.props) {
      const src = el.props["src"];
      if (typeof src === "string" && src.startsWith("data:image/")) {
        const match = src.match(/^data:image\/([a-zA-Z0-9+]+);?(base64)?,?(.*)$/);
        if (match) {
          const rawExt = match[1] || "png";
          const ext = rawExt.includes("svg") ? "svg" : rawExt.includes("jpeg") ? "jpg" : rawExt;
          const isBase64 = match[2] === "base64";
          const dataPayload = match[3] || "";
          const imgFilename = `assets/img/img-${elId}.${ext}`;

          files[imgFilename] = isBase64
            ? Buffer.from(dataPayload, "base64").toString("binary")
            : decodeURIComponent(dataPayload);

          const rewrittenUrl = `/${imgFilename}`;
          el.props["src"] = rewrittenUrl;
          imageMap.set(src, rewrittenUrl);
        }
      } else if (typeof src === "string" && imageMap.has(src)) {
        el.props["src"] = imageMap.get(src)!;
      }
    }
  }

  const resolveAssetUrl = (id: string): string => {
    if (!id) return "";
    // If id is in imageMap, return mapped URL
    if (imageMap.has(id)) return imageMap.get(id)!;
    if (imageMap.has(`/${id}`)) return imageMap.get(`/${id}`)!;
    // If id is an asset in buildDoc.assets
    if (buildDoc.assets && buildDoc.assets[id]?.url) {
      return buildDoc.assets[id].url;
    }
    // If id is already an absolute URL (http/https)
    if (/^https?:\/\//i.test(id)) {
      return id;
    }
    // If local file exists in output bundle files
    const cleanId = id.replace(/^\/+/, "").replace(/^assets\/img\//, "");
    if (files[`assets/img/${cleanId}`] !== undefined) {
      return `/assets/img/${cleanId}`;
    }
    // Return id as fallback
    return id;
  };

  // 1. Compile CSS
  const fullCSS = compileFullCSS(buildDoc);
  files["assets/site.css"] = fullCSS;

  // 2. Client-side Form handler script
  const formsScript = `
(function() {
  window.addEventListener('DOMContentLoaded', function() {
    var forms = document.querySelectorAll('form[data-element-type="Form"]');
    forms.forEach(function(form) {
      form.addEventListener('submit', async function(e) {
        e.preventDefault();
        var formId = form.getAttribute('data-form-id') || form.getAttribute('id') || 'default';
        var submitBtn = form.querySelector('button[type="submit"], input[type="submit"]');
        var originalBtnText = submitBtn ? submitBtn.innerText : '';
        if (submitBtn) {
          submitBtn.disabled = true;
          submitBtn.innerText = 'Submitting...';
        }

        var formData = new FormData(form);
        var payload = {};
        formData.forEach(function(value, key) {
          payload[key] = value;
        });

        try {
          var res = await fetch('${apiUrl}/api/public/forms/${options.siteId}/' + formId, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
          if (res.ok) {
            form.reset();
            alert('Thank you! Your message has been sent successfully.');
          } else {
            alert('Unable to submit form. Please try again.');
          }
        } catch (err) {
          console.error(err);
          alert('Network error submitting form.');
        } finally {
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerText = originalBtnText;
          }
        }
      });
    });
  });
})();
`.trim();
  files["assets/forms.js"] = formsScript;

  // 3. Render each page
  const pageList: Array<{ pageId: string; slug: string; path: string }> = [];
  const cmsEntries = options.cmsEntries || [];

  for (const [pageId, page] of Object.entries(buildDoc.pages)) {
    // If page is a dynamic CMS template, generate one static page per published entry
    if (page.cmsTemplate?.collectionId) {
      const collectionEntries = cmsEntries.filter(
        (e) =>
          (!e.collectionId || e.collectionId === page.cmsTemplate?.collectionId) &&
          (e.status === "published" || !e.status)
      );

      if (collectionEntries.length > 0) {
        for (const entry of collectionEntries) {
          const entrySlug = entry.slug || entry.data?.slug || entry.id;
          let entryPageSlug = page.slug.replace(/\[slug\]|:slug/, entrySlug);
          if (entryPageSlug === page.slug && !page.slug.includes(entrySlug)) {
            entryPageSlug = `${page.slug.replace(/\/+$/, "")}/${entrySlug}`;
          }

          const relativePath = `${entryPageSlug.replace(/^\/+|\/+$/g, "")}/index.html`;

          const { html, title, description } = renderPageToStaticMarkup(buildDoc, pageId, {
            resolveAssetUrl,
            cmsEntry: entry,
            cmsEntries,
          });

          const entryTitle = entry.title || entry.data?.title || title || buildDoc.site.name || "Blog Post";
          const descText = entry.data?.summary || description || `${entryTitle} — created with Builder`;

          const googleFontsUrl = getGoogleFontsUrl(buildDoc.tokens.fonts);
          const googleFontsTags = googleFontsUrl
            ? `  <link rel="preconnect" href="https://fonts.googleapis.com">\n  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n  <link rel="stylesheet" href="${googleFontsUrl}">\n`
            : "";

          const fullHtml = `<!DOCTYPE html>
<html lang="${buildDoc.site.defaultLocale || "en"}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(entryTitle)}</title>
  <meta name="description" content="${escapeHtml(descText)}">
  <meta property="og:title" content="${escapeHtml(entryTitle)}">
  <meta property="og:description" content="${escapeHtml(descText)}">
  <meta property="og:type" content="article">
${googleFontsTags}  <link rel="stylesheet" href="/assets/site.css">
  <script defer src="/assets/forms.js"></script>
</head>
<body>
${html}
</body>
</html>`;

          files[relativePath] = fullHtml;
          pageList.push({
            pageId: `${pageId}_${entry.id}`,
            slug: entryPageSlug,
            path: relativePath,
          });
        }
        continue;
      }
    }

    // Standard static page
    const { html, title, description } = renderPageToStaticMarkup(buildDoc, pageId, {
      resolveAssetUrl,
      cmsEntries,
    });

    // Compute relative file path
    let relativePath = "index.html";
    const cleanSlug = page.slug.replace(/^\/+|\/+$/g, "");
    if (cleanSlug) {
      relativePath = `${cleanSlug}/index.html`;
    }

    const titleText = title || buildDoc.site.name || "Website";
    const descText = description || `${titleText} — created with Builder`;

    const googleFontsUrl = getGoogleFontsUrl(buildDoc.tokens.fonts);
    const googleFontsTags = googleFontsUrl
      ? `  <link rel="preconnect" href="https://fonts.googleapis.com">\n  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n  <link rel="stylesheet" href="${googleFontsUrl}">\n`
      : "";

    const fullHtml = `<!DOCTYPE html>
<html lang="${buildDoc.site.defaultLocale || "en"}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(titleText)}</title>
  <meta name="description" content="${escapeHtml(descText)}">
  <meta property="og:title" content="${escapeHtml(titleText)}">
  <meta property="og:description" content="${escapeHtml(descText)}">
  <meta property="og:type" content="website">
${googleFontsTags}  <link rel="stylesheet" href="/assets/site.css">
  <script defer src="/assets/forms.js"></script>
</head>
<body>
${html}
</body>
</html>`;

    files[relativePath] = fullHtml;
    pageList.push({
      pageId,
      slug: page.slug,
      path: relativePath,
    });
  }

  // 4. Generate sitemap.xml and robots.txt
  if (domainUrl) {
    const cleanBaseUrl = domainUrl.replace(/\/$/, "");
    const dateStr = new Date().toISOString().split("T")[0];
    const sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${pageList
  .map((p) => {
    const loc = p.slug === "/" ? cleanBaseUrl : `${cleanBaseUrl}/${p.slug.replace(/^\/+/, "")}`;
    return `  <url>
    <loc>${loc}</loc>
    <lastmod>${dateStr}</lastmod>
    <changefreq>weekly</changefreq>
  </url>`;
  })
  .join("\n")}
</urlset>`.trim();
    files["sitemap.xml"] = sitemapXml;

    files["robots.txt"] = `User-agent: *
Allow: /

Sitemap: ${cleanBaseUrl}/sitemap.xml
`.trim();
  } else {
    warnings.push("Skipping sitemap.xml: no published domainUrl provided");
    files["robots.txt"] = `User-agent: *
Allow: /
`.trim();
  }

  // 6. Generate vercel.json with security headers and cleanUrls
  const vercelJson = JSON.stringify(
    {
      cleanUrls: true,
      headers: [
        {
          source: "/(.*)",
          headers: [
            { key: "X-Content-Type-Options", value: "nosniff" },
            { key: "X-Frame-Options", value: "DENY" },
            { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
            { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
            { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
            {
              key: "Content-Security-Policy",
              value:
                "default-src 'self' 'unsafe-inline' https:; img-src 'self' data: https:; font-src 'self' https: data:; connect-src 'self' https:;",
            },
          ],
        },
      ],
    },
    null,
    2
  );
  files["vercel.json"] = vercelJson;

  // 7. Build-time image integrity check:
  // Every <img> in the build must point to a file included in deployment upload or to a valid external URL.
  // Fails the publish with a clear message if any referenced image file is missing.
  for (const [filePath, content] of Object.entries(files)) {
    if (filePath.endsWith(".html")) {
      const imgRegex = /<img[^>]+src=["']([^"']+)["']/gi;
      let match: RegExpExecArray | null;
      while ((match = imgRegex.exec(content)) !== null) {
        const srcVal = match[1]!;
        // Ignore external URLs and inline data URIs
        if (/^https?:\/\//i.test(srcVal) || /^data:image\//i.test(srcVal) || !srcVal) {
          continue;
        }
        // Local referenced asset: must exist in files
        const cleanPath = srcVal.replace(/^\/+/, "");
        if (files[cleanPath] === undefined) {
          throw new Error(
            `Build failed: Missing referenced image file: "${srcVal}" referenced in ${filePath}. Every <img> in the build must point to a file included in the deployment upload or to a valid external URL.`
          );
        }
      }
    }
  }

  // Calculate size
  let totalSizeBytes = 0;
  for (const content of Object.values(files)) {
    totalSizeBytes += Buffer.byteLength(content, "utf8");
  }

  return {
    files,
    pageCount: pageList.length,
    totalSizeBytes,
    pages: pageList,
    warnings,
  };
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
