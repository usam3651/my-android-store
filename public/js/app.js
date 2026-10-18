// Main App Logic for Android Developer Store
let currentApps = [];
let selectedApp = null;
let currentRating = 5;
let deferredPrompt = null;

document.addEventListener("DOMContentLoaded", () => {
  initTheme();
  registerServiceWorker();
  setupPwaInstall();
  fetchSettings();
  fetchApps();
  setupEventListeners();
  trackVisitor();
});

// 📱 1. PWA Service Worker & Install Logic
function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("/sw.js")
        .then(() => console.log("Service Worker registered successfully"))
        .catch(err => console.log("Service Worker registration failed:", err));
    });
  }
}

function setupPwaInstall() {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;

    // Show Install App buttons
    document.querySelectorAll(".install-app-btn").forEach(btn => {
      btn.classList.remove("hidden");
    });

    const mobileBanner = document.getElementById("mobileInstallBanner");
    if (mobileBanner && !sessionStorage.getItem("pwa_banner_dismissed")) {
      mobileBanner.classList.remove("hidden");
    }
  });

  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    document.querySelectorAll(".install-app-btn").forEach(btn => btn.classList.add("hidden"));
    const mobileBanner = document.getElementById("mobileInstallBanner");
    if (mobileBanner) mobileBanner.classList.add("hidden");
    alert("🎉 تم تثبيت التطبيق بنجاح على شاشة هاتفك!");
  });
}

async function triggerInstallPrompt() {
  if (deferredPrompt) {
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      deferredPrompt = null;
      document.querySelectorAll(".install-app-btn").forEach(btn => btn.classList.add("hidden"));
      const mobileBanner = document.getElementById("mobileInstallBanner");
      if (mobileBanner) mobileBanner.classList.add("hidden");
    }
  } else {
    // If browser prompt is not ready or on Safari/iOS, open the guide modal
    openInstallGuideModal();
  }
}

function openInstallGuideModal() {
  const modal = document.getElementById("installGuideModal");
  if (modal) modal.classList.add("active");
}

function closeInstallGuideModal() {
  const modal = document.getElementById("installGuideModal");
  if (modal) modal.classList.remove("active");
}

function dismissMobileInstallBanner() {
  const mobileBanner = document.getElementById("mobileInstallBanner");
  if (mobileBanner) mobileBanner.classList.add("hidden");
  sessionStorage.setItem("pwa_banner_dismissed", "1");
}

// 🌗 2. Theme Toggle (Dark/Light)
function initTheme() {
  const savedTheme = localStorage.getItem("theme") || "dark";
  document.documentElement.setAttribute("data-theme", savedTheme);
  updateThemeIcon(savedTheme);

  const themeToggleBtn = document.getElementById("themeToggle");
  if (themeToggleBtn) {
    themeToggleBtn.addEventListener("click", () => {
      const current = document.documentElement.getAttribute("data-theme") || "dark";
      const next = current === "dark" ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", next);
      localStorage.setItem("theme", next);
      updateThemeIcon(next);
    });
  }
}

function updateThemeIcon(theme) {
  const icon = document.getElementById("themeIcon");
  if (icon) {
    icon.className = theme === "dark" ? "fas fa-sun" : "fas fa-moon";
  }
}

// 📊 3. Visitor Tracking
async function trackVisitor() {
  try {
    await fetch("/api/track-visit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: window.location.pathname })
    });
  } catch (e) {}
}

