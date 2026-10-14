(function () {
  var lang = new URLSearchParams(location.search).get('lang');
  if (lang !== 'en') return;

  var SKIP = 'textarea, input, select, option, script, style, code, svg';

  function skip(node) {
    var el = node.parentElement;
    return !el || Boolean(el.closest(SKIP));
  }

  function apply(map) {
    var walker = document.createTreeWalker(document.body || document.documentElement, NodeFilter.SHOW_TEXT);
    var texts = [];
    var current = walker.nextNode();
    while (current) {
      texts.push(current);
      current = walker.nextNode();
    }
    texts.forEach(function (text) {
      if (skip(text)) return;
      var trimmed = text.data.trim();
      var mapped = map[trimmed];
      if (!mapped || mapped === text.data) return;
      var lead = (text.data.match(/^\s*/) || [''])[0];
      var trail = (text.data.match(/\s*$/) || [''])[0];
      text.data = lead + mapped + trail;
    });
    document.querySelectorAll('[placeholder], [title], [aria-label]').forEach(function (el) {
      ['placeholder', 'title', 'aria-label'].forEach(function (attr) {
        var value = el.getAttribute(attr);
        if (value && map[value.trim()] && map[value.trim()] !== value) el.setAttribute(attr, map[value.trim()]);
      });
    });
    if (document.title && map[document.title.trim()]) document.title = map[document.title.trim()];
    document.documentElement.lang = 'en';
  }

  fetch(new URL('en-phrases.json', location.href))
    .then(function (response) { return response.json(); })
    .then(function (map) {
      var applying = false;
      var run = function () {
        if (applying) return;
        applying = true;
        try { apply(map); } finally { applying = false; }
      };
      run();
      new MutationObserver(run).observe(document.documentElement, {
        subtree: true,
        childList: true,
        characterData: true,
      });
    })
    .catch(function () {});
})();
