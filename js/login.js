import { supabase } from "./auth.js";

const body = document.body;

const modeLoginBtn = document.getElementById("modeLogin");
const modeCreateBtn = document.getElementById("modeCreate");
const magicTopBtn = document.getElementById("magicTopBtn");
const panelTitle = document.getElementById("panelTitle");
const panelSubtitle = document.getElementById("panelSubtitle");
const panelNote = document.getElementById("panelNote");
const passwordSub = document.getElementById("passwordSub");
const magicSub = document.getElementById("magicSub");
const magicHint = document.getElementById("magicHint");
const form = document.getElementById("authForm");
const passwordSubmitBtn = document.getElementById("passwordSubmitBtn");
const magicSubmitBtn = document.getElementById("magicSubmitBtn");
const togglePasswordBtn = document.getElementById("togglePassword");
const messageEl = document.getElementById("formMessage");

const fields = {
  fullName: document.getElementById("fullName"),
  company: document.getElementById("company"),
  email: document.getElementById("email"),
  password: document.getElementById("password"),
  confirmPassword: document.getElementById("confirmPassword"),
  magicEmail: document.getElementById("magicEmail"),
};

const copy = {
  login: {
    title: "Welcome back",
    subtitle: "Sign in with a password or use a magic link.",
    note: "Use your work email for secure access.",
    password: {
      sub: "Sign in with your email and password.",
      submit: "Sign in",
      busy: "Signing in...",
    },
    magic: {
      sub: "Email a secure sign-in link.",
      submit: "Send magic link",
      busy: "Sending link...",
      hint: "We will email you a secure sign-in link. No password needed.",
    },
  },
  create: {
    title: "Create your account",
    subtitle: "Create with a password or use a magic link.",
    note: "We will email a verification link before you can sign in.",
    password: {
      sub: "Set a password for your client workspace.",
      submit: "Create account",
      busy: "Creating account...",
    },
    magic: {
      sub: "Send a verification link to finish setup.",
      submit: "Create with magic link",
      busy: "Sending link...",
      hint: "Check your email to verify and finish account setup.",
    },
  },
};

const state = {
  mode: "login",
  busy: false,
};

function applyCopy() {
  const cfg = copy[state.mode];
  panelTitle.textContent = cfg.title;
  panelSubtitle.textContent = cfg.subtitle;
  panelNote.textContent = cfg.note;
  passwordSub.textContent = cfg.password.sub;
  magicSub.textContent = cfg.magic.sub;
  magicHint.textContent = cfg.magic.hint;
  passwordSubmitBtn.textContent = cfg.password.submit;
  magicSubmitBtn.textContent = cfg.magic.submit;

  if (fields.password) {
    fields.password.setAttribute(
      "autocomplete",
      state.mode === "create" ? "new-password" : "current-password"
    );
  }
}

function setMode(mode) {
  state.mode = mode;
  body.classList.toggle("mode-login", mode === "login");
  body.classList.toggle("mode-create", mode === "create");

  modeLoginBtn.classList.toggle("is-active", mode === "login");
  modeCreateBtn.classList.toggle("is-active", mode === "create");

  modeLoginBtn.setAttribute("aria-pressed", mode === "login" ? "true" : "false");
  modeCreateBtn.setAttribute("aria-pressed", mode === "create" ? "true" : "false");

  applyCopy();
  clearErrors();
  setMessage("", "");

  const focusField = mode === "create" ? fields.fullName : fields.email;
  focusField?.focus();
}

