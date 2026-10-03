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

  loadStats();
})();
