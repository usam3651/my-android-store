import { db, initDatabase } from "./database";
import path from "path";
import crypto from "crypto";
import fs from "fs";

// Initialize database
initDatabase();

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;
const PUBLIC_DIR = path.join(process.cwd(), "public");

// Ensure upload directories exist
for (const sub of ["icons", "apks", "screenshots", "avatars"]) {
  const p = path.join(PUBLIC_DIR, "uploads", sub);
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

// Simple Session Token Management
function generateToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

function verifyAdminSession(req: Request): boolean {
  const authHeader = req.headers.get("Authorization");
  const cookieHeader = req.headers.get("Cookie");
  let token = "";

  if (authHeader && authHeader.startsWith("Bearer ")) {
    token = authHeader.substring(7);
  } else if (cookieHeader) {
    const match = cookieHeader.match(/admin_token=([^;]+)/);
    if (match) token = match[1];
  }

  if (!token) return false;

  const session = db.prepare(`
    SELECT * FROM sessions 
    WHERE token = ? AND datetime(expires_at) > datetime('now')
  `).get(token) as { token: string } | undefined;

  return !!session;
}

// Simple IP Hashing for privacy-friendly analytics
function getIpHash(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  const ip = forwarded ? forwarded.split(",")[0].trim() : "127.0.0.1";
  return crypto.createHash("sha256").update(ip + "salt_2026").digest("hex").slice(0, 16);
}

// Track page visit
function trackVisitor(req: Request, targetPath: string = "/") {
  try {
    const ipHash = getIpHash(req);
    const userAgent = (req.headers.get("user-agent") || "unknown").slice(0, 200);
    const today = new Date().toISOString().split("T")[0];

    db.prepare(`
      INSERT INTO visitors (ip_hash, user_agent, path, visit_date)
      VALUES (?, ?, ?, ?)
    `).run(ipHash, userAgent, targetPath, today);
  } catch (err) {
    console.error("Tracking error:", err);
  }
}

// Helper to send JSON responses
function jsonResponse(data: any, status = 200, extraHeaders: HeadersInit = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      "Pragma": "no-cache",
      "Expires": "0",
      ...extraHeaders,
    },
  });
}

// Helper to save uploaded file
async function saveUploadedFile(file: File, subfolder: string): Promise<string> {
  const ext = path.extname(file.name) || (file.type.includes("png") ? ".png" : file.type.includes("jpeg") ? ".jpg" : ".bin");
  const randomName = `${Date.now()}_${crypto.randomBytes(6).toString("hex")}${ext}`;
  const relativePath = `/uploads/${subfolder}/${randomName}`;
  const fullPath = path.join(PUBLIC_DIR, "uploads", subfolder, randomName);

  const arrayBuffer = await file.arrayBuffer();
  await Bun.write(fullPath, arrayBuffer);
  return relativePath;
}

