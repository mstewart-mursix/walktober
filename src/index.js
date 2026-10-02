const COOKIE_NAME = "walktober_session";
const SESSION_SECONDS = 60 * 60 * 24 * 30;
const CHALLENGE_START = "2026-10-01";
const CHALLENGE_END = "2026-10-31";
const CHALLENGE_TIME_ZONE = "America/Indiana/Indianapolis";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(request);

    try {
      return await route(request, env, url);
    } catch (error) {
      console.error("Walktober request failed:", error);
      return json({ error: "Something went wrong. Please try again." }, 500);
    }
  },
};

async function route(request, env, url) {
  const { pathname } = url;
  if (request.method === "GET" && pathname === "/api/leaderboard") {
    return leaderboard(env);
  }
  if (request.method === "GET" && pathname === "/api/me") {
    const participant = await currentParticipant(request, env);
    return json({ participant: participant ? publicParticipant(participant) : null });
  }
  if (request.method === "GET" && pathname === "/api/steps") {
    const participant = await requireParticipant(request, env);
    if (participant instanceof Response) return participant;
    const [stepsResult, readingsResult] = await Promise.all([
      env.DB.prepare(
        "SELECT step_date AS date, steps FROM daily_steps WHERE participant_id = ? ORDER BY step_date DESC",
      ).bind(participant.id).all(),
      env.DB.prepare(
        "SELECT step_date AS date, cycle_start AS cycleStart, reading FROM stepometer_readings WHERE participant_id = ? ORDER BY step_date DESC, cycle_start DESC",
      ).bind(participant.id).all(),
    ]);
    const readingsByDate = new Map();
    for (const entry of readingsResult.results) {
      if (!readingsByDate.has(entry.date)) readingsByDate.set(entry.date, []);
      readingsByDate.get(entry.date).push({ cycleStart: entry.cycleStart, reading: entry.reading });
    }
    return json({ steps: stepsResult.results.map((entry) => ({
      ...entry,
      readings: readingsByDate.get(entry.date) || [],
    })) });
  }
  if (request.method === "PUT" && pathname === "/api/privacy") {
    if (!sameOrigin(request)) return json({ error: "Request could not be verified." }, 403);
    const participant = await requireParticipant(request, env);
    if (participant instanceof Response) return participant;
    const body = await readJson(request);
    if (!body || typeof body.hideIndividual !== "boolean") {
      return json({ error: "Choose whether to hide your individual total." }, 400);
    }
    await env.DB.prepare("UPDATE participants SET hide_individual = ? WHERE id = ?")
      .bind(body.hideIndividual ? 1 : 0, participant.id).run();
    return json({ participant: publicParticipant({ ...participant, hide_individual: body.hideIndividual ? 1 : 0 }) });
  }
  if (request.method === "POST" && pathname === "/api/claim") {
    if (!sameOrigin(request)) return json({ error: "Request could not be verified." }, 403);
    return throttledAuth(request, env, "claim", () => claim(request, env));
  }
  if (request.method === "POST" && pathname === "/api/login") {
    if (!sameOrigin(request)) return json({ error: "Request could not be verified." }, 403);
    return throttledAuth(request, env, "login", () => login(request, env));
  }
  if (request.method === "POST" && pathname === "/api/logout") {
    if (!sameOrigin(request)) return json({ error: "Request could not be verified." }, 403);
    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...headers(), "Set-Cookie": clearSessionCookie(request) },
    });
  }
  if (request.method === "PUT" && pathname === "/api/steps") {
    if (!sameOrigin(request)) return json({ error: "Request could not be verified." }, 403);
    const participant = await requireParticipant(request, env);
    if (participant instanceof Response) return participant;
    return saveSteps(request, env, participant);
  }
  return json({ error: "Not found." }, 404);
}

