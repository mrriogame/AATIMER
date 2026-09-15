/**
 * Crypto donate modal (TON / USDT on TON).
 * Public address only — no keys, no payment gateway.
 * QR is generated locally via js/vendor/qrcode-generator.js (no external API).
 */
const CRYPTO_ADDRESS = "UQDhuZeqfO6CGj0QFyOlPihzDUtgxrVwRMjPrBUyy_QK_A-v";

/** Official Tether USDT jetton master on TON */
const USDT_JETTON_MASTER = "EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs";

const QR_SIZE_PX = 180;
const QR_MARGIN_PX = 8;

/** @type {"ton"|"usdt"} */
let activeCurrency = "ton";

function transferDeepLink(currency) {
  if (currency === "usdt") {
    return `ton://transfer/${CRYPTO_ADDRESS}?jetton=${USDT_JETTON_MASTER}`;
  }
  return `ton://transfer/${CRYPTO_ADDRESS}`;
}

/** Universal TON deep link — OS may open Telegram Wallet, Tonkeeper, etc. */
function walletOpenLink(currency) {
  return transferDeepLink(currency);
}

/** Build QR as data: URL in the browser (needs window.qrcode from vendor script). */
function buildQrDataUrl(payload) {
  const factory = typeof window !== "undefined" ? window.qrcode : null;
  if (typeof factory !== "function") {
    console.warn("[AATIMER] local QR library not loaded");
    return "";
  }

  const qr = factory(0, "M");
  qr.addData(payload);
  qr.make();

  const modules = qr.getModuleCount();
  const cellSize = Math.max(2, Math.floor((QR_SIZE_PX - QR_MARGIN_PX * 2) / modules));
  return qr.createDataURL(cellSize, QR_MARGIN_PX);
}

function setCurrency(currency) {
  activeCurrency = currency === "usdt" ? "usdt" : "ton";

  document.querySelectorAll("[data-crypto-currency]").forEach((btn) => {
    const on = btn.dataset.cryptoCurrency === activeCurrency;
    btn.classList.toggle("is-active", on);
    btn.setAttribute("aria-selected", on ? "true" : "false");
  });

  const note = document.getElementById("cryptoNetworkNote");
  if (note) note.hidden = activeCurrency !== "usdt";

  const addressEl = document.getElementById("cryptoAddressText");
  if (addressEl) addressEl.textContent = CRYPTO_ADDRESS;

  const caption = document.getElementById("cryptoQrCaption");
  if (caption) {
    caption.textContent =
      activeCurrency === "usdt"
        ? "QR для перевода USDT (только сеть TON)"
        : "QR для перевода TON";
  }

  const qr = document.getElementById("cryptoQrImg");
  if (qr) {
    const payload = transferDeepLink(activeCurrency);
    qr.src = buildQrDataUrl(payload);
    qr.alt =
      activeCurrency === "usdt"
        ? "QR-код для перевода USDT в сети TON"
        : "QR-код для перевода TON";
  }

  const wallet = document.getElementById("cryptoWalletLink");
  if (wallet) {
    wallet.href = walletOpenLink(activeCurrency);
  }

  hideCopyFeedback();
}

function hideCopyFeedback() {
  const el = document.getElementById("cryptoCopyFeedback");
  if (!el) return;
  el.hidden = true;
}

function showCopyFeedback() {
  const el = document.getElementById("cryptoCopyFeedback");
  if (!el) return;
  el.hidden = false;
  clearTimeout(showCopyFeedback._t);
  showCopyFeedback._t = setTimeout(() => {
    el.hidden = true;
  }, 2200);
}

async function copyAddress() {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(CRYPTO_ADDRESS);
    } else {
      const ta = document.createElement("textarea");
      ta.value = CRYPTO_ADDRESS;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    showCopyFeedback();
  } catch (err) {
    console.warn("[AATIMER] copy address failed", err);
    alert("Не удалось скопировать адрес. Выделите его вручную.");
  }
}

export function openCryptoSupportModal() {
  const modal = document.getElementById("cryptoSupportModal");
  if (!modal) return;
  setCurrency(activeCurrency);
  modal.hidden = false;
  document.body.style.overflow = "hidden";
}

export function closeCryptoSupportModal() {
  const modal = document.getElementById("cryptoSupportModal");
  if (!modal) return;
  modal.hidden = true;
  document.body.style.overflow = "";
  hideCopyFeedback();
}

export function bindCryptoSupport() {
  const modal = document.getElementById("cryptoSupportModal");
  const openBtn = document.getElementById("openCryptoSupportBtn");
  if (!modal || !openBtn || modal.dataset.bound === "1") return;
  modal.dataset.bound = "1";

  openBtn.addEventListener("click", () => openCryptoSupportModal());

  document.getElementById("cryptoSupportCloseBtn")?.addEventListener("click", closeCryptoSupportModal);

  modal.addEventListener("click", (e) => {
    if (e.target === modal) closeCryptoSupportModal();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !modal.hidden) closeCryptoSupportModal();
  });

  modal.querySelectorAll("[data-crypto-currency]").forEach((btn) => {
    btn.addEventListener("click", () => setCurrency(btn.dataset.cryptoCurrency));
  });

  document.getElementById("cryptoCopyBtn")?.addEventListener("click", (e) => {
    e.preventDefault();
    copyAddress();
  });

  setCurrency("ton");
}
