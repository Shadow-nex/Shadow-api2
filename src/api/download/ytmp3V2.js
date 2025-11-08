import ytdl from "ytdl-core";
import { createApiKeyMiddleware } from "../../middleware/apikey.js";

export default (app) => {
  app.get("/download/ytmp3V2", createApiKeyMiddleware(), async (req, res) => {
    try {
      const { url } = req.query;

      if (!url || typeof url !== "string" || url.trim() === "") {
        return res.status(400).json({
          status: false,
          error: "URL parameter is required and must be a non-empty string",
        });
      }

      if (!ytdl.validateURL(url)) {
        return res.status(400).json({
          status: false,
          error: "Invalid YouTube URL",
        });
      }

      const info = await ytdl.getInfo(url.trim());
      const format = ytdl.chooseFormat(info.formats, { quality: "highestaudio" });

      if (!format || !format.url) {
        return res.status(404).json({
          status: false,
          error: "No audio format found for this video",
        });
      }

      res.status(200).json({
        status: true,
        message: "YouTube audio data fetched successfully",
        data: {
          videoId: info.videoDetails.videoId,
          title: info.videoDetails.title,
          author: info.videoDetails.author.name,
          lengthSeconds: info.videoDetails.lengthSeconds,
          thumbnail: info.videoDetails.thumbnails.pop().url,
          audioUrl: format.url,
        },
        meta: {
          version: "V2",
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      console.error("ytmp3V2 error:", error);
      res.status(500).json({
        status: false,
        error: error.message || "Internal Server Error",
      });
    }
  });
};