// Checks a Recovery Profile against schema/recovery-profile.json.
//
// It understands only the schema rules our schema uses (listed in SUPPORTED).
// If someone adds a rule it does not understand, it stops with a clear error
// instead of silently ignoring it, so the check can never quietly get weaker.
//
// Works in the browser (window.MomentumValidate) and in Node tests (require).
(function (root) {
  "use strict";

  var SUPPORTED = [
    "$schema", "title", "type", "required", "properties",
    "additionalProperties", "items", "maxItems", "enum", "format"
  ];

  function checkSchemaRules(schema, where) {
    Object.keys(schema).forEach(function (key) {
      if (SUPPORTED.indexOf(key) === -1) {
        throw new Error("The profile checker does not understand the schema rule \"" + key +
          "\" at " + (where || "the top") + ". Update app/js/validate.js before using it.");
      }
    });
    if (schema.properties) {
      Object.keys(schema.properties).forEach(function (name) {
        checkSchemaRules(schema.properties[name], join(where, name));
      });
    }
    if (schema.items) checkSchemaRules(schema.items, (where || "") + "[]");
  }

  function join(path, name) {
    return path ? path + "." + name : name;
  }

  function typeOf(value) {
    if (value === null) return "null";
    if (Array.isArray(value)) return "array";
    return typeof value; // "object", "string", "number", "boolean", ...
  }

  function isValidDate(text) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
    if (!m) return false;
    var d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
  }

  function isValidDateTime(text) {
    var m = /^(\d{4}-\d{2}-\d{2})T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/.exec(text);
    return Boolean(m) && isValidDate(m[1]) && !isNaN(Date.parse(text));
  }

  function check(value, schema, path, errors) {
    var where = path || "the profile";

    if (schema.enum && schema.enum.indexOf(value) === -1) {
      errors.push({ path: where, message: "must be one of: " + schema.enum.join(", ") });
      return;
    }

    if (schema.type) {
      var actual = typeOf(value);
      var ok = actual === schema.type && !(schema.type === "number" && !isFinite(value));
      if (!ok) {
        errors.push({ path: where, message: "must be a " + schema.type + " (got " + actual + ")" });
        return;
      }
    }

    if (schema.format === "date" && !isValidDate(value)) {
      errors.push({ path: where, message: "must be a date like 2026-11-04" });
    }
    if (schema.format === "date-time" && !isValidDateTime(value)) {
      errors.push({ path: where, message: "must be a date and time like 2026-11-04T09:30:00Z" });
    }

    if (schema.type === "object") {
      (schema.required || []).forEach(function (name) {
        if (!(name in value)) errors.push({ path: join(path, name), message: "is required" });
      });
      Object.keys(value).forEach(function (name) {
        var sub = schema.properties && schema.properties[name];
        if (sub) {
          check(value[name], sub, join(path, name), errors);
        } else if (schema.additionalProperties === false) {
          errors.push({ path: join(path, name), message: "is not allowed here (not in the schema)" });
        }
      });
    }

    if (schema.type === "array") {
      if (typeof schema.maxItems === "number" && value.length > schema.maxItems) {
        errors.push({ path: where, message: "can have at most " + schema.maxItems + " items (has " + value.length + ")" });
      }
      if (schema.items) {
        value.forEach(function (item, i) {
          check(item, schema.items, (path || "") + "[" + i + "]", errors);
        });
      }
    }
  }

  // Returns { ok: true, errors: [] } or { ok: false, errors: [{ path, message }] }.
  function validateProfile(profile, schema) {
    checkSchemaRules(schema, "");
    var errors = [];
    check(profile, schema, "", errors);
    return { ok: errors.length === 0, errors: errors };
  }

  var api = { validateProfile: validateProfile };
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.MomentumValidate = api;
})(this);
