import axios from "axios"
import * as cheerio from "cheerio"
import FormData from "form-data"
import * as tough from "tough-cookie"
import { createApiKeyMiddleware } from "../../middleware/apikey.js"

export default (app) => {

  // ============================================================
  // ⭐  EXTRA 1: Metadata oficial del oEmbed de TikTok
  // ============================================================
  async function getTiktokMetadata(url) {
    try {
      const api = `https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`
      const { data } = await axios.get(api, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Linux; Android 10; K)"
        }
      })
      return {
        title: data.title || null,
        author_name: data.author_name || null,
        author_url: data.author_url || null,
        thumbnail_url: data.thumbnail_url || null,
        html: data.html || null
      }
    } catch (e) {
      return null
    }
  }

  // ============================================================
  // ⭐  EXTRA 2: Scraping avanzado del HTML del video
  // ============================================================
  async function getDeepTiktokInfo(url) {
    try {
      const { data: html } = await axios.get(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Linux; Android 10; K)"
        }
      })

      const $ = cheerio.load(html)
      const jsonData = $('script[id="__UNIVERSAL_DATA_FOR_REHYDRATION__"]').html()

      if (!jsonData) return null

      const raw = JSON.parse(jsonData)
      const item = raw?.__DEFAULT_SCOPE__?.webapp?.videoInfo?.itemStruct

      if (!item) return null

      return {
        id: item.id,
        createTime: item.createTime,
        description: item.desc,
        hashtags: item.textExtra?.map(h => h.hashtagName).filter(Boolean),
        duration: item.video?.duration,
        ratio: item.video?.ratio,
        width: item.video?.width,
        height: item.video?.height,

        stats: {
          likes: item.stats?.diggCount,
          comments: item.stats?.commentCount,
          shares: item.stats?.shareCount,
          plays: item.stats?.playCount
        },

        music: {
          title: item.music?.title,
          author: item.music?.authorName,
          url: item.music?.playUrl
        },

        author: {
          nickname: item.author?.nickname,
          uniqueId: item.author?.uniqueId,
          avatar: item.author?.avatarThumb
        }
      }
    } catch (e) {
      return null
    }
  }

  // ============================================================
  // ⭐  SnapTik Client (tu estructura original)
  // ============================================================
  class SnapTikClient {
    constructor(config = {}) {
      this.config = {
        baseURL: "https://snaptik.app",
        ...config,
      }

      const cookieJar = new tough.CookieJar()
      this.axios = axios.create({
        ...this.config,
        withCredentials: true,
        jar: cookieJar,
        headers: {
          "User-Agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Mobile Safari/537.36",
          "sec-ch-ua": '"Not A(Brand";v="8", "Chromium";v="132"',
          "sec-ch-ua-mobile": "?1",
          "sec-ch-ua-platform": '"Android"',
          "Upgrade-Insecure-Requests": "1",
        },
        timeout: 30000,
      })
    }

    async get_token() {
      const { data } = await this.axios.get("/en2", {
        headers: { "Referer": "https://snaptik.app/en2" },
      })
      const $ = cheerio.load(data)
      return $("input[name=\"token\"]").val()
    }

    async get_script(url) {
      const form = new FormData()
      const token = await this.get_token()

      if (!token) throw new Error("Failed to get token")

      form.append("url", url)
      form.append("lang", "en2")
      form.append("token", token)

      const { data } = await this.axios.post("/abc2.php", form, {
        headers: {
          ...form.getHeaders(),
          "origin": "https://snaptik.app",
          "referer": "https://snaptik.app/en2",
        },
      })
      return data
    }

    async eval_script(script1) {
      const script2 = await new Promise((resolve) =>
        Function("eval", script1)(resolve)
      )

      return new Promise((resolve, reject) => {
        let html = ""
        const mockObjects = {
          $: () => ({
            remove() {},
            style: { display: "" },
            get innerHTML() { return html },
            set innerHTML(t) { html = t },
          }),
          app: { showAlert: reject },
          document: { getElementById: () => ({ src: "" }) },
          fetch: (a) => {
            resolve({ html, oembed_url: a })
            return { json: () => ({ thumbnail_url: "" }) }
          },
          gtag: () => 0,
          Math: { round: () => 0 },
          XMLHttpRequest: function () { return { open() {}, send() {} } },
          window: { location: { hostname: "snaptik.app" } },
        }

        try {
          Function(...Object.keys(mockObjects), script2)(...Object.values(mockObjects))
        } catch (error) {
          reject(error)
        }
      })
    }

    async get_hd_video(hdUrl, backupUrl) {
      try {
        const { data } = await this.axios.get(hdUrl)
        if (data?.url) return data.url
      } catch {}
      return backupUrl
    }

    async parse_html(html) {
      const $ = cheerio.load(html)
      const isVideo = !$("div.render-wrapper").length

      const thumbnail = $(".avatar").attr("src") || $("#thumbnail").attr("src")
      const title = $(".video-title").text().trim()
      const creator = $(".info span").text().trim()

      if (isVideo) {
        const hdButton = $("div.video-links > button[data-tokenhd]")
        const hdTokenUrl = hdButton.data("tokenhd")
        const backupUrl = hdButton.data("backup")

        let hdUrl = null
        if (hdTokenUrl) hdUrl = await this.get_hd_video(hdTokenUrl, backupUrl)

        const videoUrls = [
          hdUrl || backupUrl,
          ...$("div.video-links > a:not(a[href=\"/\"])")
            .map((_, el) => $(el).attr("href"))
            .get()
            .filter((x) => x && !x.includes("play.google.com"))
            .map((x) => (x.startsWith("/") ? this.config.baseURL + x : x)),
        ].filter(Boolean)

        return {
          type: "video",
          urls: videoUrls,
          metadata: {
            title: title || null,
            description: title || null,
            thumbnail,
            creator,
          },
        }
      }
    }

    // ⭐⭐  AQUI VA LA PARTE MODIFICADA ⭐⭐
    async process(url) {
      try {
        const script = await this.get_script(url)
        const { html, oembed_url } = await this.eval_script(script)
        const result = await this.parse_html(html)

        const meta_oembed = await getTiktokMetadata(url)
        const deepInfo = await getDeepTiktokInfo(url)

        return {
          original_url: url,
          oembed_url,
          type: result.type,
          urls: result.urls,
          metadata: {
            ...result.metadata,
            oembed: meta_oembed,
            advanced: deepInfo
          },
        }
      } catch (error) {
        return { original_url: url, error: error.message }
      }
    }
  }

  async function scrapeTiktok(url) {
    try {
      const client = new SnapTikClient()
      return await client.process(url)
    } catch {
      return null
    }
  }

  // GET endpoint
  app.get("/download/tiktok2", createApiKeyMiddleware(), async (req, res) => {
    try {
      const { url } = req.query

      if (!url) return res.status(400).json({ status: false, error: "URL parameter is required" })
      const result = await scrapeTiktok(url.trim())

      res.status(200).json({ status: true, data: result, timestamp: new Date().toISOString() })
    } catch (error) {
      res.status(500).json({ status: false, error: error.message })
    }
  })

  // POST endpoint
  app.post("/download/tiktok2", createApiKeyMiddleware(), async (req, res) => {
    try {
      const { url } = req.body

      if (!url) return res.status(400).json({ status: false, error: "URL parameter is required" })
      const result = await scrapeTiktok(url.trim())

      res.status(200).json({ status: true, data: result, timestamp: new Date().toISOString() })
    } catch (error) {
      res.status(500).json({ status: false, error: error.message })
    }
  })
}