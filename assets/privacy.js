(function () {
  "use strict";
  const config = window.VX_CONFIG, core = window.VXPrivacyCore;
  if (!config || !core) return;
  const overlay = document.getElementById("cookieOverlay");
  if (!overlay) return;
  const dialog = overlay.querySelector('[role="dialog"]');
  const settings = document.getElementById("cookieSettings");
  const analyticsInput = document.getElementById("analyticsCookies");
  const mediaConsent = document.getElementById("vxMediaConsent");
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

  function updateThumbnail(box, button) {
    const image = button.querySelector("img"), id = box.dataset.youtubeId;
    if (!image || !/^[A-Za-z0-9_-]{11}$/.test(id)) return;
    if (!image.dataset.vxLocalPoster) image.dataset.vxLocalPoster = image.getAttribute("src");
    if (image.dataset.vxPosterReady === "true") return;
    image.dataset.vxPosterReady = "true";
    image.onload = null;
    image.onerror = null;
    let fallbackUsed = false;
    function fallback() {
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
    const source = "https://i.ytimg.com/vi/" + id + "/maxresdefault.jpg";
    if (image.getAttribute("src") !== source) image.src = source;
    else if (image.complete && image.naturalWidth <= 120) fallback();
  }

  function updateMedia() {
    const permitted = mediaAllowed();
    if (mediaConsent) mediaConsent.hidden = !permitted;
    document.querySelectorAll("[data-youtube-id]").forEach(box => {
      const button = box.querySelector(".vx-video-play");
      if (!permitted) {
        box.querySelectorAll("iframe").forEach(frame => frame.remove());
        if (button) button.hidden = false;
      }
      if (!button) return;
      updateThumbnail(box, button);
      button.setAttribute("aria-label", "Přehrát video: " + box.dataset.videoTitle);
      button.querySelector(".vx-video-action").textContent = "Přehrát video";
      button.querySelector(".vx-video-notice").textContent = permitted ?
        "Přehrávač YouTube se načte po kliknutí. Povolení lze odvolat v nastavení cookies." :
        "Kliknutím povolíte přehrávač YouTube, předání IP adresy Googlu a použití jeho úložiště. Analytiku tím nepovolujete.";
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
  function save(choices, preserveExpiry) {
    const previous = current();
    state = core.makeConsent(choices, config, Date.now());
    if (preserveExpiry && previous) {
      state.createdAt = previous.createdAt;
      state.expiresAt = previous.expiresAt;
    }
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
    if (mediaConsent) mediaConsent.hidden = !mediaAllowed();
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
    save({analytics: analyticsOn, youtube: mediaAllowed()}); hide();
  });
  document.getElementById("cookieRejectAll").addEventListener("click", function () {
    save({analytics: false, youtube: false}); hide();
  });
  document.getElementById("cookieSaveSelected").addEventListener("click", function () {
    save({analytics: analyticsInput.checked, youtube: mediaAllowed()}); hide();
  });
  document.getElementById("cookieRevokeMedia").addEventListener("click", function () {
    save({analytics: !!current() && current().analytics, youtube: false}, true);
    document.getElementById("cookieSaveSelected").focus({preventScroll: true});
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
      if (!mediaAllowed()) save({analytics: !!current() && current().analytics, youtube: true}, true);
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
