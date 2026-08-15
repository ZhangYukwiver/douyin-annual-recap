const path = require("node:path");

let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => { input += chunk; });
process.stdin.on("end", () => {
  let result = { a_bogus: "", ok: false };
  try {
    const payload = JSON.parse(input);
    const runtimeDirectory = process.argv[2];
    const parameters = new URL(payload.url).searchParams;
    const env = require(path.join(runtimeDirectory, "bdms", "env.js"));
    env.updateUserAgent(payload.userAgent);
    env.navigator.appVersion = payload.userAgent.replace(/^Mozilla\//u, "");
    env.navigator.platform = parameters.get("browser_platform") || env.navigator.platform;
    env.navigator.language = parameters.get("browser_language") || env.navigator.language;
    env.navigator.languages = [env.navigator.language, env.navigator.language.split("-")[0]];
    env.navigator.hardwareConcurrency = Number(parameters.get("cpu_core_num")) || env.navigator.hardwareConcurrency;
    env.navigator.deviceMemory = Number(parameters.get("device_memory")) || env.navigator.deviceMemory;
    env.navigator.connection.downlink = Number(parameters.get("downlink")) || env.navigator.connection.downlink;
    env.navigator.connection.rtt = Number(parameters.get("round_trip_time")) || env.navigator.connection.rtt;
    const screenWidth = Number(parameters.get("screen_width"));
    const screenHeight = Number(parameters.get("screen_height"));
    if (screenWidth > 0 && screenHeight > 0) env.updateScreen(screenWidth, screenHeight);
    const { get_a_bogus: sign } = require(path.join(runtimeDirectory, "bdms", "index.js"));
    const method = payload.method === "POST" ? "POST" : "GET";
    const body = typeof payload.body === "string" && payload.body.length <= 4_096 ? payload.body : "";
    const aBogus = sign(payload.url, payload.uifid, method, body);
    result = { a_bogus: aBogus || "", ok: Boolean(aBogus) };
  } catch {
    // The parent process reports a fixed error and never exposes signer input.
  }
  if (global._process) global.process = global._process;
  process.stdout.write(`__SIGN_RESULT__${JSON.stringify(result)}\n`, () => process.exit(0));
});
