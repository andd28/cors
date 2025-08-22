// config.js
module.exports = {
  proxy_request_timeout_ms: 10000,
  max_request_length: 100000,
  blacklist_hostname_regex: /^(10\.|192\.168\.|127\.|localhost$)/i
};
