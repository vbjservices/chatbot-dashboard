const body = document.body;

const modeLoginBtn = document.getElementById("modeLogin");
const modeCreateBtn = document.getElementById("modeCreate");
const panelTitle = document.getElementById("panelTitle");
const panelSubtitle = document.getElementById("panelSubtitle");
const panelNote = document.getElementById("panelNote");
const form = document.getElementById("authForm");
const submitBtn = document.getElementById("submitBtn");
const messageEl = document.getElementById("formMessage");
const forgotBtn = document.getElementById("forgotBtn");
const togglePasswordBtn = document.getElementById("togglePassword");

const fields = {
  fullName: document.getElementById("fullName"),
  company: document.getElementById("company"),
  email: document.getElementById("email"),
  password: document.getElementById("password"),
  confirmPassword: document.getElementById("confirmPassword"),
};

const copy = {
  login: {
    title: "Welcome back",
    subtitle: "Sign in to your client workspace.",
    submit: "Sign in",
    busy: "Signing in...",
    note: "We only use your email for authentication and account notices.",
  },
  create: {
    title: "Create your account",
    subtitle: "Set up access before you connect data.",
    submit: "Create account",
    busy: "Creating account...",
    note: "We will email a verification link before you can sign in.",
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
  submitBtn.textContent = copy[mode].submit;

  if (fields.password) {
    fields.password.setAttribute(
      "autocomplete",
      mode === "create" ? "new-password" : "current-password"
    );
  }

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
  const password = fields.password?.value || "";

  let ok = true;

  if (state.mode === "create") {
    const fullName = fields.fullName?.value.trim() || "";
    const company = fields.company?.value.trim() || "";
    const confirmPassword = fields.confirmPassword?.value || "";

    if (!fullName) {
      setFieldError("fullName", "Full name is required.");
      ok = false;
    }

    if (!company) {
      setFieldError("company", "Company is required.");
      ok = false;
    }

    if (!confirmPassword) {
      setFieldError("confirmPassword", "Please confirm your password.");
      ok = false;
    }

    if (confirmPassword && confirmPassword !== password) {
      setFieldError("confirmPassword", "Passwords do not match.");
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

  return ok;
}

function simulateRequest() {
  return new Promise((resolve) => setTimeout(resolve, 700));
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
    await simulateRequest();
    const text =
      state.mode === "login"
        ? "UI is ready. Auth is not wired yet, so no real sign in happens."
        : "UI is ready. Account creation is not wired yet, so nothing is stored.";
    setMessage("warn", text);
  } catch (err) {
    setMessage("error", "Something went wrong. Try again.");
  } finally {
    setBusy(false);
  }
});

forgotBtn?.addEventListener("click", () => {
  setMessage("warn", "Password reset is not wired yet.");
});

togglePasswordBtn?.addEventListener("click", () => {
  if (!fields.password) return;
  const nextType = fields.password.type === "password" ? "text" : "password";
  fields.password.type = nextType;
  togglePasswordBtn.textContent = nextType === "password" ? "Show" : "Hide";
  togglePasswordBtn.setAttribute(
    "aria-pressed",
    nextType === "text" ? "true" : "false"
  );
});

form?.addEventListener("input", (event) => {
  const field = event.target?.closest(".field");
  if (!field) return;
  field.classList.remove("error");
  const error = field.querySelector(".field-error");
  if (error) error.textContent = "";
});

const params = new URLSearchParams(window.location.search);
const startMode = params.get("mode") === "create" ? "create" : "login";
setMode(startMode);
