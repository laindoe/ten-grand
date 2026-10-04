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
      .from("comm_voices")
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
    var trigger = document.querySelector("[data-join-trigger]");
    if (!modal || !trigger) return;

    var lastFocused = null;

    function openModal() {
      lastFocused = trigger;
      modal.classList.add("is-open");
      modal.setAttribute("aria-hidden", "false");
      document.body.classList.add("modal-open");
      modal.querySelector(".modal__close").focus();
    }

    function closeModal() {
      modal.classList.remove("is-open");
      modal.setAttribute("aria-hidden", "true");
      document.body.classList.remove("modal-open");
      if (lastFocused) lastFocused.focus();
    }

    trigger.addEventListener("click", openModal);
    modal.querySelectorAll("[data-modal-close]").forEach(function (el) {
      el.addEventListener("click", closeModal);
    });
    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && modal.classList.contains("is-open")) closeModal();
    });
  }

  loadStats();
  initJoinModal();
})();
