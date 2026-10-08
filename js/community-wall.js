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
      var roles = ["create", "build", "fund", "support"];
      var counts = await Promise.all(
        [approvedCount(null)].concat(roles.map(approvedCount))
      );
      var total = counts[0];
      if (total !== null) setStat("total", total);
      roles.forEach(function (role, i) {
        var count = counts[i + 1];
        if (count !== null) setStat(role, count);
      });
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

  // These are static sample cards (no real audio file behind them),
  // so "play" just demonstrates the interaction: toggling the button
  // between its play and pause icon/label.
  function initVoiceCardAudio() {
    var buttons = document.querySelectorAll(".cw-voice-card__audio-play");
    buttons.forEach(function (button) {
      var playIcon = button.querySelector(".amass-flow__review-play-icon--play");
      var pauseIcon = button.querySelector(".amass-flow__review-play-icon--pause");
      var label = button.querySelector("span");
      button.addEventListener("click", function () {
        var isPlaying = !button.classList.contains("is-playing");
        button.classList.toggle("is-playing", isPlaying);
        setSvgHidden(playIcon, isPlaying);
        setSvgHidden(pauseIcon, !isPlaying);
        label.textContent = isPlaying ? "Pause" : "Play";
      });
    });
  }

  // .cw-voice-card__avatar (CSS: grid + align-self:stretch +
  // aspect-ratio) does correctly size itself to match the name/links
  // column's real height, including when a 2-line name wraps -- but
  // .cw-voice-card__top, the grid row containing it, doesn't grow to
  // contain that stretched child: measured, the row's own box stays
  // only as tall as its non-stretched children (badge column), so a
  // taller avatar/identity overflows past the row's reported bottom
  // edge. .cw-voice-card__body's margin-top is measured from that
  // (too-small) edge, so it lands inside the overflow instead of
  // below it. This corrects the gap directly: however far the
  // content actually overflows past the row's box, add that onto the
  // intended 24px gap.
  function fixVoiceCardSpacing() {
    var desiredGap = 24;
    document.querySelectorAll(".cw-voice-card").forEach(function (card) {
      var top = card.querySelector(".cw-voice-card__top");
      var body = card.querySelector(".cw-voice-card__body");
      if (!top || !body) return;
      body.style.removeProperty("margin-top");
      var edges = [top, top.querySelector(".cw-voice-card__avatar"), top.querySelector(".cw-voice-card__identity"), top.querySelector(".cw-voice-card__badge-col")]
        .filter(Boolean)
        .map(function (el) {
          return el.getBoundingClientRect().bottom;
        });
      var contentBottom = Math.max.apply(null, edges);
      var topBottom = top.getBoundingClientRect().bottom;
      var shortfall = contentBottom - topBottom;
      if (shortfall > 0.5) {
        body.style.marginTop = Math.ceil(desiredGap + shortfall) + "px";
      }
    });
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
      '<rect class="cw-voice-card__orb-glow" x="10" y="10" width="44" height="44" style="fill:var(--cw-color-' + role + ')" opacity="0.52" filter="url(#' + glowId + ')"/>' +
      '<rect class="cw-voice-card__orb-core" x="10" y="10" width="44" height="44" fill="url(#' + gradId + ')"/>' +
      '<rect class="cw-voice-card__orb-ring" x="10" y="10" width="44" height="44" fill="none" style="stroke:var(--color-card-border)" stroke-width="1"/>';
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

  // Draws the real waveform from a row's stored audio_peaks (one bar
  // per peak, height scaled from its 0-1 amplitude), or -- for audio
  // submitted before this existed, or if the client-side decode
  // failed at submission time -- a plain evenly-varied placeholder
  // pattern, so the card still reads as a waveform either way.
  function renderWaveformBars(waveEl, peaks) {
    waveEl.replaceChildren();
    var count = peaks && peaks.length ? peaks.length : 60;
    var minHeightPct = 12;
    for (var i = 0; i < count; i++) {
      var bar = document.createElement("span");
      bar.className = "cw-voice-card__audio-bar";
      var rawAmplitude = peaks && peaks.length ? peaks[i] : [1, 0.5, 0.75][i % 3];
      var amplitude = Math.max(0, Math.min(1, rawAmplitude));
      bar.style.height = Math.round(minHeightPct + amplitude * (100 - minHeightPct)) + "%";
      waveEl.appendChild(bar);
    }
  }

  function setPlayedBars(waveEl, fraction) {
    var bars = waveEl.children;
    var playedCount = Math.round(fraction * bars.length);
    for (var i = 0; i < bars.length; i++) {
      bars[i].classList.toggle("is-played", i < playedCount);
    }
  }

  // Builds the audio row for a real submission: a real <audio> element
  // (hidden -- .amass-flow__review-audio-el, same as the modal's own
  // player) drives a real play/pause button and a waveform playhead,
  // instead of the cosmetic class-toggle initVoiceCardAudio() gives
  // the static example cards.
  function buildAudioBody(row) {
    var url = publicStorageUrl("voices-heard-audio", row.audio_path);
    var durationSeconds = row.audio_duration || 0;

    var wrap = document.createElement("div");
    wrap.className = "cw-voice-card__audio cw-voice-card__audio--" + row.role;
    wrap.setAttribute("role", "group");
    wrap.setAttribute("aria-label", "Audio response, " + formatDurationWords(durationSeconds));

    var audio = document.createElement("audio");
    audio.className = "amass-flow__review-audio-el";
    if (url) audio.src = url;
    audio.preload = "none";

    var button = document.createElement("button");
    button.type = "button";
    button.className = "cw-voice-card__audio-play amass-flow__review-play";
    button.setAttribute("aria-label", "Play audio response");
    button.innerHTML =
      '<svg class="amass-flow__review-play-icon amass-flow__review-play-icon--play" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5 L19 12 L7 19 Z"/></svg>' +
      '<svg class="amass-flow__review-play-icon amass-flow__review-play-icon--pause" viewBox="0 0 24 24" aria-hidden="true" hidden><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>' +
      "<span>Play</span>";
    var playIcon = button.querySelector(".amass-flow__review-play-icon--play");
    var pauseIcon = button.querySelector(".amass-flow__review-play-icon--pause");
    var label = button.querySelector("span");

    var wave = document.createElement("span");
    wave.className = "cw-voice-card__audio-wave cw-voice-card__audio-wave--real";
    wave.setAttribute("aria-hidden", "true");
    renderWaveformBars(wave, row.audio_peaks);

    var time = document.createElement("span");
    time.className = "cw-voice-card__audio-time";
    time.setAttribute("aria-hidden", "true");
    time.textContent = "0:00 / " + formatClock(durationSeconds);

    function setIcon(isPlaying) {
      setSvgHidden(playIcon, isPlaying);
      setSvgHidden(pauseIcon, !isPlaying);
      label.textContent = isPlaying ? "Pause" : "Play";
      button.classList.toggle("is-playing", isPlaying);
    }

    button.addEventListener("click", function () {
      if (!url) return;
      if (audio.paused) audio.play();
      else audio.pause();
    });
    audio.addEventListener("play", function () { setIcon(true); });
    audio.addEventListener("pause", function () { setIcon(false); });
    audio.addEventListener("ended", function () {
      setIcon(false);
      time.textContent = "0:00 / " + formatClock(durationSeconds);
      setPlayedBars(wave, 0);
    });
    audio.addEventListener("timeupdate", function () {
      if (audio.paused) return;
      time.textContent = formatClock(audio.currentTime) + " / " + formatClock(durationSeconds);
      if (audio.duration) setPlayedBars(wave, audio.currentTime / audio.duration);
    });

    wrap.append(audio, button, wave, time);
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
    badgeCol.innerHTML =
      '<span class="cw-voice-card__badge cw-voice-card__badge--' + row.role + '" aria-hidden="true">' +
        '<span class="cw-voice-card__badge-ring"></span>' +
        '<span class="cw-voice-card__badge-number">' + String(badgeNumber).padStart(4, "0") + "</span>" +
      "</span>" +
      '<span class="cw-voice-card__role-label cw-voice-card__role-label--' + row.role + '">' + role.label + "</span>";

    top.append(identity, badgeCol);

    var body = document.createElement("div");
    body.className = "cw-voice-card__body";
    var subtitle = document.createElement("p");
    subtitle.className = "cw-voice-card__subtitle";
    subtitle.textContent = "WHY I " + role.verb;
    body.appendChild(subtitle);

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

  // Replaces the four static example cards with real approved
  // submissions. Left untouched (same as loadStats()) if the
  // Supabase client isn't available, the query fails, or there are
  // no approved submissions yet -- the page should never show an
  // empty wall or break over this.
  async function loadVoiceCards() {
    if (!window.tenGrandSupabase) return;
    try {
      var result = await window.tenGrandSupabase
        .from("voices_heard")
        .select("*")
        .eq("status", "approved")
        .order("created_at", { ascending: false })
        .limit(24);
      if (result.error || !result.data || !result.data.length) return;

      var grid = document.querySelector(".cw-voice-grid");
      if (!grid) return;

      var cards = result.data
        .map(function (row, i) { return buildVoiceCard(row, i + 1); })
        .filter(Boolean);
      if (!cards.length) return;

      // Real cards wire their own play/pause listener in
      // buildAudioBody() (driven by real <audio> events, not the
      // class-toggle initVoiceCardAudio() uses for the static
      // examples) -- re-running it here would double-bind their
      // buttons and fight the real one.
      grid.replaceChildren.apply(grid, cards);
      fixVoiceCardSpacing();
    } catch (error) {
      console.error("Ten Grand voice cards failed to load", error);
    }
  }

  loadStats();
  initJoinModal();
  initVoiceCardAudio();
  fixVoiceCardSpacing();
  loadVoiceCards();
  window.addEventListener("resize", fixVoiceCardSpacing);
  // Catches any late reflow from web fonts swapping in after this
  // script runs, which can change whether a name wraps.
  window.addEventListener("load", fixVoiceCardSpacing);
})();
