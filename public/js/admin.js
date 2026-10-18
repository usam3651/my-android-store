// Admin Dashboard Logic
let adminToken = localStorage.getItem("admin_token") || "";
let appsList = [];
let reviewsList = [];

document.addEventListener("DOMContentLoaded", () => {
  checkAuth();
  setupAdminListeners();
});

// Check Authentication Status
async function checkAuth() {
  if (!adminToken) {
    showLoginScreen();
    return;
  }

  try {
    const res = await fetch("/api/auth/verify", {
      headers: { "Authorization": `Bearer ${adminToken}` }
    });
    const data = await res.json();
    if (data.authenticated) {
      showDashboardScreen();
      loadDashboardData();
    } else {
      showLoginScreen();
    }
  } catch (e) {
    showLoginScreen();
  }
}

function showLoginScreen() {
  document.getElementById("loginView")?.classList.remove("hidden");
  document.getElementById("dashboardView")?.classList.add("hidden");
}

function showDashboardScreen() {
  document.getElementById("loginView")?.classList.add("hidden");
  document.getElementById("dashboardView")?.classList.remove("hidden");
}

// 🔐 Login Handler
async function handleLogin(e) {
  e.preventDefault();
  const passwordInput = document.getElementById("adminPassword");
  const errorEl = document.getElementById("loginError");
  const loginBtn = document.getElementById("loginSubmitBtn");

  if (!passwordInput) return;
  const password = passwordInput.value;

  loginBtn.disabled = true;
  loginBtn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> جارٍ التحقق...`;
  errorEl?.classList.add("hidden");

  try {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "كلمة المرور غير صحيحة");

    adminToken = data.token;
    localStorage.setItem("admin_token", adminToken);
    showDashboardScreen();
    loadDashboardData();
  } catch (err) {
    if (errorEl) {
      errorEl.textContent = err.message;
      errorEl.classList.remove("hidden");
    }
  } finally {
    loginBtn.disabled = false;
    loginBtn.innerHTML = `<i class="fas fa-sign-in-alt"></i> تسجيل الدخول`;
  }
}

// 🚪 Logout Handler
async function handleLogout() {
  if (!confirm("هل أنت متأكد من رغبتك في تسجيل الخروج؟")) return;
  try {
    await fetch("/api/auth/logout", {
      method: "POST",
      headers: { "Authorization": `Bearer ${adminToken}` }
    });
  } catch (e) {}
  
  adminToken = "";
  localStorage.removeItem("admin_token");
  showLoginScreen();
}

// 📊 Load All Dashboard Data
async function loadDashboardData() {
  await Promise.all([
    fetchStats(),
    fetchAdminApps(),
    fetchAdminReviews(),
    fetchSettingsForEdit()
  ]);
}

// Fetch Stats & Analytics
async function fetchStats() {
  try {
    const res = await fetch("/api/admin/stats?t=" + Date.now(), {
      headers: { "Authorization": `Bearer ${adminToken}` }
    });
    if (!res.ok) return;
    const data = await res.json();

    // Update Counter Cards
    document.getElementById("statTotalVisitors").textContent = (data.stats.totalVisitors || 0).toLocaleString();
    document.getElementById("statTodayVisitors").textContent = (data.stats.todayVisitors || 0).toLocaleString();
    document.getElementById("statUniqueVisitors").textContent = (data.stats.uniqueVisitors || 0).toLocaleString();
    document.getElementById("statTotalApps").textContent = (data.stats.totalApps || 0).toLocaleString();
    document.getElementById("statTotalDownloads").textContent = (data.stats.totalDownloads || 0).toLocaleString();
    document.getElementById("statTotalReviews").textContent = (data.stats.totalReviews || 0).toLocaleString();

    // Render Recent Visitors Table
    renderRecentVisitors(data.recentVisitors || []);
  } catch (err) {
    console.error("Failed to load admin stats:", err);
  }
}

function renderRecentVisitors(visitors) {
  const tbody = document.getElementById("recentVisitorsTableBody");
  if (!tbody) return;

  if (visitors.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" class="text-center py-6 text-slate-400">لا توجد زيارات مسجلة حتى الآن</td></tr>`;
    return;
  }

  tbody.innerHTML = visitors.map(v => `
    <tr class="border-b border-slate-700/40 hover:bg-slate-800/40 text-xs">
      <td class="py-3 px-4 text-slate-300">${new Date(v.visited_at).toLocaleString('ar-EG')}</td>
      <td class="py-3 px-4"><span class="bg-blue-900/50 text-blue-300 px-2 py-0.5 rounded font-mono">${escapeHtml(v.path || '/')}</span></td>
      <td class="py-3 px-4 font-mono text-slate-400">${escapeHtml(v.ip_hash || 'مجهول')}</td>
      <td class="py-3 px-4 text-slate-400 truncate max-w-xs" title="${escapeHtml(v.user_agent || '')}">${escapeHtml(v.user_agent || 'غير معروف')}</td>
    </tr>
  `).join("");
}

