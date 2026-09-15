/**
 * Auth UI — modal + header control. Injected on index & tasks pages.
 * Does not touch LocalStorage app data.
 */
import {
  initAuth,
  onAuthChange,
  getCurrentUser,
  signIn,
  signUp,
  signOut,
} from "./auth.js";

function ensureMarkup() {
  const header = document.querySelector(".header-inner");
  if (header && !document.getElementById("authAccountBtn")) {
    const wrap = document.createElement("div");
    wrap.className = "header-auth-wrap";
    wrap.innerHTML = `
      <button type="button" class="auth-account-btn" id="authAccountBtn">Войти</button>
      <div class="auth-menu" id="authMenu" hidden>
        <div class="auth-menu-email" id="authMenuEmail"></div>
        <p class="auth-menu-note">Данные аккаунта хранятся отдельно от гостя в этом браузере. Синхронизация между устройствами — позже.</p>
        <button type="button" class="auth-menu-logout" id="authLogoutBtn">Выйти</button>
      </div>`;
    // Insert before install btn or at end
    const install = document.getElementById("installBtn");
    if (install) header.insertBefore(wrap, install);
    else header.appendChild(wrap);
  }

  if (!document.getElementById("authModal")) {
    const modal = document.createElement("div");
    modal.id = "authModal";
    modal.className = "events-modal-overlay";
    modal.hidden = true;
    modal.innerHTML = `
      <div class="events-modal auth-modal" role="dialog" aria-modal="true" aria-labelledby="authModalTitle">
        <div class="events-modal-header">
          <span id="authModalTitle">Аккаунт</span>
          <button type="button" class="events-modal-close" id="authModalClose" aria-label="Закрыть">✕</button>
        </div>
        <div class="events-modal-body">
          <p class="auth-guest-hint">
            Сайт работает без регистрации. Аккаунт понадобится для синхронизации между устройствами (скоро).
            Данные гостя и данные каждого аккаунта в браузере изолированы.
          </p>
          <div class="auth-tabs">
            <button type="button" class="auth-tab is-active" data-auth-tab="login">Вход</button>
            <button type="button" class="auth-tab" data-auth-tab="register">Регистрация</button>
          </div>
          <form id="authForm" class="auth-form" autocomplete="on">
            <label class="task-field-label" for="authEmail">Email</label>
            <input id="authEmail" class="auth-input" type="email" name="email" required autocomplete="email" placeholder="you@example.com">
            <label class="task-field-label" for="authPassword">Пароль</label>
            <input id="authPassword" class="auth-input" type="password" name="password" required minlength="6" autocomplete="current-password" placeholder="минимум 6 символов">
            <p class="auth-form-error" id="authFormError" hidden></p>
            <p class="auth-form-success" id="authFormSuccess" hidden></p>
            <button type="submit" class="events-planner-btn" id="authSubmitBtn">Войти</button>
          </form>
        </div>
      </div>`;
    document.body.appendChild(modal);
  }

  if (!document.getElementById("tasksToast")) {
    const toast = document.createElement("div");
    toast.id = "tasksToast";
    toast.className = "tasks-toast";
    toast.hidden = true;
    document.body.appendChild(toast);
  }
}

function toast(msg) {
  const el = document.getElementById("tasksToast");
  if (!el) return;
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => {
    el.hidden = true;
  }, 2800);
}

function setFormMode(mode) {
  const form = document.getElementById("authForm");
  form.dataset.mode = mode;
  document.querySelectorAll("[data-auth-tab]").forEach((tab) => {
    tab.classList.toggle("is-active", tab.dataset.authTab === mode);
  });
  const submit = document.getElementById("authSubmitBtn");
  const pass = document.getElementById("authPassword");
  if (mode === "register") {
    submit.textContent = "Зарегистрироваться";
    pass.autocomplete = "new-password";
    document.getElementById("authModalTitle").textContent = "Регистрация";
  } else {
    submit.textContent = "Войти";
    pass.autocomplete = "current-password";
    document.getElementById("authModalTitle").textContent = "Вход";
  }
  clearMessages();
}

function clearMessages() {
  const err = document.getElementById("authFormError");
  const ok = document.getElementById("authFormSuccess");
  err.hidden = true;
  ok.hidden = true;
  err.textContent = "";
  ok.textContent = "";
}

