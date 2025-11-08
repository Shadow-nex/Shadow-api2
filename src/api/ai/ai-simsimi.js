import axios from "axios";
import { createApiKeyMiddleware } from "../../middleware/apikey.js";

export default (app) => {
  // Función para consultar la IA de Simsimi
  async function fetchSimsimiResponse(text) {
    try {
      const response = await axios.get("https://api.simsimi.net/v2/", {
        params: {
          text,
          lc: "es", // idioma español
        },
      });
      return response.data;
    } catch (error) {
      console.error("Error fetching content from Simsimi:", error.response?.data || error.message);
      throw new Error("Failed to fetch content from Simsimi AI");
    }
  }

  // NUEVO ENDPOINT v1 PARA SIMSIMI
  app.get("/ai/simsimi", createApiKeyMiddleware(), async (req, res) => {
    try {
      const { text } = req.query;
      if (!text || text.trim() === "") {
        return res.status(400).json({ status: false, error: "Text is required" });
      }

      const data = await fetchSimsimiResponse(text.trim());

      if (!data || !data.success) {
        return res.status(500).json({ status: false, error: "No response from Simsimi AI" });
      }

      res.status(200).json({
        status: true,
        result: data.success, // respuesta de la IA
        meta: {
          ai: "Simsimi",
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      res.status(500).json({ status: false, error: error.message });
    }
  });
};