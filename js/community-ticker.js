(function () {
  "use strict";

  var ticker = document.querySelector("[data-community-ticker]");
  if (!ticker) return;
  var client = window.tenGrandSupabase;
  var sources = [];
  var broadcasts = [];
  var campaignItems = {};
  var channels = [];
  var signature = "";
  var refreshing = false;
  var refreshAgain = false;
  var stopped = false;
  var timer;

  function timestamp(value) {
    return Date.parse(value) || 0;
  }

  function render(unavailable) {
    var items = broadcasts.map(function (row) {
      return { id: "broadcast:" + row.id, date: timestamp(row.created_at), text: "Broadcast: " + row.title };
    });
    sources.forEach(function (source) {
      items = items.concat(campaignItems[source.id] || []);
    });
    items.sort(function (a, b) { return b.date - a.date || a.id.localeCompare(b.id); });
    items = items.slice(0, 20);
    var labels = items.map(function (item) { return item.text; });
    if (!labels.length) labels = [unavailable ? "Community updates are temporarily unavailable" : "Waiting for community updates"];
    var nextSignature = JSON.stringify(labels);
    if (signature === nextSignature) return;
    signature = nextSignature;
    var group = document.createElement("span");
    group.className = "cw-ticker__group";
    labels.forEach(function (label) {
      var item = document.createElement("span");
      item.className = "cw-ticker__item";
      // Names and titles are always plain text, never HTML.
      item.textContent = label;
      group.appendChild(item);
    });
    var duplicate = group.cloneNode(true);
    duplicate.setAttribute("aria-hidden", "true");
    ticker.replaceChildren(group, duplicate);
  }

  function subscribe() {
    if (!client || stopped) return;
    channels.forEach(function (channel) { client.removeChannel(channel); });
    channels = sources.map(function (source) {
      return client.channel("community-ticker:" + source.id)
        .on("postgres_changes", { event: "*", schema: "public", table: source.table }, function () {
          // Re-query public rows instead of rendering potentially private event payloads.
          refresh();
        }).subscribe();
    });
  }

  async function loadCampaign(source) {
    if (!client) throw new Error("Community database unavailable");
    var fields = ["id", source.name_field, source.date_field].join(",");
    var query = client.from(source.table).select(fields);
    if (source.status_field) query = query.eq(source.status_field, source.public_status);
    var result = await query.order(source.date_field, { ascending: false })
      .order("id", { ascending: false }).limit(20);
    if (result.error) throw result.error;
    campaignItems[source.id] = (result.data || []).map(function (row) {
      var name = String(row[source.name_field] || "").trim() || "Someone";
      return {
        id: source.id + ":" + row.id,
        date: timestamp(row[source.date_field]),
        text: source.message.replace(/\{name\}/g, function () { return name; })
      };
    });
  }

  async function refresh() {
    if (stopped) return;
    if (refreshing) { refreshAgain = true; return; }
    refreshing = true;
    var unavailable = false;
    try {
      try {
        var response = await fetch(ticker.getAttribute("data-feed-url"), { cache: "no-store" });
        if (!response.ok) throw new Error("Activity feed unavailable");
        var feed = await response.json();
        if (!Array.isArray(feed.campaigns) || !Array.isArray(feed.broadcasts)) throw new Error("Invalid activity feed");
        broadcasts = feed.broadcasts;
        if (JSON.stringify(sources) !== JSON.stringify(feed.campaigns)) {
          sources = feed.campaigns;
          subscribe();
        }
      } catch (error) {
        unavailable = true;
        console.warn("Community ticker feed failed", error);
      }
      await Promise.all(sources.map(async function (source) {
        try { await loadCampaign(source); }
        catch (error) {
          unavailable = true;
          console.warn("Community ticker campaign failed: " + source.id, error);
        }
      }));
      if (!stopped) render(unavailable);
    } finally {
      refreshing = false;
      if (refreshAgain && !stopped) { refreshAgain = false; refresh(); }
    }
  }

  function start() {
    stopped = false;
    subscribe();
    refresh();
    // Also catches published broadcasts and changes when Realtime is unavailable.
    timer = window.setInterval(function () {
      if (!document.hidden) refresh();
    }, 30000);
  }

  document.addEventListener("visibilitychange", function () {
    if (!document.hidden) refresh();
  });
  window.addEventListener("pagehide", function () {
    stopped = true;
    window.clearInterval(timer);
    channels.forEach(function (channel) { if (client) client.removeChannel(channel); });
    channels = [];
  });
  window.addEventListener("pageshow", function (event) { if (event.persisted) start(); });
  start();
})();
