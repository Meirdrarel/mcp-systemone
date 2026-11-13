import http from "node:http";

/**
 * Minimal mock of a System One endpoint for tests.
 * Records each request (url, authorization header or undefined, content-type, body)
 * and replies with the configured status and body.
 */
export function startMockSystemOne({ status = 200, body = {}, delayMs = 0, raw = null } = {}) {
  const requests = [];
  const server = http.createServer((req, res) => {
    let rawBody = "";
    req.on("data", (chunk) => (rawBody += chunk));
    req.on("end", () => {
      requests.push({
        url: req.url,
        authorization: req.headers.authorization,
        contentType: req.headers["content-type"],
        body: JSON.parse(rawBody),
      });
      const respond = () => {
        if (raw !== null) {
          res.writeHead(status, { "Content-Type": "text/plain" });
          res.end(raw);
          return;
        }
        res.writeHead(status, { "Content-Type": "application/json" });
        res.end(JSON.stringify(body));
      };
      if (delayMs > 0) {
        setTimeout(respond, delayMs);
      } else {
        respond();
      }
    });
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () =>
      resolve({
        port: server.address().port,
        requests,
        close: () => new Promise((done) => server.close(done)),
      }),
    );
  });
}
