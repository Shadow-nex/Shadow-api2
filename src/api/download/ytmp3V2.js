import axios from "axios";
import * as cheerio from "cheerio";
import { createApiKeyMiddleware } from "../../middleware/apikey.js";

export default (app) => {
  // Función para scrapear la comunidad de YouTube
  async function scrapeYoutubeCommunity(url) {
    try {
      const { data: response } = await axios.get(url);
      const $ = cheerio.load(response);
      const ytInitialData = JSON.parse(
        $("script")
          .text()
          .match(/ytInitialData = ({.*?});/)?.[1] || "{}"
      );

      const posts =
        ytInitialData.contents.twoColumnBrowseResultsRenderer.tabs[0].tabRenderer.content.sectionListRenderer.contents
          .flatMap((section) => section.itemSectionRenderer?.contents || [])
          .map((item) => {
            const postRenderer =
              item.backstagePostThreadRenderer?.post?.backstagePostRenderer;
            if (!postRenderer) return null;

            const images =
              postRenderer.backstageAttachment?.postMultiImageRenderer
                ?.images || [];
            const imageUrls = images.map((imageObj) => {
              const thumbnails =
                imageObj.backstageImageRenderer.image.thumbnails;
              return thumbnails[thumbnails.length - 1].url;
            });

            return {
              postId: postRenderer.postId,
              author: postRenderer.authorText.simpleText,
              content:
                postRenderer.contentText?.runs
                  ?.map((run) => run.text)
                  .join("") || "",
              images: imageUrls,
            };
          })
          .filter(Boolean);

      return posts[0] || null;
    } catch (error) {
      console.error("Youtube Community scrape error:", error.message);
      throw new Error("Failed to get response from YouTube Community");
    }
  }

  // NUEVO ENDPOINT v2 PARA AUDIO (ytmp3)
  app.get("/download/ytmp3v2", createApiKeyMiddleware(), async (req, res) => {
    try {
      const { url } = req.query;

      if (!url || typeof url !== "string" || url.trim() === "") {
        return res.status(400).json({
          status: false,
          error: "URL parameter is required and must be a non-empty string",
        });
      }

      const result = await scrapeYoutubeCommunity(url.trim());
      if (!result) {
        return res.status(404).json({
          status: false,
          error: "No community post found or failed to fetch data",
        });
      }

      // Respuesta para la versión v2
      res.status(200).json({
        status: true,
        message: "YouTube Community audio data fetched successfully",
        data: result,
        meta: {
          version: "v2",
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      res.status(500).json({
        status: false,
        error: error.message || "Internal Server Error",
      });
    }
  });
};