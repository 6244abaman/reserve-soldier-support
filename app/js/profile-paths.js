// Reading and writing places in a Recovery Profile by path, like
// "businesses[0].numbers.cashOnHand", and marking answers as estimated or
// missing in meta.unconfirmedFields ("path:estimated", "path:missing";
// CLAUDE.md rule 6). Shared by Intake and the Diagnostic.
//
// Works in the browser (window.MomentumPaths) and in Node tests (require).
(function (root) {
  "use strict";

  function parts(path) {
    return path.replace(/\[(\d+)\]/g, ".$1").split(".");
  }

  function getPath(obj, path) {
    return parts(path).reduce(function (o, k) { return o == null ? undefined : o[k]; }, obj);
  }

  function setPath(obj, path, value) {
    var keys = parts(path);
    var o = obj;
    for (var i = 0; i < keys.length - 1; i++) {
      if (o[keys[i]] == null) o[keys[i]] = /^\d+$/.test(keys[i + 1]) ? [] : {};
      o = o[keys[i]];
    }
    o[keys[keys.length - 1]] = value;
  }

  function deletePath(obj, path) {
    var keys = parts(path);
    var parent = getPath(obj, keys.slice(0, -1).join("."));
    if (parent && typeof parent === "object") delete parent[keys[keys.length - 1]];
  }

  // "businesses[#].name" with biz 1 -> "businesses[1].name"
  function pathFor(path, biz) { return path.replace("#", String(biz)); }

  // state: "estimated", "missing", or null to clear the mark.
  function mark(profile, path, state) {
    profile.meta = profile.meta || {};
    var list = (profile.meta.unconfirmedFields || []).filter(function (entry) {
      return entry.slice(0, entry.lastIndexOf(":")) !== path;
    });
    if (state) list.push(path + ":" + state);
    profile.meta.unconfirmedFields = list;
  }

  function markOf(profile, path) {
    var list = (profile.meta && profile.meta.unconfirmedFields) || [];
    for (var i = 0; i < list.length; i++) {
      var cut = list[i].lastIndexOf(":");
      if (list[i].slice(0, cut) === path) return list[i].slice(cut + 1);
    }
    return null;
  }

  // "32,000 ₪" -> 32000. Returns null when it is not a number.
  function parseNumber(text) {
    var clean = String(text == null ? "" : text).replace(/[\s,₪]/g, "");
    if (!/^\d+(\.\d+)?$/.test(clean)) return null;
    return Number(clean);
  }

  function copy(value) { return JSON.parse(JSON.stringify(value)); }

  var api = {
    getPath: getPath, setPath: setPath, deletePath: deletePath, pathFor: pathFor,
    mark: mark, markOf: markOf, parseNumber: parseNumber, copy: copy
  };
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.MomentumPaths = api;
})(this);