// 📱 Manage Apps (Fetch & Render)
async function fetchAdminApps() {
  try {
    const res = await fetch("/api/admin/apps?t=" + Date.now(), {
      headers: { "Authorization": `Bearer ${adminToken}` }
    });
    if (!res.ok) return;
    appsList = await res.json();
    renderAdminAppsTable(appsList);
  } catch (err) {
    console.error("Failed to fetch admin apps:", err);
  }
}

function renderAdminAppsTable(apps) {
  const tbody = document.getElementById("adminAppsTableBody");
  if (!tbody) return;

  if (apps.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="text-center py-10 text-slate-400">لم تقم بإضافة أي تطبيقات بعد. اضغط على "إضافة تطبيق جديد" للبدء.</td></tr>`;
    return;
  }

  const defaultIcon = "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=200&auto=format&fit=crop&q=80";

  tbody.innerHTML = apps.map(app => {
    const avgRating = parseFloat(app.average_rating || 0).toFixed(1);
    return `
      <tr class="border-b border-slate-700/50 hover:bg-slate-800/30 transition">
        <td class="py-4 px-4">
          <div class="flex items-center gap-3">
            <img src="${app.icon_url || defaultIcon}" class="w-12 h-12 rounded-xl object-cover border border-slate-600 shadow" onerror="this.src='${defaultIcon}'" />
            <div>
              <div class="font-bold text-white text-sm hover:text-blue-400 transition">${escapeHtml(app.title)}</div>
              <div class="text-xs text-slate-400">${escapeHtml(app.package_name || 'com.app')} | v${escapeHtml(app.version || '1.0.0')}</div>
            </div>
          </div>
        </td>
        <td class="py-4 px-4 text-xs">
          <span class="badge badge-primary">${escapeHtml(app.category || 'أدوات')}</span>
          ${app.is_featured ? '<span class="badge badge-gold mr-1">مميز</span>' : ''}
        </td>
        <td class="py-4 px-4 text-xs font-bold text-emerald-400">
          <i class="fas fa-download ml-1"></i> ${(app.downloads_count || 0).toLocaleString()}
        </td>
        <td class="py-4 px-4 text-xs font-bold text-yellow-400">
          <i class="fas fa-star ml-1"></i> ${avgRating} (${app.reviews_count || 0})
        </td>
        <td class="py-4 px-4 text-xs">
          <span class="px-2.5 py-1 rounded-full ${app.status === 'published' ? 'bg-emerald-900/50 text-emerald-300' : 'bg-slate-700 text-slate-300'}">
            ${app.status === 'published' ? 'منشور' : 'مسودة'}
          </span>
        </td>
        <td class="py-4 px-4 text-left">
          <div class="flex items-center justify-end gap-2">
            <button onclick="editApp(${app.id})" class="bg-blue-600/20 hover:bg-blue-600 text-blue-400 hover:text-white p-2 rounded-lg text-xs transition" title="تعديل">
              <i class="fas fa-edit"></i>
            </button>
            <button onclick="deleteApp(${app.id})" class="bg-red-600/20 hover:bg-red-600 text-red-400 hover:text-white p-2 rounded-lg text-xs transition" title="حذف">
              <i class="fas fa-trash-alt"></i>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join("");
}

// ➕ Open Add App Modal
function openAddAppModal() {
  document.getElementById("appFormTitle").textContent = "إضافة تطبيق جديد";
  const form = document.getElementById("appForm");
  form?.reset();
  document.getElementById("appIdInput").value = "";
  document.getElementById("existingScreenshotsInput").value = "[]";
  document.getElementById("screenshotsPreview").innerHTML = "";
  
  const modal = document.getElementById("appFormModal");
  modal?.classList.add("active");
}

// ✏️ Edit App
function editApp(appId) {
  const app = appsList.find(a => a.id === appId);
  if (!app) return;

  document.getElementById("appFormTitle").textContent = "تعديل بيانات التطبيق";
  document.getElementById("appIdInput").value = app.id;
  document.getElementById("appTitleInput").value = app.title || "";
  document.getElementById("appCategoryInput").value = app.category || "أدوات";
  document.getElementById("appVersionInput").value = app.version || "1.0.0";
  document.getElementById("appPackageInput").value = app.package_name || "";
  document.getElementById("appSizeInput").value = app.file_size || "15 MB";
  document.getElementById("appMinAndroidInput").value = app.min_android || "Android 8.0+";
  document.getElementById("appPlaystoreInput").value = app.playstore_link || "";
  document.getElementById("appIconExternalInput").value = app.icon_url || "";
  document.getElementById("appApkExternalInput").value = app.apk_url || "";
  document.getElementById("appSummaryInput").value = app.summary || "";
  document.getElementById("appDescInput").value = app.description || "";
  document.getElementById("appFeaturedInput").checked = app.is_featured === 1;
  document.getElementById("appStatusInput").value = app.status || "published";

  // Screenshots preview
  const screenshots = Array.isArray(app.screenshots) ? app.screenshots : [];
  document.getElementById("existingScreenshotsInput").value = JSON.stringify(screenshots);
  
  const preview = document.getElementById("screenshotsPreview");
  if (preview) {
    preview.innerHTML = screenshots.map((url, i) => `
      <div class="relative group">
        <img src="${url}" class="w-16 h-28 object-cover rounded-lg border border-slate-600" />
        <button type="button" onclick="removeExistingScreenshot(${i})" class="absolute top-1 right-1 bg-red-600 text-white rounded-full w-5 h-5 flex items-center justify-center text-[10px] opacity-90 group-hover:opacity-100">
          &times;
        </button>
      </div>
    `).join("");
  }

  const modal = document.getElementById("appFormModal");
  modal?.classList.add("active");
}

function removeExistingScreenshot(index) {
  const input = document.getElementById("existingScreenshotsInput");
  try {
    let arr = JSON.parse(input.value || "[]");
    arr.splice(index, 1);
    input.value = JSON.stringify(arr);
    
    // Re-render preview
    const preview = document.getElementById("screenshotsPreview");
    preview.innerHTML = arr.map((url, i) => `
      <div class="relative group">
        <img src="${url}" class="w-16 h-28 object-cover rounded-lg border border-slate-600" />
        <button type="button" onclick="removeExistingScreenshot(${i})" class="absolute top-1 right-1 bg-red-600 text-white rounded-full w-5 h-5 flex items-center justify-center text-[10px]">
          &times;
        </button>
      </div>
    `).join("");
  } catch (e) {}
}

// 💾 Save App (Add or Update with FormData)
async function handleSaveApp(e) {
  e.preventDefault();
  const form = document.getElementById("appForm");
  const saveBtn = document.getElementById("saveAppBtn");
  if (!form || !saveBtn) return;

  saveBtn.disabled = true;
  saveBtn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> جارٍ الحفظ ورفع الملفات...`;

  const formData = new FormData(form);

  try {
    const res = await fetch("/api/admin/apps", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${adminToken}`
      },
      body: formData
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "فشل حفظ بيانات التطبيق");

    alert("✅ " + data.message);
    document.getElementById("appFormModal")?.classList.remove("active");
    fetchAdminApps();
    fetchStats();
  } catch (err) {
    alert("❌ خطأ: " + err.message);
  } finally {
    saveBtn.disabled = false;
    saveBtn.innerHTML = `<i class="fas fa-save"></i> حفظ ونشر التطبيق`;
  }
}

