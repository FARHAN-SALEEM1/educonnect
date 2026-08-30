import net from "node:net";

/**
 * A real SMTP server, small enough to keep in the test suite.
 *
 * The email tests could reach two states before this existed: SMTP not
 * configured (console fallback) and SMTP configured but every send throwing.
 * Neither of them ever put a message on a socket, so nothing had checked that
 * nodemailer connects, authenticates, and transmits the right envelope and
 * body — the whole point of the feature.
 *
 * This speaks enough ESMTP for nodemailer and records what actually arrived.
 * Written against `node:net` rather than pulling in a package: it is sixty
 * lines, it runs in CI with no install, and a mail sink that needs its own
 * dependency tree is a strange thing to trust about mail.
 *
 * STARTTLS is deliberately not advertised, so the session stays in plain text
 * and the test can read the bytes. That is also why it only ever listens on
 * 127.0.0.1 and on an ephemeral port.
 */
export async function startSmtpSink({ requireAuth = false, failAt = null } = {}) {
  /** Every message that completed DATA, in arrival order. */
  const messages = [];
  /** Every AUTH exchange, so a test can assert credentials were offered. */
  const authAttempts = [];

  const server = net.createServer((socket) => {
    let buffer = "";
    let inData = false;
    let dataLines = [];
    let envelope = { envelopeFrom: null, envelopeTo: [] };

    const write = (line) => socket.write(line + "\r\n");

    write("220 localhost EduConnect test sink");

    socket.on("data", (chunk) => {
      buffer += chunk.toString("utf8");

      let index;
      while ((index = buffer.indexOf("\r\n")) !== -1) {
        const line = buffer.slice(0, index);
        buffer = buffer.slice(index + 2);

        if (inData) {
          // A lone dot on its own line ends the body.
          if (line === ".") {
            inData = false;
            const raw = dataLines.join("\n");
            // Envelope last: the From: header and the address handed to the
            // server are different things, and a relay routes on the envelope.
            messages.push({ raw, ...parseMessage(raw), ...envelope });
            dataLines = [];
            envelope = { envelopeFrom: null, envelopeTo: [] };
            write("250 2.0.0 Ok: queued");
          } else {
            // Dot-stuffing: a body line starting with "." is sent as "..".
            dataLines.push(line.startsWith("..") ? line.slice(1) : line);
          }
          continue;
        }

        const upper = line.toUpperCase();

        if (failAt && upper.startsWith(failAt)) {
          write("451 4.3.0 Requested action aborted: local error");
          continue;
        }

        if (upper.startsWith("EHLO") || upper.startsWith("HELO")) {
          write("250-localhost");
          write("250-SIZE 10485760");
          write("250 AUTH PLAIN LOGIN");
        } else if (upper.startsWith("AUTH")) {
          authAttempts.push(line);
          // One challenge round is enough for LOGIN; PLAIN arrives inline.
          if (upper.startsWith("AUTH LOGIN")) {
            write("334 VXNlcm5hbWU6");
            socket.once("data", () => write("334 UGFzc3dvcmQ6"));
          }
          write("235 2.7.0 Authentication successful");
        } else if (upper.startsWith("MAIL FROM")) {
          if (requireAuth && !authAttempts.length) {
            write("530 5.7.0 Authentication required");
            continue;
          }
          envelope.envelopeFrom = between(line, "<", ">");
          write("250 2.1.0 Ok");
        } else if (upper.startsWith("RCPT TO")) {
          envelope.envelopeTo.push(between(line, "<", ">"));
          write("250 2.1.5 Ok");
        } else if (upper.startsWith("DATA")) {
          inData = true;
          write("354 End data with <CR><LF>.<CR><LF>");
        } else if (upper.startsWith("QUIT")) {
          write("221 2.0.0 Bye");
          socket.end();
        } else if (upper.startsWith("RSET") || upper.startsWith("NOOP")) {
          write("250 2.0.0 Ok");
        } else {
          /**
           * Anything unrecognised is refused, the way a real server refuses it.
           *
           * A catch-all 250 looked harmless and was not: this server does not
           * advertise STARTTLS, so a client that demands it sends the command
           * anyway, read "250 Ok" as success, and began a TLS handshake against
           * a plain socket that would never answer. The client hung for its
           * full socket timeout instead of failing in a second.
           */
          write("502 5.5.1 Command not implemented");
        }
      }
    });

    socket.on("error", () => { /* a client hanging up mid-session is not a test failure */ });
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));

  return {
    port: server.address().port,
    messages,
    authAttempts,
    /** Waits for `count` messages, or gives up so a test fails on the assertion. */
    async waitFor(count, timeoutMs = 4000) {
      const deadline = Date.now() + timeoutMs;
      while (messages.length < count && Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 25));
      }
      return messages;
    },
    close: () =>
      new Promise((resolve) => {
        server.close(resolve);
        server.unref();
      }),
  };
}

