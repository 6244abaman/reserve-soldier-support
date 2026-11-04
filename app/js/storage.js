// The one place that loads and saves a Recovery Profile.
//
// Today it saves to the browser (localStorage), one profile per phone number.
// To move to a server database later, only this file changes: everything else
// keeps calling load(), save(), and validate().
//
// Every save is checked against the schema first. If the check fails, nothing
// is written and the old saved profile stays exactly as it was.
//
// Works in the browser (window.MomentumStorage) and in Node tests (require).
(function (root) {
  "use strict";

  var KEY_PREFIX = "momentum.profile.";

  // "050-123 4567", "+972 50 123 4567" and "0501234567" are the same phone,
  // so they must find the same profile.
  function normalizePhone(phone) {
    var digits = String(phone == null ? "" : phone).replace(/\D/g, "");
    if (digits.indexOf("972") === 0) digits = "0" + digits.slice(3);
    return digits.length >= 9 ? digits : null;
  }

  function copy(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function fail(message, path) {
    return { ok: false, errors: [path ? { path: path, message: message } : { message: message }] };
  }

  function createProfileStore(options) {
    var opts = options || {};
    var backend = opts.backend;
    var schema = opts.schema;
    var validator = opts.validator;
    var now = opts.now || function () { return new Date().toISOString(); };

    if (!backend) {
      try { backend = root.localStorage; } catch (e) { backend = null; }
    }

    function keyFor(phone) {
      var normal = normalizePhone(phone);
      return normal ? KEY_PREFIX + normal : null;
    }

    function validate(profile) {
      return validator.validateProfile(profile, schema);
    }

    // Returns { ok, profile, errors }. profile is null when nothing is saved yet.
    // Saved data that no longer passes the check is still returned (ok: false),
    // never deleted, so nothing a soldier entered is ever lost.
    function load(phone) {
      var key = keyFor(phone);
      if (!key) return { ok: false, profile: null, errors: fail("This phone number looks incomplete.", "person.phone").errors };
      if (!backend) return { ok: false, profile: null, errors: fail("Saving is not available in this browser.").errors };

      var raw;
      try { raw = backend.getItem(key); } catch (e) {
        return { ok: false, profile: null, errors: fail("Saving is not available in this browser.").errors };
      }
      if (raw == null) return { ok: true, profile: null, errors: [] };

      var profile;
      try { profile = JSON.parse(raw); } catch (e) {
        return { ok: false, profile: null, errors: fail("The saved profile could not be read. It was left in place.").errors };
      }
      var result = validate(profile);
      return { ok: result.ok, profile: profile, errors: result.errors };
    }

    // Returns { ok: true, profile } with the saved copy (timestamps filled in),
    // or { ok: false, errors } and nothing is written.
    function save(profile) {
      if (!profile || typeof profile !== "object") return fail("There is no profile to save.");
      var phone = profile.person && profile.person.phone;
      var key = keyFor(phone);
      if (!key) return fail("A full phone number is needed to save the profile.", "person.phone");
      if (!backend) return fail("Saving is not available in this browser.");

      var toSave = copy(profile);
      var stamp = now();
      toSave.meta = toSave.meta || {};
      if (!toSave.meta.createdAt) toSave.meta.createdAt = stamp;
      toSave.meta.updatedAt = stamp;

      var result = validate(toSave);
      if (!result.ok) return { ok: false, errors: result.errors };

      try { backend.setItem(key, JSON.stringify(toSave)); } catch (e) {
        return fail("The profile could not be saved on this device. It may be full or blocked.");
      }
      return { ok: true, profile: toSave, errors: [] };
    }

    return { load: load, save: save, validate: validate };
  }

  var api = { createProfileStore: createProfileStore, normalizePhone: normalizePhone };
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.MomentumStorage = api;
})(this);
