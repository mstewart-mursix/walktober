const TEAM_ORDER = ["Team 1", "Team 2", "Team 3", "Team 4"];
const $ = (selector) => document.querySelector(selector);
const numberFormat = new Intl.NumberFormat("en-US");

const state = {
  people: [],
  teams: [],
  roster: [],
  participant: null,
  mySteps: [],
  pendingReading: null,
  selectedReadingId: null,
  selectedReadingDate: null,
  authMode: "claim",
  toastTimer: null,
  filter: "",
  challengeToday: "2026-10-01",
  boardError: false,
  boardSignature: "",
};

const els = {
  accountButton: $("#account-button"),
  authDialog: $("#auth-dialog"),
  readingConfirmationDialog: $("#reading-confirmation-dialog"),
  stepReminderDialog: $("#step-reminder-dialog"),
  authForm: $("#auth-form"),
  authName: $("#auth-name"),
  authCode: $("#auth-code"),
  authCodeLabel: $("#auth-code-label"),
  authPassword: $("#auth-password"),
  authFeedback: $("#auth-feedback"),
  authHint: $("#auth-hint"),
  authSubmit: $("#auth-submit"),
  stepForm: $("#step-form"),
  stepDate: $("#step-date"),
  stepCount: $("#step-count"),
  stepFeedback: $("#step-feedback"),
  resetCheck: $("#reset-check"),
  stepAfterReset: $("#step-after-reset"),
  hideIndividual: $("#hide-individual"),
  privacyFeedback: $("#privacy-feedback"),
  search: $("#walker-search"),
  tbody: $("#leaderboard-body"),
};

function formatSteps(value) {
  return numberFormat.format(Number(value) || 0);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/gu, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]);
}

function teamClass(team) {
  return `team-${TEAM_ORDER.indexOf(team) + 1}`;
}

// Counts a figure up (or down) to its new value instead of swapping it instantly.
function animateNumber(element, value) {
  const from = element.dataset.value === undefined ? 0 : Number(element.dataset.value);
  element.dataset.value = String(value);
  cancelAnimationFrame(element.countFrame);
  if (from === value || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    element.textContent = formatSteps(value);
    return;
  }
  const started = performance.now();
  const tick = (now) => {
    const progress = Math.min(1, (now - started) / 1400);
    const eased = 1 - (1 - progress) ** 4;
    element.textContent = formatSteps(Math.round(from + (value - from) * eased));
    if (progress < 1) element.countFrame = requestAnimationFrame(tick);
  };
  element.countFrame = requestAnimationFrame(tick);
}

function initials(name) {
  return String(name).split(/\s+/u).slice(0, 2).map((part) => part[0] || "").join("").toUpperCase();
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    credentials: "same-origin",
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
  });
  let data;
  try { data = await response.json(); } catch { data = {}; }
  if (!response.ok && !data.confirmationRequired) throw new Error(data.error || "That didn’t work. Please try again.");
  return data;
}

async function loadBoard() {
  try {
    const data = await api("/api/leaderboard");
    state.people = data.people || [];
    state.teams = data.teams || [];
    state.roster = data.roster || [];
    state.challengeToday = data.challenge?.today || state.challengeToday;
    state.boardError = false;
    renderBoard();
    populateRosterSelect();
    updateTimestamp();
  } catch (error) {
    $("#updated-at").textContent = "Standings unavailable";
    $("#team-list").innerHTML = `<p class="loading-line">${escapeHtml(error.message)}</p>`;
    els.tbody.innerHTML = `<tr><td colspan="4" class="loading-line">The leaderboard is waiting for its database connection.</td></tr>`;
    if (!state.boardError) showToast("The tracker is getting set up. Try refreshing in a moment.");
    state.boardError = true;
    state.boardSignature = "";
  }
}

async function loadAccount() {
  try {
    const data = await api("/api/me");
    state.participant = data.participant || null;
    renderAccount();
    if (state.participant) await loadMySteps();
  } catch {
    state.participant = null;
    renderAccount();
  }
}

