import { tool } from "ai";
import { z } from "zod";
import axios from "axios";
import * as cheerio from "cheerio";
import { pushUpdate } from "../agentContext.js";

export const webSearch = tool({
  description:
    "Search the web for current information about a topic, person, company, event, or trend. Use this when writing a post that would benefit from real-time context, recent news, trending topics, or specific facts. Do NOT use this for generic/evergreen content where web search adds no value.",
  inputSchema: z.object({
    query: z.string().describe("The search query to look up"),
  }),
  execute: async ({ query }) => {
    await pushUpdate("researching", "Web Researcher is searching...", [
      `Searching the web for "${query}"...`,
    ]);

    try {
      const response = await axios.get(
        `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`,
        {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          },
          timeout: 10000,
        }
      );

      const $ = cheerio.load(response.data);
      const results: { title: string; snippet: string; url: string }[] = [];

      $(".result").each((i, el) => {
        if (results.length >= 5) return false; // Top 5 results
        const title = $(el).find(".result__title").text().trim();
        const snippet = $(el).find(".result__snippet").text().trim();
        const href = $(el).find(".result__a").attr("href") || "";

        if (title && snippet) {
          results.push({ title, snippet, url: href });
        }
      });

      if (results.length === 0) {
        return {
          results: [],
          query,
          summary: "No results found for this query.",
        };
      }

      const summary = results
        .map((r, i) => `${i + 1}. **${r.title}**: ${r.snippet}`)
        .join("\n");

      return { results, query, summary };
    } catch {
      return {
        results: [],
        query,
        summary: "Web search was unavailable. Proceed without search results.",
      };
    }
  },
});
