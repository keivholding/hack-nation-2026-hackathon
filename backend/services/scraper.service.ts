import axios from "axios";
import * as cheerio from "cheerio";

export interface ScrapedPage {
  url: string;
  title: string;
  content: string;
}

export interface ScrapedImage {
  url: string;
  alt: string;
  context: string; // nearby heading or section context
}

export interface SiteDesignSignals {
  themeColor: string | null; // <meta name="theme-color">
  ogImage: string | null; // og:image
  favicon: string | null;
  cssColors: string[]; // colors found in inline styles / CSS
  bodyClasses: string[]; // body class names (often reveal dark/light themes)
  metaKeywords: string | null;
}

export interface ScrapeResult {
  pages: ScrapedPage[];
  images: ScrapedImage[];
  designSignals: SiteDesignSignals;
}

export class WebScraperService {
  private async fetchPage(url: string): Promise<string> {
    try {
      const response = await axios.get(url, {
        timeout: 10000,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
      });
      return response.data;
    } catch (error) {
      console.error(`Failed to fetch ${url}:`, error);
      return "";
    }
  }

  private extractContent(
    html: string,
    pageUrl: string
  ): {
    title: string;
    content: string;
    links: string[];
    images: ScrapedImage[];
    designSignals: SiteDesignSignals;
  } {
    const $ = cheerio.load(html);

    // --- Extract design signals BEFORE removing elements ---
    const themeColor =
      $('meta[name="theme-color"]').attr("content") || null;
    const ogImage =
      $('meta[property="og:image"]').attr("content") || null;
    const favicon =
      $('link[rel="icon"]').attr("href") ||
      $('link[rel="shortcut icon"]').attr("href") ||
      null;
    const metaKeywords =
      $('meta[name="keywords"]').attr("content") || null;

    // Body classes (often contain theme hints like "dark-mode", "light-theme")
    const bodyClasses = ($(("body")).attr("class") || "")
      .split(/\s+/)
      .filter(Boolean);

    // Extract colors from inline styles and style tags
    const cssColors = this.extractCSSColors($);

    const designSignals: SiteDesignSignals = {
      themeColor,
      ogImage,
      favicon,
      cssColors,
      bodyClasses,
      metaKeywords,
    };

    // --- Extract images BEFORE removing noise ---
    const images: ScrapedImage[] = [];
    $("img").each((_, element) => {
      if (images.length >= 15) return false; // collect extras, filter later

      const src = $(element).attr("src") || $(element).attr("data-src") || "";
      const alt = $(element).attr("alt") || "";
      const width = parseInt($(element).attr("width") || "0");
      const height = parseInt($(element).attr("height") || "0");

      // Skip tiny images (icons, tracking pixels, avatars)
      if ((width > 0 && width < 80) || (height > 0 && height < 80)) return;
      // Skip non-content images and unsupported formats
      const srcLower = src.toLowerCase();
      if (
        srcLower.includes("favicon") ||
        srcLower.includes("icon") ||
        srcLower.includes("logo") ||
        srcLower.includes("pixel") ||
        srcLower.includes("tracking") ||
        srcLower.includes("1x1") ||
        srcLower.includes("spacer") ||
        srcLower.includes("data:image") ||
        srcLower.includes(".svg") ||
        srcLower.includes(".avif") ||
        srcLower.includes(".tiff") ||
        srcLower.includes(".tif") ||
        srcLower.includes(".bmp") ||
        srcLower.includes(".ico") ||
        srcLower.includes(".heic") ||
        srcLower.includes(".heif")
      )
        return;

      // Resolve relative URLs
      let fullUrl = src;
      try {
        fullUrl = new URL(src, pageUrl).href;
      } catch {
        return;
      }

      // Get surrounding context (nearest heading)
      const nearestHeading =
        $(element).closest("section, article, div").find("h1, h2, h3").first().text().trim() ||
        $(element).parent().text().trim().substring(0, 100) ||
        "";

      images.push({
        url: fullUrl,
        alt,
        context: nearestHeading,
      });
    });

    // Also grab CSS background images from hero/banner sections
    $("[style]").each((_, element) => {
      if (images.length >= 15) return false;
      const style = $(element).attr("style") || "";
      const bgMatch = style.match(/background-image:\s*url\(['"]?([^'")\s]+)['"]?\)/i);
      if (bgMatch && bgMatch[1]) {
        try {
          const fullUrl = new URL(bgMatch[1], pageUrl).href;
          if (
            !fullUrl.includes(".svg") &&
            !fullUrl.includes("data:image")
          ) {
            images.push({
              url: fullUrl,
              alt: "Background image",
              context:
                $(element).find("h1, h2, h3").first().text().trim() || "Hero/banner section",
            });
          }
        } catch {
          // skip invalid URLs
        }
      }
    });

    // --- Now remove noise elements for text extraction ---
    $(
      "script, style, nav, header, footer, iframe, noscript, svg, .nav, .navbar, .menu, .sidebar, .advertisement, .ad, .cookie-banner, #cookie-notice"
    ).remove();

    // Extract title
    const title =
      $("title").text() ||
      $('meta[property="og:title"]').attr("content") ||
      $("h1").first().text() ||
      "";

    // Extract meta description
    const metaDescription =
      $('meta[name="description"]').attr("content") ||
      $('meta[property="og:description"]').attr("content") ||
      "";

    // Try to find main content area
    let mainContent = "";
    const contentSelectors = [
      "main",
      "article",
      '[role="main"]',
      ".main-content",
      ".content",
      "#content",
      ".post-content",
      ".entry-content",
    ];

    for (const selector of contentSelectors) {
      const element = $(selector);
      if (element.length > 0) {
        mainContent = element.text();
        break;
      }
    }

    if (!mainContent) {
      mainContent = $("body").text();
    }

    // Extract headings
    const headings: string[] = [];
    $("h1, h2, h3").each((_, element) => {
      const heading = $(element).text().trim();
      if (heading) {
        headings.push(heading);
      }
    });

    // Extract paragraphs
    const paragraphs: string[] = [];
    $("p").each((_, element) => {
      const text = $(element).text().trim();
      if (text && text.length > 50) {
        paragraphs.push(text);
      }
    });

    // Combine content
    const combinedContent = [
      metaDescription ? `Description: ${metaDescription}` : "",
      headings.length > 0
        ? `\nKey Topics: ${headings.slice(0, 10).join(", ")}`
        : "",
      paragraphs.length > 0
        ? `\nContent: ${paragraphs.slice(0, 5).join(" ")}`
        : "",
      mainContent ? `\n${mainContent}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    const content = combinedContent
      .replace(/\s+/g, " ")
      .trim()
      .substring(0, 5000);

    // Extract links
    const links: string[] = [];
    $("a[href]").each((_, element) => {
      const href = $(element).attr("href");
      if (href) {
        links.push(href);
      }
    });

    return { title: title.trim(), content, links, images, designSignals };
  }

  /**
   * Extract color values from inline styles and <style> tags.
   * Looks for hex colors, rgb/rgba, and named CSS color properties.
   */
  private extractCSSColors($: cheerio.CheerioAPI): string[] {
    const colors = new Set<string>();

    // From <style> tags
    $("style").each((_, el) => {
      const css = $(el).text();
      this.findColorsInCSS(css, colors);
    });

    // From inline styles (sample a few key elements)
    const importantSelectors = [
      "body",
      "header",
      "nav",
      ".hero",
      ".banner",
      "main",
      "footer",
      "a",
      "button",
      ".btn",
      ".cta",
      "h1",
      "h2",
    ];
    for (const selector of importantSelectors) {
      $(selector).each((_, el) => {
        const style = $(el).attr("style") || "";
        this.findColorsInCSS(style, colors);
      });
    }

    return Array.from(colors).slice(0, 20); // Cap at 20 unique colors
  }

  private findColorsInCSS(css: string, colors: Set<string>) {
    // Hex colors (#fff, #ffffff, #ffffffff)
    const hexMatches = css.match(/#[0-9a-fA-F]{3,8}\b/g);
    if (hexMatches) {
      for (const hex of hexMatches) {
        colors.add(hex.toLowerCase());
      }
    }

    // rgb/rgba
    const rgbMatches = css.match(/rgba?\([^)]+\)/g);
    if (rgbMatches) {
      for (const rgb of rgbMatches) {
        colors.add(rgb);
      }
    }

    // hsl/hsla
    const hslMatches = css.match(/hsla?\([^)]+\)/g);
    if (hslMatches) {
      for (const hsl of hslMatches) {
        colors.add(hsl);
      }
    }
  }

  private normalizeUrl(
    baseUrl: string,
    link: string,
    baseHostname?: string
  ): string | null {
    try {
      const resolved = new URL(link, baseUrl);

      // Compare hostnames with www stripped for flexibility
      const resolvedHost = resolved.hostname.replace(/^www\./, "");
      const compareHost =
        baseHostname || new URL(baseUrl).hostname.replace(/^www\./, "");

      if (resolvedHost !== compareHost) {
        return null;
      }

      // Strip hash fragments
      resolved.hash = "";

      // Skip non-page resources
      const path = resolved.pathname.toLowerCase();
      if (
        path.match(/\.(pdf|zip|png|jpg|jpeg|gif|svg|css|js|mp4|mp3|webp|ico)$/)
      ) {
        return null;
      }

      return resolved.href;
    } catch {
      return null;
    }
  }

  /**
   * Common subpaths to try as fallback when the link crawl doesn't find enough pages.
   * Many modern SPAs don't expose internal links in the HTML, so we probe these manually.
   */
  private static COMMON_PATHS = [
    "/about",
    "/about-us",
    "/features",
    "/pricing",
    "/blog",
    "/products",
    "/services",
    "/solutions",
    "/customers",
    "/case-studies",
    "/company",
    "/team",
    "/contact",
    "/faq",
    "/how-it-works",
  ];

  async scrapeWebsite(websiteUrl: string): Promise<ScrapeResult> {
    const scrapedPages: ScrapedPage[] = [];
    const allImages: ScrapedImage[] = [];
    let mergedDesignSignals: SiteDesignSignals = {
      themeColor: null,
      ogImage: null,
      favicon: null,
      cssColors: [],
      bodyClasses: [],
      metaKeywords: null,
    };

    const visitedUrls = new Set<string>();
    const seenImageUrls = new Set<string>();
    const toVisit: string[] = [websiteUrl];

    // Normalize base hostname for comparison (handle www vs non-www)
    let baseHostname: string;
    try {
      baseHostname = new URL(websiteUrl).hostname.replace(/^www\./, "");
    } catch {
      baseHostname = "";
    }

    console.log(`Starting scrape of ${websiteUrl}`);

    const maxPages = 11;

    while (toVisit.length > 0 && scrapedPages.length < maxPages) {
      const currentUrl = toVisit.shift()!;

      if (visitedUrls.has(currentUrl)) {
        continue;
      }

      visitedUrls.add(currentUrl);

      const html = await this.fetchPage(currentUrl);
      if (!html) {
        continue;
      }

      const { title, content, links, images, designSignals } =
        this.extractContent(html, currentUrl);

      // Skip pages with barely any content (likely error pages or empty shells)
      if (content.trim().length < 100) {
        console.log(`Skipped (too little content): ${currentUrl}`);
        continue;
      }

      scrapedPages.push({ url: currentUrl, title, content });

      // Merge design signals (first page takes priority for theme-level data)
      if (scrapedPages.length === 1) {
        mergedDesignSignals = { ...designSignals };
      } else {
        // Accumulate CSS colors from all pages
        for (const color of designSignals.cssColors) {
          if (!mergedDesignSignals.cssColors.includes(color)) {
            mergedDesignSignals.cssColors.push(color);
          }
        }
      }

      // Collect unique images
      for (const img of images) {
        if (!seenImageUrls.has(img.url) && allImages.length < 12) {
          seenImageUrls.add(img.url);
          allImages.push(img);
        }
      }

      console.log(
        `Scraped: ${currentUrl} (${scrapedPages.length}/${maxPages}, ${allImages.length} images found)`
      );

      if (scrapedPages.length < maxPages) {
        for (const link of links) {
          const normalizedLink = this.normalizeUrl(websiteUrl, link, baseHostname);
          if (normalizedLink && !visitedUrls.has(normalizedLink)) {
            toVisit.push(normalizedLink);
          }
        }
      }
    }

    // If we only scraped a few pages (common with SPAs), probe common subpaths
    if (scrapedPages.length < 5) {
      console.log(
        `Only found ${scrapedPages.length} pages from links. Probing common subpaths...`
      );

      let baseOrigin: string;
      try {
        baseOrigin = new URL(websiteUrl).origin;
      } catch {
        baseOrigin = websiteUrl;
      }

      const probeUrls = WebScraperService.COMMON_PATHS
        .map((p) => `${baseOrigin}${p}`)
        .filter((url) => !visitedUrls.has(url));

      // Probe in parallel (up to 5 at a time) for speed
      const batchSize = 5;
      for (let i = 0; i < probeUrls.length && scrapedPages.length < maxPages; i += batchSize) {
        const batch = probeUrls.slice(i, i + batchSize);
        const results = await Promise.all(
          batch.map(async (url) => {
            visitedUrls.add(url);
            const html = await this.fetchPage(url);
            if (!html) return null;
            const extracted = this.extractContent(html, url);
            if (extracted.content.trim().length < 100) return null;
            return { url, ...extracted };
          })
        );

        for (const result of results) {
          if (!result || scrapedPages.length >= maxPages) continue;

          scrapedPages.push({
            url: result.url,
            title: result.title,
            content: result.content,
          });

          for (const img of result.images) {
            if (!seenImageUrls.has(img.url) && allImages.length < 12) {
              seenImageUrls.add(img.url);
              allImages.push(img);
            }
          }

          // Accumulate CSS colors
          for (const color of result.designSignals.cssColors) {
            if (!mergedDesignSignals.cssColors.includes(color)) {
              mergedDesignSignals.cssColors.push(color);
            }
          }

          console.log(
            `Probed: ${result.url} (${scrapedPages.length}/${maxPages}, ${allImages.length} images found)`
          );
        }
      }
    }

    // Keep top 10 most representative images
    const finalImages = allImages.slice(0, 10);

    console.log(
      `Completed scraping. Pages: ${scrapedPages.length}, Images: ${finalImages.length}, CSS Colors: ${mergedDesignSignals.cssColors.length}`
    );

    return {
      pages: scrapedPages,
      images: finalImages,
      designSignals: mergedDesignSignals,
    };
  }
}