async function loadMySteps() {
  if (!state.participant) return;
  try {
    const data = await api("/api/steps");
    state.mySteps = data.steps || [];
    renderMySteps();
  } catch (error) {
    setFeedback(els.stepFeedback, error.message, true);
  }
}

function renderBoard() {
  const teams = [...state.teams].sort((left, right) => TEAM_ORDER.indexOf(left.team) - TEAM_ORDER.indexOf(right.team));
  const totalSteps = teams.reduce((total, team) => total + Number(team.total_steps || 0), 0);
  const activeWalkers = teams.reduce((total, team) => total + Number(team.walkers_logged || 0), 0);
  const maxTeam = Math.max(0, ...teams.map((team) => Number(team.total_steps)));
  const isTeamLead = maxTeam > 0;
  const topTeams = teams.filter((team) => Number(team.total_steps) === maxTeam);

  animateNumber($("#total-steps"), totalSteps);
  animateNumber($("#grove-total"), totalSteps);
  $("#active-walkers").textContent = `${activeWalkers} / ${state.roster.length}`;
  $("#leader-team").textContent = isTeamLead
    ? (topTeams.length === 1 ? topTeams[0].team : `${topTeams.length} teams tied`)
    : "—";

  const now = new Date();
  const challengeDay = now.getFullYear() === 2026 && now.getMonth() === 9 ? Math.min(31, Math.max(1, now.getDate())) : (now.getMonth() > 9 || now.getFullYear() > 2026 ? 31 : 1);
  $("#challenge-day").textContent = challengeDay === 31 && (now.getMonth() > 9 || now.getFullYear() > 2026) ? "WALKTOBER COMPLETE" : `DAY ${challengeDay} / 31`;
  $("#day-progress").style.width = `${Math.round((challengeDay / 31) * 100)}%`;

  // The board refreshes every 30 seconds; rebuild the lists only when something changed.
  const signature = JSON.stringify([state.people, state.teams, state.roster, state.participant?.id, state.participant?.hideIndividual]);
  if (signature === state.boardSignature) return;
  state.boardSignature = signature;

  renderClimb(teams, maxTeam);
  $("#team-list").innerHTML = competitionRanks(teams, (team) => team.total_steps).map((team) => {
    const members = Number(team.participant_count || 0);
    const total = Number(team.total_steps || 0);
    const lead = isTeamLead && total === maxTeam;
    const barWidth = maxTeam > 0 ? Math.max(2, (total / maxTeam) * 100) : 0;
    return `<article class="team-row ${teamClass(team.team)}${lead ? " is-first" : ""}">
      <div class="team-row-top"><span class="team-rank">${String(team.rank).padStart(2, "0")}</span>
      <span class="team-name-wrap"><strong class="team-name">${escapeHtml(team.team)}</strong><span class="team-small">${members} walkers</span>${lead ? '<span class="team-lead">In the lead</span>' : ""}</span>
      <strong class="team-total">${formatSteps(total)} <small>steps</small></strong></div>
      <div class="team-bar" aria-label="${escapeHtml(team.team)} has ${formatSteps(total)} steps"><i style="width:${barWidth}%"></i></div>
    </article>`;
  }).join("") || `<p class="loading-line">No team data found.</p>`;

  const maxPerson = Number(state.people[0]?.total_steps || 0);
  const leadingPeople = maxPerson > 0 ? state.people.filter((person) => Number(person.total_steps) === maxPerson) : [];
  const leadMessage = leadingPeople.length > 1
    ? `${leadingPeople.length} walkers are tied for the lead. One good walk can shift the board.`
    : leadingPeople.length === 1
      ? `${leadingPeople[0].name} is setting the pace with ${formatSteps(maxPerson)} steps. The month is still wide open.`
      : "First steps set the pace. Be the first to make your mark on this month’s board.";
  $("#leader-message").textContent = leadMessage;
  $("#mini-leader-list").innerHTML = maxPerson > 0
    ? competitionRanks(state.people, (person) => person.total_steps).slice(0, 3).map((person) => {
      return `<div class="mini-leader ${teamClass(person.team)}"><span class="mini-rank">${person.rank}</span><span class="mini-name">${escapeHtml(person.name)}<small>${escapeHtml(person.team)}</small></span><span class="mini-total">${formatSteps(person.total_steps)}</span></div>`;
    }).join("")
    : `<span class="mini-empty">The leaderboard is ready for its first steps.</span>`;

  $("#walker-count").textContent = `${state.people.length} sharing individual totals · ${state.roster.length} on the roster`;
  renderPeopleTable();
  if (state.participant) renderAccount();
}