function showError(msg) {
  const err = document.getElementById("authFormError");
  const ok = document.getElementById("authFormSuccess");
  ok.hidden = true;
  err.hidden = false;
  err.textContent = msg;
}

function showSuccess(msg) {
  const err = document.getElementById("authFormError");
  const ok = document.getElementById("authFormSuccess");
  err.hidden = true;
  ok.hidden = false;
  ok.textContent = msg;
}

function openAuthModal(tab = "login") {
  document.getElementById("authMenu").hidden = true;
  setFormMode(tab);
  document.getElementById("authModal").hidden = false;
  document.body.style.overflow = "hidden";
  document.getElementById("authEmail")?.focus();
}

function closeAuthModal() {
  document.getElementById("authModal").hidden = true;
  document.body.style.overflow = "";
  clearMessages();
}

function updateHeader(user) {
  const btn = document.getElementById("authAccountBtn");
  const menu = document.getElementById("authMenu");
  const emailEl = document.getElementById("authMenuEmail");
  if (!btn) return;

  if (user) {
    btn.classList.add("is-authed");
    const short = user.email || "Аккаунт";
    btn.textContent = short.length > 22 ? short.slice(0, 20) + "…" : short;
    btn.title = user.email || "Аккаунт";
    if (emailEl) emailEl.textContent = user.email || user.id;
  } else {
    btn.classList.remove("is-authed");
    btn.textContent = "Войти";
    btn.title = "Войти или зарегистрироваться";
    menu.hidden = true;
  }
}

function bindUi() {
  const btn = document.getElementById("authAccountBtn");
  const menu = document.getElementById("authMenu");

  btn?.addEventListener("click", (e) => {
    e.stopPropagation();
    const user = getCurrentUser();
    if (!user) {
      openAuthModal("login");
      return;
    }
    menu.hidden = !menu.hidden;
  });

  document.getElementById("authLogoutBtn")?.addEventListener("click", async () => {
    menu.hidden = true;
    const res = await signOut();
    toast(res.message);
  });

  document.addEventListener("click", () => {
    if (menu) menu.hidden = true;
  });
  menu?.addEventListener("click", (e) => e.stopPropagation());

  document.getElementById("authModalClose")?.addEventListener("click", closeAuthModal);
  document.getElementById("authModal")?.addEventListener("click", (e) => {
    if (e.target.id === "authModal") closeAuthModal();
  });

  document.querySelectorAll("[data-auth-tab]").forEach((tab) => {
    tab.addEventListener("click", () => setFormMode(tab.dataset.authTab));
  });

  document.getElementById("authForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearMessages();
    const mode = document.getElementById("authForm").dataset.mode || "login";
    const email = document.getElementById("authEmail").value;
    const password = document.getElementById("authPassword").value;
    const submit = document.getElementById("authSubmitBtn");
    submit.disabled = true;

    try {
      if (mode === "register") {
        const res = await signUp(email, password);
        if (!res.ok) {
          showError(res.message);
          return;
        }
        showSuccess(res.message);
        toast(res.message);
        if (!res.needsEmailConfirm) {
          closeAuthModal();
        } else {
          setFormMode("login");
          showSuccess(res.message);
        }
      } else {
        const res = await signIn(email, password);
        if (!res.ok) {
          showError(res.message);
          return;
        }
        toast(res.message);
        closeAuthModal();
      }
    } finally {
      submit.disabled = false;
    }
  });
}

/**
 * Call once from each page entry (app.js / tasks-page.js).
 */
export async function initAuthUI() {
  ensureMarkup();
  bindUi();
  onAuthChange(updateHeader);
  const user = await initAuth();
  updateHeader(user);

  // After email confirmation link (tokens consumed by detectSessionInUrl)
  try {
    const url = new URL(window.location.href);
    const type = url.searchParams.get("type");
    if (user && (type === "signup" || type === "email" || type === "magiclink")) {
      toast("Email подтверждён. Вы вошли в аккаунт.");
      url.searchParams.delete("type");
      url.searchParams.delete("token_hash");
      window.history.replaceState({}, "", url.pathname + url.search + url.hash);
    } else if (window.location.hash.includes("access_token") && user) {
      toast("Email подтверждён. Вы вошли в аккаунт.");
      window.history.replaceState({}, "", url.pathname + url.search);
    }
  } catch {
    /* ignore */
  }

  return user;
}