// ⚙️ 4. Fetch Settings (Developer profile, WhatsApp, Facebook)
async function fetchSettings() {
  try {
    const res = await fetch("/api/settings?t=" + Date.now());
    if (!res.ok) return;
    const data = await res.json();

    if (data.developer_name) {
      document.querySelectorAll(".dev-name").forEach(el => el.textContent = data.developer_name);
    }
    if (data.developer_title) {
      document.querySelectorAll(".dev-title").forEach(el => el.textContent = data.developer_title);
    }
    if (data.developer_bio) {
      const bioEl = document.getElementById("devBio");
      if (bioEl) bioEl.textContent = data.developer_bio;
    }
    if (data.developer_avatar) {
      const avatarEl = document.getElementById("devAvatar");
      if (avatarEl) {
        avatarEl.src = data.developer_avatar;
        avatarEl.classList.remove("hidden");
      }
    }
    if (data.site_title) {
      document.title = data.site_title;
    }

    // 🟢 WhatsApp Link
    const whatsappLink = document.getElementById("whatsappLink");
    if (whatsappLink) {
      if (data.whatsapp_url && data.whatsapp_url.trim()) {
        let waUrl = data.whatsapp_url.trim();
        // If user provided just a phone number e.g. 967771234567 or +967...
        if (!waUrl.startsWith("http")) {
          let cleanNumber = waUrl.replace(/[^0-9]/g, "");
          if (cleanNumber.length === 9 && cleanNumber.startsWith("7")) {
            cleanNumber = "967" + cleanNumber;
          }
          waUrl = "https://wa.me/" + cleanNumber;
        }
        whatsappLink.href = waUrl;
        whatsappLink.classList.remove("hidden");
        whatsappLink.style.display = "inline-flex";
      } else {
        whatsappLink.classList.add("hidden");
      }
    }

    // 🔵 Facebook Link
    const facebookLink = document.getElementById("facebookLink");
    if (facebookLink) {
      if (data.facebook_url && data.facebook_url.trim()) {
        let fbUrl = data.facebook_url.trim();
        if (!fbUrl.startsWith("http")) {
          fbUrl = "https://" + fbUrl;
        }
        facebookLink.href = fbUrl;
        facebookLink.classList.remove("hidden");
        facebookLink.style.display = "inline-flex";
      } else {
        facebookLink.classList.add("hidden");
      }
    }

    // Play Store Link (if present)
    const playstoreLink = document.getElementById("playstoreLink");
    if (playstoreLink) {
      if (data.playstore_url && data.playstore_url.trim()) {
        playstoreLink.href = data.playstore_url;
        playstoreLink.classList.remove("hidden");
        playstoreLink.style.display = "inline-flex";
      } else {
        playstoreLink.classList.add("hidden");
      }
    }
  } catch (err) {
    console.error("Failed to load settings:", err);
  }
}

// 📱 5. Fetch Apps
async function fetchApps(category = "all", search = "") {
  const container = document.getElementById("appsContainer");
  const loading = document.getElementById("appsLoading");
  if (loading) loading.style.display = "block";
  if (container) container.innerHTML = "";

  try {
    let url = "/api/apps?t=" + Date.now() + "&category=" + encodeURIComponent(category);
    if (search) url += "&search=" + encodeURIComponent(search);

    const res = await fetch(url);
    const apps = await res.json();
    currentApps = apps;

    if (loading) loading.style.display = "none";
    renderApps(apps);
    updateStatsCounter(apps);
  } catch (err) {
    if (loading) loading.style.display = "none";
    if (container) {
      container.innerHTML = `
        <div class="col-span-full text-center py-12 text-red-400">
          <i class="fas fa-exclamation-triangle text-3xl mb-3"></i>
          <p>حدث خطأ أثناء تحميل التطبيقات، يرجى إعادة المحاولة لاحقاً.</p>
        </div>
      `;
    }
  }
}