function renderPeopleTable() {
  const search = state.filter.trim().toLowerCase();
  const filtered = competitionRanks(state.people, (person) => person.total_steps).filter((person) => !search || person.name.toLowerCase().includes(search) || person.team.toLowerCase().includes(search));
  if (!filtered.length) {
    const message = state.filter.trim()
      ? `No walkers match “${escapeHtml(state.filter)}”.`
      : "No walkers are sharing individual totals yet.";
    els.tbody.innerHTML = `<tr><td colspan="4" class="loading-line">${message}</td></tr>`;
    return;
  }
  const best = Number(state.people[0]?.total_steps || 0);
  const allZero = best === 0;
  els.tbody.innerHTML = filtered.map((person) => {
    const share = allZero ? 0 : Number(person.total_steps || 0) / best;
    const top = !allZero && person.rank <= 3;
    const yours = state.participant?.id === person.id;
    return `<tr class="${teamClass(person.team)}${yours ? " you-row" : ""}">
      <td class="rank-cell${top ? ` is-top rank-${person.rank}` : ""}"><span>${String(person.rank).padStart(2, "0")}</span></td>
      <td><span class="walker-cell"><span class="walker-avatar">${escapeHtml(initials(person.name))}</span><span class="walker-name">${escapeHtml(person.name)}${yours ? " <small>(you)</small>" : ""}</span></span></td>
      <td><span class="team-tag">${escapeHtml(person.team)}</span></td>
      <td class="steps-cell"><span class="steps-bar" style="--share:${share.toFixed(3)}"></span>${formatSteps(person.total_steps)}</td>
    </tr>`;
  }).join("");
}

// Places each team along the ridge trail by its share of the leading team's steps.
// Crowded labels alternate above and below the trail so they stay readable.
function renderClimb(teams, maxTeam) {
  const trail = $("#climb-trail");
  const length = trail.getTotalLength();
  const labelGap = (86 / Math.max(1, trail.ownerSVGElement.clientWidth)) * 1000;
  const markers = teams.map((team) => {
    const share = maxTeam > 0 ? Number(team.total_steps || 0) / maxTeam : 0;
    const point = trail.getPointAtLength(length * (0.02 + share * 0.96));
    return { team: team.team, share, x: point.x, y: point.y, level: 0 };
  }).sort((left, right) => left.x - right.x);
  markers.forEach((marker, index) => {
    const previous = markers[index - 1];
    if (previous && marker.x - previous.x < labelGap) marker.level = previous.level + 1;
  });
  $("#climb-markers").innerHTML = markers.map((marker, index) => `<div class="climb-marker ${teamClass(marker.team)}${marker.x < 130 ? " is-start" : ""}${marker.x > 870 ? " is-end" : ""}${marker.level % 2 ? " is-below" : ""}" style="left:${(marker.x / 10).toFixed(2)}%;top:${(marker.y / 3).toFixed(2)}%;--tier:${Math.floor(marker.level / 2)};--i:${index}">
      <span class="climb-pin"></span><span class="climb-label">${escapeHtml(marker.team)}<small>${Math.round(marker.share * 100)}%</small></span>
    </div>`).join("");
}

function competitionRanks(items, getScore) {
  let previousScore;
  let rank = 0;
  return items.map((item, index) => {
    const score = Number(getScore(item) || 0);
    if (index === 0 || score !== previousScore) rank = index + 1;
    previousScore = score;
    return { ...item, rank };
  });
}