function setBusy(isBusy, method) {
  state.busy = isBusy;
  passwordSubmitBtn.disabled = isBusy;
  magicSubmitBtn.disabled = isBusy;

  if (isBusy) {
    if (method === "magic") {
      magicSubmitBtn.textContent = copy[state.mode].magic.busy;
    } else {
      passwordSubmitBtn.textContent = copy[state.mode].password.busy;
    }
    return;
  }

  passwordSubmitBtn.textContent = copy[state.mode].password.submit;
  magicSubmitBtn.textContent = copy[state.mode].magic.submit;
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

function validate(method) {
  clearErrors();

  let ok = true;

  if (method === "password") {
    const email = fields.email?.value.trim() || "";
    const password = fields.password?.value || "";
    const confirmPassword = fields.confirmPassword?.value || "";

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

    if (!password) {
      setFieldError("password", "Password is required.");
      ok = false;
    } else if (password.length < 8) {
      setFieldError("password", "Use at least 8 characters.");
      ok = false;
    }

    if (state.mode === "create") {
      if (!confirmPassword) {
        setFieldError("confirmPassword", "Please confirm your password.");
        ok = false;
      } else if (confirmPassword !== password) {
        setFieldError("confirmPassword", "Passwords do not match.");
        ok = false;
      }
    }
  } else {
    const email = fields.magicEmail?.value.trim() || "";

    if (!email) {
      setFieldError("magicEmail", "Email is required.");
      ok = false;
    } else if (!fields.magicEmail.checkValidity()) {
      setFieldError("magicEmail", "Use a valid work email.");
      ok = false;
    }
  }

  return ok;
}

function formatAuthError(error, mode, method) {
  const raw = String(error?.message || "").toLowerCase();
  if (raw.includes("already registered")) {
    return "Account already exists. Switch to Sign in.";
  }
  if (raw.includes("invalid login") || raw.includes("invalid credentials")) {
    return "Invalid email or password.";
  }
  if (raw.includes("confirm") && raw.includes("email")) {
    return "Check your email to confirm your account.";
  }
  if (raw.includes("user not found") || raw.includes("not found")) {
    return mode === "login"
      ? "No account found. Switch to Create account."
      : "Account not found. Try creating a new account.";
  }
  if (raw.includes("rate") || raw.includes("too many")) {
    return method === "magic"
      ? "Too many attempts. Try again in a few minutes or use password sign-in."
      : "Too many attempts. Try again in a few minutes.";
  }
  if (raw.includes("invalid") && raw.includes("email")) {
    return "Use a valid work email.";
  }
  return error?.message || "Something went wrong. Try again.";
}

function getRedirectTo() {
  return new URL(".", window.location.href).href;
}

function detectMethodFromActive() {
  const active = document.activeElement;
  if (active && active.closest("#magicSection")) return "magic";
  return "password";
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

magicTopBtn?.addEventListener("click", () => {
  const section = document.getElementById("magicSection");
  section?.scrollIntoView({ behavior: "smooth", block: "start" });
  fields.magicEmail?.focus();
});

form?.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (state.busy) return;

  const method = event.submitter?.dataset.method || detectMethodFromActive();

  setMessage("", "");

  if (!validate(method)) {
    setMessage("error", "Fix the highlighted fields before continuing.");
    return;
  }

  setBusy(true, method);

  try {
    let error = null;

    if (method === "magic") {
      const email = fields.magicEmail.value.trim();
      const options = {
        emailRedirectTo: getRedirectTo(),
        shouldCreateUser: state.mode === "create",
      };

      if (state.mode === "create") {
        const fullName = fields.fullName?.value.trim() || "";
        const company = fields.company?.value.trim() || "";
        if (fullName || company) {
          options.data = { full_name: fullName, company };
        }
      }

      ({ error } = await supabase.auth.signInWithOtp({ email, options }));
    } else if (state.mode === "create") {
      const email = fields.email.value.trim();
      const password = fields.password.value;
      const options = {
        data: {
          full_name: fields.fullName?.value.trim(),
          company: fields.company?.value.trim(),
        },
        emailRedirectTo: getRedirectTo(),
      };

      ({ error } = await supabase.auth.signUp({ email, password, options }));
    } else {
      const email = fields.email.value.trim();
      const password = fields.password.value;
      ({ error } = await supabase.auth.signInWithPassword({ email, password }));
    }

    if (error) {
      setMessage("error", formatAuthError(error, state.mode, method));
    } else if (method === "magic") {
      const text =
        state.mode === "login"
          ? "Check your email for your sign-in link."
          : "Check your email to verify and finish account setup.";
      setMessage("success", text);
    } else if (state.mode === "create") {
      setMessage("success", "Account created. Check your email to confirm before signing in.");
    } else {
      setMessage("success", "Signed in. Redirecting...");
    }
  } catch (err) {
    setMessage("error", formatAuthError(err, state.mode, method));
  } finally {
    setBusy(false, method);
  }
});

form?.addEventListener("input", (event) => {
  const field = event.target?.closest(".field");
  if (!field) return;
  field.classList.remove("error");
  const error = field.querySelector(".field-error");
  if (error) error.textContent = "";
});

togglePasswordBtn?.addEventListener("click", () => {
  const passwordField = fields.password;
  if (!passwordField) return;

  const nextType = passwordField.type === "password" ? "text" : "password";
  passwordField.type = nextType;
  if (fields.confirmPassword) fields.confirmPassword.type = nextType;

  const visible = nextType === "text";
  togglePasswordBtn.setAttribute("data-visible", visible ? "true" : "false");
  togglePasswordBtn.setAttribute("aria-pressed", visible ? "true" : "false");
  togglePasswordBtn.setAttribute("aria-label", visible ? "Hide password" : "Show password");
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