// 🗑️ Delete App
async function deleteApp(appId) {
  if (!confirm("هل أنت متأكد من حذف هذا التطبيق نهائياً؟ سيتم حذف جميع التعليقات والتقييمات المرتبطة به.")) return;

  try {
    const res = await fetch(`/api/admin/apps/${appId}`, {
      method: "DELETE",
      headers: { "Authorization": `Bearer ${adminToken}` }
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    alert("✅ تم حذف التطبيق بنجاح");
    fetchAdminApps();
    fetchStats();
  } catch (err) {
    alert("❌ فشل الحذف: " + err.message);
  }
}

// 💬 Manage Reviews
async function fetchAdminReviews() {
  try {
    const res = await fetch("/api/admin/reviews?t=" + Date.now(), {
      headers: { "Authorization": `Bearer ${adminToken}` }
    });
    if (!res.ok) return;
    reviewsList = await res.json();
    renderAdminReviewsTable(reviewsList);
  } catch (err) {
    console.error("Failed to fetch admin reviews:", err);
  }
}

function renderAdminReviewsTable(reviews) {
  const tbody = document.getElementById("adminReviewsTableBody");
  if (!tbody) return;

  if (reviews.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="text-center py-8 text-slate-400">لا توجد تعليقات حتى الآن</td></tr>`;
    return;
  }

  tbody.innerHTML = reviews.map(r => `
    <tr class="border-b border-slate-700/50 hover:bg-slate-800/30 transition text-xs">
      <td class="py-3 px-4">
        <div class="font-bold text-white">${escapeHtml(r.app_title || 'تطبيق')}</div>
      </td>
      <td class="py-3 px-4">
        <div class="font-bold text-slate-200">${escapeHtml(r.author_name)}</div>
        <div class="text-[11px] text-slate-500">${new Date(r.created_at).toLocaleDateString('ar-EG')}</div>
      </td>
      <td class="py-3 px-4 text-yellow-400 font-bold">
        ${renderStarsText(r.rating)} (${r.rating}/5)
      </td>
      <td class="py-3 px-4 text-slate-300 max-w-md">
        ${escapeHtml(r.comment)}
      </td>
      <td class="py-3 px-4 text-left">
        <button onclick="deleteReview(${r.id})" class="bg-red-600/20 hover:bg-red-600 text-red-400 hover:text-white p-2 rounded-lg transition" title="حذف التعليق">
          <i class="fas fa-trash-alt"></i>
        </button>
      </td>
    </tr>
  `).join("");
}

function renderStarsText(rating) {
  let stars = "";
  for (let i = 1; i <= 5; i++) {
    stars += i <= rating ? "⭐" : "☆";
  }
  return stars;
}

// 🗑️ Delete Review
async function deleteReview(reviewId) {
  if (!confirm("هل أنت متأكد من حذف هذا التعليق؟")) return;
  try {
    const res = await fetch(`/api/admin/reviews/${reviewId}`, {
      method: "DELETE",
      headers: { "Authorization": `Bearer ${adminToken}` }
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    fetchAdminReviews();
    fetchStats();
  } catch (err) {
    alert("❌ فشل حذف التعليق: " + err.message);
  }
}

// ⚙️ Settings (Fetch & Save)
async function fetchSettingsForEdit() {
  try {
    const res = await fetch("/api/settings?t=" + Date.now());
    if (!res.ok) return;
    const data = await res.json();

    if (document.getElementById("setDevName")) document.getElementById("setDevName").value = data.developer_name || "";
    if (document.getElementById("setDevTitle")) document.getElementById("setDevTitle").value = data.developer_title || "";
    if (document.getElementById("setDevBio")) document.getElementById("setDevBio").value = data.developer_bio || "";
    if (document.getElementById("setWhatsapp")) document.getElementById("setWhatsapp").value = data.whatsapp_url || "";
    if (document.getElementById("setFacebook")) document.getElementById("setFacebook").value = data.facebook_url || "";
    if (document.getElementById("setPlaystore")) document.getElementById("setPlaystore").value = data.playstore_url || "";
    if (document.getElementById("setSiteTitle")) document.getElementById("setSiteTitle").value = data.site_title || "";
    if (document.getElementById("setSiteDesc")) document.getElementById("setSiteDesc").value = data.site_description || "";
  } catch (e) {}
}

async function handleSaveSettings(e) {
  e.preventDefault();
  const form = document.getElementById("settingsForm");
  const saveBtn = document.getElementById("saveSettingsBtn");
  if (!form || !saveBtn) return;

  saveBtn.disabled = true;
  saveBtn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> جارٍ الحفظ...`;

  const formData = new FormData(form);

  try {
    const res = await fetch("/api/admin/settings", {
      method: "PUT",
      headers: { "Authorization": `Bearer ${adminToken}` },
      body: formData
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "فشل حفظ الإعدادات");

    alert("✅ " + data.message);
    document.getElementById("setNewPassword").value = "";
  } catch (err) {
    alert("❌ خطأ: " + err.message);
  } finally {
    saveBtn.disabled = false;
    saveBtn.innerHTML = `<i class="fas fa-check"></i> حفظ التغييرات`;
  }
}

// Setup Event Listeners & Tabs
function setupAdminListeners() {
  // Login Form
  document.getElementById("loginForm")?.addEventListener("submit", handleLogin);

  // Logout Button
  document.getElementById("logoutBtn")?.addEventListener("click", handleLogout);

  // App Form
  document.getElementById("appForm")?.addEventListener("submit", handleSaveApp);

  // Settings Form
  document.getElementById("settingsForm")?.addEventListener("submit", handleSaveSettings);

  // Add App Button
  document.getElementById("openAddAppBtn")?.addEventListener("click", openAddAppModal);

  // Close App Form Modal
  const modal = document.getElementById("appFormModal");
  document.getElementById("closeAppFormBtn")?.addEventListener("click", () => modal?.classList.remove("active"));
  modal?.addEventListener("click", (e) => {
    if (e.target === modal) modal.classList.remove("active");
  });

  // Admin Navigation Tabs
  document.querySelectorAll(".admin-tab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".admin-tab-btn").forEach(b => {
        b.classList.remove("bg-blue-600", "text-white");
        b.classList.add("text-slate-400", "hover:text-white");
      });
      btn.classList.add("bg-blue-600", "text-white");
      btn.classList.remove("text-slate-400");

      const targetTab = btn.getAttribute("data-tab");
      document.querySelectorAll(".admin-tab-content").forEach(c => c.classList.add("hidden"));
      document.getElementById(`tab-${targetTab}`)?.classList.remove("hidden");
    });
  });
}

function escapeHtml(text) {
  if (!text) return "";
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