function populateRosterSelect() {
  const selected = els.authName.value;
  const options = TEAM_ORDER.map((team) => {
    const people = state.roster.filter((person) => person.team === team).sort((a, b) => a.name.localeCompare(b.name));
    return `<optgroup label="${escapeHtml(team)}">${people.map((person) => `<option value="${escapeHtml(person.name)}">${escapeHtml(person.name)}</option>`).join("")}</optgroup>`;
  }).join("");
  els.authName.innerHTML = `<option value="">Choose your name</option>${options}`;
  if (selected && state.roster.some((person) => person.name === selected)) els.authName.value = selected;
  if (state.participant) els.authName.value = state.participant.name;
}

function renderAccount() {
  const isSignedIn = Boolean(state.participant);
  const stepMax = state.challengeToday < "2026-10-01" ? "2026-10-01" : (state.challengeToday > "2026-10-31" ? "2026-10-31" : state.challengeToday);
  els.stepDate.max = stepMax;
  $("#signed-out-log").hidden = isSignedIn;
  $("#signed-in-log").hidden = !isSignedIn;
  els.accountButton.innerHTML = isSignedIn ? "Your account <span aria-hidden=\"true\">↗</span>" : "Sign in <span aria-hidden=\"true\">↗</span>";
  if (!isSignedIn) return;
  $("#account-name").textContent = state.participant.name;
  $("#account-team").textContent = state.participant.team;
  $("#account-initial").textContent = initials(state.participant.name).slice(0, 1);
  els.hideIndividual.checked = Boolean(state.participant.hideIndividual);
  const personalTotal = state.mySteps.reduce((total, entry) => total + Number(entry.steps), 0);
  $("#personal-total").innerHTML = `${formatSteps(personalTotal)} <small>steps</small>`;
  populateRosterSelect();
}

function renderMySteps() {
  const recent = [...state.mySteps].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5);
  $("#recent-steps").innerHTML = recent.length
    ? recent.map((entry) => {
      const readings = entry.readings || [];
      const readingButtons = readings.map((item) => {
        const afterReset = item.cycleStart === entry.date;
        const label = item.resetAfterMax
          ? `after 99,999 reset · +${formatSteps(item.stepsAdded)}`
          : `${isMondayDate(entry.date) ? (afterReset ? "after Monday reset" : "before Monday reset") : "new steps"} · +${formatSteps(item.stepsAdded)}`;
        return `<button class="recent-reading" type="button" data-id="${Number(item.id)}" data-date="${escapeHtml(entry.date)}" data-reading="${Number(item.reading)}" data-after-reset="${afterReset}">Meter ${formatSteps(item.reading)}<small>${label} · edit</small></button>`;
      }).join("");
      const history = readingButtons || `<span class="recent-legacy">Existing total</span>`;
      return `<div class="recent-day-group"><div class="recent-day-summary"><span>${escapeHtml(formatShortDate(entry.date))}</span><strong>+${formatSteps(entry.steps)}</strong></div><div class="recent-readings">${history}</div></div>`;
    }).join("")
    : `<span class="recent-empty">Your entries will show up here.</span>`;
  $("#recent-steps").querySelectorAll("[data-date]").forEach((button) => {
    button.addEventListener("click", () => {
      els.stepDate.value = button.dataset.date;
      els.stepAfterReset.checked = button.dataset.afterReset === "true";
      updateResetOption(true);
      els.stepCount.value = button.dataset.reading;
      state.selectedReadingId = Number(button.dataset.id);
      state.selectedReadingDate = button.dataset.date;
      els.stepCount.focus();
    });
  });
  const stepMax = state.challengeToday < "2026-10-01" ? "2026-10-01" : (state.challengeToday > "2026-10-31" ? "2026-10-31" : state.challengeToday);
  els.stepDate.max = stepMax;
  if (!els.stepDate.value) els.stepDate.value = stepMax;
  updateResetOption(true);
  renderAccount();
}

