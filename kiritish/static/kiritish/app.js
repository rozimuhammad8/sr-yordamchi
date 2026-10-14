// SR yordamchi sahifasi. Tokenlar va ariza ID ni "SR yordamchi" kengaytmasi sr.ihma.uz dan olib beradi
// (window.postMessage orqali), so'rovlarni Django server sr.ihma.uz ga yuboradi.
"use strict";

const $ = (sel) => document.querySelector(sel);
const state = { ariza: null };

// ---------- yordamchilar ----------
function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === "class") node.className = v;
    else if (k.startsWith("on")) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v);
  }
  for (const c of children.flat()) if (c !== null && c !== undefined && c !== false) node.append(c);
  return node;
}

function options(select, items, selected = null, placeholder = "— tanlang —") {
  select.replaceChildren(el("option", { value: "" }, placeholder),
    ...items.map((it) => el("option", { value: String(it.id) }, it.name)));
  select.value = selected != null ? String(selected) : "";
}

function formatPhone(raw) {
  const d = String(raw || "").replace(/\D/g, "");
  const n = d.length === 9 ? "998" + d : d;
  if (n.length !== 12) return raw || "";
  return `+${n.slice(0, 3)} ${n.slice(3, 5)} ${n.slice(5, 8)} ${n.slice(8, 10)} ${n.slice(10, 12)}`;
}

function jwtExpires(token) {
  try {
    return new Date(JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))).exp * 1000);
  } catch {
    return null;
  }
}

const hhmm = (d) => d.toTimeString().slice(0, 5);
const csrf = () => (document.cookie.match(/csrftoken=([^;]+)/) || [])[1] || "";

function srHeaders() {
  return {
    "X-SR-Token": $("#token").value.trim(),
    "X-SR-CF": $("#cf").value.trim(),
    "X-SR-UA": $("#ua").value || navigator.userAgent,
  };
}

async function call(url, opts = {}) {
  const r = await fetch(url, { ...opts, headers: { ...srHeaders(), "X-CSRFToken": csrf(), ...(opts.headers || {}) } });
  const data = await r.json().catch(() => ({ xato: `Server javobi noto'g'ri (${r.status})` }));
  if (!r.ok) throw new Error(data.xato || `Xato ${r.status}`);
  return data;
}

// ---------- tokenlar ----------
function setPill(ok, text) {
  $("#pill").className = ok ? "pill ok" : "pill err";
  $("#pill").textContent = text;
}

function tokenHolati() {
  const token = $("#token").value.trim().replace(/^Bearer\s+/i, "");
  if (!token) return setPill(false, "Auth token yo'q"), false;
  const exp = jwtExpires(token);
  if (exp && exp <= new Date()) return setPill(false, `Token muddati tugagan (${hhmm(exp)}) — sr.ihma.uz ga qayta kiring`), false;
  setPill(true, `token ${exp ? hhmm(exp) + " gacha" : "kiritilgan"} · Cloudflare: ${$("#cf").value.trim() ? "bor" : "yo'q"}`);
  return true;
}

let extTimer = null;
function olish() {
  setPill(false, "kengaytmadan kutilmoqda…");
  window.postMessage({ source: "sr-yordamchi-page", type: "olish" }, location.origin);
  clearTimeout(extTimer);
  extTimer = setTimeout(() => setPill(false, "Kengaytma javob bermadi — u o'rnatilganini tekshiring yoki tokenlarni qo'lda kiriting"), 2500);
}

window.addEventListener("message", (e) => {
  if (e.source !== window || !e.data || e.data.source !== "sr-yordamchi-ext") return;
  clearTimeout(extTimer);
  const d = e.data;
  if (d.xato) return setPill(false, d.xato);
  $("#token").value = d.token || "";
  $("#cf").value = d.cf || "";
  $("#ua").value = d.ua || navigator.userAgent;
  if (d.arizaId) $("#arizaId").value = d.arizaId;
  if (!tokenHolati()) return;
  if (!d.token) return;
  if (d.arizaId) arizaniYukla();
  else $("#arizaBox").replaceChildren(el("p", { class: "warn" },
    "sr.ihma.uz da ochiq ariza topilmadi. Arizani (sr.ihma.uz/applications/…) oching va qayta \"olish\"ni bosing yoki ID ni qo'lda kiriting."));
});

