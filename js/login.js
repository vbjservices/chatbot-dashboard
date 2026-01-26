import { supabase } from "./auth.js";

const body = document.body;

const modeLoginBtn = document.getElementById("modeLogin");
const modeCreateBtn = document.getElementById("modeCreate");
const methodMagicBtn = document.getElementById("methodMagic");
const methodPasswordBtn = document.getElementById("methodPassword");
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
  password: document.getElementById("password"),
  confirmPassword: document.getElementById("confirmPassword"),
};

const copy = {
  login: {
    magic: {
      title: "Welcome back",
      subtitle: "We will email a secure sign-in link.",
      submit: "Send sign-in link",
      busy: "Sending link...",
      note: "Use your work email to receive a secure sign-in link.",
      hint: "We will email you a secure sign-in link. No password needed.",
    },
    password: {
      title: "Welcome back",
      subtitle: "Sign in with your email and password.",
      submit: "Sign in",
      busy: "Signing in...",
      note: "Use the password you set during account creation.",
      hint: "Use your email and password to sign in.",
    },
  },
  create: {
    magic: {
      title: "Create your account",
      subtitle: "We will email a verification link to finish setup.",
      submit: "Create account",
      busy: "Creating account...",
      note: "We will email a verification link before you can sign in.",
      hint: "Check your email to verify and finish account setup.",
    },
    password: {
      title: "Create your account",
      subtitle: "Set a password for your client workspace.",
      submit: "Create account",
      busy: "Creating account...",
      note: "We will email a verification link before you can sign in.",
      hint: "Use a strong password and verify by email.",
    },
  },
};

const state = {
  mode: "login",
  method: "magic",
  busy: false,
};

function applyCopy() {
  const cfg = copy[state.mode][state.method];
  panelTitle.textContent = cfg.title;
  panelSubtitle.textContent = cfg.subtitle;
  panelNote.textContent = cfg.note;
  magicHint.textContent = cfg.hint;
  submitBtn.textContent = cfg.submit;

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

function setMethod(method) {
  state.method = method;
  body.classList.toggle("method-magic", method === "magic");
  body.classList.toggle("method-password", method === "password");

  methodMagicBtn.classList.toggle("is-active", method === "magic");
  methodPasswordBtn.classList.toggle("is-active", method === "password");

  methodMagicBtn.setAttribute("aria-pressed", method === "magic" ? "true" : "false");
  methodPasswordBtn.setAttribute("aria-pressed", method === "password" ? "true" : "false");

  applyCopy();
  clearErrors();
  setMessage("", "");
}

function setBusy(isBusy) {
  state.busy = isBusy;
  submitBtn.disabled = isBusy;
  submitBtn.textContent = isBusy ? copy[state.mode][state.method].busy : copy[state.mode][state.method].submit;
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
  const password = fields.password?.value || "";
  const confirmPassword = fields.confirmPassword?.value || "";

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

  if (state.method === "password") {
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
methodMagicBtn?.addEventListener("click", () => setMethod("magic"));
methodPasswordBtn?.addEventListener("click", () => setMethod("password"));

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
    let error = null;

    if (state.method === "magic") {
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

      ({ error } = await supabase.auth.signInWithOtp({ email, options }));
    } else if (state.mode === "create") {
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
      const password = fields.password.value;
      ({ error } = await supabase.auth.signInWithPassword({ email, password }));
    }

    if (error) {
      setMessage("error", formatAuthError(error, state.mode, state.method));
    } else if (state.method === "magic") {
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
    setMessage("error", formatAuthError(err, state.mode, state.method));
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
const startMethod = params.get("method") === "password" ? "password" : "magic";
setMode(startMode);
setMethod(startMethod);
ensureSessionRedirect();