// Render Apps Grid
function renderApps(apps) {
  const container = document.getElementById("appsContainer");
  if (!container) return;

  if (apps.length === 0) {
    container.innerHTML = `
      <div class="col-span-full text-center py-16 text-slate-400 glass-card p-8">
        <i class="fas fa-box-open text-5xl mb-4 opacity-50 text-blue-400"></i>
        <h3 class="text-xl font-bold mb-2 text-white">لا توجد تطبيقات متطابقة</h3>
        <p class="text-sm">جرب البحث بكلمات أخرى أو اختر تصنيفاً مختلفاً.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = apps.map(app => {
    const avgRating = parseFloat(app.average_rating || 0).toFixed(1);
    const reviewsCount = app.reviews_count || 0;
    const defaultIcon = "/icons/icon.svg";

    return `
      <div class="glass-card p-5 sm:p-6 app-card animate-fade-in flex flex-col justify-between" data-id="${app.id}">
        <div>
          <!-- Top Row: Icon + Title + Category -->
          <div class="flex items-start gap-3 sm:gap-4 mb-4">
            <img 
              src="${app.icon_url || defaultIcon}" 
              alt="${escapeHtml(app.title)}" 
              class="app-icon-img"
              onerror="this.src='${defaultIcon}'"
            />
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 mb-1 flex-wrap">
                <span class="badge badge-primary text-[11px]">${escapeHtml(app.category || 'أدوات')}</span>
                ${app.is_featured ? '<span class="badge badge-gold text-[11px]"><i class="fas fa-star text-[10px]"></i> مميز</span>' : ''}
              </div>
              <h3 class="text-base sm:text-lg font-bold text-white leading-tight truncate hover:text-blue-400 transition cursor-pointer" onclick="openAppModal(${app.id})">
                ${escapeHtml(app.title)}
              </h3>
              <p class="text-xs text-slate-400 mt-1">الإصدار: ${escapeHtml(app.version || '1.0.0')}</p>
            </div>
          </div>

          <!-- Summary -->
          <p class="text-xs sm:text-sm text-slate-300 line-clamp-2 mb-4 leading-relaxed">
            ${escapeHtml(app.summary || app.description || 'لا يوجد وصف متاح.')}
          </p>
        </div>

        <!-- Card Footer Info & Buttons -->
        <div class="pt-4 border-t border-slate-700/50 mt-auto">
          <!-- Rating & Downloads -->
          <div class="flex items-center justify-between text-xs text-slate-400 mb-4">
            <div class="flex items-center gap-1.5 bg-slate-800/80 px-2.5 py-1 rounded-lg">
              <i class="fas fa-star text-yellow-400 text-xs"></i>
              <span class="font-bold text-white">${avgRating}</span>
              <span>(${reviewsCount})</span>
            </div>
            <div class="flex items-center gap-1.5 bg-slate-800/80 px-2.5 py-1 rounded-lg">
              <i class="fas fa-download text-emerald-400 text-xs"></i>
              <span class="font-bold text-white">${app.downloads_count || 0}</span>
              <span>تنزيل</span>
            </div>
            <div class="flex items-center gap-1 bg-slate-800/80 px-2.5 py-1 rounded-lg">
              <i class="fas fa-hdd text-blue-400 text-xs"></i>
              <span>${escapeHtml(app.file_size || '15 MB')}</span>
            </div>
          </div>

          <!-- Action Buttons -->
          <div class="grid grid-cols-2 gap-2">
            <button onclick="openAppModal(${app.id})" class="btn-secondary text-xs py-2.5 w-full">
              <i class="fas fa-info-circle"></i> التفاصيل
            </button>
            <button onclick="triggerDownload(${app.id})" class="btn-primary text-xs py-2.5 w-full">
              <i class="fas fa-download"></i> تحميل APK
            </button>
          </div>
        </div>
      </div>
    `;
  }).join("");
}

// Update Hero Stats
function updateStatsCounter(apps) {
  const totalAppsEl = document.getElementById("heroTotalApps");
  const totalDownloadsEl = document.getElementById("heroTotalDownloads");
  
  if (totalAppsEl) totalAppsEl.textContent = apps.length;
  if (totalDownloadsEl) {
    const totalDownloads = apps.reduce((sum, a) => sum + (a.downloads_count || 0), 0);
    totalDownloadsEl.textContent = totalDownloads.toLocaleString();
  }
}

// 📱 6. Open App Details Modal
async function openAppModal(appId) {
  const modal = document.getElementById("appModal");
  const modalBody = document.getElementById("appModalBody");
  if (!modal || !modalBody) return;

  modalBody.innerHTML = `
    <div class="p-12 text-center text-slate-400">
      <i class="fas fa-spinner fa-spin text-3xl mb-3 text-blue-500"></i>
      <p>جارٍ تحميل تفاصيل التطبيق...</p>
    </div>
  `;
  modal.classList.add("active");

  try {
    const res = await fetch("/api/apps/" + appId + "?t=" + Date.now());
    if (!res.ok) throw new Error("تعذر جلب التطبيق");
    const app = await res.json();
    selectedApp = app;

    renderModalContent(app);
  } catch (err) {
    modalBody.innerHTML = `
      <div class="p-8 text-center text-red-400">
        <p>تعذر تحميل بيانات التطبيق، يرجى المحاولة مرة أخرى.</p>
      </div>
    `;
  }
}

function renderModalContent(app) {
  const modalBody = document.getElementById("appModalBody");
  if (!modalBody) return;

  const defaultIcon = "/icons/icon.svg";
  const avgRating = parseFloat(app.average_rating || 0).toFixed(1);
  const reviewsCount = app.reviews_count || 0;

  // Render Screenshots Gallery
  let screenshotsHtml = "";
  if (app.screenshots && app.screenshots.length > 0) {
    screenshotsHtml = `
      <div class="mb-8">
        <h4 class="text-sm sm:text-base font-bold mb-3 flex items-center gap-2 text-white">
          <i class="fas fa-images text-blue-400"></i> لقطات الشاشة
        </h4>
        <div class="flex gap-4 overflow-x-auto pb-4 pt-1 snap-x scrollbar-none">
          ${app.screenshots.map(url => `
            <img 
              src="${url}" 
              alt="Screenshot" 
              class="screenshot-thumbnail snap-center shadow-lg"
              onclick="window.open('${url}', '_blank')"
            />
          `).join("")}
        </div>
      </div>
    `;
  }

  // Render Reviews List
  let reviewsListHtml = "";
  if (app.reviews && app.reviews.length > 0) {
    reviewsListHtml = app.reviews.map(r => `
      <div class="bg-slate-800/60 p-4 rounded-xl border border-slate-700/50 mb-3">
        <div class="flex items-center justify-between mb-2">
          <div class="flex items-center gap-2">
            <div class="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center font-bold text-white text-xs">
              ${escapeHtml(r.author_name.charAt(0).toUpperCase())}
            </div>
            <div>
              <div class="font-bold text-sm text-white">${escapeHtml(r.author_name)}</div>
              <div class="text-[11px] text-slate-400">${new Date(r.created_at).toLocaleDateString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric' })}</div>
            </div>
          </div>
          <div class="star-rating text-xs">
            ${renderStars(r.rating)}
          </div>
        </div>
        <p class="text-sm text-slate-300 leading-relaxed pr-2">${escapeHtml(r.comment)}</p>
      </div>
    `).join("");
  } else {
    reviewsListHtml = `
      <div class="text-center py-6 text-slate-400 bg-slate-800/30 rounded-xl border border-dashed border-slate-700">
        <i class="far fa-comment-dots text-3xl mb-2 opacity-50"></i>
        <p class="text-sm">كن أول من يكتب تقييماً وتعليقاً لهذا التطبيق!</p>
      </div>
    `;
  }

  modalBody.innerHTML = `
    <!-- Header -->
    <div class="p-5 sm:p-8 border-b border-slate-700/50 flex flex-col md:flex-row items-start md:items-center justify-between gap-6 bg-slate-800/40">
      <div class="flex items-center gap-4 sm:gap-5">
        <img 
          src="${app.icon_url || defaultIcon}" 
          alt="${escapeHtml(app.title)}" 
          class="w-16 h-16 sm:w-24 sm:h-24 rounded-2xl object-cover border-2 border-slate-600 shadow-xl"
          onerror="this.src='${defaultIcon}'"
        />
        <div>
          <div class="flex items-center gap-2 mb-1.5 flex-wrap">
            <span class="badge badge-primary text-xs">${escapeHtml(app.category || 'أدوات')}</span>
            <span class="badge badge-green text-xs"><i class="fab fa-android"></i> ${escapeHtml(app.min_android || 'Android 8.0+')}</span>
          </div>
          <h2 class="text-lg sm:text-2xl font-black text-white mb-1 leading-snug">${escapeHtml(app.title)}</h2>
          <p class="text-xs text-slate-400">${escapeHtml(app.package_name || 'com.android.app')}</p>
        </div>
      </div>

      <!-- Quick Action Download -->
      <div class="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto">
        <button onclick="triggerDownload(${app.id})" class="btn-primary w-full md:w-auto py-3 px-6 text-sm">
          <i class="fas fa-download"></i> تحميل APK (${escapeHtml(app.file_size || '15 MB')})
        </button>
        ${app.playstore_link ? `
          <a href="${app.playstore_link}" target="_blank" class="btn-secondary w-full md:w-auto py-3 px-5 text-sm">
            <i class="fab fa-google-play text-emerald-400"></i> Google Play
          </a>
        ` : ''}
      </div>
    </div>

    <!-- Body -->
    <div class="p-5 sm:p-8 space-y-6 sm:space-y-8">
      <!-- App Meta Grid -->
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div class="bg-slate-800/60 p-3 rounded-xl border border-slate-700 text-center">
          <div class="text-xs text-slate-400 mb-1">الإصدار</div>
          <div class="font-bold text-white text-sm">${escapeHtml(app.version || '1.0.0')}</div>
        </div>
        <div class="bg-slate-800/60 p-3 rounded-xl border border-slate-700 text-center">
          <div class="text-xs text-slate-400 mb-1">الحجم</div>
          <div class="font-bold text-white text-sm">${escapeHtml(app.file_size || '15 MB')}</div>
        </div>
        <div class="bg-slate-800/60 p-3 rounded-xl border border-slate-700 text-center">
          <div class="text-xs text-slate-400 mb-1">التقييم</div>
          <div class="font-bold text-yellow-400 text-sm flex items-center justify-center gap-1">
            <i class="fas fa-star text-xs"></i> ${avgRating} / 5
          </div>
        </div>
        <div class="bg-slate-800/60 p-3 rounded-xl border border-slate-700 text-center">
          <div class="text-xs text-slate-400 mb-1">التنزيلات</div>
          <div class="font-bold text-emerald-400 text-sm" id="modalDownloadCounter">${app.downloads_count || 0}</div>
        </div>
      </div>

      <!-- Screenshots -->
      ${screenshotsHtml}

      <!-- Full Description -->
      <div>
        <h4 class="text-sm sm:text-base font-bold mb-3 flex items-center gap-2 text-white">
          <i class="fas fa-align-right text-blue-400"></i> عن هذا التطبيق
        </h4>
        <div class="bg-slate-800/40 p-4 sm:p-5 rounded-2xl border border-slate-700 text-slate-300 text-xs sm:text-sm leading-relaxed whitespace-pre-line">
          ${escapeHtml(app.description || app.summary || 'لا يوجد وصف مفصل لهذا التطبيق.')}
        </div>
      </div>

      <!-- Ratings & Reviews Section -->
      <div class="pt-6 border-t border-slate-700/60">
        <div class="flex items-center justify-between mb-6 flex-wrap gap-2">
          <h4 class="text-base sm:text-lg font-bold flex items-center gap-2 text-white">
            <i class="fas fa-comments text-blue-400"></i> التعليقات والتقييمات (${reviewsCount})
          </h4>
          <div class="flex items-center gap-2">
            <span class="text-xl sm:text-2xl font-black text-white">${avgRating}</span>
            <div class="star-rating text-sm">
              ${renderStars(Math.round(parseFloat(avgRating)))}
            </div>
          </div>
        </div>

        <!-- Add Review Form -->
        <form id="addReviewForm" onsubmit="submitReview(event, ${app.id})" class="bg-slate-800/80 p-4 sm:p-5 rounded-2xl border border-slate-700 mb-6">
          <h5 class="text-sm font-bold text-white mb-3">أضف تقييمك ورأيك:</h5>
          
          <div class="flex items-center gap-2 mb-4">
            <span class="text-xs text-slate-400">اختر التقييم:</span>
            <div class="flex gap-1" id="interactiveStarContainer">
              ${[1, 2, 3, 4, 5].map(star => `
                <i class="fas fa-star star-interactive ${star <= 5 ? 'active' : ''}" data-value="${star}" onclick="setRating(${star})"></i>
              `).join("")}
            </div>
            <span class="text-xs font-bold text-yellow-400 mr-2" id="ratingScoreText">5 من 5</span>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
            <div>
              <label class="block text-xs text-slate-400 mb-1">اسمك الكريم *</label>
              <input type="text" id="reviewAuthor" required placeholder="مثال: أحمد عبد الله" class="text-sm" />
            </div>
          </div>

          <div class="mb-4">
            <label class="block text-xs text-slate-400 mb-1">تعليقك أو رأيك بالتطبيق *</label>
            <textarea id="reviewComment" rows="3" required placeholder="اكتب رأيك هنا حول مميزات التطبيق أو اقتراحاتك للتحسين..." class="text-sm"></textarea>
          </div>

          <button type="submit" class="btn-success text-sm py-2 px-6" id="submitReviewBtn">
            <i class="fas fa-paper-plane"></i> إرسال التقييم
          </button>
        </form>

        <!-- Reviews List -->
        <div id="reviewsListContainer" class="space-y-3">
          ${reviewsListHtml}
        </div>
      </div>
    </div>
  `;

  currentRating = 5;
}

// 🌟 7. Interactive Star Selector
function setRating(val) {
  currentRating = val;
  const stars = document.querySelectorAll("#interactiveStarContainer .star-interactive");
  stars.forEach((star, index) => {
    if (index < val) {
      star.classList.add("active");
    } else {
      star.classList.remove("active");
    }
  });

  const ratingText = document.getElementById("ratingScoreText");
  if (ratingText) ratingText.textContent = val + " من 5";
}

// 💬 8. Submit Review
async function submitReview(e, appId) {
  e.preventDefault();
  const btn = document.getElementById("submitReviewBtn");
  const authorInput = document.getElementById("reviewAuthor");
  const commentInput = document.getElementById("reviewComment");

  if (!authorInput || !commentInput) return;

  btn.disabled = true;
  btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> جارٍ الإرسال...`;

  try {
    const res = await fetch("/api/apps/" + appId + "/reviews", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        author_name: authorInput.value.trim(),
        rating: currentRating,
        comment: commentInput.value.trim()
      })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "تعذر إرسال التقييم");

    alert("✨ شكراً جزيلاً لك! تم حفظ تقييمك بنجاح.");
    authorInput.value = "";
    commentInput.value = "";

    // Refresh Modal and background list
    openAppModal(appId);
    fetchApps();
  } catch (err) {
    alert(err.message || "حدث خطأ أثناء إرسال التقييم");
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<i class="fas fa-paper-plane"></i> إرسال التقييم`;
  }
}

// ⬇️ 9. Download Trigger and Tracking
async function triggerDownload(appId) {
  try {
    const res = await fetch("/api/apps/" + appId + "/download", { method: "POST" });
    const data = await res.json();
    
    // Update local counter on modal if open
    const modalCounter = document.getElementById("modalDownloadCounter");
    if (modalCounter) {
      modalCounter.textContent = parseInt(modalCounter.textContent || "0") + 1;
    }

    if (data.downloadUrl && data.downloadUrl !== "#") {
      const link = document.createElement("a");
      link.href = data.downloadUrl;
      link.download = "";
      link.target = "_blank";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } else {
      alert("رابط التحميل المباشر غير متوفر حالياً لهذا التطبيق.");
    }
  } catch (err) {
    console.error("Download error:", err);
  }
}

// Helper: Render Stars
function renderStars(rating) {
  let starsHtml = "";
  for (let i = 1; i <= 5; i++) {
    if (i <= rating) {
      starsHtml += `<i class="fas fa-star text-yellow-400"></i>`;
    } else {
      starsHtml += `<i class="far fa-star text-slate-500"></i>`;
    }
  }
  return starsHtml;
}

// Helper: Escape HTML
function escapeHtml(text) {
  if (!text) return "";
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// 10. Setup Event Listeners
function setupEventListeners() {
  // Category filter tabs
  document.querySelectorAll(".category-tab").forEach(tab => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".category-tab").forEach(t => {
        t.classList.remove("bg-blue-600", "text-white");
        t.classList.add("bg-slate-800", "text-slate-300");
      });
      tab.classList.remove("bg-slate-800", "text-slate-300");
      tab.classList.add("bg-blue-600", "text-white");

      const category = tab.getAttribute("data-category") || "all";
      const searchInputEl = document.getElementById("searchInput");
      const search = searchInputEl ? searchInputEl.value : "";
      fetchApps(category, search);
    });
  });

  // Search input with debounce
  const searchInput = document.getElementById("searchInput");
  let debounceTimeout = null;
  if (searchInput) {
    searchInput.addEventListener("input", (e) => {
      clearTimeout(debounceTimeout);
      debounceTimeout = setTimeout(() => {
        const activeTab = document.querySelector(".category-tab.bg-blue-600");
        const category = activeTab ? (activeTab.getAttribute("data-category") || "all") : "all";
        fetchApps(category, e.target.value);
      }, 300);
    });
  }

  // Close modal on click outside or close button
  const modal = document.getElementById("appModal");
  const modalCloseBtn = document.getElementById("modalCloseBtn");
  if (modalCloseBtn && modal) {
    modalCloseBtn.addEventListener("click", () => modal.classList.remove("active"));
  }
  if (modal) {
    modal.addEventListener("click", (e) => {
      if (e.target === modal) modal.classList.remove("active");
    });
  }

  // Install guide modal close
  const guideModal = document.getElementById("installGuideModal");
  const guideModalClose = document.getElementById("closeInstallGuideBtn");
  if (guideModalClose && guideModal) {
    guideModalClose.addEventListener("click", closeInstallGuideModal);
  }
  if (guideModal) {
    guideModal.addEventListener("click", (e) => {
      if (e.target === guideModal) closeInstallGuideModal();
    });
  }
}