function formatShortDate(date) {
  const parsed = new Date(`${date}T12:00:00`);
  return parsed.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function localDateString(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function isMondayDate(date) {
  return Boolean(date) && new Date(`${date}T12:00:00`).getDay() === 1;
}

function updateResetOption(preserveSelection = false) {
  const isMonday = isMondayDate(els.stepDate.value);
  els.resetCheck.hidden = !isMonday;
  if (!isMonday || !preserveSelection) els.stepAfterReset.checked = false;
}

function updateTimestamp() {
  const current = new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  $("#updated-at").textContent = `Updated ${current}`;
}

function setFeedback(element, message, isError = false) {
  element.textContent = message;
  element.classList.toggle("is-error", isError);
}

function setAuthMode(mode) {
  state.authMode = mode;
  const claiming = mode === "claim";
  $("#claim-tab").classList.toggle("is-active", claiming);
  $("#signin-tab").classList.toggle("is-active", !claiming);
  $("#claim-tab").setAttribute("aria-selected", String(claiming));
  $("#signin-tab").setAttribute("aria-selected", String(!claiming));
  els.authCode.hidden = !claiming;
  els.authCodeLabel.hidden = !claiming;
  els.authCode.required = claiming;
  els.authPassword.autocomplete = claiming ? "new-password" : "current-password";
  els.authPassword.placeholder = claiming ? "At least 10 characters" : "Your passphrase";
  els.authPassword.minLength = claiming ? 10 : 1;
  els.authHint.textContent = claiming
    ? "Your organizer shares this code with the team. Choose a passphrase you can remember."
    : "Use the roster name and passphrase you set when you claimed your name.";
  els.authSubmit.innerHTML = claiming ? 'Claim my name <span aria-hidden="true">↗</span>' : 'Sign in <span aria-hidden="true">↗</span>';
  $("#auth-title").textContent = claiming ? "You’re on the team." : "Welcome back.";
  setFeedback(els.authFeedback, "");
}

function openAuth(mode = "claim") {
  if (state.participant) {
    $("#log-card").scrollIntoView({ behavior: "smooth", block: "center" });
    setTimeout(() => els.stepDate.focus({ preventScroll: true }), 250);
    return;
  }
  setAuthMode(mode);
  if (state.roster.length) populateRosterSelect();
  els.authDialog.showModal();
  setTimeout(() => els.authName.focus(), 50);
}

function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("is-visible");
  clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(() => toast.classList.remove("is-visible"), 3500);
}

$("#hero-log-button").addEventListener("click", () => openAuth("claim"));
$("#how-log-button").addEventListener("click", () => openAuth("claim"));
$("#claim-button").addEventListener("click", () => openAuth("claim"));
$("#login-button").addEventListener("click", () => openAuth("login"));
els.accountButton.addEventListener("click", () => openAuth(state.participant ? "login" : "login"));
$("#step-reminder-close").addEventListener("click", () => els.stepReminderDialog.close());
$("#step-reminder-confirm").addEventListener("click", () => els.stepReminderDialog.close());
$("#new-reading-button").addEventListener("click", () => {
  state.selectedReadingId = null;
  state.selectedReadingDate = null;
  els.stepCount.value = "";
  setFeedback(els.stepFeedback, "Enter a new meter reading. Each reading is kept in your history.");
  els.stepCount.focus();
});
els.stepReminderDialog.addEventListener("click", (event) => {
  if (event.target === els.stepReminderDialog) els.stepReminderDialog.close();
});
$("#reading-confirmation-close").addEventListener("click", () => els.readingConfirmationDialog.close());
$("#reading-confirmation-edit").addEventListener("click", () => els.readingConfirmationDialog.close());
$("#reading-confirmation-save").addEventListener("click", () => {
  if (state.pendingReading) saveStepReading(state.pendingReading);
});
els.readingConfirmationDialog.addEventListener("click", (event) => {
  if (event.target === els.readingConfirmationDialog) els.readingConfirmationDialog.close();
});
els.readingConfirmationDialog.addEventListener("close", () => {
  state.pendingReading = null;
});
$("#dialog-close").addEventListener("click", () => els.authDialog.close());
$("#claim-tab").addEventListener("click", () => setAuthMode("claim"));
$("#signin-tab").addEventListener("click", () => setAuthMode("login"));
els.authDialog.addEventListener("click", (event) => {
  if (event.target === els.authDialog) els.authDialog.close();
});
els.authDialog.addEventListener("close", () => {
  els.authForm.reset();
  setFeedback(els.authFeedback, "");
});

  els.stepDate.addEventListener("change", () => {
    if (state.selectedReadingDate !== els.stepDate.value) {
      state.selectedReadingId = null;
      state.selectedReadingDate = null;
    }
    updateResetOption();
  });
els.hideIndividual.addEventListener("change", async () => {
  if (!state.participant) return;
  els.hideIndividual.disabled = true;
  setFeedback(els.privacyFeedback, "Saving your privacy setting…");
  try {
    const data = await api("/api/privacy", {
      method: "PUT",
      body: JSON.stringify({ hideIndividual: els.hideIndividual.checked }),
    });
    state.participant = data.participant;
    setFeedback(els.privacyFeedback, state.participant.hideIndividual
      ? "Your individual total is hidden. Your team total is unchanged."
      : "Your individual total is visible on the leaderboard.");
    await loadBoard();
  } catch (error) {
    els.hideIndividual.checked = Boolean(state.participant.hideIndividual);
    setFeedback(els.privacyFeedback, error.message, true);
  } finally {
    els.hideIndividual.disabled = false;
  }
});

els.authForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = new FormData(els.authForm);
  const body = {
    name: form.get("name"),
    password: form.get("password"),
    ...(state.authMode === "claim" ? { claimCode: form.get("claimCode") } : {}),
  };
  els.authSubmit.disabled = true;
  els.authSubmit.textContent = state.authMode === "claim" ? "Claiming your name…" : "Signing you in…";
  setFeedback(els.authFeedback, "");
  try {
    const path = state.authMode === "claim" ? "/api/claim" : "/api/login";
    const data = await api(path, { method: "POST", body: JSON.stringify(body) });
    state.participant = data.participant;
    state.mySteps = [];
    els.authForm.reset();
    els.authDialog.close();
    renderAccount();
    setFeedback(els.stepFeedback, "Welcome to the team — add your steps below.");
    await loadMySteps();
    await loadBoard();
    showToast(state.authMode === "claim" ? "Name claimed. You’re ready to walk!" : "You’re signed in. Welcome back!");
    $("#log-card").scrollIntoView({ behavior: "smooth", block: "center" });
  } catch (error) {
    setFeedback(els.authFeedback, error.message, true);
  } finally {
    els.authSubmit.disabled = false;
    els.authSubmit.innerHTML = state.authMode === "claim" ? 'Claim my name <span aria-hidden="true">↗</span>' : 'Sign in <span aria-hidden="true">↗</span>';
  }
});