// ---------- ariza ----------
async function arizaniYukla() {
  const id = $("#arizaId").value.trim();
  if (!/^\d+$/.test(id)) return $("#arizaBox").replaceChildren(el("p", { class: "error" }, "Ariza ID raqam bo'lishi kerak"));
  if (!tokenHolati()) return;
  $("#form").classList.add("disabled");
  $("#msg").replaceChildren();
  $("#arizaBox").replaceChildren(el("p", { class: "note" }, "Ariza yuklanmoqda…"));
  try {
    const [res, vil] = await Promise.all([call(`/api/ariza/${id}/`), call("/api/viloyatlar/")]);
    state.ariza = res.ariza;
    const a = res.ariza, adr = a.address;
    $("#arizaBox").replaceChildren(
      el("div", { class: "grid" },
        info("Arizachi", `${a.applicantName} · ${a.applicantPinFL}`),
        info("Ariza", `№ ${a.externalNo || a.id} · ${a.status || ""}`),
        info("Hozirgi manzil (tizimda)", `${adr.locality}, ${adr.district}, ${adr.region}`),
        info("Xonadon ID", String(a.householdId)),
        info("A'zolar", a.members.map((m) => `${m.fullName} (${m.relationship || "—"})`).join("; "), true)),
      res.oldingi ? el("p", { class: "warn" },
        `Diqqat: bu xonadon ${res.oldingi.sana} da allaqachon yuborilgan (o'zgartirish ID ${res.oldingi.ozgartirish_id}).`) : null);

    options($("#sabab"), res.royxatlar.sabablar);
    options($("#turi"), res.royxatlar.xabar_beruvchi_turlari);
    $("#xabarBeruvchi").replaceChildren(el("option", { value: "" }, "— tanlang —"),
      ...a.members.map((m) => el("option", { value: String(m.personId) }, `${m.fullName} · ${m.pinFL}${m.isApplicant ? " (arizachi)" : ""}`)),
      el("option", { value: "boshqa" }, "Boshqa shaxs (xonadon a'zosi emas)"));
    $("#boshqaBox").hidden = true;
    $("#pasportNote").textContent = "";
    $("#telefon").value = formatPhone(a.applicantMobileNumber);
    options($("#viloyat"), vil, adr.regionId);
    await tumanlarniYukla(adr.regionId);
    $("#form").classList.remove("disabled");
  } catch (e) {
    $("#arizaBox").replaceChildren(el("p", { class: "error" }, e.message));
  }
}

function info(label, value, wide = false) {
  return el("div", { class: `field${wide ? " wide" : ""}` }, el("label", {}, label), el("div", {}, value || "—"));
}

async function tumanlarniYukla(viloyatId) {
  options($("#tuman"), viloyatId ? await call(`/api/tumanlar/${viloyatId}/`) : []);
  options($("#mahalla"), []);
  birXilmi();
}

async function mahallalarniYukla(tumanId) {
  options($("#mahalla"), tumanId ? await call(`/api/mahallalar/${tumanId}/`) : []);
  birXilmi();
}

function birXilmi() {
  const same = state.ariza && $("#mahalla").value && +$("#mahalla").value === state.ariza.address.localityId;
  $("#sameWarn").textContent = same ? "Yangi mahalla hozirgi mahalla bilan bir xil — sr.ihma.uz buni qabul qilmaydi" : "";
}

// ---------- yuborish ----------
// Brauzerning confirm() oynasi o'rniga sahifadagi oyna: Playwright orqali ochilgan brauzer
// confirm() ni ko'rsatmasdan avtomatik bekor qiladi.
function tasdiqla(text) {
  const dlg = $("#confirmDlg");
  $("#confirmText").textContent = text;
  dlg.returnValue = "";
  dlg.showModal();
  $("#confirmOk").focus();
  return new Promise((resolve) => dlg.addEventListener("close", () => resolve(dlg.returnValue === "ok"), { once: true }));
}
async function yubor(e) {
  e.preventDefault();
  const a = state.ariza;
  if (!a || !tokenHolati()) return;
  const sel = (id) => $(id).selectedOptions[0];
  const fd = new FormData($("#form"));
  fd.set("ariza_id", a.id);
  fd.set("telefon", formatPhone(fd.get("telefon")));
  fd.set("sabab_nomi", $("#sabab").value ? sel("#sabab").textContent : "");
  fd.set("yangi_manzil_nomi", $("#mahalla").value ? `${sel("#mahalla").textContent}, ${sel("#tuman").textContent}` : "");

  const eski = `${a.address.locality}, ${a.address.district}`;
  const yangi = fd.get("yangi_manzil_nomi") || "—";
  if (!(await tasdiqla(`${a.applicantName}\n${eski}  →  ${yangi}\n\nsr.ihma.uz ga yuborilsinmi?`))) return;

  $("#btnSend").disabled = true;
  $("#msg").replaceChildren(el("p", { class: "note" }, "Yuborilmoqda: pasport tekshiruvi, PDF yuklash, o'zgartirishni saqlash…"));
  try {
    const res = await call("/api/yuborish/", { method: "POST", body: fd });
    $("#msg").replaceChildren(
      el("p", { class: "ok" }, `Yuborildi. O'zgartirish ID: ${res.ozgartirish_id}`),
      el("p", { class: "note" }, "Keyingi arizani sr.ihma.uz da oching va \"sr.ihma.uz dan olish\" ni bosing."));
    $("#form").reset();
    $("#sana").value = new Date().toLocaleDateString("sv-SE");
    $("#pdfInfo").replaceChildren();
    $("#form").classList.add("disabled");
  } catch (err) {
    $("#msg").replaceChildren(el("p", { class: "error" }, err.message));
  } finally {
    $("#btnSend").disabled = false;
    tarixniYukla();
  }
}

