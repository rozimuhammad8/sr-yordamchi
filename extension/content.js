// localhost:5300 sahifasi bilan kengaytma o'rtasidagi ko'prik.
// Sahifa {source: "sr-yordamchi-page", type: "olish"} yuboradi, biz tokenlar va ariza ID ni qaytaramiz.
async function ask() {
  try {
    return await chrome.runtime.sendMessage({ type: "olish" });
  } catch (err) {
    // fon qismi (service worker) endi uyg'onayotgan bo'lsa, bir oz kutib qayta urinamiz
    await new Promise((r) => setTimeout(r, 700));
    return chrome.runtime.sendMessage({ type: "olish" });
  }
}

window.addEventListener("message", async (e) => {
  if (e.source !== window || !e.data || e.data.source !== "sr-yordamchi-page" || e.data.type !== "olish") return;
  let data;
  try {
    data = (await ask()) || { xato: "Kengaytma bo'sh javob qaytardi" };
  } catch (err) {
    data = { xato: "Kengaytma bilan bog'lanib bo'lmadi: " + err.message + ". chrome://extensions da SR yordamchini qayta yuklang (↻)." };
  }
  window.postMessage({ source: "sr-yordamchi-ext", ua: navigator.userAgent, ...data }, location.origin);
});