function formatSignedSteps(value) {
  const steps = Number(value) || 0;
  if (steps > 0) return `+${formatSteps(steps)}`;
  if (steps < 0) return `−${formatSteps(Math.abs(steps))}`;
  return "0";
}

function showReadingConfirmation(preview) {
  const previous = preview.previousReading;
  if (preview.resetAfterMax) {
    $("#reading-confirmation-message").textContent = `Your previous reading reached 99,999. This reading of ${formatSteps(preview.reading)} is after the meter was reset, so ${formatSteps(preview.stepsToAdd)} additional steps will be added.`;
  } else if (previous !== null) {
    $("#reading-confirmation-message").textContent = `Your previous stepometer reading was ${formatSteps(previous)}. This reading is ${formatSteps(preview.reading)}, so ${formatSteps(preview.stepsToAdd)} new steps will be added.`;
  } else if (preview.legacyOffset > 0) {
    $("#reading-confirmation-message").textContent = `There isn’t a previous stepometer reading in this reset cycle. ${formatSteps(preview.legacyOffset)} steps are already logged for this period, so this reading adds ${formatSteps(preview.stepsToAdd)} new steps.`;
  } else {
    $("#reading-confirmation-message").textContent = `This is the first reading in this reset cycle, so ${formatSteps(preview.stepsToAdd)} steps will be added.`;
  }
  if (preview.afterReset) {
    $("#reading-confirmation-message").textContent += " It starts a fresh cycle after Monday’s 10:00 a.m. reset.";
  }
  $("#confirmation-reading").textContent = `${formatSteps(preview.reading)} steps`;
  $("#confirmation-addition").textContent = `${formatSteps(preview.stepsToAdd)} steps`;

  const notes = [];
  if (preview.totalAdjustment !== preview.stepsToAdd) {
    notes.push(`Because this updates an earlier entry, the overall challenge total will change by ${formatSignedSteps(preview.totalAdjustment)}.`);
  }
  if (preview.recalculatesLater) notes.push("Later readings in this reset cycle will be recalculated too.");
  const note = $("#reading-confirmation-note");
  note.textContent = notes.join(" ");
  note.hidden = notes.length === 0;
  if (!els.readingConfirmationDialog.open) els.readingConfirmationDialog.showModal();
}

