(function () {
  "use strict";

  // Google Analytics 4で発行された測定IDへ置き換えてください。
  const measurementId = "G-XXXXXXXXXX";

  if (!/^G-[A-Z0-9]+$/.test(measurementId) || measurementId === "G-XXXXXXXXXX") {
    return;
  }

  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function () {
    window.dataLayer.push(arguments);
  };

  window.gtag("js", new Date());
  window.gtag("config", measurementId);

  const script = document.createElement("script");
  script.async = true;
  script.src = "https://www.googletagmanager.com/gtag/js?id=" + encodeURIComponent(measurementId);
  document.head.appendChild(script);

  document.addEventListener("click", function (event) {
    const target = event.target.closest("a, button");
    if (!target) return;

    const href = target.getAttribute("href") || "";
    let eventName = target.dataset.analyticsEvent || "navigation_click";

    if (!target.dataset.analyticsEvent) {
      if (href.startsWith("tel:")) eventName = "phone_click";
      else if (href.includes("google.com/maps")) eventName = "map_click";
      else if (/^(kadogawa|furukawa|center|ebisu|nobeoka)\.html/.test(href)) eventName = "store_page_click";
      else if (href.startsWith("#")) eventName = "section_navigation";
    }

    window.gtag("event", eventName, {
      link_text: (target.textContent || "").trim().replace(/\s+/g, " ").slice(0, 100),
      link_url: href,
      store: target.dataset.store || "",
      location: target.dataset.analyticsLocation || "",
      page_title: document.title,
      page_path: window.location.pathname
    });
  });
})();
