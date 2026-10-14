// SR yordamchi kengaytmasi: sr.ihma.uz dan tokenlarni va ochiq ariza ID sini olib beradi.
const SR = "https://sr.ihma.uz";
const APP_URL = "http://127.0.0.1:5300/";

// Belgi bosilganda SR yordamchi sahifasini ochadi (ochiq bo'lsa, unga o'tadi)
chrome.action.onClicked.addListener(async () => {
  const tabs = await chrome.tabs.query({});
  const app = tabs.find((t) => t.url && /^http:\/\/(127\.0\.0\.1|localhost):5300\//.test(t.url));
  if (app) {
    await chrome.tabs.update(app.id, { active: true });
    await chrome.windows.update(app.windowId, { focused: true });
  } else {
    await chrome.tabs.create({ url: APP_URL });
  }
});

async function getData() {
  const srTabs = await chrome.tabs.query({ url: `${SR}/*` });
  if (!srTabs.length) return { xato: "sr.ihma.uz ochiq emas. Birinchi tabda sr.ihma.uz ga kiring va arizani oching." };

  // cf_clearance "partitioned" (CHIPS) cookie: uni faqat partitionKey bilan so'raganda ko'rish mumkin
  const [plain, partitioned] = await Promise.all([
    chrome.cookies.getAll({ url: SR }),
    chrome.cookies.getAll({ url: SR, partitionKey: {} }).catch(() => []),
  ]);
  const cookies = [...plain, ...partitioned];
  const token = cookies.find((c) => c.name === "Authorization");
  const cf = cookies.find((c) => c.name === "cf_clearance");
  if (!token) return { xato: "Auth token topilmadi. sr.ihma.uz ga OneID orqali kiring." };

  // eng oxirgi faol bo'lgan sr.ihma.uz/applications/<id> tabidagi ariza
  const apps = srTabs
    .map((t) => ({ t, m: (t.url || "").match(/\/applications\/(\d+)/) }))
    .filter((x) => x.m)
    .sort((a, b) => (b.t.lastAccessed || 0) - (a.t.lastAccessed || 0));

  return { token: token.value, cf: cf ? cf.value : "", arizaId: apps.length ? apps[0].m[1] : "" };
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === "olish") {
    getData().then(sendResponse, (e) => sendResponse({ xato: String(e) }));
    return true; // javob asinxron
  }
  return false;
});