async function leaderboard(env) {
  const [peopleResult, teamsResult, rosterResult] = await Promise.all([
    env.DB.prepare(
      `SELECT p.id, p.name, p.team, COALESCE(SUM(s.steps), 0) AS total_steps,
        COUNT(s.step_date) AS days_logged
       FROM participants p LEFT JOIN daily_steps s ON s.participant_id = p.id
       WHERE p.hide_individual = 0
       GROUP BY p.id ORDER BY total_steps DESC, p.name COLLATE NOCASE ASC`,
    ).all(),
    env.DB.prepare(
      `SELECT p.team, COALESCE(SUM(s.steps), 0) AS total_steps,
        COUNT(DISTINCT CASE WHEN s.steps > 0 THEN p.id END) AS walkers_logged,
        COUNT(DISTINCT p.id) AS participant_count,
        COUNT(s.step_date) AS days_logged
       FROM participants p LEFT JOIN daily_steps s ON s.participant_id = p.id
       GROUP BY p.team ORDER BY p.team ASC`,
    ).all(),
    env.DB.prepare("SELECT id, name, team FROM participants ORDER BY team, name COLLATE NOCASE").all(),
  ]);
  return json({
    challenge: { start: CHALLENGE_START, end: CHALLENGE_END, today: challengeToday() },
    people: peopleResult.results.map((person) => ({ ...person, team: publicTeamName(person.team) })),
    teams: teamsResult.results.map((team) => ({ ...team, team: publicTeamName(team.team) })),
    roster: rosterResult.results.map((person) => ({ ...person, team: publicTeamName(person.team) })),
    updatedAt: new Date().toISOString(),
  });
}

async function claim(request, env) {
  if (!env.CLAIM_CODE || env.CLAIM_CODE.length < 10 || !env.SESSION_SECRET || env.SESSION_SECRET.length < 32) {
    return json({ error: "Name claiming is not set up yet. Ask the challenge organizer for help." }, 503);
  }
  const body = await readJson(request);
  if (!body) return json({ error: "Please check the information and try again." }, 400);
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const claimCode = typeof body.claimCode === "string" ? body.claimCode.trim() : "";
  if (!name || password.length < 10 || password.length > 128 || !claimCode) {
    return json({ error: "Choose your roster name, enter the organizer code, and use a passphrase of at least 10 characters." }, 400);
  }
  if (!constantTimeEqual(claimCode, env.CLAIM_CODE)) {
    return json({ error: "That organizer code didn’t match. Check with the challenge organizer." }, 403);
  }
  const participant = await env.DB.prepare(
    "SELECT id, name, team, hide_individual FROM participants WHERE name = ? COLLATE NOCASE",
  ).bind(name).first();
  if (!participant) return json({ error: "Choose a name from the Walktober roster." }, 404);
  const existing = await env.DB.prepare(
    "SELECT participant_id FROM credentials WHERE participant_id = ?",
  ).bind(participant.id).first();
  if (existing) return json({ error: "That name has already been claimed. Try signing in or ask the organizer for help." }, 409);

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const passwordHash = await hashPassword(password, salt);
  try {
    await env.DB.prepare(
      "INSERT INTO credentials (participant_id, salt, password_hash) VALUES (?, ?, ?)",
    ).bind(participant.id, toBase64Url(salt), passwordHash).run();
  } catch {
    return json({ error: "That name was just claimed. Try signing in or ask the organizer for help." }, 409);
  }
  return setSessionResponse(request, env, participant);
}

async function login(request, env) {
  if (!env.SESSION_SECRET || env.SESSION_SECRET.length < 32) return json({ error: "Sign in is not set up yet. Ask the challenge organizer for help." }, 503);
  const body = await readJson(request);
  if (!body) return json({ error: "Please check your name and passphrase." }, 400);
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const record = await env.DB.prepare(
    `SELECT p.id, p.name, p.team, p.hide_individual, c.salt, c.password_hash
     FROM participants p JOIN credentials c ON c.participant_id = p.id
     WHERE p.name = ? COLLATE NOCASE`,
  ).bind(name).first();
  if (!record || !(await verifyPassword(password, record.salt, record.password_hash))) {
    return json({ error: "We couldn’t sign you in with those details." }, 401);
  }
  return setSessionResponse(request, env, record);
}

