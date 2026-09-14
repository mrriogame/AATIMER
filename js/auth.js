/**
 * Supabase Auth — session only (no data sync).
 * Guest mode keeps using LocalStorage unchanged.
 */
import { supabase } from "./supabase.js";

/** @typedef {{ id: string, email: string|null }} AuthUser */

/** @type {AuthUser|null} */
let currentUser = null;

/** @type {Set<(user: AuthUser|null) => void>} */
const listeners = new Set();

let started = false;

export function getAuthRedirectUrl() {
  // Works for localhost and GitHub Pages project/user sites
  return new URL("./", window.location.href).href;
}

export function getCurrentUser() {
  return currentUser;
}

export function isAuthenticated() {
  return !!currentUser;
}

export function onAuthChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function setUser(user) {
  const next = user
    ? { id: user.id, email: user.email ?? null }
    : null;
  const same =
    (!currentUser && !next) ||
    (currentUser && next && currentUser.id === next.id && currentUser.email === next.email);
  currentUser = next;
  if (!same) {
    listeners.forEach((fn) => {
      try {
        fn(currentUser);
      } catch (e) {
        console.warn("[AATIMER] auth listener error", e);
      }
    });
  }
}

export function mapAuthError(error) {
  if (!error) return "Неизвестная ошибка";
  const msg = (error.message || String(error)).toLowerCase();
  const status = error.status;

  if (msg.includes("failed to fetch") || msg.includes("network")) {
    return "Нет связи с сервером. Проверьте интернет.";
  }
  if (msg.includes("invalid login credentials") || msg.includes("invalid credentials")) {
    return "Неверный email или пароль.";
  }
  if (msg.includes("email not confirmed")) {
    return "Email ещё не подтверждён. Проверьте почту и перейдите по ссылке.";
  }
  if (msg.includes("user already registered") || msg.includes("already been registered")) {
    return "Этот email уже зарегистрирован. Войдите или восстановите доступ.";
  }
  if (msg.includes("password should be") || msg.includes("password is known") || (msg.includes("password") && msg.includes("least"))) {
    return "Пароль слишком короткий или слишком простой. Используйте не меньше 6 символов.";
  }
  if (msg.includes("unable to validate email") || msg.includes("invalid email") || msg.includes("email address")) {
    return "Введите корректный email.";
  }
  if (msg.includes("signup is disabled")) {
    return "Регистрация временно отключена.";
  }
  if (msg.includes("rate limit") || status === 429) {
    return "Слишком много попыток. Подождите немного и попробуйте снова.";
  }
  if (msg.includes("user not found")) {
    return "Пользователь с таким email не найден.";
  }
  return "Не удалось выполнить действие. Попробуйте ещё раз.";
}

function validateCredentials(email, password) {
  const e = (email || "").trim();
  if (!e || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) {
    return { ok: false, message: "Введите корректный email." };
  }
  if (!password || password.length < 6) {
    return { ok: false, message: "Пароль должен быть не короче 6 символов." };
  }
  return { ok: true, email: e, password };
}

/**
 * @returns {Promise<{ ok: boolean, needsEmailConfirm?: boolean, message: string }>}
 */
export async function signUp(email, password) {
  const v = validateCredentials(email, password);
  if (!v.ok) return { ok: false, message: v.message };

  const { data, error } = await supabase.auth.signUp({
    email: v.email,
    password: v.password,
    options: {
      emailRedirectTo: getAuthRedirectUrl(),
    },
  });

  if (error) {
    return { ok: false, message: mapAuthError(error) };
  }

  // Identities empty often means email already registered (when confirm enabled)
  if (data?.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
    return {
      ok: false,
      message: "Этот email уже зарегистрирован. Войдите или подтвердите почту, если ещё не подтвердили.",
    };
  }

  if (data.session && data.user) {
    setUser(data.user);
    return { ok: true, needsEmailConfirm: false, message: "Регистрация успешна. Вы вошли в аккаунт." };
  }

  return {
    ok: true,
    needsEmailConfirm: true,
    message:
      "Аккаунт создан. Проверьте почту и перейдите по ссылке подтверждения, затем войдите.",
  };
}

/**
 * @returns {Promise<{ ok: boolean, message: string }>}
 */
export async function signIn(email, password) {
  const v = validateCredentials(email, password);
  if (!v.ok) return { ok: false, message: v.message };

  const { data, error } = await supabase.auth.signInWithPassword({
    email: v.email,
    password: v.password,
  });

  if (error) {
    return { ok: false, message: mapAuthError(error) };
  }

  if (data.user) setUser(data.user);
  return { ok: true, message: "Вы вошли в аккаунт." };
}

/**
 * @returns {Promise<{ ok: boolean, message: string }>}
 */
export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) {
    return { ok: false, message: mapAuthError(error) };
  }
  setUser(null);
  return { ok: true, message: "Вы вышли. Данные в этом браузере сохранены." };
}

/**
 * Restore session + subscribe to auth changes. Call once per page.
 */
export async function initAuth() {
  if (started) return getCurrentUser();
  started = true;

  supabase.auth.onAuthStateChange((event, session) => {
    setUser(session?.user ?? null);
    if (event === "PASSWORD_RECOVERY") {
      /* not implemented this stage */
    }
  });

  const { data, error } = await supabase.auth.getSession();
  if (error) {
    console.warn("[AATIMER] getSession", error.message);
    setUser(null);
    return null;
  }
  setUser(data.session?.user ?? null);
  return getCurrentUser();
}