// Bun Server
const server = Bun.serve({
  port: PORT,
  maxRequestBodySize: 1024 * 1024 * 300, // 300MB for large APK uploads

  async fetch(req: Request) {
    const url = new URL(req.url);
    const pathname = url.pathname;
    const method = req.method;

    // Handle CORS preflight
    if (method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
        },
      });
    }

    // ==========================================
    // 🌐 PUBLIC API ROUTES
    // ==========================================

    // 1. Get Public Settings
    if (method === "GET" && pathname === "/api/settings") {
      const settings = db.query(`
        SELECT id, developer_name, developer_title, developer_bio, 
               developer_avatar, whatsapp_url, facebook_url, 
               playstore_url, site_title, site_description 
        FROM settings WHERE id = 1
      `).get();
      return jsonResponse(settings || {});
    }

    // 2. Track Visit
    if (method === "POST" && pathname === "/api/track-visit") {
      try {
        const body = await req.json().catch(() => ({}));
        trackVisitor(req, body.path || "/");
        return jsonResponse({ success: true });
      } catch {
        return jsonResponse({ success: true });
      }
    }

    // 3. Get Public Apps List (with category, search, average rating)
    if (method === "GET" && pathname === "/api/apps") {
      const category = url.searchParams.get("category");
      const search = url.searchParams.get("search");

      let queryStr = `
        SELECT 
          a.id, a.title, a.summary, a.category, a.version, a.package_name,
          a.file_size, a.icon_url, a.apk_url, a.playstore_link, a.min_android,
          a.downloads_count, a.is_featured, a.created_at,
          COALESCE(AVG(r.rating), 0) as average_rating,
          COUNT(r.id) as reviews_count
        FROM apps a
        LEFT JOIN reviews r ON a.id = r.app_id AND r.is_approved = 1
        WHERE a.status = 'published'
      `;
      const params: any[] = [];

      if (category && category !== "all" && category !== "الكل") {
        queryStr += ` AND a.category = ?`;
        params.push(category);
      }

      if (search && search.trim() !== "") {
        queryStr += ` AND (a.title LIKE ? OR a.summary LIKE ? OR a.description LIKE ?)`;
        params.push(`%${search.trim()}%`, `%${search.trim()}%`, `%${search.trim()}%`);
      }

      queryStr += ` GROUP BY a.id ORDER BY a.is_featured DESC, a.created_at DESC`;

      const apps = db.prepare(queryStr).all(...params);
      return jsonResponse(apps);
    }

    // 4. Get Single App Details (with reviews)
    if (method === "GET" && pathname.startsWith("/api/apps/")) {
      const appId = parseInt(pathname.split("/")[3]);
      if (isNaN(appId)) {
        return jsonResponse({ error: "معرّف التطبيق غير صالح" }, 400);
      }

      const app = db.prepare(`
        SELECT 
          a.*,
          COALESCE(AVG(r.rating), 0) as average_rating,
          COUNT(r.id) as reviews_count
        FROM apps a
        LEFT JOIN reviews r ON a.id = r.app_id AND r.is_approved = 1
        WHERE a.id = ?
        GROUP BY a.id
      `).get(appId) as any;

      if (!app) {
        return jsonResponse({ error: "التطبيق غير موجود" }, 404);
      }

      // Parse screenshots JSON safely
      try {
        app.screenshots = JSON.parse(app.screenshots || "[]");
      } catch {
        app.screenshots = [];
      }

      // Get approved reviews
      const reviews = db.prepare(`
        SELECT id, author_name, rating, comment, created_at 
        FROM reviews 
        WHERE app_id = ? AND is_approved = 1 
        ORDER BY created_at DESC
      `).all(appId);

      return jsonResponse({
        ...app,
        reviews,
      });
    }

    // 5. Track / Increment App Download
    if (method === "POST" && pathname.match(/^\/api\/apps\/\d+\/download$/)) {
      const appId = parseInt(pathname.split("/")[3]);
      db.prepare(`
        UPDATE apps SET downloads_count = downloads_count + 1 WHERE id = ?
      `).run(appId);

      const app = db.prepare(`SELECT apk_url, playstore_link FROM apps WHERE id = ?`).get(appId) as any;
      return jsonResponse({
        success: true,
        downloadUrl: app?.apk_url || app?.playstore_link || "#"
      });
    }

    // 6. Submit Review for an App
    if (method === "POST" && pathname.match(/^\/api\/apps\/\d+\/reviews$/)) {
      const appId = parseInt(pathname.split("/")[3]);
      const body = await req.json().catch(() => null);

      if (!body || !body.author_name || !body.comment || !body.rating) {
        return jsonResponse({ error: "يرجى ملء جميع الحقول المطلوبة (الاسم، التقييم، والتعليق)" }, 400);
      }

      const rating = parseInt(body.rating);
      if (isNaN(rating) || rating < 1 || rating > 5) {
        return jsonResponse({ error: "التقييم يجب أن يكون بين 1 و 5 نجوم" }, 400);
      }

      const authorName = String(body.author_name).trim().slice(0, 50);
      const comment = String(body.comment).trim().slice(0, 1000);

      db.prepare(`
        INSERT INTO reviews (app_id, author_name, rating, comment, is_approved)
        VALUES (?, ?, ?, ?, 1)
      `).run(appId, authorName, rating, comment);

      return jsonResponse({ success: true, message: "تمت إضافة تقييمك بنجاح! شكراً لك." });
    }

    // ==========================================
    // 🔐 AUTHENTICATION
    // ==========================================

    // Admin Login
    if (method === "POST" && pathname === "/api/auth/login") {
      const body = await req.json().catch(() => null);
      if (!body || !body.password) {
        return jsonResponse({ error: "يرجى إدخال كلمة المرور" }, 400);
      }

      const settings = db.query("SELECT admin_password_hash FROM settings WHERE id = 1").get() as any;
      const isMatch = Bun.password.verifySync(body.password, settings.admin_password_hash);

      if (!isMatch) {
        return jsonResponse({ error: "كلمة المرور غير صحيحة" }, 401);
      }

      // Create Session
      const token = generateToken();
      // Expires in 7 days
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

      db.prepare(`
        INSERT INTO sessions (token, expires_at) VALUES (?, ?)
      `).run(token, expiresAt);

      return jsonResponse(
        { success: true, token, message: "تم تسجيل الدخول بنجاح" },
        200,
        {
          "Set-Cookie": `admin_token=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${7 * 24 * 3600}`,
        }
      );
    }

    // Verify Session
    if (method === "GET" && pathname === "/api/auth/verify") {
      const isValid = verifyAdminSession(req);
      return jsonResponse({ authenticated: isValid });
    }

    // Admin Logout
    if (method === "POST" && pathname === "/api/auth/logout") {
      const authHeader = req.headers.get("Authorization");
      if (authHeader && authHeader.startsWith("Bearer ")) {
        const token = authHeader.substring(7);
        db.prepare("DELETE FROM sessions WHERE token = ?").run(token);
      }
      return jsonResponse(
        { success: true },
        200,
        { "Set-Cookie": `admin_token=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT` }
      );
    }

    // ==========================================
    // ⚙️ PROTECTED ADMIN ROUTES
    // ==========================================

    if (pathname.startsWith("/api/admin")) {
      if (!verifyAdminSession(req)) {
        return jsonResponse({ error: "غير مصرح، يرجى تسجيل الدخول كمسؤول" }, 401);
      }

      // Admin Stats
      if (method === "GET" && pathname === "/api/admin/stats") {
        const totalVisitors = (db.query("SELECT COUNT(*) as count FROM visitors").get() as any).count;
        
        const today = new Date().toISOString().split("T")[0];
        const todayVisitors = (db.prepare("SELECT COUNT(*) as count FROM visitors WHERE visit_date = ?").get(today) as any).count;
        
        const uniqueVisitors = (db.query("SELECT COUNT(DISTINCT ip_hash) as count FROM visitors").get() as any).count;
        
        const totalApps = (db.query("SELECT COUNT(*) as count FROM apps").get() as any).count;
        
        const totalDownloads = (db.query("SELECT COALESCE(SUM(downloads_count), 0) as count FROM apps").get() as any).count;
        
        const totalReviews = (db.query("SELECT COUNT(*) as count FROM reviews").get() as any).count;

        // Daily visits for the last 7 days
        const visitsChart = db.query(`
          SELECT visit_date, COUNT(*) as count, COUNT(DISTINCT ip_hash) as unique_count
          FROM visitors
          WHERE visit_date >= date('now', '-7 days')
          GROUP BY visit_date
          ORDER BY visit_date ASC
        `).all();

        // Recent visitors log (last 20)
        const recentVisitors = db.query(`
          SELECT id, ip_hash, user_agent, path, visited_at
          FROM visitors
          ORDER BY visited_at DESC
          LIMIT 20
        `).all();

        return jsonResponse({
          stats: {
            totalVisitors,
            todayVisitors,
            uniqueVisitors,
            totalApps,
            totalDownloads,
            totalReviews,
          },
          visitsChart,
          recentVisitors,
        });
      }

      // Admin: Get all apps (with draft/published status)
      if (method === "GET" && pathname === "/api/admin/apps") {
        const apps = db.query(`
          SELECT 
            a.*,
            COALESCE(AVG(r.rating), 0) as average_rating,
            COUNT(r.id) as reviews_count
          FROM apps a
          LEFT JOIN reviews r ON a.id = r.app_id
          GROUP BY a.id
          ORDER BY a.created_at DESC
        `).all();

        return jsonResponse(apps.map((a: any) => {
          try { a.screenshots = JSON.parse(a.screenshots || "[]"); } catch { a.screenshots = []; }
          return a;
        }));
      }

      // Admin: Add or Edit App (supports FormData multipart upload or JSON)
      if ((method === "POST" || method === "PUT") && pathname === "/api/admin/apps") {
        const contentType = req.headers.get("content-type") || "";
        let data: any = {};
        let iconUrl = "";
        let apkUrl = "";
        let screenshotUrls: string[] = [];

        if (contentType.includes("multipart/form-data")) {
          const formData = await req.formData();
          
          data.title = formData.get("title")?.toString() || "";
          data.summary = formData.get("summary")?.toString() || "";
          data.description = formData.get("description")?.toString() || "";
          data.category = formData.get("category")?.toString() || "أدوات";
          data.version = formData.get("version")?.toString() || "1.0.0";
          data.package_name = formData.get("package_name")?.toString() || "";
          data.file_size = formData.get("file_size")?.toString() || "10 MB";
          data.playstore_link = formData.get("playstore_link")?.toString() || "";
          data.min_android = formData.get("min_android")?.toString() || "Android 8.0+";
          data.is_featured = formData.get("is_featured") === "1" || formData.get("is_featured") === "true" ? 1 : 0;
          data.status = formData.get("status")?.toString() || "published";
          data.id = formData.get("id") ? parseInt(formData.get("id")!.toString()) : null;

          // External URLs if provided
          if (formData.get("icon_url_external")) {
            iconUrl = formData.get("icon_url_external")!.toString();
          }
          if (formData.get("apk_url_external")) {
            apkUrl = formData.get("apk_url_external")!.toString();
          }

          // Handle Icon File upload
          const iconFile = formData.get("icon_file");
          if (iconFile instanceof File && iconFile.size > 0) {
            iconUrl = await saveUploadedFile(iconFile, "icons");
          }

          // Handle APK File upload
          const apkFile = formData.get("apk_file");
          if (apkFile instanceof File && apkFile.size > 0) {
            apkUrl = await saveUploadedFile(apkFile, "apks");
            // Auto calculate file size if not manually set
            const sizeInMB = (apkFile.size / (1024 * 1024)).toFixed(1);
            if (!data.file_size || data.file_size === "10 MB") {
              data.file_size = `${sizeInMB} MB`;
            }
          }

          // Handle Screenshots upload
          const existingScreenshotsStr = formData.get("existing_screenshots")?.toString();
          if (existingScreenshotsStr) {
            try { screenshotUrls = JSON.parse(existingScreenshotsStr); } catch {}
          }

          const screenshotFiles = formData.getAll("screenshot_files");
          for (const sFile of screenshotFiles) {
            if (sFile instanceof File && sFile.size > 0) {
              const sUrl = await saveUploadedFile(sFile, "screenshots");
              screenshotUrls.push(sUrl);
            }
          }
        } else {
          // Plain JSON request
          data = await req.json();
          iconUrl = data.icon_url || "";
          apkUrl = data.apk_url || "";
          screenshotUrls = Array.isArray(data.screenshots) ? data.screenshots : [];
        }

        if (!data.title) {
          return jsonResponse({ error: "اسم التطبيق مطلوب" }, 400);
        }

        if (data.id) {
          // Update existing app
          const existing = db.prepare("SELECT * FROM apps WHERE id = ?").get(data.id) as any;
          if (!existing) return jsonResponse({ error: "التطبيق غير موجود" }, 404);

          const finalIcon = iconUrl || existing.icon_url;
          const finalApk = apkUrl || existing.apk_url;
          const finalScreenshots = screenshotUrls.length > 0 ? JSON.stringify(screenshotUrls) : existing.screenshots;

          db.prepare(`
            UPDATE apps SET
              title = ?, summary = ?, description = ?, category = ?,
              version = ?, package_name = ?, file_size = ?,
              icon_url = ?, apk_url = ?, playstore_link = ?,
              screenshots = ?, min_android = ?, is_featured = ?,
              status = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `).run(
            data.title, data.summary, data.description, data.category,
            data.version, data.package_name, data.file_size,
            finalIcon, finalApk, data.playstore_link,
            finalScreenshots, data.min_android, data.is_featured,
            data.status, data.id
          );

          return jsonResponse({ success: true, message: "تم تحديث بيانات التطبيق بنجاح", id: data.id });
        } else {
          // Insert new app
          const result = db.prepare(`
            INSERT INTO apps (
              title, summary, description, category, version,
              package_name, file_size, icon_url, apk_url,
              playstore_link, screenshots, min_android,
              is_featured, status
            ) VALUES (
              ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
            )
          `).run(
            data.title, data.summary, data.description, data.category,
            data.version, data.package_name, data.file_size,
            iconUrl, apkUrl, data.playstore_link,
            JSON.stringify(screenshotUrls), data.min_android,
            data.is_featured, data.status
          );

          return jsonResponse({ success: true, message: "تم نشر التطبيق بنجاح!", id: result.lastInsertRowid });
        }
      }

      // Admin: Delete App
      if (method === "DELETE" && pathname.startsWith("/api/admin/apps/")) {
        const appId = parseInt(pathname.split("/")[4]);
        db.prepare("DELETE FROM apps WHERE id = ?").run(appId);
        return jsonResponse({ success: true, message: "تم حذف التطبيق بنجاح" });
      }

      // Admin: Get All Reviews
      if (method === "GET" && pathname === "/api/admin/reviews") {
        const reviews = db.query(`
          SELECT r.*, a.title as app_title, a.icon_url as app_icon
          FROM reviews r
          JOIN apps a ON r.app_id = a.id
          ORDER BY r.created_at DESC
        `).all();
        return jsonResponse(reviews);
      }

      // Admin: Delete Review
      if (method === "DELETE" && pathname.startsWith("/api/admin/reviews/")) {
        const reviewId = parseInt(pathname.split("/")[4]);
        db.prepare("DELETE FROM reviews WHERE id = ?").run(reviewId);
        return jsonResponse({ success: true, message: "تم حذف التعليق بنجاح" });
      }

      // Admin: Update Settings & Developer Profile & Admin Password
      if (method === "PUT" && pathname === "/api/admin/settings") {
        const contentType = req.headers.get("content-type") || "";
        let body: any = {};
        let avatarUrl = "";

        if (contentType.includes("multipart/form-data")) {
          const formData = await req.formData();
          body = {
            developer_name: formData.get("developer_name")?.toString(),
            developer_title: formData.get("developer_title")?.toString(),
            developer_bio: formData.get("developer_bio")?.toString(),
            whatsapp_url: formData.get("whatsapp_url")?.toString(),
            facebook_url: formData.get("facebook_url")?.toString(),
            playstore_url: formData.get("playstore_url")?.toString(),
            site_title: formData.get("site_title")?.toString(),
            site_description: formData.get("site_description")?.toString(),
            new_password: formData.get("new_password")?.toString(),
          };

          const avatarFile = formData.get("avatar_file");
          if (avatarFile instanceof File && avatarFile.size > 0) {
            avatarUrl = await saveUploadedFile(avatarFile, "avatars");
          }
        } else {
          body = await req.json();
          avatarUrl = body.developer_avatar || "";
        }

        const currentSettings = db.query("SELECT * FROM settings WHERE id = 1").get() as any;
        const finalAvatar = avatarUrl || currentSettings.developer_avatar;

        db.prepare(`
          UPDATE settings SET
            developer_name = COALESCE(?, developer_name),
            developer_title = COALESCE(?, developer_title),
            developer_bio = COALESCE(?, developer_bio),
            developer_avatar = ?,
            whatsapp_url = COALESCE(?, whatsapp_url),
            facebook_url = COALESCE(?, facebook_url),
            playstore_url = COALESCE(?, playstore_url),
            site_title = COALESCE(?, site_title),
            site_description = COALESCE(?, site_description)
          WHERE id = 1
        `).run(
          body.developer_name, body.developer_title, body.developer_bio,
          finalAvatar, body.whatsapp_url, body.facebook_url,
          body.playstore_url, body.site_title, body.site_description
        );

        if (body.new_password && body.new_password.trim().length >= 6) {
          const newHash = Bun.password.hashSync(body.new_password.trim());
          db.prepare("UPDATE settings SET admin_password_hash = ? WHERE id = 1").run(newHash);
        }

        return jsonResponse({ success: true, message: "تم تحديث الإعدادات والملف التعريفي بنجاح" });
      }
    }

    // ==========================================
    // 📁 STATIC ASSETS & HTML SERVING
    // ==========================================

    // Route: /manifest.json
    if (pathname === "/manifest.json") {
      const manifestFile = Bun.file(path.join(PUBLIC_DIR, "manifest.json"));
      if (await manifestFile.exists()) {
        return new Response(manifestFile, {
          headers: {
            "Content-Type": "application/manifest+json; charset=utf-8",
            "Cache-Control": "no-cache",
          },
        });
      }
    }

    // Route: /sw.js
    if (pathname === "/sw.js") {
      const swFile = Bun.file(path.join(PUBLIC_DIR, "sw.js"));
      if (await swFile.exists()) {
        return new Response(swFile, {
          headers: {
            "Content-Type": "application/javascript; charset=utf-8",
            "Service-Worker-Allowed": "/",
            "Cache-Control": "no-cache",
          },
        });
      }
    }

    // Route: /admin -> serve admin.html
    if (pathname === "/admin" || pathname === "/admin/") {
      return new Response(Bun.file(path.join(PUBLIC_DIR, "admin.html")), {
        headers: { "Content-Type": "text/html; charset=utf-8" }
      });
    }

    // Route: / or /index.html -> serve index.html
    if (pathname === "/" || pathname === "/index.html") {
      trackVisitor(req, "/");
      return new Response(Bun.file(path.join(PUBLIC_DIR, "index.html")), {
        headers: { "Content-Type": "text/html; charset=utf-8" }
      });
    }

    // Serve static files from public/
    let filePath = path.join(PUBLIC_DIR, pathname);
    let file = Bun.file(filePath);

    if (await file.exists()) {
      return new Response(file);
    }

    // 404 Fallback
    return new Response("الصفحة غير موجودة (404 Not Found)", {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8" }
    });
  }
});

console.log(`🚀 السيرفر يعمل الآن بنجاح على الرابط: http://localhost:${PORT}`);
console.log(`📱 صفحة الزوار الرئيسية: http://localhost:${PORT}`);
console.log(`⚙️  لوحة تحكم المسؤول: http://localhost:${PORT}/admin (كلمة المرور الافتراضية: admin123)`);