async function throttledAuth(request, env, action, handler) {
  if (!env.SESSION_SECRET) return handler();
  const ip = request.headers.get("CF-Connecting-IP") || "local";
  const fingerprint = await crypto.subtle.digest(
    "SHA-256", new TextEncoder().encode(`${env.SESSION_SECRET}:${action}:${ip}`),
  );
  const bucket = toBase64Url(new Uint8Array(fingerprint));
  const now = Math.floor(Date.now() / 1000);
  const row = await env.DB.prepare(
    "SELECT attempts, window_started, blocked_until FROM auth_throttle WHERE bucket_key = ?",
  ).bind(bucket).first();
  if (row?.blocked_until > now) {
    return json({ error: "Too many attempts. Please wait 15 minutes, then try again." }, 429);
  }

  const response = await handler();
  if (response.status >= 400 && response.status < 500) {
    if (!row || now - row.window_started >= 900 || row.blocked_until > 0) {
      await env.DB.prepare(
        `INSERT INTO auth_throttle (bucket_key, attempts, window_started, blocked_until)
         VALUES (?, 1, ?, 0)
         ON CONFLICT(bucket_key) DO UPDATE SET attempts = 1, window_started = excluded.window_started, blocked_until = 0`,
      ).bind(bucket, now).run();
    } else {
      const attempts = row.attempts + 1;
      await env.DB.prepare(
        "UPDATE auth_throttle SET attempts = ?, blocked_until = ? WHERE bucket_key = ?",
      ).bind(attempts, attempts >= 8 ? now + 900 : 0, bucket).run();
    }
  } else if (response.ok) {
    await env.DB.prepare("DELETE FROM auth_throttle WHERE bucket_key = ?").bind(bucket).run();
  }
  return response;
}

async function saveSteps(request, env, participant) {
  const body = await readJson(request);
  if (!body) return json({ error: "Enter a date and stepometer reading." }, 400);
  const date = typeof body.date === "string" ? body.date : "";
  const reading = Number(body.reading);
  const afterReset = body.afterReset === true;
  if (!/^2026-10-(0[1-9]|[12][0-9]|3[01])$/.test(date)) {
    return json({ error: "Choose a date in October 2026." }, 400);
  }
  if (!Number.isSafeInteger(reading) || reading < 0 || reading > 100000) {
    return json({ error: "Enter a whole-number stepometer reading from 0 to 100,000." }, 400);
  }
  if (afterReset && !isMondayDate(date)) {
    return json({ error: "The reset option is only available for Monday readings." }, 400);
  }
  if (date > challengeToday()) {
    return json({ error: "You can add steps through today, but not for a future date." }, 400);
  }
  const plan = await buildStepReadingPlan(env, participant.id, date, reading, afterReset);
  if (plan.error) return json({ error: plan.error }, 400);
  if (!matchesStepConfirmation(body.confirmation, plan.confirmation)) {
    return json({
      confirmationRequired: true,
      error: "Review the calculated steps, then confirm to save this reading.",
      preview: plan.confirmation,
    }, 409);
  }

  const statements = [
    env.DB.prepare(
      `INSERT INTO stepometer_readings (participant_id, step_date, cycle_start, reading, updated_at)
       VALUES (?, ?, ?, ?, datetime('now'))
       ON CONFLICT(participant_id, step_date, cycle_start) DO UPDATE SET
         reading = excluded.reading,
         updated_at = datetime('now')`,
    ).bind(participant.id, date, plan.confirmation.cycleStart, reading),
    ...plan.contributions.map(({ date: stepDate, steps }) => env.DB.prepare(
      `INSERT INTO daily_steps (participant_id, step_date, steps, updated_at)
       VALUES (?, ?, ?, datetime('now'))
       ON CONFLICT(participant_id, step_date)
       DO UPDATE SET steps = excluded.steps, updated_at = datetime('now')`,
    ).bind(participant.id, stepDate, steps)),
  ];
  await env.DB.batch(statements);
  return json({
    ok: true,
    date,
    reading,
    steps: plan.confirmation.stepsToAdd,
    totalAdjustment: plan.confirmation.totalAdjustment,
  });
}