const between = (line, open, close) => {
  const a = line.indexOf(open);
  const b = line.lastIndexOf(close);
  return a === -1 || b === -1 ? null : line.slice(a + 1, b);
};

/**
 * Enough MIME to assert on: headers, and the decoded text of the body.
 *
 * Nodemailer sends multipart/alternative with quoted-printable parts, so a
 * plain `raw.includes("...")` misses anything containing a long line or a
 * non-ASCII character. Decoding here means a test can look for the actual
 * sentence a parent would read.
 */
function parseMessage(raw) {
  const split = raw.indexOf("\n\n");
  const headerBlock = split === -1 ? raw : raw.slice(0, split);
  const bodyBlock = split === -1 ? "" : raw.slice(split + 2);

  const headers = {};
  // Unfold RFC 5322 continuation lines before splitting on the colon.
  for (const line of headerBlock.replace(/\n[ \t]+/g, " ").split("\n")) {
    const colon = line.indexOf(":");
    if (colon === -1) continue;
    headers[line.slice(0, colon).trim().toLowerCase()] = line.slice(colon + 1).trim();
  }

  return {
    headers,
    subject: decodeHeader(headers.subject ?? ""),
    to: headers.to ?? "",
    from: headers.from ?? "",
    body: decodeQuotedPrintable(bodyBlock),
  };
}

/**
 * `=?UTF-8?Q?...?=` and `=?UTF-8?B?...?=`, which nodemailer uses for subjects.
 *
 * A long subject is folded across lines and split into several encoded words.
 * The whitespace *between* two encoded words is folding, not content, and
 * RFC 2047 says to drop it — leaving it in produced "Rs. 12,500 ou tstanding"
 * from a subject that was written correctly.
 */
function decodeHeader(value) {
  const word = /=\?[^?]+\?[QqBb]\?[^?]*\?=/;
  const joined = value.replace(
    new RegExp(`(${word.source})\\s+(?=${word.source})`, "g"),
    "$1"
  );

  return joined.replace(/=\?[^?]+\?([QqBb])\?([^?]*)\?=/g, (_, kind, text) =>
    kind.toUpperCase() === "B"
      ? Buffer.from(text, "base64").toString("utf8")
      : decodeQuotedPrintable(text.replace(/_/g, " "))
  );
}

/**
 * Decoded as bytes and then as UTF-8, not one character at a time.
 *
 * Doing it per escape turned the em dash in "Absence on Friday — Beaconhouse"
 * into three stray characters, so a test looking for the sentence a parent
 * actually reads would have failed on a message that was perfectly correct.
 */
function decodeQuotedPrintable(text) {
  const unfolded = text.replace(/=\r?\n/g, "");
  const bytes = [];
  for (let i = 0; i < unfolded.length; i += 1) {
    const hex = unfolded[i] === "=" && unfolded.slice(i + 1, i + 3);
    if (hex && /^[0-9A-Fa-f]{2}$/.test(hex)) {
      bytes.push(parseInt(hex, 16));
      i += 2;
    } else {
      bytes.push(...Buffer.from(unfolded[i], "utf8"));
    }
  }
  return Buffer.from(bytes).toString("utf8");
}
