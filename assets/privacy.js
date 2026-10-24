(function () {
  "use strict";
  const config = window.VX_CONFIG, core = window.VXPrivacyCore;
  if (!config || !core) return;
  const overlay = document.getElementById("cookieOverlay");
  if (!overlay) return;
  const dialog = overlay.querySelector('[role="dialog"]');
  const settings = document.getElementById("cookieSettings");
  const analyticsInput = document.getElementById("analyticsCookies");
  const youtubeInput = document.getElementById("youtubeCookies");
  const analyticsOn = core.analyticsAvailable(config);
  let state = null, expiryTimer = null, lastFocus = null, oldOverflow = "", inertItems = [];
  function read() {
    try { return core.parseConsent(localStorage.getItem(core.STORAGE_KEY), config, Date.now()); }
    catch (_) { return null; }
  }
  state = read();
  try { localStorage.removeItem("vx_cookie_consent"); } catch (_) { /* Starý souhlas nepřebíráme. */ }
  function current() { return core.parseConsent(state, config, Date.now()); }
  const analytics = core.createAnalytics(window, document, config, current);
  function mediaAllowed() { const s = current(); return !!s && s.youtube; }

  function updateThumbnail(box, button, permitted) {
    const image = button.querySelector("img"), id = box.dataset.youtubeId;
    if (!image || !/^[A-Za-z0-9_-]{11}$/.test(id)) return;
    if (!image.dataset.vxLocalPoster) image.dataset.vxLocalPoster = image.getAttribute("src");
    const mode = permitted ? "youtube" : "local";
    if (image.dataset.vxPosterMode === mode) return;
    image.dataset.vxPosterMode = mode;
    image.onload = null;
    image.onerror = null;
    if (!permitted) {
      if (image.getAttribute("src") !== image.dataset.vxLocalPoster) image.src = image.dataset.vxLocalPoster;
      return;
    }
    let fallbackUsed = false;
    function fallback() {
      if (!mediaAllowed() || image.dataset.vxPosterMode !== "youtube") return;
      if (!fallbackUsed) {
        fallbackUsed = true;
        image.src = "https://i.ytimg.com/vi/" + id + "/hqdefault.jpg";
      } else {
        image.onload = null;
        image.onerror = null;
        image.src = image.dataset.vxLocalPoster;
      }
    }
    image.referrerPolicy = "no-referrer";
    image.onerror = fallback;
    image.onload = function () { if (image.naturalWidth <= 120) fallback(); };
    image.src = "https://i.ytimg.com/vi/" + id + "/maxresdefault.jpg";
  }

  function updateMedia() {
    const permitted = mediaAllowed();
    document.querySelectorAll("[data-youtube-id]").forEach(box => {
      const button = box.querySelector(".vx-video-play");
      if (!permitted) {
        box.querySelectorAll("iframe").forEach(frame => frame.remove());
        if (button) button.hidden = false;
      }
      if (!button) return;
      updateThumbnail(box, button, permitted);
      button.setAttribute("aria-label", (permitted ? "Přehrát: " : "Povolit YouTube a přehrát: ") + box.dataset.videoTitle);
      button.querySelector(".vx-video-action").textContent = permitted ? "Přehrát video" : "Povolit YouTube a přehrát";
      button.querySelector(".vx-video-notice").textContent = permitted ?
        "Náhled se načítá z YouTube. Souhlas lze změnit v patičce." :
        "Kliknutím povolíte spojení s Googlem, předání IP adresy a použití úložiště YouTube. Analytiku tím nepovolujete.";
    });
  }
  function armExpiry() {
    clearTimeout(expiryTimer);
    const s = current();
    if (!s) return;
    expiryTimer = setTimeout(function () {
      if (!current()) {
        state = null;
        try { localStorage.removeItem(core.STORAGE_KEY); } catch (_) {}
        apply();
        if (!document.body.hasAttribute("data-vx-no-auto-consent")) show(false);
      } else armExpiry();
    }, Math.min(s.expiresAt - Date.now() + 1, 2147483000));
  }
  function apply() { analytics.sync(); updateMedia(); armExpiry(); }
  function save(choices) {
    state = core.makeConsent(choices, config, Date.now());
    try { localStorage.setItem(core.STORAGE_KEY, JSON.stringify(state)); } catch (_) {}
    apply();
  }
  function show(details) {
    if (overlay.hidden) {
      lastFocus = document.activeElement;
      oldOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      inertItems = [...document.body.children].filter(el => el !== overlay && !["SCRIPT", "STYLE", "LINK"].includes(el.tagName))
        .map(el => ({el: el, inert: el.inert}));
      inertItems.forEach(item => { item.el.inert = true; });
    }
    const s = current();
    analyticsInput.checked = !!s && s.analytics && analyticsOn;
    youtubeInput.checked = !!s && s.youtube;
    settings.hidden = !details;
    document.getElementById("cookieSettingsBtn").setAttribute("aria-expanded", String(!!details));
    overlay.hidden = false;
    overlay.classList.add("is-visible");
    dialog.focus({preventScroll: true});
  }
  function hide() {
    if (overlay.hidden) return;
    overlay.hidden = true;
    overlay.classList.remove("is-visible");
    inertItems.forEach(item => { item.el.inert = item.inert; });
    inertItems = [];
    document.body.style.overflow = oldOverflow;
    if (lastFocus && lastFocus.isConnected && typeof lastFocus.focus === "function") lastFocus.focus({preventScroll: true});
  }
  document.getElementById("cookieAcceptAll").addEventListener("click", function () {
    save({analytics: analyticsOn, youtube: true}); hide();
  });
  document.getElementById("cookieRejectAll").addEventListener("click", function () {
    save({analytics: false, youtube: false}); hide();
  });
  document.getElementById("cookieSaveSelected").addEventListener("click", function () {
    save({analytics: analyticsInput.checked, youtube: youtubeInput.checked}); hide();
  });
  document.getElementById("cookieSettingsBtn").addEventListener("click", function () {
    settings.hidden = !settings.hidden;
    this.setAttribute("aria-expanded", String(!settings.hidden));
  });
  document.getElementById("cookieClose").addEventListener("click", hide);
  document.querySelectorAll("[data-vx-cookie-settings]").forEach(button => {
    button.hidden = false;
    button.addEventListener("click", function () { show(true); });
  });
  document.querySelectorAll("[data-vx-analytics-only]").forEach(el => { el.hidden = !analyticsOn; });
  document.querySelectorAll("[data-vx-analytics-off]").forEach(el => { el.hidden = analyticsOn; });
  analyticsInput.disabled = !analyticsOn;
  document.addEventListener("keydown", function (event) {
    if (overlay.hidden) return;
    if (event.key === "Escape") { event.preventDefault(); event.stopImmediatePropagation(); hide(); return; }
    if (event.key !== "Tab") return;
    const elements = [...dialog.querySelectorAll('button:not([disabled]), a[href], input:not([disabled]), [tabindex="0"]')]
      .filter(el => !el.closest("[hidden]") && el.getClientRects().length);
    if (!elements.length) { event.preventDefault(); dialog.focus(); return; }
    const first = elements[0], last = elements[elements.length - 1];
    if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) {
      event.preventDefault(); last.focus();
    } else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) {
      event.preventDefault(); first.focus();
    }
  }, true);
  document.addEventListener("focusin", function (event) {
    if (!overlay.hidden && !dialog.contains(event.target)) dialog.focus({preventScroll: true});
  });
  document.querySelectorAll("[data-youtube-id]").forEach(box => {
    const button = box.querySelector(".vx-video-play");
    if (!button) return;
    button.addEventListener("click", function () {
      const id = box.dataset.youtubeId;
      if (!/^[A-Za-z0-9_-]{11}$/.test(id) || box.querySelector("iframe")) return;
      if (!mediaAllowed()) save({analytics: !!current() && current().analytics, youtube: true});
      const frame = document.createElement("iframe");
      frame.title = box.dataset.videoTitle;
      frame.allow = "autoplay; encrypted-media; picture-in-picture; fullscreen";
      frame.allowFullscreen = true;
      frame.referrerPolicy = "strict-origin-when-cross-origin";
      frame.src = "https://www.youtube-nocookie.com/embed/" + id + "?autoplay=1&playsinline=1&rel=0";
      button.hidden = true;
      box.appendChild(frame);
      frame.focus();
    });
  });
  document.addEventListener("click", function (event) {
    const link = event.target.closest && event.target.closest("a[href]");
    if (!link) return;
    const href = link.getAttribute("href") || "";
    if (href.startsWith("mailto:")) analytics.event("contact_email");
    else if (href.startsWith("tel:")) analytics.event("contact_phone");
    else if (link.matches('[data-vx-inquiry]')) analytics.event("inquiry_click");
  });
  window.addEventListener("storage", function (event) {
    if (event.key !== core.STORAGE_KEY && event.key !== null) return;
    state = read(); apply();
  });
  window.addEventListener("pageshow", function (event) {
    if (event.persisted) { state = read(); apply(); }
  });
  document.addEventListener("visibilitychange", function () {
    if (!document.hidden && state && !current()) { state = null; apply(); }
  });
  apply();
  if (!current() && !document.body.hasAttribute("data-vx-no-auto-consent")) show(false);
})();
