// Small helpers for drawing screens, shared by every screen file.
// el("p", { class: "lead", text: "Hi" }) makes <p class="lead">Hi</p>.
// Text is always set as text, never as HTML, so typed answers can't break the page.
(function (root) {
  "use strict";

  function append(node, child) {
    if (child == null || child === false) return;
    if (Array.isArray(child)) { child.forEach(function (c) { append(node, c); }); return; }
    node.appendChild(typeof child === "string" ? document.createTextNode(child) : child);
  }

  function el(tag, props) {
    var node = document.createElement(tag);
    Object.keys(props || {}).forEach(function (k) {
      var v = props[k];
      if (v === false || v == null) return;
      if (k === "text") node.textContent = v;
      else if (k === "class") node.className = v;
      else if (k.indexOf("on") === 0) node.addEventListener(k.slice(2), v);
      else node.setAttribute(k, v === true ? "" : v);
    });
    for (var i = 2; i < arguments.length; i++) append(node, arguments[i]);
    return node;
  }

  // fill("Hello {name}", { name: "Noam" }) -> "Hello Noam"
  function fill(text, vars) {
    return String(text).replace(/\{(\w+)\}/g, function (_, k) { return vars && vars[k] != null ? vars[k] : ""; });
  }

  root.MomentumDom = { el: el, append: append, fill: fill };
})(this);
