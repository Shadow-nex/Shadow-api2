import express from "express";
import fetch from "node-fetch";

const router = express.Router();

router.get("/search/spotify", async (req, res) => {
  const { q, limit } = req.query;
  if (!q) return res.status(400).json({ error: "Falta el parámetro 'q' (búsqueda)" });

  const maxResults = limit ? parseInt(limit) : 15; // Por defecto 15 resultados

  try {
    const clientId = process.env.SPOTIFY_CLIENT_ID;
    const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;

    // Obtener token de Spotify
    const tokenResponse = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: {
        Authorization: "Basic " + Buffer.from(`${clientId}:${clientSecret}`).toString("base64"),
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: "grant_type=client_credentials"
    });

    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token;

    // Hacer búsqueda
    const searchUrl = `https://api.spotify.com/v1/search?q=${encodeURIComponent(q)}&type=track&limit=${maxResults}`;
    const response = await fetch(searchUrl, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    if (!response.ok) {
      const err = await response.text();
      return res.status(response.status).json({ error: err });
    }

    const data = await response.json();
    const tracks = data.tracks.items.map(track => ({
      id: track.id,
      title: track.name,
      artists: track.artists.map(a => a.name).join(", "),
      album: track.album.name,
      album_release_date: track.album.release_date,
      duration_min: (track.duration_ms / 60000).toFixed(2),
      popularity: track.popularity,
      explicit: track.explicit,
      preview_url: track.preview_url,
      external_url: track.external_urls.spotify,
      cover: track.album.images?.[0]?.url
    }));

    res.json({
      status: true,
      creator: "Shadow.xyz",
      query: q,
      total_results: tracks.length,
      results: tracks
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error interno del servidor" });
  }
});

export default router;