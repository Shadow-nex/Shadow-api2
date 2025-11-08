import { createApiKeyMiddleware } from "../../middleware/apikey.js";
import axios from "axios";
import crypto from "crypto";

const savetube = {
  api: {
    base: "https://media.savetube.me/api",
    cdn: "/random-cdn",
    info: "/v2/info",
    download: "/download",
  },
  headers: {
    accept: "*/*",
    "content-type": "application/json",
    origin: "https://yt.savetube.me",
    referer: "https://yt.savetube.me/",
    "user-agent": "Postify/1.0.0",
  },
  crypto: {
    hexToBuffer: (hexString) => {
      const matches = hexString.match(/.{1,2}/g);
      return Buffer.from(matches.join(""), "hex");
    },
    decrypt: async (enc) => {
      const secretKey = "C5D58EF67A7584E4A29F6C35BBC4EB12";
      const data = Buffer.from(enc, "base64");
      const iv = data.slice(0, 16);
      const content = data.slice(16);
      const key = savetube.crypto.hexToBuffer(secretKey);

      const decipher = crypto.createDecipheriv("aes-128-cbc", key, iv);
      let decrypted = decipher.update(content);
      decrypted = Buffer.concat([decrypted, decipher.final()]);

      return JSON.parse(decrypted.toString());
    },
  },
  youtube: (url) => {
    const patterns = [
      /youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})/,
      /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
      /youtube\.com\/v\/([a-zA-Z0-9_-]{11})/,
      /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
      /youtu\.be\/([a-zA-Z0-9_-]{11})/,
    ];
    for (let regex of patterns) {
      if (regex.test(url)) return url.match(regex)[1];
    }
    return null;
  },
  request: async (endpoint, data = {}, method = "post") => {
    try {
      const { data: response } = await axios({
        method,
        url: `${endpoint.startsWith("http") ? "" : savetube.api.base}${endpoint}`,
        data: method === "post" ? data : undefined,
        params: method === "get" ? data : undefined,
        headers: savetube.headers,
      });
      return { status: true, code: 200, data: response };
    } catch (error) {
      return { status: false, code: error.response?.status || 500, error: error.message };
    }
  },
  getCDN: async () => {
    const response = await savetube.request(savetube.api.cdn, {}, "get");
    if (!response.status) return response;
    return { status: true, code: 200, data: response.data.cdn };
  },
  download: async (link) => {
    if (!link) return { status: false, code: 400, error: "Falta el enlace de YouTube." };
    const id = savetube.youtube(link);
    if (!id) return { status: false, code: 400, error: "No se pudo extraer el ID del video." };

    try {
      const cdnRes = await savetube.getCDN();
      if (!cdnRes.status) return cdnRes;
      const cdn = cdnRes.data;

      const infoRes = await savetube.request(`https://${cdn}${savetube.api.info}`, {
        url: `https://www.youtube.com/watch?v=${id}`,
      });
      if (!infoRes.status) return infoRes;

      const decrypted = await savetube.crypto.decrypt(infoRes.data.data);

      const dl = await savetube.request(`https://${cdn}${savetube.api.download}`, {
        id: id,
        downloadType: "audio",
        quality: "128",
        key: decrypted.key,
      });

      // Calcular peso aproximado en MB
      const sizeMB = decrypted.filesize ? (decrypted.filesize / (1024 * 1024)).toFixed(2) : null;

      return {
        status: true,
        code: 200,
        data: {
          title: decrypted.title || "Desconocido",
          thumbnail: decrypted.thumbnail || `https://i.ytimg.com/vi/${id}/maxresdefault.jpg`,
          download: dl.data.data.downloadUrl,
          duration: decrypted.duration,
          quality: "128kbps",
          id,
          sizeMB,
          channel: decrypted.channel || "Desconocido",
          source: "SAVETUBE",
          poweredBy: "Shadow.xyz",
        },
      };
    } catch (error) {
      return { status: false, code: 500, error: error.message };
    }
  },
};

export default (app) => {
  app.get("/download/ytmp3V2", createApiKeyMiddleware(), async (req, res) => {
    try {
      const { url } = req.query;
      if (!url || url.trim() === "") {
        return res.status(400).json({ status: false, error: "URL is required" });
      }

      const result = await savetube.download(url.trim());
      if (!result.status) {
        return res.status(result.code || 500).json({ status: false, error: result.error });
      }

      res.status(200).json({
        status: true,
        message: "Audio fetched successfully",
        data: result.data,
        meta: {
          timestamp: new Date().toISOString(),
          api: "Shadow.xyz",
          version: "v3",
        },
      });
    } catch (error) {
      res.status(500).json({ status: false, error: error.message });
    }
  });
};