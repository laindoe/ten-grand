(function () {
  "use strict";

  var root = document.getElementById("voice-player");
  var openers = document.querySelectorAll("[data-voice-player-open]");
  if (!root || !openers.length) return;

  var panel = root.querySelector(".vp__panel");
  var $ = function (name) { return root.querySelector("[data-vp-" + name + "]"); };
  var audio = $("audio"), art = $("art"), seek = $("seek");
  var elTrack = $("track"), elArtist = $("artist"), elRole = $("role"), elFrom = $("from");
  var elElapsed = $("elapsed"), elTotal = $("total"), elStatus = $("status");
  var elNow = $("now"), elPlaylists = $("playlists"), elGrid = $("grid"), elQueue = $("queue");
  var btnPlay = $("play"), btnShuffle = $("shuffle");
  var mainTabs = Array.from(root.querySelectorAll("[data-vp-main]"));

  var ROLES = {
    create: { label: "CREATOR", name: "Creators", a: "var(--cw-color-create)", b: "var(--cw-color-create-blend)" },
    build: { label: "BUILDER", name: "Builders", a: "var(--cw-color-build)", b: "var(--cw-color-build-blend)" },
    fund: { label: "INVESTOR", name: "Investors", a: "var(--cw-color-fund)", b: "var(--cw-color-fund-blend)" },
    support: { label: "SUPPORTER", name: "Supporters", a: "var(--cw-color-support)", b: "var(--cw-color-support-blend)" }
  };

  // Each playlist is { id, name, a, b, icon, shuffle, match(row) }. Rows with
  // no matches are hidden, so adding Top Picks / Fan Favs later (once the
  // admin side can tag voices) is one more entry here, e.g.
  // { id: "top", name: "Top Picks", match: function (r) { return r.featured; } }.
  var PLAYLISTS = [
    { id: "all", name: "Shuffle All", a: "#fb2f7b", b: "#ff9a3c", shuffle: true, match: function () { return true; },
      icon: '<path d="M3 7h3c5 0 6 10 11 10h4M3 17h3c1.6 0 2.8-.9 3.8-2.2M21 7h-4c-1.6 0-2.8.9-3.8 2.2M18 4l3 3-3 3M18 14l3 3-3 3"/>' },
    { id: "newest", name: "Latest", a: "#f3f3f4", b: "#9aa0a6", shuffle: false, match: function () { return true; },
      icon: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>' }
  ].concat(Object.keys(ROLES).map(function (role) {
    return { id: role, name: ROLES[role].name, a: ROLES[role].a, b: ROLES[role].b, shuffle: true, role: role,
      match: function (row) { return row.role === role; } };
  }));

  var rows = null;          // playable audio voices, newest first
  var allCount = 0;
  var written = [];         // written responses, newest first
  var writtenRole = "";     // category filter for the Written tab ("" = all)
  var loading = null;
  var playlist = PLAYLISTS[0];
  var shuffleOn = true;
  var base = [];            // current playlist in natural order
  var queue = [];           // play order
  var index = 0;
  var lastFocus = null;

  function mediaUrl(row, kind) {
    var path = kind === "photo" ? row.photo_path : row.audio_path;
    if (!path || !window.tenGrandSupabase) return null;
    var security = window.tenGrandVoiceSecurity;
    if (security && security.enabled) {
      if (!security.mediaEndpoint) return null;
      return security.mediaEndpoint + "?id=" + encodeURIComponent(row.id) + "&kind=" + kind;
    }
    var bucket = kind === "photo" ? "voices-heard-photos" : "voices-heard-audio";
    var result = window.tenGrandSupabase.storage.from(bucket).getPublicUrl(path);
    return (result && result.data && result.data.publicUrl) || null;
  }

  function clock(seconds) {
    seconds = Math.max(0, Math.floor(seconds || 0));
    return Math.floor(seconds / 60) + ":" + String(seconds % 60).padStart(2, "0");
  }

  function titleCase(text) {
    var minor = /^(a|an|and|as|at|but|by|for|in|of|on|or|the|to|via)$/;
    return String(text || "").toLowerCase().split(/(\s+)/).map(function (word, i) {
      if (!word.trim() || (i > 0 && minor.test(word))) return word;
      if (/^(ai|nft|nfts|vr|ar|ip)$/.test(word)) return word.toUpperCase();
      return word.replace(/(^|[-–])([a-z])/g, function (_, p, l) { return p + l.toUpperCase(); });
    }).join("");
  }

  function shuffled(list) {
    var copy = list.slice();
    for (var i = copy.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = copy[i]; copy[i] = copy[j]; copy[j] = t;
    }
    return copy;
  }

  function say(message) {
    elStatus.hidden = !message;
    elStatus.textContent = message || "";
  }

  async function loadRows() {
    if (rows) return rows;
    if (loading) return loading;
    loading = (async function () {
      if (!window.tenGrandSupabase) throw new Error("Supabase unavailable");
      var result = await window.tenGrandSupabase
        .from("voices_heard")
        .select("id,name,role,response_type,response_title,why_detail,audio_path,audio_duration,photo_path,created_at")
        .eq("status", "approved")
        .order("created_at", { ascending: false }).order("id", { ascending: false })
        .limit(1000);
      if (result.error) throw result.error;
      var all = (result.data || []).filter(function (r) { return ROLES[r.role] && r.name; });
      allCount = all.length;
      renderStats(all);
      written = all.filter(function (r) { return r.response_type === "written" && r.why_detail; });
      rows = all.filter(function (r) { return r.response_type === "audio" && r.audio_path; });
      return rows;
    })();
    try { return await loading; } finally { loading = null; }
  }

  function renderPlaylists() {
    elGrid.replaceChildren.apply(elGrid, PLAYLISTS.map(function (p) {
      var count = rows.filter(p.match).length;
      if (!count) return null;
      var tile = document.createElement("button");
      tile.type = "button";
      tile.className = "vp__tile" + (p.id === playlist.id ? " is-active" : "");
      tile.style.setProperty("--tile-a", p.a);
      tile.style.setProperty("--tile-b", p.b);
      var name = document.createElement("span"); name.className = "vp__tile-name"; name.textContent = p.name;
      var n = document.createElement("span"); n.className = "vp__tile-count";
      var writtenCount = written.filter(p.match).length;
      n.textContent = count + (count === 1 ? " voice" : " voices") + (writtenCount ? " \u00b7 " + writtenCount + " written" : "");
      tile.append(name, n);
      if (p.icon) {
        tile.insertAdjacentHTML("afterbegin", '<svg class="vp__tile-icon" viewBox="0 0 24 24" aria-hidden="true">' + p.icon + "</svg>");
      }
      tile.addEventListener("click", function () { startPlaylist(p); showView("now"); });
      return tile;
    }).filter(Boolean));
  }

  function renderStats(all) {
    $("total-count").textContent = String(all.length).padStart(4, "0");
    Object.keys(ROLES).forEach(function (role) {
      root.querySelector('[data-vp-role-count="' + role + '"]').textContent =
        all.filter(function (r) { return r.role === role; }).length;
    });
  }

  // Two top-level views: "playlists" (the albums grid, shown first) and
  // "now" (the player). The header stays put above both.
  function showView(view) {
    var player = view === "now";
    elNow.hidden = !player;
    elPlaylists.hidden = player;
    mainTabs.forEach(function (tab) {
      var on = (tab.getAttribute("data-vp-main") === "player") === player;
      tab.classList.toggle("is-active", on);
      tab.setAttribute("aria-selected", String(on));
      tab.tabIndex = on ? 0 : -1;
    });
    if (!player) renderPlaylists();
    root.querySelector(".vp__scroll").scrollTop = 0;
  }

  mainTabs.forEach(function (tab, i) {
    function go() {
      if (!rows) return;
      var player = tab.getAttribute("data-vp-main") === "player";
      if (player && !queue.length && rows.length) startPlaylist(PLAYLISTS[0]);
      if (player && !rows.length) showTab("written");
      showView(player ? "now" : "playlists");
    }
    tab.addEventListener("click", go);
    tab.addEventListener("keydown", function (event) {
      var next = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: mainTabs.length - 1 }[event.key];
      if (next === undefined) return;
      event.preventDefault();
      var target = mainTabs[(next + mainTabs.length) % mainTabs.length];
      target.focus(); target.click();
    });
  });

  function startPlaylist(p) {
    playlist = p;
    base = rows.filter(p.match);
    if (p.id === "newest") shuffleOn = false;
    else if (p.shuffle) shuffleOn = true;
    writtenRole = p.role || "";
    renderWritten();
    buildQueue(null);
    elFrom.textContent = "Playing from " + (p.id === "all" ? "All Voices" : p.name);
    play(0);
  }

  function buildQueue(current) {
    queue = shuffleOn ? shuffled(base) : base.slice();
    if (current) {
      queue.splice(queue.indexOf(current), 1);
      queue.unshift(current);
      index = 0;
    }
    btnShuffle.setAttribute("aria-pressed", String(shuffleOn));
    btnShuffle.setAttribute("aria-label", shuffleOn ? "Shuffle on" : "Shuffle off");
  }

  function addBars() {
    for (var i = 0; i < 9; i++) {
      var bar = document.createElement("span"); bar.className = "vp__art-bar"; art.appendChild(bar);
    }
  }

  // Photo when the voice has one that loads; otherwise the role-colored
  // artwork with equalizer bars.
  function setArt(row) {
    art.replaceChildren();
    art.classList.remove("has-photo");
    art.style.backgroundImage = "";
    var photo = mediaUrl(row, "photo");
    if (!photo) { addBars(); return; }
    var probe = new Image();
    probe.onload = function () {
      if (queue[index] !== row) return;
      art.replaceChildren();
      art.classList.add("has-photo");
      art.style.backgroundImage = 'url("' + photo.replace(/"/g, "%22") + '")';
    };
    probe.onerror = function () { if (queue[index] === row) addBars(); };
    addBars();
    probe.src = photo;
  }

  function renderQueue() {
    elQueue.replaceChildren.apply(elQueue, queue.map(function (row, i) {
      var li = document.createElement("li");
      li.className = "vp__queue-item" + (i === index ? " is-current" : "");
      var btn = document.createElement("button"); btn.type = "button";
      if (i === index) btn.setAttribute("aria-current", "true");
      var thumb = document.createElement("span"); thumb.className = "vp__q-thumb";
      thumb.style.setProperty("--q-color", ROLES[row.role].a);
      var photo = mediaUrl(row, "photo");
      if (photo) thumb.style.backgroundImage = 'url("' + photo.replace(/"/g, "%22") + '")';
      var text = document.createElement("span");
      var t = document.createElement("span"); t.className = "vp__q-title"; t.textContent = titleCase(row.response_title) || row.name;
      var s = document.createElement("span"); s.className = "vp__q-sub"; s.textContent = row.name + " \u00b7 " + ROLES[row.role].label;
      text.append(t, s);
      var d = document.createElement("span"); d.className = "vp__q-dur"; d.textContent = clock(row.audio_duration);
      btn.append(thumb, text, d);
      btn.addEventListener("click", function () { play(i); });
      li.appendChild(btn);
      return li;
    }));
  }

  var tabs = Array.from(root.querySelectorAll("[data-vp-tab]"));
  var elWritten = $("written"), elChips = $("chips"), elWrittenCount = $("written-count");

  function showTab(name) {
    tabs.forEach(function (tab) {
      var on = tab.getAttribute("data-vp-tab") === name;
      tab.classList.toggle("is-active", on);
      tab.setAttribute("aria-selected", String(on));
      tab.tabIndex = on ? 0 : -1;
      root.querySelector("#" + tab.getAttribute("aria-controls")).hidden = !on;
    });
  }
  tabs.forEach(function (tab, i) {
    tab.addEventListener("click", function () { showTab(tab.getAttribute("data-vp-tab")); });
    tab.addEventListener("keydown", function (event) {
      var next = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 }[event.key];
      if (next === undefined) return;
      event.preventDefault();
      var target = tabs[(next + tabs.length) % tabs.length];
      target.focus(); showTab(target.getAttribute("data-vp-tab"));
    });
  });

  // Written responses follow the category picked in the playlists (or the
  // chips here), mirroring how audio playlists are sorted by role.
  function renderWritten() {
    elWrittenCount.textContent = written.length ? "(" + written.length + ")" : "";
    var options = [{ id: "", label: "All" }].concat(Object.keys(ROLES).map(function (r) {
      return { id: r, label: ROLES[r].name };
    })).filter(function (o) { return !o.id || written.some(function (w) { return w.role === o.id; }); });
    elChips.replaceChildren.apply(elChips, options.map(function (o) {
      var chip = document.createElement("button");
      chip.type = "button"; chip.className = "vp__chip"; chip.textContent = o.label;
      chip.setAttribute("aria-pressed", String(o.id === writtenRole));
      chip.addEventListener("click", function () { writtenRole = o.id; renderWritten(); });
      return chip;
    }));
    var list = written.filter(function (w) { return !writtenRole || w.role === writtenRole; });
    if (!list.length) {
      var empty = document.createElement("li"); empty.className = "vp__written-empty";
      empty.textContent = written.length ? "No written responses in this category yet." : "No written responses yet.";
      elWritten.replaceChildren(empty);
      return;
    }
    elWritten.replaceChildren.apply(elWritten, list.map(function (w) {
      var li = document.createElement("li"); li.className = "vp__written-card";
      li.style.setProperty("--card-accent", ROLES[w.role].a);
      var role = document.createElement("p"); role.className = "vp__written-role"; role.textContent = ROLES[w.role].label;
      li.appendChild(role);
      if (w.response_title) {
        var t = document.createElement("h5"); t.className = "vp__written-title"; t.textContent = titleCase(w.response_title); li.appendChild(t);
      }
      var q = document.createElement("p"); q.className = "vp__written-quote"; q.textContent = "\u201c" + w.why_detail + "\u201d";
      var n = document.createElement("p"); n.className = "vp__written-name"; n.textContent = w.name;
      li.append(q, n);
      return li;
    }));
  }

  function play(i) {
    if (!queue.length) return;
    index = (i + queue.length) % queue.length;
    var row = queue[index];
    var url = mediaUrl(row, "audio");
    panel.dataset.role = row.role;
    elRole.textContent = ROLES[row.role].label;
    elTrack.textContent = titleCase(row.response_title) || "Untitled";
    elArtist.textContent = row.name;
    elTotal.textContent = clock(row.audio_duration);
    elElapsed.textContent = "0:00";
    seek.value = 0;
    setArt(row);
    renderQueue();
    say("");
    if (!url) { say("This voice can't be played right now."); return; }
    audio.src = url;
    audio.play().catch(function () { setPlaying(false); });
    if ("mediaSession" in navigator && window.MediaMetadata) {
      navigator.mediaSession.metadata = new MediaMetadata({ title: elTrack.textContent, artist: row.name, album: "Voices Heard" });
    }
  }

  function setPlaying(on) {
    root.classList.toggle("is-playing", on);
    btnPlay.setAttribute("aria-label", on ? "Pause" : "Play");
    root.querySelector("[data-vp-icon-play]").toggleAttribute("hidden", on);
    root.querySelector("[data-vp-icon-pause]").toggleAttribute("hidden", !on);
  }

  function duration() {
    return Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration
      : (queue[index] && queue[index].audio_duration) || 0;
  }

  audio.addEventListener("play", function () { setPlaying(true); });
  audio.addEventListener("pause", function () { setPlaying(false); });
  audio.addEventListener("ended", function () { play(index + 1); });
  audio.addEventListener("error", function () {
    if (!audio.getAttribute("src")) return;
    say("That voice couldn't be loaded. Skipping ahead…");
    window.setTimeout(function () { if (root.classList.contains("is-open")) play(index + 1); }, 1200);
  });
  audio.addEventListener("loadedmetadata", function () { elTotal.textContent = clock(duration()); });
  audio.addEventListener("timeupdate", function () {
    var total = duration();
    elElapsed.textContent = clock(audio.currentTime);
    if (!seeking && total) seek.value = Math.round(audio.currentTime / total * 1000);
  });
  var seeking = false;
  seek.addEventListener("input", function () {
    seeking = true;
    elElapsed.textContent = clock(seek.value / 1000 * duration());
  });
  seek.addEventListener("change", function () {
    seeking = false;
    if (duration()) audio.currentTime = seek.value / 1000 * duration();
  });

  btnPlay.addEventListener("click", function () {
    if (!audio.getAttribute("src")) play(index);
    else if (audio.paused) audio.play().catch(function () {});
    else audio.pause();
  });
  $("next").addEventListener("click", function () { play(index + 1); });
  $("prev").addEventListener("click", function () {
    if (audio.currentTime > 3) audio.currentTime = 0; else play(index - 1);
  });
  btnShuffle.addEventListener("click", function () {
    shuffleOn = !shuffleOn;
    buildQueue(queue[index]);
    renderQueue();
  });
  $("queue-jump").addEventListener("click", function () {
    showTab("queue");
    root.querySelector(".vp__queue").scrollIntoView({ behavior: "smooth", block: "start" });
  });

  if ("mediaSession" in navigator) {
    try {
      navigator.mediaSession.setActionHandler("nexttrack", function () { play(index + 1); });
      navigator.mediaSession.setActionHandler("previoustrack", function () { play(index - 1); });
    } catch (e) { /* unsupported action */ }
  }

  async function open(event) {
    lastFocus = event && event.currentTarget;
    root.hidden = false;
    root.setAttribute("aria-hidden", "false");
    root.classList.add("is-open");
    document.body.classList.add("modal-open");
    panel.focus({ preventScroll: true });
    if (rows) { showView("playlists"); return; }
    say("Loading voices\u2026");
    try {
      await loadRows();
    } catch (error) {
      console.error("Ten Grand voice player failed to load", error);
      say("Voices could not be loaded. Please try again.");
      return;
    }
    if (!allCount) { say("Voices are coming soon. Be the first to add yours."); return; }
    say("");
    renderWritten();
    showView("playlists");
  }

  function close() {
    audio.pause();
    root.classList.remove("is-open");
    root.hidden = true;
    root.setAttribute("aria-hidden", "true");
    document.body.classList.remove("modal-open");
    if (lastFocus) lastFocus.focus({ preventScroll: true });
  }

  openers.forEach(function (el) { el.addEventListener("click", open); });
  $("close").addEventListener("click", close);
  root.addEventListener("click", function (event) { if (event.target === root) close(); });
  document.addEventListener("keydown", function (event) {
    if (!root.classList.contains("is-open")) return;
    if (event.key === "Escape") { close(); return; }
    if (event.key !== "Tab") return;
    var items = Array.from(root.querySelectorAll("button:not([disabled]), input:not([disabled])"))
      .filter(function (el) { return el.getClientRects().length > 0; });
    var first = items[0], last = items[items.length - 1];
    if (!first) return;
    if (event.shiftKey && (document.activeElement === first || document.activeElement === panel)) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  });
})();
