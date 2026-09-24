// Parses the JavaScript object literal that SvelteKit embeds in its pages
// ({players:[{assetId:1,cardName:"x"}]} - keys unquoted, so JSON.parse can't read it).
// It is a data-only parser: nothing from the page is ever executed.

export function parseJsLiteral(src) {
  let i = 0;

  const fail = (msg) => {
    throw new Error(`${msg} at ${i}: ${JSON.stringify(src.slice(Math.max(0, i - 40), i + 40))}`);
  };
  const skipWs = () => {
    while (i < src.length && /\s/.test(src[i])) i++;
  };

  function value() {
    skipWs();
    const c = src[i];
    if (c === "{") return object();
    if (c === "[") return array();
    if (c === '"' || c === "'") return string();
    if (c === "-" || c === "." || (c >= "0" && c <= "9")) return number();
    return identifier();
  }

  function object() {
    const out = {};
    i++; // {
    skipWs();
    while (src[i] !== "}") {
      skipWs();
      let key;
      if (src[i] === '"' || src[i] === "'") key = string();
      else {
        const m = /^[A-Za-z_$0-9]+/.exec(src.slice(i, i + 200));
        if (!m) fail("bad key");
        key = m[0];
        i += key.length;
      }
      skipWs();
      if (src[i] !== ":") fail("expected :");
      i++;
      out[key] = value();
      skipWs();
      if (src[i] === ",") i++;
      else if (src[i] !== "}") fail("expected , or }");
      skipWs();
    }
    i++; // }
    return out;
  }

  function array() {
    const out = [];
    i++; // [
    skipWs();
    while (src[i] !== "]") {
      if (src[i] === ",") { out.push(undefined); i++; skipWs(); continue; } // hole: [1,,2]
      out.push(value());
      skipWs();
      if (src[i] === ",") i++;
      else if (src[i] !== "]") fail("expected , or ]");
      skipWs();
    }
    i++; // ]
    return out;
  }

  function string() {
    const quote = src[i++];
    let out = "";
    while (src[i] !== quote) {
      if (i >= src.length) fail("unterminated string");
      if (src[i] === "\\") {
        const e = src[++i];
        if (e === "u") {
          out += String.fromCharCode(parseInt(src.slice(i + 1, i + 5), 16));
          i += 5;
          continue;
        }
        out += { n: "\n", t: "\t", r: "\r", b: "\b", f: "\f" }[e] ?? e;
        i++;
        continue;
      }
      out += src[i++];
    }
    i++;
    return out;
  }

  function number() {
    const m = /^-?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?/.exec(src.slice(i, i + 40));
    if (!m) fail("bad number");
    i += m[0].length;
    return Number(m[0]);
  }

  function identifier() {
    const rest = src.slice(i, i + 20);
    for (const [word, val] of [["true", true], ["false", false], ["null", null], ["void 0", undefined],
                               ["undefined", undefined], ["NaN", NaN], ["Infinity", Infinity]]) {
      if (rest.startsWith(word)) { i += word.length; return val; }
    }
    fail("unexpected token");
  }

  const result = value();
  return { value: result, end: i };
}

// Pull the `data: [...]` array out of a SvelteKit page's kit.start(...) call.
export function extractKitData(html) {
  const start = html.indexOf("kit.start(");
  if (start < 0) throw new Error("no kit.start in page");
  const dataAt = html.indexOf("data:", start);
  if (dataAt < 0) throw new Error("no data: in kit.start");
  const open = html.indexOf("[", dataAt);
  return parseJsLiteral(html.slice(open)).value;
}
