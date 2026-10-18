import { Database } from "bun:sqlite";
import path from "path";
import fs from "fs";

const dataDir = path.join(process.cwd(), "data");
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, "appstore.db");
export const db = new Database(dbPath);

// Enable WAL mode for better concurrency and performance
db.exec("PRAGMA journal_mode = WAL;");
db.exec("PRAGMA foreign_keys = ON;");

export function initDatabase() {
  // Settings table
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY DEFAULT 1,
      developer_name TEXT DEFAULT 'مطور تطبيقات أندرويد',
      developer_title TEXT DEFAULT 'Android & Flutter Developer',
      developer_bio TEXT DEFAULT 'أهلاً بك في منصتي الخاصة! أقوم بتطوير تطبيقات أندرويد مبتكرة، سريعة، وسهلة الاستخدام بأحدث التقنيات.',
      developer_avatar TEXT DEFAULT '',
      github_url TEXT DEFAULT '',
      linkedin_url TEXT DEFAULT '',
      email TEXT DEFAULT '',
      whatsapp_url TEXT DEFAULT '',
      facebook_url TEXT DEFAULT '',
      playstore_url TEXT DEFAULT '',
      admin_password_hash TEXT NOT NULL,
      site_title TEXT DEFAULT 'معرض تطبيقات أندرويد | Android Apps Store',
      site_description TEXT DEFAULT 'منصة عرض وتحميل تطبيقات الأندرويد مع التقييمات والتعليقات المباشرة',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Migrate columns if table already existed
  try {
    db.exec("ALTER TABLE settings ADD COLUMN whatsapp_url TEXT DEFAULT '';");
  } catch {}
  try {
    db.exec("ALTER TABLE settings ADD COLUMN facebook_url TEXT DEFAULT '';");
  } catch {}

  // Apps table
  db.exec(`
    CREATE TABLE IF NOT EXISTS apps (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      summary TEXT,
      description TEXT,
      category TEXT DEFAULT 'أدوات',
      version TEXT DEFAULT '1.0.0',
      package_name TEXT,
      file_size TEXT DEFAULT '15 MB',
      icon_url TEXT,
      apk_url TEXT,
      playstore_link TEXT,
      screenshots TEXT DEFAULT '[]',
      min_android TEXT DEFAULT 'Android 8.0+',
      downloads_count INTEGER DEFAULT 0,
      is_featured INTEGER DEFAULT 0,
      status TEXT DEFAULT 'published',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Reviews table
  db.exec(`
    CREATE TABLE IF NOT EXISTS reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      app_id INTEGER NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
      author_name TEXT NOT NULL,
      rating INTEGER NOT NULL CHECK(rating >= 1 AND rating <= 5),
      comment TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      is_approved INTEGER DEFAULT 1
    );
  `);

  // Visitors analytics table
  db.exec(`
    CREATE TABLE IF NOT EXISTS visitors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ip_hash TEXT,
      user_agent TEXT,
      path TEXT,
      visit_date TEXT,
      visited_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Admin sessions table
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      expires_at DATETIME NOT NULL
    );
  `);

  // Insert default settings if not exists
  const existingSettings = db.query("SELECT * FROM settings WHERE id = 1").get();
  if (!existingSettings) {
    // Default admin password: admin123
    const defaultPasswordHash = Bun.password.hashSync("admin123");
    db.prepare(`
      INSERT INTO settings (id, admin_password_hash) VALUES (1, ?)
    `).run(defaultPasswordHash);
    console.log("✅ Initialized default settings with default password: admin123");
  }

  // Insert sample apps if table is empty
  const appCount = db.query("SELECT COUNT(*) as count FROM apps").get() as { count: number };
  if (appCount.count === 0) {
    seedSampleApps();
  }
}

function seedSampleApps() {
  const insertApp = db.prepare(`
    INSERT INTO apps (
      title, summary, description, category, version, package_name,
      file_size, icon_url, apk_url, playstore_link, screenshots,
      min_android, downloads_count, is_featured
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
    )
  `);

  const sampleApps = [
    {
      title: "تطبيق مهامي اليومية | TaskManager Pro",
      summary: "تطبيق إنتاجية متقدم لتنظيم وإدارة المهام اليومية مع تنبيهات ذكية وودجت للشاشة الرئيسية.",
      description: `تطبيق **TaskManager Pro** هو رفيقك المثالي لزيادة الإنتاجية وإدارة الوقت بكفاءة عالية.\n\n### المميزات الرئيسية:\n- 📝 تسجيل المهام مع الأولويات والتصنيفات اللونية.\n- ⏰ تذكيرات وتنبيهات مخصصة لا تفوت أي موعد.\n- 📊 إحصائيات بصرية توضح مدى إنجازك الأسبوعي والشهري.\n- 🌓 دعم كامل للوضع الليلي (Dark Mode).\n- 🔒 خصوصية تامة - بياناتك مخزنة محلياً على جهازك دون اتصال بالسيرفرات.\n- 📱 ودجت تفاعلي وسريع على الشاشة الرئيسية.`,
      category: "إنتاجية",
      version: "2.1.0",
      package_name: "com.androiddev.taskmanager",
      file_size: "18.5 MB",
      icon_url: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=200&auto=format&fit=crop&q=80",
      apk_url: "",
      playstore_link: "https://play.google.com",
      screenshots: JSON.stringify([
        "https://images.unsplash.com/photo-1551650975-87deedd944c3?w=800&auto=format&fit=crop&q=80",
        "https://images.unsplash.com/photo-1512941937669-90a1b58e7e9c?w=800&auto=format&fit=crop&q=80"
      ]),
      min_android: "Android 8.0+",
      downloads_count: 1420,
      is_featured: 1
    },
    {
      title: "محول العملات والأسعار الذكي | CurrencyX",
      summary: "محول عملات فوري يدعم أكثر من 160 عملة عالمية مع تحديث مباشر للأسعار ورسوم بيانية تفاعلية.",
      description: `تطبيق **CurrencyX** يوفر لك أسعار الصرف الحية للعملات العالمية والعملات الرقمية المشفرة بدقة وسرعة.\n\n### المميزات:\n- 💱 دعم لأكثر من 160 عملة عالمية مع أسعار مباشرة.\n- 📈 رسوم بيانية توضح حركة السعر التاريخية خلال 30 يوماً وسنة.\n- 📶 إمكانية العمل بدون إنترنت باستخدام آخر أسعار تم تحديثها.\n- 🧮 حاسبة سريعة مدمجة لحساب الصفقات والمشتريات فورياً.`,
      category: "أدوات",
      version: "1.4.2",
      package_name: "com.androiddev.currencyx",
      file_size: "12.3 MB",
      icon_url: "https://images.unsplash.com/photo-1559526324-4b87b5e36e44?w=200&auto=format&fit=crop&q=80",
      apk_url: "",
      playstore_link: "https://play.google.com",
      screenshots: JSON.stringify([
        "https://images.unsplash.com/photo-1563986768609-322da13575f3?w=800&auto=format&fit=crop&q=80"
      ]),
      min_android: "Android 7.0+",
      downloads_count: 890,
      is_featured: 1
    },
    {
      title: "قارئ القرآن الكريم والأذكار | Noor",
      summary: "تطبيق إسلامي شامل بدون إعلانات مع تلاوات صوتية، أذكار الصباح والمساء، واتجاه القبلة.",
      description: `تطبيق **Noor** مصمم بعناية فائقة لتقديم تجربة إيمانية مريحة وسلسة بدون أي إعلانات مزعجة.\n\n### المميزات:\n- 📖 المصحف الشريف بالخط العثماني عالي الوضوح مع التفسير الميسر.\n- 🎧 تلاوات صوتية لمشاهير القراء مع إمكانية التحميل للاستماع بدون إنترنت.\n- 🧭 بوصلة دقيقة لتحديد اتجاه القبلة في أي مكان في العالم.\n- 📿 مسبحة إلكترونية وأذكار الصباح والمساء وحصن المسلم.`,
      category: "إسلامي",
      version: "3.0.1",
      package_name: "com.androiddev.noorquran",
      file_size: "34.0 MB",
      icon_url: "https://images.unsplash.com/photo-1590076215667-873d3170b021?w=200&auto=format&fit=crop&q=80",
      apk_url: "",
      playstore_link: "https://play.google.com",
      screenshots: JSON.stringify([
        "https://images.unsplash.com/photo-1564769625905-50e93615e769?w=800&auto=format&fit=crop&q=80"
      ]),
      min_android: "Android 8.0+",
      downloads_count: 3250,
      is_featured: 1
    }
  ];

  for (const app of sampleApps) {
    const result = insertApp.run(
      app.title,
      app.summary,
      app.description,
      app.category,
      app.version,
      app.package_name,
      app.file_size,
      app.icon_url,
      app.apk_url,
      app.playstore_link,
      app.screenshots,
      app.min_android,
      app.downloads_count,
      app.is_featured
    );

    const appId = Number(result.lastInsertRowid);

    // Add sample reviews
    const insertReview = db.prepare(`
      INSERT INTO reviews (app_id, author_name, rating, comment, created_at)
      VALUES (?, ?, ?, ?, datetime('now', ?))
    `);

    insertReview.run(appId, "أحمد محمد", 5, "تطبيق رائع جداً وسلس في الاستخدام، بارك الله في جهودك!", "-2 days");
    insertReview.run(appId, "سارة خالد", 5, "تصميم جميل جداً وواجهة مريحة للعين، أنصح به بشدة.", "-1 days");
  }

  console.log("✅ Seeded initial sample apps & reviews successfully.");
}
