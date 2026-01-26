import { supabase } from "./auth.js";

const body = document.body;

const modeLoginBtn = document.getElementById("modeLogin");
const modeCreateBtn = document.getElementById("modeCreate");
const panelTitle = document.getElementById("panelTitle");
const panelSubtitle = document.getElementById("panelSubtitle");
const panelNote = document.getElementById("panelNote");
const magicHint = document.getElementById("magicHint");
const form = document.getElementById("authForm");
const submitBtn = document.getElementById("submitBtn");
const messageEl = document.getElementById("formMessage");

const fields = {
  fullName: document.getElementById("fullName"),
  company: document.getElementById("company"),
  email: document.getElementById("email"),
};

const copy = {
  login: {
    title: "Welcome back",
    subtitle: "We will email a secure sign-in link.",
    submit: "Send sign-in link",
    busy: "Sending link...",
    note: "Use your work email to receive a secure sign-in link.",
    hint: "We will email you a secure sign-in link. No password needed.",
  },
  create: {
    title: "Create your account",
    subtitle: "We will email a verification link to finish setup.",
    submit: "Create account",
    busy: "Creating account...",
    note: "We will email a verification link before you can sign in.",
    hint: "Check your email to verify and finish account setup.",
  },
};

const state = {
  mode: "login",
  busy: false,
};

function setMode(mode) {
  state.mode = mode;
  body.classList.toggle("mode-login", mode === "login");
  body.classList.toggle("mode-create", mode === "create");

  modeLoginBtn.classList.toggle("is-active", mode === "login");
  modeCreateBtn.classList.toggle("is-active", mode === "create");

  modeLoginBtn.setAttribute("aria-pressed", mode === "login" ? "true" : "false");
  modeCreateBtn.setAttribute("aria-pressed", mode === "create" ? "true" : "false");

  panelTitle.textContent = copy[mode].title;
  panelSubtitle.textContent = copy[mode].subtitle;
  panelNote.textContent = copy[mode].note;
  magicHint.textContent = copy[mode].hint;
  submitBtn.textContent = copy[mode].submit;

  clearErrors();
  setMessage("", "");

  const focusField = mode === "create" ? fields.fullName : fields.email;
  focusField?.focus();
}

function setBusy(isBusy) {
  state.busy = isBusy;
  submitBtn.disabled = isBusy;
  submitBtn.textContent = isBusy ? copy[state.mode].busy : copy[state.mode].submit;
}

function setMessage(type, text) {
  messageEl.textContent = text;
  messageEl.className = "form-message" + (type ? ` ${type}` : "");
}

function clearErrors() {
  const wrappers = form.querySelectorAll(".field");
  wrappers.forEach((wrap) => {
    wrap.classList.remove("error");
    const error = wrap.querySelector(".field-error");
    if (error) error.textContent = "";
  });
}

function setFieldError(fieldKey, text) {
  const wrap = form.querySelector(`[data-field='${fieldKey}']`);
  if (!wrap) return;
  wrap.classList.add("error");
  const error = wrap.querySelector(".field-error");
  if (error) error.textContent = text;
}

function validate() {
  clearErrors();

  const email = fields.email?.value.trim() || "";
  let ok = true;

  if (state.mode === "create") {
    const fullName = fields.fullName?.value.trim() || "";
    const company = fields.company?.value.trim() || "";

    if (!fullName) {
      setFieldError("fullName", "Full name is required.");
      ok = false;
    }

    if (!company) {
      setFieldError("company", "Company is required.");
      ok = false;
    }
  }

  if (!email) {
    setFieldError("email", "Email is required.");
    ok = false;
  } else if (!fields.email.checkValidity()) {
    setFieldError("email", "Use a valid work email.");
    ok = false;
  }

  return ok;
}

function formatAuthError(error, mode) {
  const raw = String(error?.message || "").toLowerCase();
  if (raw.includes("user not found") || raw.includes("not found")) {
    return mode === "login"
      ? "No account found. Switch to Create account."
      : "Account not found. Try creating a new account.";
  }
  if (raw.includes("rate") || raw.includes("too many")) {
    return "Too many attempts. Try again in a few minutes.";
  }
  if (raw.includes("invalid") && raw.includes("email")) {
    return "Use a valid work email.";
  }
  return error?.message || "Something went wrong. Try again.";
}

function getRedirectTo() {
  return new URL("./index.html", window.location.href).href;
}

async function ensureSessionRedirect() {
  try {
    const { data } = await supabase.auth.getSession();
    if (data?.session) {
      window.location.href = "./index.html";
      return true;
    }
  } catch (err) {
    console.warn("Auth session check failed:", err);
  }
  return false;
}

modeLoginBtn?.addEventListener("click", () => setMode("login"));
modeCreateBtn?.addEventListener("click", () => setMode("create"));

form?.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (state.busy) return;

  setMessage("", "");

  if (!validate()) {
    setMessage("error", "Fix the highlighted fields before continuing.");
    return;
  }

  setBusy(true);

  try {
    const email = fields.email.value.trim();
    const options = {
      emailRedirectTo: getRedirectTo(),
      shouldCreateUser: state.mode === "create",
    };

    if (state.mode === "create") {
      options.data = {
        full_name: fields.fullName?.value.trim(),
        company: fields.company?.value.trim(),
      };
    }

    const { error } = await supabase.auth.signInWithOtp({ email, options });

    if (error) {
      setMessage("error", formatAuthError(error, state.mode));
    } else {
      const text =
        state.mode === "login"
          ? "Check your email for your sign-in link."
          : "Check your email to verify and finish account setup.";
      setMessage("success", text);
    }
  } catch (err) {
    setMessage("error", formatAuthError(err, state.mode));
  } finally {
    setBusy(false);
  }
});

form?.addEventListener("input", (event) => {
  const field = event.target?.closest(".field");
  if (!field) return;
  field.classList.remove("error");
  const error = field.querySelector(".field-error");
  if (error) error.textContent = "";
});

supabase.auth.onAuthStateChange((_event, session) => {
  if (session) {
    window.location.href = "./index.html";
  }
});

const params = new URLSearchParams(window.location.search);
const startMode = params.get("mode") === "create" ? "create" : "login";
setMode(startMode);
ensureSessionRedirect();