async function buildStepReadingPlan(env, participantId, date, reading, afterReset) {
  const [readingResult, stepResult, legacyResult] = await Promise.all([
    env.DB.prepare(
      "SELECT step_date AS date, cycle_start AS cycleStart, reading FROM stepometer_readings WHERE participant_id = ? ORDER BY step_date",
    ).bind(participantId).all(),
    env.DB.prepare(
      "SELECT step_date AS date, steps FROM daily_steps WHERE participant_id = ? ORDER BY step_date",
    ).bind(participantId).all(),
    env.DB.prepare(
      "SELECT step_date AS date, steps FROM legacy_step_entries WHERE participant_id = ? ORDER BY step_date",
    ).bind(participantId).all(),
  ]);

  const cycleStart = cycleStartForDate(date, afterReset);
  const readings = readingResult.results
    .filter((entry) => !(entry.date === date && entry.cycleStart === cycleStart))
    .concat({ date, cycleStart, reading })
    .sort((left, right) => left.date.localeCompare(right.date) || left.cycleStart.localeCompare(right.cycleStart));
  const legacySteps = legacyResult.results;
  const existingSteps = stepResult.results;
  const oldTotal = existingSteps.reduce((total, entry) => total + Number(entry.steps), 0);
  const byCycle = new Map();
  for (const entry of readings) {
    if (!byCycle.has(entry.cycleStart)) byCycle.set(entry.cycleStart, []);
    byCycle.get(entry.cycleStart).push(entry);
  }

  const contributions = [];
  let submittedReadingDetails = null;
  for (const [cycleStart, cycleReadings] of byCycle) {
    const cycleLegacy = legacySteps.filter((entry) => legacyCycleStart(entry.date) === cycleStart);
    let previousReading = null;
    let previousDate = null;
    for (const entry of cycleReadings) {
      const legacyOffset = cycleLegacy
        .filter((legacy) => legacy.date <= entry.date && (!previousDate || legacy.date > previousDate))
        .reduce((total, legacy) => total + Number(legacy.steps), 0);
      const stepsToAdd = Number(entry.reading) - (previousReading ?? 0) - legacyOffset;
      if (stepsToAdd < 0) {
        return {
          error: "This reading is lower than the earlier reading for this reset cycle. Check the number or mark a Monday reading as taken after the 10:00 a.m. reset.",
        };
      }
      contributions.push({ date: entry.date, steps: stepsToAdd });
      if (entry.date === date && entry.cycleStart === cycleStart) {
        submittedReadingDetails = { previousReading, legacyOffset, stepsToAdd };
      }
      previousReading = Number(entry.reading);
      previousDate = entry.date;
    }
  }

  if (!submittedReadingDetails) {
    return { error: "We couldn’t calculate this reading. Please try again." };
  }
  const newTotal = legacySteps.reduce((total, entry) => total + Number(entry.steps), 0)
    + contributions.reduce((total, entry) => total + entry.steps, 0);
  const dailyContributions = new Map();
  for (const entry of legacySteps) {
    dailyContributions.set(entry.date, Number(entry.steps));
  }
  for (const entry of contributions) {
    dailyContributions.set(entry.date, (dailyContributions.get(entry.date) || 0) + entry.steps);
  }
  const confirmation = {
    date,
    reading,
    afterReset,
    cycleStart,
    previousReading: submittedReadingDetails.previousReading,
    legacyOffset: submittedReadingDetails.legacyOffset,
    stepsToAdd: submittedReadingDetails.stepsToAdd,
    totalAdjustment: newTotal - oldTotal,
    recalculatesLater: readings.some((entry) => entry.cycleStart === cycleStart && entry.date > date),
  };
  return { confirmation, contributions: [...dailyContributions].map(([stepDate, steps]) => ({ date: stepDate, steps })) };
}

function matchesStepConfirmation(supplied, expected) {
  if (!supplied || typeof supplied !== "object") return false;
  return ["date", "reading", "afterReset", "cycleStart", "previousReading", "legacyOffset", "stepsToAdd", "totalAdjustment", "recalculatesLater"]
    .every((key) => supplied[key] === expected[key]);
}

function legacyCycleStart(date) {
  return cycleStartForDate(date, false);
}

function cycleStartForDate(date, afterReset) {
  const [year, month, day] = date.split("-").map(Number);
  const selected = new Date(Date.UTC(year, month - 1, day));
  const weekday = selected.getUTCDay();
  let daysSinceMonday = (weekday + 6) % 7;
  if (weekday === 1 && !afterReset) daysSinceMonday = 7;
  selected.setUTCDate(selected.getUTCDate() - daysSinceMonday);
  const monday = `${selected.getUTCFullYear()}-${String(selected.getUTCMonth() + 1).padStart(2, "0")}-${String(selected.getUTCDate()).padStart(2, "0")}`;
  return monday < CHALLENGE_START ? CHALLENGE_START : monday;
}

function isMondayDate(date) {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay() === 1;
}