async function saveStepReading(entry) {
  const saveButton = $("#save-steps");
  const confirmButton = $("#reading-confirmation-save");
  saveButton.disabled = true;
  confirmButton.disabled = true;
  saveButton.textContent = entry.confirmation ? "Saving your reading…" : "Checking your reading…";
  confirmButton.textContent = "Saving…";
  setFeedback(els.stepFeedback, "");
  try {
    const body = {
      date: entry.date,
      reading: entry.reading,
      afterReset: entry.afterReset,
      readingId: entry.readingId,
      ...(entry.confirmation ? { confirmation: entry.confirmation } : {}),
    };
    const result = await api("/api/steps", { method: "PUT", body: JSON.stringify(body) });
    if (result.confirmationRequired) {
      state.pendingReading = { ...entry, confirmation: result.preview };
      showReadingConfirmation(result.preview);
      return;
    }

    state.pendingReading = null;
    state.selectedReadingId = null;
    state.selectedReadingDate = null;
    if (els.readingConfirmationDialog.open) els.readingConfirmationDialog.close();
    els.stepCount.value = "";
    await Promise.all([loadMySteps(), loadBoard()]);
    setFeedback(els.stepFeedback, `${formatSteps(result.steps)} new steps added to your total.`);
    els.stepReminderDialog.showModal();
  } catch (error) {
    if (els.readingConfirmationDialog.open) els.readingConfirmationDialog.close();
    setFeedback(els.stepFeedback, error.message, true);
  } finally {
    saveButton.disabled = false;
    saveButton.innerHTML = 'Save my steps <span aria-hidden="true">↗</span>';
    confirmButton.disabled = false;
    confirmButton.textContent = "Confirm and save";
  }
}

els.stepForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!state.participant) return openAuth("login");
  const reading = Number(els.stepCount.value);
  if (!Number.isSafeInteger(reading) || reading < 0 || reading > 99999) {
    return setFeedback(els.stepFeedback, "Enter a whole-number reading from 0 to 99,999.", true);
  }
  await saveStepReading({
    date: els.stepDate.value,
    reading,
    afterReset: els.stepAfterReset.checked,
    readingId: state.selectedReadingId,
    confirmation: null,
  });
});

$("#logout-button").addEventListener("click", async () => {
  try { await api("/api/logout", { method: "POST" }); } catch { /* Local view still signs out. */ }
  state.participant = null;
  state.mySteps = [];
  renderAccount();
  await loadBoard();
  showToast("You’re signed out. Thanks for walking!");
});

els.search.addEventListener("input", () => {
  state.filter = els.search.value;
  renderPeopleTable();
});

async function start() {
  const today = new Date();
  const localToday = localDateString(today);
  els.stepDate.value = localToday < "2026-10-01" ? "2026-10-01" : (localToday > "2026-10-31" ? "2026-10-31" : localToday);
  els.stepDate.max = els.stepDate.value;
  await Promise.all([loadBoard(), loadAccount()]);
  setInterval(async () => {
    await loadBoard();
    updateTimestamp();
  }, 30_000);
}

start();