async function tarixniYukla() {
  try {
    const list = await (await fetch("/api/tarix/")).json();
    $("#tarix").replaceChildren(...(list.length ? list.map((t) => el("li", {},
      el("div", { class: "name" }, t.fish),
      el("div", { class: "sub" }, `${t.eski} → ${t.yangi}`),
      el("div", { class: `sub ${t.holat}` }, `${t.vaqt} · ${t.holat === "yuborildi" ? "ID " + t.ozgartirish_id : "xato: " + t.xato}`),
    )) : [el("li", { class: "note" }, "Hali hech narsa yuborilmagan")]));
  } catch { /* tarix muhim emas */ }
}

// ---------- hodisalar ----------
$("#btnOlish").addEventListener("click", olish);
$("#btnAriza").addEventListener("click", arizaniYukla);
$("#arizaId").addEventListener("keydown", (e) => e.key === "Enter" && arizaniYukla());
$("#token").addEventListener("input", tokenHolati);
$("#cf").addEventListener("input", tokenHolati);
$("#showTokens").addEventListener("change", (e) => {
  for (const id of ["#token", "#cf"]) $(id).type = e.target.checked ? "text" : "password";
});
$("#viloyat").addEventListener("change", (e) => tumanlarniYukla(+e.target.value || null).catch((x) => { $("#sameWarn").textContent = x.message; }));
$("#tuman").addEventListener("change", (e) => mahallalarniYukla(+e.target.value || null).catch((x) => { $("#sameWarn").textContent = x.message; }));
$("#mahalla").addEventListener("change", birXilmi);
$("#xabarBeruvchi").addEventListener("change", (e) => {
  const v = e.target.value;
  $("#boshqaBox").hidden = v !== "boshqa";
  // pasport ma'lumoti sr.ihma.uz dagi xonadon a'zolaridan olinadi; o'zgartirish mumkin
  const m = state.ariza && state.ariza.members.find((x) => String(x.personId) === v);
  const seriya = document.querySelector("[name=pasport_seriya]");
  const raqam = document.querySelector("[name=pasport_raqam]");
  seriya.value = m ? m.passportSeries || "" : "";
  raqam.value = m ? m.passportNo || "" : "";
  $("#pasportNote").className = m && !(m.passportSeries && m.passportNo) ? "warn" : "note";
  $("#pasportNote").textContent = !v ? ""
    : v === "boshqa" ? "Boshqa shaxsning pasport ma'lumotlarini qo'lda kiriting"
    : m && m.passportSeries && m.passportNo ? "Pasport ma'lumoti sr.ihma.uz dan olindi"
    : "Bu a'zoning pasport ma'lumoti sr.ihma.uz da yo'q — qo'lda kiriting";
});
$("#telefon").addEventListener("blur", (e) => { e.target.value = formatPhone(e.target.value); });
$("#pdf").addEventListener("change", (e) => {
  const f = e.target.files[0];
  if (!f) return $("#pdfInfo").replaceChildren();
  const big = f.size > 1024 * 1024;
  $("#pdfInfo").replaceChildren(el("p", { class: big ? "error" : "note" },
    `${f.name} · ${(f.size / 1024).toFixed(0)} KB${big ? " — sr.ihma.uz 1 MB gacha qabul qiladi, kichikroq fayl tanlang" : ""}`));
});
$("#form").addEventListener("submit", yubor);
$("#sana").value = new Date().toLocaleDateString("sv-SE");

tarixniYukla();
olish(); // sahifa ochilganda kengaytmadan tokenlarni so'raymiz
