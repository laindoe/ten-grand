(function () {
  "use strict";

  var root = document.getElementById("voice-player");
  var openers = document.querySelectorAll("[data-voice-player-open]");
  if (!root || !openers.length) return;

  var panel = root.querySelector(".vp__panel");
  var $ = function (name) { return root.querySelector("[data-vp-" + name + "]"); };
  var audio = $("audio"), art = $("art"), seek = $("seek");
  var elTrack = $("track"), elArtist = $("artist"), elRole = $("role"), elNum = $("num"), elLinks = $("links");
  var elElapsed = $("elapsed"), elTotal = $("total"), elStatus = $("status");
  var elNow = $("now"), elPlaylists = $("playlists"), elWrittenView = $("written-view"), elGrid = $("grid"), elQueue = $("queue");
  var elWritten = $("written"), elChips = $("chips"), elWrittenCount = $("written-count");
  var btnPlay = $("play"), btnShuffle = $("shuffle");
  var addButtons = Array.from(root.querySelectorAll("[data-vp-add]"));
  var mainTabs = Array.from(root.querySelectorAll("[data-vp-main]"));
  var scroller = root.querySelector(".vp__scroll");

  var ROLES = {
    create: { label: "CREATOR", name: "Creators", a: "var(--cw-color-create)", b: "var(--cw-color-create-blend)" },
    build: { label: "BUILDER", name: "Builders", a: "var(--cw-color-build)", b: "var(--cw-color-build-blend)" },
    fund: { label: "INVESTOR", name: "Investors", a: "var(--cw-color-fund)", b: "var(--cw-color-fund-blend)" },
    support: { label: "SUPPORTER", name: "Supporters", a: "var(--cw-color-support)", b: "var(--cw-color-support-blend)" }
  };

  var SOCIAL_URL_PREFIX = {
    Instagram: "https://instagram.com/",
    Facebook: "https://facebook.com/",
    X: "https://x.com/",
    Threads: "https://threads.net/@",
    TikTok: "https://tiktok.com/@"
  };
  var GLOBE_ICON = '<circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><line x1="3" y1="12" x2="21" y2="12"/>';
  var HANDLE_ICON = '<rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none"/>';

  // Each playlist is { id, name, a, b, icon, shuffle, match(row) }. Playlists
  // with no audio voices are hidden, so adding Top Picks / Fan Favs later
  // (once the admin side can tag voices) is one more entry here, e.g.
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
  var written = [];         // written responses, newest first
  var allCount = 0;
  var writtenRole = "";     // category filter for the Written tab ("" = all)
  var loading = null;
  var playlist = PLAYLISTS[0];
  var shuffleOn = true;
  var view = "playlists";   // "playlists" | "now" | "written"
  var base = [];            // current playlist in natural order
  var queue = [];           // play order
  var index = 0;
  var lastFocus = null;
  var seeking = false;

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
        .select("id,name,role,response_type,response_title,why_detail,audio_path,audio_duration,photo_path,website,social_platform,social_handle,created_at,campaign_number")
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

  function renderStats(all) {
    $("total-count").textContent = String(all.length).padStart(4, "0");
  }

  // 2x2 cover built from the photos of the newest four voices in the album;
  // voices without a photo show their role color, and empty cells (albums with
  // fewer than four voices) fall back to the album's own gradient.
  function buildCover(p, list) {
    var cover = document.createElement("span");
    cover.className = "vp__cover";
    cover.setAttribute("aria-hidden", "true");
    var latest = list.slice(0, 4);
    for (var i = 0; i < 4; i++) {
      var cell = document.createElement("span");
      cell.className = "vp__cover-cell";
      var row = latest[i];
      if (row) {
        cell.style.backgroundColor = ROLES[row.role].a;
        var photo = mediaUrl(row, "photo");
        if (photo) cell.style.backgroundImage = 'url("' + photo.replace(/"/g, "%22") + '")';
      } else {
        cell.style.background = "linear-gradient(135deg, " + p.a + ", " + p.b + ")";
      }
      cover.appendChild(cell);
    }
    if (latest.length === 1) cover.classList.add("is-single");
    return cover;
  }

  function renderPlaylists() {
    elGrid.replaceChildren.apply(elGrid, PLAYLISTS.map(function (p) {
      var list = rows.filter(p.match);
      var count = list.length;
      if (!count) return null;
      var tile = document.createElement("button");
      tile.type = "button";
      tile.className = "vp__tile" + (p.id === playlist.id && queue.length ? " is-active" : "");
      tile.style.setProperty("--tile-a", p.a);
      tile.style.setProperty("--tile-b", p.b);
      var name = document.createElement("span"); name.className = "vp__tile-name"; name.textContent = p.name;
      var n = document.createElement("span"); n.className = "vp__tile-count";
      var writtenCount = written.filter(p.match).length;
      n.textContent = count + (count === 1 ? " voice" : " voices") + (writtenCount ? " \u00b7 " + writtenCount + " written" : "");
      tile.append(buildCover(p, list), name, n);
      if (p.icon) {
        tile.insertAdjacentHTML("beforeend", '<svg class="vp__tile-icon" viewBox="0 0 24 24" aria-hidden="true">' + p.icon + "</svg>");
      }
      tile.addEventListener("click", function () { startPlaylist(p); showView("now"); });
      return tile;
    }).filter(Boolean));
  }

  // Three top-level views under the persistent header: the albums grid
  // (shown first), the player, and the written responses.
  function showView(next) {
    view = next;
    elPlaylists.hidden = next !== "playlists";
    elNow.hidden = next !== "now";
    elWrittenView.hidden = next !== "written";
    var tabFor = { playlists: "albums", now: "player", written: "written" }[next];
    mainTabs.forEach(function (tab) {
      var on = tab.getAttribute("data-vp-main") === tabFor;
      tab.classList.toggle("is-active", on);
      tab.setAttribute("aria-selected", String(on));
      tab.tabIndex = on ? 0 : -1;
    });
    if (next === "playlists") renderPlaylists();
    if (next === "written") renderWritten();
    scroller.scrollTop = 0;
  }

  mainTabs.forEach(function (tab, i) {
    tab.addEventListener("click", function () {
      if (!rows) return;
      var target = tab.getAttribute("data-vp-main");
      if (target === "player") {
        // Opening the player never starts audio; it just cues something up.
        if (!queue.length && rows.length) startPlaylist(PLAYLISTS[0], false);
        if (!queue.length) { say("No audio voices yet. Read the written responses."); showView("written"); return; }
        showView("now");
      } else {
        showView(target === "written" ? "written" : "playlists");
      }
    });
    tab.addEventListener("keydown", function (event) {
      var next = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: mainTabs.length - 1 }[event.key];
      if (next === undefined) return;
      event.preventDefault();
      var target = mainTabs[(next + mainTabs.length) % mainTabs.length];
      target.focus(); target.click();
    });
  });

  // autoplay=false cues the first voice without playing it.
  function startPlaylist(p, autoplay) {
    playlist = p;
    base = rows.filter(p.match);
    if (p.id === "newest") shuffleOn = false;
    else if (p.shuffle) shuffleOn = true;
    writtenRole = p.role || "";
    buildQueue(null);
    load(0, autoplay === true);
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
    for (var i = 0; i < 5; i++) {
      var bar = document.createElement("span"); bar.className = "vp__art-bar"; art.appendChild(bar);
    }
  }

  // Photo when the voice has one that loads; otherwise the role-colored
  // artwork with equalizer bars.
  function setArt(row) {
    art.replaceChildren();
    art.style.backgroundImage = "";
    var photo = mediaUrl(row, "photo");
    if (!photo) { addBars(); return; }
    var probe = new Image();
    probe.onload = function () {
      if (queue[index] !== row) return;
      art.replaceChildren();
      art.style.backgroundImage = 'url("' + photo.replace(/"/g, "%22") + '")';
    };
    probe.onerror = function () { if (queue[index] === row) addBars(); };
    addBars();
    probe.src = photo;
  }

  function linkEl(href, label, icon, text) {
    var a = document.createElement("a");
    a.className = "vp__link";
    a.href = href; a.target = "_blank"; a.rel = "noopener noreferrer";
    a.setAttribute("aria-label", label);
    a.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' + icon + "</svg>";
    if (text) {
      var span = document.createElement("span"); span.textContent = text; a.appendChild(span);
    }
    return a;
  }

  function renderLinks(row) {
    var items = [];
    if (row.website) {
      var href = /^https?:\/\//i.test(row.website) ? row.website : "https://" + row.website;
      items.push(linkEl(href, "Website: " + row.website, GLOBE_ICON, "Website"));
    }
    if (row.social_platform && row.social_handle) {
      var handle = row.social_handle.trim().replace(/^@/, "");
      var prefix = SOCIAL_URL_PREFIX[row.social_platform] || SOCIAL_URL_PREFIX.Instagram;
      items.push(linkEl(prefix + encodeURIComponent(handle), row.social_platform + ": @" + handle, HANDLE_ICON, ""));
    }
    elLinks.replaceChildren.apply(elLinks, items);
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
      var s = document.createElement("span"); s.className = "vp__q-sub"; s.textContent = row.name + " · " + ROLES[row.role].label;
      text.append(t, s);
      var d = document.createElement("span"); d.className = "vp__q-dur"; d.textContent = clock(row.audio_duration);
      btn.append(thumb, text, d);
      btn.addEventListener("click", function () { load(i, true); });
      li.appendChild(btn);
      return li;
    }));
  }

  // Written responses follow the category picked via the role counts or the
  // chips here, mirroring how audio playlists are sorted by role.
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
      var q = document.createElement("p"); q.className = "vp__written-quote"; q.textContent = "“" + w.why_detail + "”";
      var n = document.createElement("p"); n.className = "vp__written-name"; n.textContent = w.name;
      li.append(q, n);
      return li;
    }));
  }

  // Loads queue[i] into the player. Only plays when autoplay is true.
  function load(i, autoplay) {
    if (!queue.length) return;
    index = (i + queue.length) % queue.length;
    var row = queue[index];
    var url = mediaUrl(row, "audio");
    panel.dataset.role = row.role;
    elRole.textContent = ROLES[row.role].label;
    var hasNumber = row.campaign_number !== null && row.campaign_number !== undefined;
    elNum.hidden = !hasNumber;
    elNum.textContent = hasNumber ? String(row.campaign_number).padStart(4, "0") : "";
    elTrack.textContent = titleCase(row.response_title) || "Untitled";
    elArtist.textContent = row.name;
    elTotal.textContent = clock(row.audio_duration);
    elElapsed.textContent = "0:00";
    seek.value = 0;
    setArt(row);
    renderLinks(row);
    renderQueue();
    say("");
    audio.pause();
    if (!url) { audio.removeAttribute("src"); setPlaying(false); say("This voice can't be played right now."); return; }
    audio.src = url;
    if (autoplay) audio.play().catch(function () { setPlaying(false); });
    else setPlaying(false);
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
  audio.addEventListener("ended", function () { load(index + 1, true); });
  audio.addEventListener("error", function () {
    if (!audio.getAttribute("src")) return;
    say("That voice couldn't be loaded. Skipping ahead…");
    window.setTimeout(function () { if (root.classList.contains("is-open")) load(index + 1, true); }, 1200);
  });
  audio.addEventListener("loadedmetadata", function () { elTotal.textContent = clock(duration()); });
  audio.addEventListener("timeupdate", function () {
    var total = duration();
    elElapsed.textContent = clock(audio.currentTime);
    if (!seeking && total) seek.value = Math.round(audio.currentTime / total * 1000);
  });
  seek.addEventListener("input", function () {
    seeking = true;
    elElapsed.textContent = clock(seek.value / 1000 * duration());
  });
  seek.addEventListener("change", function () {
    seeking = false;
    if (duration()) audio.currentTime = seek.value / 1000 * duration();
  });

  btnPlay.addEventListener("click", function () {
    if (!audio.getAttribute("src")) load(index, true);
    else if (audio.paused) audio.play().catch(function () {});
    else audio.pause();
  });
  // Skipping keeps the current state: it only plays on if something was playing.
  $("next").addEventListener("click", function () { load(index + 1, !audio.paused); });
  $("prev").addEventListener("click", function () {
    if (audio.currentTime > 3) audio.currentTime = 0; else load(index - 1, !audio.paused);
  });
  btnShuffle.addEventListener("click", function () {
    shuffleOn = !shuffleOn;
    buildQueue(queue[index]);
    renderQueue();
  });
  $("queue-jump").addEventListener("click", function () {
    root.querySelector(".vp__queue").scrollIntoView({ behavior: "smooth", block: "start" });
  });

  if ("mediaSession" in navigator) {
    try {
      navigator.mediaSession.setActionHandler("nexttrack", function () { load(index + 1, true); });
      navigator.mediaSession.setActionHandler("previoustrack", function () { load(index - 1, true); });
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
    say("Loading voices…");
    try {
      await loadRows();
    } catch (error) {
      console.error("Ten Grand voice player failed to load", error);
      say("Voices could not be loaded. Please try again.");
      return;
    }
    if (!allCount) { say("Voices are coming soon. Be the first to add yours."); return; }
    say("");
    showView("playlists");
  }

  function close(skipFocus) {
    audio.pause();
    root.classList.remove("is-open");
    root.hidden = true;
    root.setAttribute("aria-hidden", "true");
    document.body.classList.remove("modal-open");
    if (!skipFocus && lastFocus) lastFocus.focus({ preventScroll: true });
  }

  openers.forEach(function (el) { el.addEventListener("click", open); });
  $("close").addEventListener("click", function () { close(); });
  // ADD YOURS opens the submission modal, which sits beneath this dialog, so
  // step the player out of the way (amass-modal.js handles the click itself).
  addButtons.forEach(function (btn) { btn.addEventListener("click", function () { close(true); }); });
  root.addEventListener("click", function (event) { if (event.target === root) close(); });
  document.addEventListener("keydown", function (event) {
    if (!root.classList.contains("is-open")) return;
    if (event.key === "Escape") { close(); return; }
    if (event.key !== "Tab") return;
    var items = Array.from(root.querySelectorAll("button:not([disabled]), input:not([disabled]), a[href]"))
      .filter(function (el) { return el.getClientRects().length > 0; });
    var first = items[0], last = items[items.length - 1];
    if (!first) return;
    if (event.shiftKey && (document.activeElement === first || document.activeElement === panel)) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  });
})();
