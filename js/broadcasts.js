(function () {
  "use strict";

  var list = document.getElementById("broadcast-list");
  var button = document.getElementById("broadcast-load-more");
  var status = document.getElementById("broadcast-status");
  if (!list || !button) return;

  var cards = Array.prototype.slice.call(list.children);
  var batchSize = 10;
  var visibleCount = Math.min(batchSize, cards.length);

  function update() {
    cards.forEach(function (card, index) {
      card.hidden = index >= visibleCount;
    });
    button.hidden = visibleCount >= cards.length;
  }

  update();
  button.addEventListener("click", function () {
    var firstNewCard = cards[visibleCount];
    visibleCount = Math.min(visibleCount + batchSize, cards.length);
    update();
    if (status) status.textContent = "Showing " + visibleCount + " of " + cards.length + " broadcasts.";
    // Move focus into the appended batch, including when the button disappears.
    if (firstNewCard) {
      firstNewCard.setAttribute("tabindex", "-1");
      firstNewCard.focus({ preventScroll: true });
    }
  });
})();
