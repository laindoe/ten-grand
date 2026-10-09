(function () {
  "use strict";

  function setStat(key, value) {
    var el = document.querySelector('[data-stat="' + key + '"]');
    if (el && typeof value === "number") {
      el.textContent = value.toLocaleString("en-US");
    }
  }

  async function approvedCount(role) {
    var query = window.tenGrandSupabase
      .from("voices_heard")
      .select("*", { count: "exact", head: true })
      .eq("status", "approved");
    if (role) query = query.eq("role", role);
    var result = await query;
    if (result.error || typeof result.count !== "number") return null;
    return result.count;
  }

  async function loadStats() {
    if (!window.tenGrandSupabase) return;
    try {
      // "total" (Total Members) and the four role-breakdown stats
      // (create/build/fund/support) are intentionally disconnected
      // from Voices Heard data -- they stay at their static 0 values
      // until wired to a real member-count source. Only the Voices
      // Heard badge itself still reflects real approved submissions.
      var total = await approvedCount(null);
      if (total !== null) setStat("voices-total", total);
    } catch (error) {
      console.error("Ten Grand Community Wall stats failed", error);
    }
  }

  function initJoinModal() {
    var modal = document.getElementById("cw-join-modal");
    var triggers = document.querySelectorAll("[data-join-trigger]");
    if (!modal || !triggers.length) return;

    var lastFocused = null;
    var scrollLock = null;

    // Same body-lock technique as the AMASS modal on the homepage
    // (js/main.js's initSimpleModals): position:fixed + scroll offset
    // compensation + scrollbar-width padding compensation, so the page
    // behind the modal can't scroll (including on iOS, where plain
    // overflow:hidden on body doesn't stop background scroll).
    function lockScroll() {
      if (scrollLock) return;
      var body = document.body;
      var properties = ["position", "top", "left", "width", "overflow", "padding-right"];
      scrollLock = {
        x: window.scrollX,
        y: window.scrollY,
        styles: properties.map(function (property) {
          return [property, body.style.getPropertyValue(property), body.style.getPropertyPriority(property)];
        }),
      };
      var scrollbar = window.innerWidth - document.documentElement.clientWidth;
      var padding = parseFloat(getComputedStyle(body).paddingRight) || 0;
      body.style.setProperty("position", "fixed");
      body.style.setProperty("top", "-" + scrollLock.y + "px");
      body.style.setProperty("left", "-" + scrollLock.x + "px");
      body.style.setProperty("width", "100%");
      body.style.setProperty("overflow", "hidden");
      if (scrollbar > 0) body.style.setProperty("padding-right", padding + scrollbar + "px");
    }

    function unlockScroll() {
      if (!scrollLock) return;
      var saved = scrollLock;
      scrollLock = null;
      saved.styles.forEach(function (entry) {
        var property = entry[0], value = entry[1], priority = entry[2];
        if (value) document.body.style.setProperty(property, value, priority);
        else document.body.style.removeProperty(property);
      });
      var root = document.documentElement;
      var behavior = root.style.getPropertyValue("scroll-behavior");
      var priority = root.style.getPropertyPriority("scroll-behavior");
      root.style.setProperty("scroll-behavior", "auto", "important");
      window.scrollTo(saved.x, saved.y);
      if (behavior) root.style.setProperty("scroll-behavior", behavior, priority);
      else root.style.removeProperty("scroll-behavior");
    }

    function openModal(event) {
      if (modal.classList.contains("is-open")) return;
      lastFocused = event.currentTarget;
      lockScroll();
      modal.classList.add("is-open");
      modal.setAttribute("aria-hidden", "false");
      document.body.classList.add("modal-open");
      modal.querySelector(".modal__close").focus({ preventScroll: true });
    }

    function closeModal() {
      modal.classList.remove("is-open");
      modal.setAttribute("aria-hidden", "true");
      document.body.classList.remove("modal-open");
      unlockScroll();
      if (lastFocused) lastFocused.focus({ preventScroll: true });
    }

    triggers.forEach(function (trigger) {
      trigger.addEventListener("click", openModal);
    });
    modal.querySelectorAll("[data-modal-close]").forEach(function (el) {
      el.addEventListener("click", closeModal);
    });
    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && modal.classList.contains("is-open")) closeModal();
    });
  }

  // Chromium doesn't reflect the .hidden IDL property to the actual
  // `hidden` content attribute on <svg> elements (same quirk worked
  // around in js/amass-modal.js), so toggling icons via plain
  // `svgEl.hidden = true` silently fails. Setting the attribute
  // directly works around it.
  function setSvgHidden(svgEl, isHidden) {
    if (isHidden) svgEl.setAttribute("hidden", "");
    else svgEl.removeAttribute("hidden");
  }

  var ROLE_DISPLAY = {
    create: { label: "CREATOR", verb: "CREATE" },
    build: { label: "BUILDER", verb: "BUILD" },
    fund: { label: "INVESTOR", verb: "FUND" },
    support: { label: "SUPPORTER", verb: "SUPPORT" },
  };

  var SOCIAL_URL_PREFIX = {
    Instagram: "https://instagram.com/",
    Facebook: "https://facebook.com/",
    X: "https://x.com/",
    Threads: "https://threads.net/@",
    TikTok: "https://tiktok.com/@",
  };

  function formatClock(totalSeconds) {
    var minutes = Math.floor(totalSeconds / 60);
    var seconds = Math.floor(totalSeconds % 60);
    return minutes + ":" + String(seconds).padStart(2, "0");
  }

  function formatDurationWords(totalSeconds) {
    var minutes = Math.floor(totalSeconds / 60);
    var seconds = Math.floor(totalSeconds % 60);
    var parts = [];
    if (minutes > 0) parts.push(minutes + " minute" + (minutes === 1 ? "" : "s"));
    parts.push(seconds + " second" + (seconds === 1 ? "" : "s"));
    return parts.join(" ");
  }

  function publicStorageUrl(bucket, path) {
    if (!path || !window.tenGrandSupabase) return null;
    var result = window.tenGrandSupabase.storage.from(bucket).getPublicUrl(path);
    return (result && result.data && result.data.publicUrl) || null;
  }

  // The fallback color avatar, built the same way as the static
  // example cards' <svg class="cw-voice-card__orb">, but with a
  // unique id suffix per card -- several of these can be on the page
  // at once, and SVG <linearGradient>/<filter> ids are referenced by
  // literal #id, so two cards reusing the same id would make later
  // ones silently paint with (or get blurred by) the first one's def.
  function buildOrbAvatar(role, idSuffix) {
    var gradId = "cw-orb-grad-dyn-" + idSuffix;
    var glowId = "cw-orb-glow-dyn-" + idSuffix;
    var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", "cw-voice-card__avatar cw-voice-card__orb");
    svg.setAttribute("viewBox", "0 0 64 64");
    svg.setAttribute("width", "64");
    svg.setAttribute("height", "64");
    svg.setAttribute("aria-hidden", "true");
    svg.innerHTML =
      '<defs>' +
        '<linearGradient id="' + gradId + '" x1="0%" y1="0%" x2="100%" y2="100%">' +
          '<stop offset="0" style="stop-color:var(--cw-color-' + role + ')"/>' +
          '<stop offset="1" style="stop-color:var(--cw-color-' + role + '-blend)"/>' +
        '</linearGradient>' +
        '<filter id="' + glowId + '" x="-80%" y="-80%" width="260%" height="260%" color-interpolation-filters="sRGB">' +
          '<feGaussianBlur stdDeviation="4"/>' +
        '</filter>' +
      '</defs>' +
      '<circle class="cw-voice-card__orb-glow" cx="32" cy="32" r="22" style="fill:var(--cw-color-' + role + ')" opacity="0.52" filter="url(#' + glowId + ')"/>' +
      '<circle class="cw-voice-card__orb-core" cx="32" cy="32" r="22" fill="url(#' + gradId + ')"/>' +
      '<circle class="cw-voice-card__orb-ring" cx="32" cy="32" r="22" fill="none" style="stroke:var(--color-card-border)" stroke-width="1"/>';
    return svg;
  }

  function buildPhotoAvatar(url, role) {
    var img = document.createElement("img");
    img.className = "cw-voice-card__avatar cw-voice-card__photo cw-voice-card__photo--" + role;
    img.src = url;
    img.alt = "";
    return img;
  }

  function buildLinkRow(iconPathHtml, extraClass) {
    var a = document.createElement("a");
    a.className = "cw-voice-card__link " + extraClass;
    a.hidden = true;
    var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", "cw-voice-card__link-icon");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");
    svg.innerHTML = iconPathHtml;
    var text = document.createElement("span");
    text.className = "cw-voice-card__link-text";
    a.append(svg, text);
    return a;
  }

  var HANDLE_ICON_HTML =
    '<rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/>' +
    '<circle class="cw-voice-card__link-icon-dot" cx="17.5" cy="6.5" r="1.1"/>';
  var WEBSITE_ICON_HTML =
    '<circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><line x1="3" y1="12" x2="21" y2="12"/>';

  function buildAudioBody(row) {
    var url = publicStorageUrl("voices-heard-audio", row.audio_path);
    var durationSeconds = row.audio_duration || 0;

    var wrap = document.createElement("div");
    wrap.className = "cw-voice-card__audio cw-voice-card__audio--" + row.role;
    wrap.setAttribute("role", "group");
    wrap.setAttribute("aria-label", "Audio response, " + formatDurationWords(durationSeconds));

    var audio = document.createElement("audio");
    audio.className = "amass-flow__review-audio-el";
    audio.crossOrigin = "anonymous";
    if (url) audio.src = url;
    audio.preload = "none";

    var button = document.createElement("button");
    button.type = "button";
    button.className = "cw-voice-card__audio-play amass-flow__review-play";
    button.setAttribute("aria-label", "Play audio response");
    button.innerHTML =
      '<svg class="amass-flow__review-play-icon amass-flow__review-play-icon--play" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5 L19 12 L7 19 Z"/></svg>' +
      '<svg class="amass-flow__review-play-icon amass-flow__review-play-icon--pause" viewBox="0 0 24 24" aria-hidden="true" hidden><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>';
    var playIcon = button.querySelector(".amass-flow__review-play-icon--play");
    var pauseIcon = button.querySelector(".amass-flow__review-play-icon--pause");
    var wave = document.createElement("span");
    wave.className = "cw-voice-card__audio-wave cw-voice-card__audio-wave--real";
    wave.setAttribute("aria-hidden", "true");
    var equalizer = window.tenGrandEqualizer(audio, wave);

    var time = document.createElement("span");
    time.className = "cw-voice-card__audio-time";
    time.setAttribute("aria-hidden", "true");
    time.textContent = "0:00 / " + formatClock(durationSeconds);

    function setIcon(isPlaying) {
      setSvgHidden(playIcon, isPlaying);
      setSvgHidden(pauseIcon, !isPlaying);
      button.setAttribute("aria-label", isPlaying ? "Pause audio response" : "Play audio response");
      button.classList.toggle("is-playing", isPlaying);
    }

    button.addEventListener("click", function () {
      if (!url) return;
      if (audio.paused) {
        equalizer.prepare();
        audio.play().catch(function () {
          setIcon(false);
          button.setAttribute("aria-label", "Retry audio response playback");
        });
      }
      else audio.pause();
    });
    audio.addEventListener("play", function () { setIcon(true); });
    audio.addEventListener("pause", function () { setIcon(false); });
    audio.addEventListener("ended", function () {
      setIcon(false);
      time.textContent = "0:00 / " + formatClock(durationSeconds);
    });
    audio.addEventListener("timeupdate", function () {
      if (audio.paused) return;
      time.textContent = formatClock(audio.currentTime) + " / " + formatClock(durationSeconds);
    });

    wrap.append(audio, time, wave, button);
    return wrap;
  }

  function buildQuoteBody(row) {
    var quote = document.createElement("p");
    quote.className = "cw-voice-card__quote";
    quote.textContent = "“" + row.why_detail + "”";
    return quote;
  }

  function buildVoiceCard(row, badgeNumber) {
    var role = ROLE_DISPLAY[row.role];
    if (!role || !row.name) return null;

    var article = document.createElement("article");
    article.className = "cw-voice-card";
    article.id = "voice-" + row.id;
    article.tabIndex = -1;
    var number = document.createElement("span");
    number.className = "cw-voice-card__number";
    number.textContent = String(badgeNumber).padStart(4, "0");
    var meta = document.createElement("div");
    meta.className = "cw-voice-card__meta";
    meta.appendChild(number);
    article.appendChild(meta);

    var top = document.createElement("div");
    top.className = "cw-voice-card__top";

    var photoUrl = publicStorageUrl("voices-heard-photos", row.photo_path);
    top.appendChild(photoUrl ? buildPhotoAvatar(photoUrl, row.role) : buildOrbAvatar(row.role, badgeNumber));

    var identity = document.createElement("div");
    identity.className = "cw-voice-card__identity";
    var name = document.createElement("p");
    name.className = "cw-voice-card__name";
    name.textContent = row.name;
    var links = document.createElement("p");
    links.className = "cw-voice-card__links";

    if (row.social_platform && row.social_handle) {
      var handle = row.social_handle.trim().replace(/^@/, "");
      var prefix = SOCIAL_URL_PREFIX[row.social_platform] || SOCIAL_URL_PREFIX.Instagram;
      var handleLink = buildLinkRow(HANDLE_ICON_HTML, "cw-voice-card__handle");
      handleLink.href = prefix + handle;
      handleLink.querySelector(".cw-voice-card__link-text").textContent = "@" + handle;
      handleLink.hidden = false;
      links.appendChild(handleLink);
    }
    if (row.website) {
      var websiteLink = buildLinkRow(WEBSITE_ICON_HTML, "cw-voice-card__website");
      var websiteHref = /^https?:\/\//i.test(row.website) ? row.website : "https://" + row.website;
      websiteLink.href = websiteHref;
      websiteLink.querySelector(".cw-voice-card__link-text").textContent = row.website.replace(/^https?:\/\//i, "");
      websiteLink.hidden = false;
      links.appendChild(websiteLink);
    }
    identity.append(name, links);

    var badgeCol = document.createElement("div");
    badgeCol.className = "cw-voice-card__badge-col";
    var roleIcons = {
      create: '<circle cx="19" cy="24" r="13"/><circle cx="29" cy="24" r="13"/>',
      build: '<rect x="7" y="7" width="22" height="22"/><rect x="19" y="19" width="22" height="22"/>',
      fund: '<ellipse cx="24" cy="15" rx="15" ry="6"/><path d="M9 15v9a15 6 0 0 0 30 0v-9M9 24v9a15 6 0 0 0 30 0v-9"/>',
      support: '<path d="M24 4L28 20L44 24L28 28L24 44L20 28L4 24L20 20Z"/>'
    };
    badgeCol.innerHTML =
      '<svg class="cw-voice-card__role-icon cw-voice-card__role-label--' + row.role + '" viewBox="0 0 48 48" aria-hidden="true">' + roleIcons[row.role] + '</svg>' +
      '<span class="cw-voice-card__role-label cw-voice-card__role-label--' + row.role + '">' + role.label + '</span>';

    meta.appendChild(badgeCol);
    top.appendChild(identity);

    var body = document.createElement("div");
    body.className = "cw-voice-card__body";

    if (row.response_title) {
      var title = document.createElement("p");
      title.className = "cw-voice-card__title";
      title.textContent = row.response_title;
      body.appendChild(title);
    }

    if (row.response_type === "audio" && row.audio_path) {
      body.appendChild(buildAudioBody(row));
    } else if (row.why_detail) {
      body.appendChild(buildQuoteBody(row));
    }

    article.append(top, body);
    return article;
  }

  var linkedVoice = window.location.hash.indexOf("#voice-") === 0 ? window.location.hash.slice(1) : null;
  function revealLinkedVoice() {
    if (!linkedVoice) return;
    var card = document.getElementById(linkedVoice);
    if (!card) return;
    card.scrollIntoView({ block: "start" });
    card.focus({ preventScroll: true });
    linkedVoice = null;
  }
  window.addEventListener("hashchange", function () {
    linkedVoice = window.location.hash.indexOf("#voice-") === 0 ? window.location.hash.slice(1) : null;
    revealLinkedVoice();
    if (linkedVoice) loadVoiceCards();
  });

  var voiceOffset = 0;
  var voiceLoading = false;
  async function loadVoiceCards() {
    var grid = document.querySelector(".cw-voice-grid");
    if (!grid || voiceLoading) return;
    var archive = grid.hasAttribute("data-voice-archive");
    var button = document.getElementById("voice-load-more");
    var message = document.getElementById("voice-message");
    var status = document.getElementById("voice-status");
    if (!window.tenGrandSupabase) {
      if (message) message.textContent = "Voices could not be loaded. Please refresh to try again.";
      grid.setAttribute("aria-busy", "false");
      return;
    }
    voiceLoading = true;
    grid.setAttribute("aria-busy", "true");
    if (button) button.disabled = true;
    try {
      var query = window.tenGrandSupabase
        .from("voices_heard")
        .select("*", { count: "exact" })
        .eq("status", "approved")
        .order("created_at", { ascending: false })
        .order("id", { ascending: false });
      var result = await (archive ? query.range(voiceOffset, voiceOffset + 23) : query.limit(24));
      if (result.error) throw result.error;
      var rows = result.data || [];
      var cards = rows.map(function (row, i) {
        return buildVoiceCard(row, voiceOffset + i + 1);
      }).filter(Boolean);
      if (archive) {
        cards.forEach(function (card) { grid.appendChild(card); });
        voiceOffset += rows.length;
        if (button) button.hidden = typeof result.count === "number"
          ? voiceOffset >= result.count : rows.length < 24;
        if (message) {
          message.hidden = grid.children.length > 0;
          message.textContent = "Voices are coming soon. Be the first to share yours.";
        }
        if (status) status.textContent = "Showing " + grid.children.length + " voices.";
      } else if (cards.length) {
        grid.replaceChildren.apply(grid, cards);
      }
      revealLinkedVoice();
      if (linkedVoice && archive && button && !button.hidden) {
        window.setTimeout(loadVoiceCards, 0);
      }
    } catch (error) {
      if (message) {
        message.hidden = false;
        message.textContent = "Voices could not be loaded. Please try again.";
      }
      if (button) button.hidden = false;
      console.error("Ten Grand voice cards failed to load", error);
    } finally {
      voiceLoading = false;
      grid.setAttribute("aria-busy", "false");
      if (button) button.disabled = false;
    }
  }

  var voiceLoadMore = document.getElementById("voice-load-more");
  if (voiceLoadMore) voiceLoadMore.addEventListener("click", loadVoiceCards);

  if (!document.querySelector("[data-voice-archive]")) loadStats();
  initJoinModal();
  loadVoiceCards();
})();