async function requireParticipant(request, env) {
  const participant = await currentParticipant(request, env);
  return participant || json({ error: "Please sign in to continue." }, 401);
}

async function currentParticipant(request, env) {
  const token = getCookie(request, COOKIE_NAME);
  if (!token || !env.SESSION_SECRET) return null;
  const payload = await verifySession(token, env.SESSION_SECRET);
  if (!payload || payload.exp < Math.floor(Date.now() / 1000)) return null;
  return env.DB.prepare("SELECT id, name, team, hide_individual FROM participants WHERE id = ?")
    .bind(payload.pid).first();
}

async function setSessionResponse(request, env, participant) {
  const payload = { pid: participant.id, exp: Math.floor(Date.now() / 1000) + SESSION_SECONDS };
  const token = await signSession(payload, env.SESSION_SECRET);
  return new Response(JSON.stringify({ participant: publicParticipant(participant) }), {
    headers: { ...headers(), "Set-Cookie": sessionCookie(request, token) },
  });
}

function publicParticipant(participant) {
  return {
    id: participant.id,
    name: participant.name,
    team: publicTeamName(participant.team),
    hideIndividual: Boolean(participant.hide_individual),
  };
}

function publicTeamName(team) {
  const labels = {
    "1:00 PM": "Team 1",
    "1:15 PM": "Team 2",
    "1:30 PM": "Team 3",
    "1:45 PM": "Team 4",
  };
  return labels[team] || team;
}

function sessionCookie(request, token) {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${COOKIE_NAME}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_SECONDS}${secure}`;
}

function clearSessionCookie(request) {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${COOKIE_NAME}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secure}`;
}

async function signSession(payload, secret) {
  const content = toBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(content));
  return `${content}.${toBase64Url(new Uint8Array(signature))}`;
}

async function verifySession(token, secret) {
  const [content, suppliedSignature, extra] = token.split(".");
  if (!content || !suppliedSignature || extra) return null;
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"],
  );
  let signature;
  let bytes;
  try {
    signature = fromBase64Url(suppliedSignature);
    bytes = fromBase64Url(content);
  } catch {
    return null;
  }
  const valid = await crypto.subtle.verify("HMAC", key, signature, new TextEncoder().encode(content));
  if (!valid) return null;
  try {
    const payload = JSON.parse(new TextDecoder().decode(bytes));
    return Number.isInteger(payload.pid) && Number.isInteger(payload.exp) ? payload : null;
  } catch {
    return null;
  }
}

async function hashPassword(password, salt) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" }, key, 256,
  );
  return toBase64Url(new Uint8Array(bits));
}

async function verifyPassword(password, encodedSalt, expectedHash) {
  let salt;
  try {
    salt = fromBase64Url(encodedSalt);
  } catch {
    return false;
  }
  const actual = await hashPassword(password, salt);
  return constantTimeEqual(actual, expectedHash);
}

function constantTimeEqual(left, right) {
  if (typeof left !== "string" || typeof right !== "string") return false;
  const a = new TextEncoder().encode(left);
  const b = new TextEncoder().encode(right);
  let diff = a.length ^ b.length;
  const max = Math.max(a.length, b.length);
  for (let i = 0; i < max; i += 1) diff |= (a[i % (a.length || 1)] || 0) ^ (b[i % (b.length || 1)] || 0);
  return diff === 0;
}

function toBase64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

function fromBase64Url(value) {
  const base64 = value.replaceAll("-", "+").replaceAll("_", "/");
  const binary = atob(base64 + "=".repeat((4 - (base64.length % 4)) % 4));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function readJson(request) {
  try {
    if (!request.headers.get("content-type")?.includes("application/json")) return null;
    return await request.json();
  } catch {
    return null;
  }
}

function sameOrigin(request) {
  const origin = request.headers.get("Origin");
  return !origin || origin === new URL(request.url).origin;
}

function challengeToday() {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone: CHALLENGE_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date()).map(({ type, value }) => [type, value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function getCookie(request, name) {
  const cookieHeader = request.headers.get("Cookie") || "";
  for (const entry of cookieHeader.split(";")) {
    const [key, ...value] = entry.trim().split("=");
    if (key === name) return value.join("=");
  }
  return "";
}

function headers() {
  return {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
  };
}

function json(value, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: headers() });
}
