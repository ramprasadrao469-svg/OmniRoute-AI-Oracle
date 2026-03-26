import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import Parser from "rss-parser";
import cors from "cors";
import OpenAI from "openai";

const parser = new Parser({
  timeout: 5000, // 5 second timeout for feed fetching
});

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(cors());
  app.use(express.json({ limit: '10mb' }));

  // Health check endpoint
  app.get("/api/v1/health", (req, res) => {
    res.json({ status: "healthy" });
  });

  // OpenAI Analysis Endpoint
  app.post("/api/v1/analyze/openai", async (req, res) => {
    console.log("Received request to /api/v1/analyze/openai");
    try {
      const { route, newsContext } = req.body;
      console.log(`Route: ${route}, News Context Length: ${newsContext?.length}`);
      
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) {
        console.log("No OpenAI API key found");
        return res.status(400).json({ 
          error: "OpenAI API key is not configured. Please add OPENAI_API_KEY to your environment variables or the AI Studio Secrets panel." 
        });
      }

      // Automatically route to OpenRouter if an OpenRouter key is provided
      const baseURL = process.env.OPENAI_BASE_URL || (apiKey.startsWith("sk-or-") ? "https://openrouter.ai/api/v1" : undefined);
      console.log(`Using baseURL: ${baseURL}`);

      const openai = new OpenAI({ 
        apiKey: apiKey,
        baseURL: baseURL,
        timeout: 60000 // 60 seconds timeout to prevent server connection drop
      });
      
      const systemPrompt = "You are an elite Supply Chain Operations Analyst. Analyze the provided maritime news headlines and geographic route data to calculate a Disruption Risk Score from 1 to 10 for the specified shipping route. Output ONLY valid JSON with the following keys: route (string), overall_risk_score (integer 1-10), primary_threat_category (string), executive_summary (string, 2 sentences), recommended_action (string), source_coords (array of 2 floats: [lat, lng]), dest_coords (array of 2 floats: [lat, lng]), and risk_area_coords (array of 2 floats: [lat, lng], optional, coordinates of the primary risk area).";
      
      const model = baseURL?.includes("openrouter") ? "openai/gpt-4o-mini" : "gpt-4o-mini";
      console.log(`Using model: ${model}`);

      const response = await openai.chat.completions.create({
        model: model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Analyze risk for route: ${route}\n\nNews Context:\n${newsContext}` }
        ],
        ...(baseURL?.includes("openrouter") ? {} : { response_format: { type: "json_object" } })
      });
      
      console.log("Received response from OpenAI/OpenRouter");
      let content = response.choices[0].message.content || "{}";
      // Remove markdown code blocks if the model wrapped the JSON
      content = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      const result = JSON.parse(content);
      res.json(result);
    } catch (error: any) {
      console.error("OpenAI Error:", error);
      res.status(500).json({ error: error.message || "Failed to analyze risk with OpenAI" });
    }
  });

  // RSS Scraping endpoint
  app.post("/api/v1/news", async (req, res) => {
    try {
      const userFeeds = req.body.feeds;
      const feeds = Array.isArray(userFeeds) && userFeeds.length > 0 
        ? userFeeds 
        : [
            "https://gcaptain.com/feed/",
            "https://www.supplychaindive.com/feeds/news/"
          ];

      const fetchFeedWithRetry = async (feedUrl: string, retries = 3) => {
        for (let i = 0; i < retries; i++) {
          try {
            return await parser.parseURL(feedUrl);
          } catch (err: any) {
            if (i === retries - 1) {
              let reason = "Unknown error";
              const errMsg = (err.message || "").toLowerCase();
              if (err.code === 'ECONNABORTED' || errMsg.includes('timeout')) {
                reason = "Connection timeout";
              } else if (err.code === 'ENOTFOUND' || err.code === 'ECONNREFUSED') {
                reason = "Connection refused or DNS lookup failed";
              } else if (errMsg.includes('not a feed') || errMsg.includes('unrecognized') || errMsg.includes('invalid xml')) {
                reason = "Invalid RSS feed format";
              } else if (err.response && err.response.status) {
                reason = `HTTP Error ${err.response.status}`;
              } else {
                reason = err.message || "Unknown error";
              }
              throw new Error(reason);
            }
            await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, i)));
          }
        }
        throw new Error("Unreachable");
      };

      const allItems: any[] = [];
      const feedStatus: { successful: string[], failed: { url: string, reason: string }[] } = { 
        successful: [], 
        failed: [] 
      };
      
      for (const feedUrl of feeds) {
        try {
          const feed = await fetchFeedWithRetry(feedUrl);
          allItems.push(...feed.items.slice(0, 5).map(item => ({
            title: item.title,
            contentSnippet: item.contentSnippet,
            link: item.link,
            isoDate: item.isoDate,
            source: feed.title || feedUrl
          })));
          feedStatus.successful.push(feedUrl);
        } catch (err: any) {
          console.error(`Failed to fetch feed ${feedUrl}:`, err.message);
          feedStatus.failed.push({ url: feedUrl, reason: err.message });
        }
      }

      if (feedStatus.successful.length === 0) {
        return res.status(502).json({ 
          error: "Failed to fetch data from all maritime news sources.",
          details: feedStatus.failed
        });
      }

      // Sort by date and take top 10
      const sortedNews = allItems
        .sort((a, b) => new Date(b.isoDate || 0).getTime() - new Date(a.isoDate || 0).getTime())
        .slice(0, 10);

      res.json({
        items: sortedNews,
        status: feedStatus
      });
    } catch (error) {
      console.error("Error in /api/v1/news:", error);
      res.status(500).json({ error: "An internal server error occurred while processing maritime news." });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  const server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
  server.setTimeout(300000); // 5 minutes
}

startServer();
