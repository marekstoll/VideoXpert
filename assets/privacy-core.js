(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.VXPrivacyCore = api;
})(typeof window === "undefined" ? globalThis : window, function () {
  "use strict";
  const STORAGE_KEY = "vx_privacy_v2";
  const DAY = 86400000;

  function analyticsAvailable(config) {
    return config.analyticsEnabled === true && /^G-[A-Z0-9]{6,20}$/.test(config.measurementId || "");
  }

  function parseConsent(raw, config, now) {
    try {
      const s = typeof raw === "string" ? JSON.parse(raw) : raw;
      if (!s || s.version !== config.consentVersion || s.necessary !== true ||
          typeof s.analytics !== "boolean" || typeof s.youtube !== "boolean" ||
          !Number.isFinite(s.createdAt) || !Number.isFinite(s.expiresAt) ||
          s.createdAt > now || s.expiresAt <= now || s.expiresAt <= s.createdAt ||
          s.expiresAt - s.createdAt > config.consentDays * DAY) return null;
      return {version: s.version, necessary: true, analytics: s.analytics,
        youtube: s.youtube, createdAt: s.createdAt, expiresAt: s.expiresAt};
    } catch (_) { return null; }
  }

  function makeConsent(choices, config, now) {
    return {version: config.consentVersion, necessary: true,
      analytics: analyticsAvailable(config) && choices.analytics === true,
      youtube: choices.youtube === true, createdAt: now,
      expiresAt: now + config.consentDays * DAY};
  }

  function clearAnalyticsCookies(doc, location) {
    const names = new Set(["_ga"]);
    try {
      doc.cookie.split(";").forEach(part => {
        const name = part.trim().split("=")[0];
        if (/^_ga(?:_|$)/.test(name)) names.add(name);
      });
    } catch (_) { return; }
    const domains = new Set([""]);
    const host = location.hostname;
    if (host && host !== "localhost" && !/^[\d.]+$/.test(host)) {
      const parts = host.split(".");
      for (let i = 0; i < parts.length - 1; i++) {
        domains.add(parts.slice(i).join("."));
        domains.add("." + parts.slice(i).join("."));
      }
    }
    const paths = new Set(["/", "/assets", "/assets/"]);
    const segments = location.pathname.split("/").filter(Boolean);
    for (let i = 1; i <= segments.length; i++) {
      paths.add("/" + segments.slice(0, i).join("/"));
      paths.add("/" + segments.slice(0, i).join("/") + "/");
    }
    names.forEach(name => domains.forEach(domain => paths.forEach(path => {
      try {
        doc.cookie = name + "=; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Path=" + path +
          (domain ? "; Domain=" + domain : "") + "; SameSite=Lax" +
          (location.protocol === "https:" ? "; Secure" : "");
      } catch (_) { /* Nedostupné úložiště nesmí blokovat web. */ }
    })));
  }

  function pageContext(location, config) {
    const path = location.pathname.replace(/\/index\.html$/, "/");
    return config.pages[path] || null;
  }

  function createAnalytics(win, doc, config, consent) {
    const id = config.measurementId;
    const page = pageContext(win.location, config);
    let loaded = false, loading = false, configured = false, pageViewSent = false;
    function allowed() {
      const s = consent();
      return analyticsAvailable(config) && !!page && !!s && s.analytics === true;
    }
    function disable() {
      if (id) win["ga-disable-" + id] = true;
      clearAnalyticsCookies(doc, win.location);
    }
    function configure() {
      if (!allowed() || !loaded) return;
      win["ga-disable-" + id] = false;
      if (!configured) {
        win.gtag("consent", "default", {analytics_storage: "granted", ad_storage: "denied",
          ad_user_data: "denied", ad_personalization: "denied"});
        win.gtag("js", new Date());
        win.gtag("config", id, {
          send_page_view: false, page_location: page.url, page_title: page.title,
          page_referrer: "", ignore_referrer: true,
          allow_google_signals: false, allow_ad_personalization_signals: false,
          cookie_expires: config.consentDays * 86400, cookie_update: false,
          cookie_flags: "SameSite=Lax;Secure", cookie_path: "/"
        });
        configured = true;
      }
      if (!pageViewSent) {
        win.gtag("event", "page_view", {send_to: id, page_location: page.url,
          page_title: page.title, page_referrer: ""});
        pageViewSent = true;
      }
    }
    function sync() {
      if (!allowed()) { disable(); return; }
      win["ga-disable-" + id] = false;
      if (loaded) { configure(); return; }
      if (loading) return;
      loading = true;
      win.dataLayer = win.dataLayer || [];
      win.gtag = win.gtag || function () { win.dataLayer.push(arguments); };
      const tag = doc.createElement("script");
      tag.id = "vx-ga4-tag";
      tag.async = true;
      tag.referrerPolicy = "origin";
      tag.src = "https://www.googletagmanager.com/gtag/js?id=" + encodeURIComponent(id);
      tag.onload = function () { loading = false; loaded = true; configure(); };
      tag.onerror = function () { loading = false; tag.remove(); };
      doc.head.appendChild(tag);
    }
    function event(name) {
      if (!allowed() || !loaded || !configured ||
          !["contact_email", "contact_phone", "inquiry_click"].includes(name)) return;
      win.gtag("event", name, {send_to: id, page_location: page.url,
        page_title: page.title, page_referrer: ""});
    }
    return {sync: sync, event: event};
  }
  return {STORAGE_KEY: STORAGE_KEY, analyticsAvailable: analyticsAvailable,
    parseConsent: parseConsent, makeConsent: makeConsent, createAnalytics: createAnalytics,
    clearAnalyticsCookies: clearAnalyticsCookies, pageContext: pageContext};
});
