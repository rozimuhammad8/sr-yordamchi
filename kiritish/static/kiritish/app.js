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

let toastTimer = null;
function toast(text, kind = "") {
  const t = $("#toast");
  t.textContent = text;
  t.className = `toast show ${kind}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.className = "toast"; }, 3500);
}

function note(text, kind = "") {
  return el("div", { class: `note ${kind}` }, text);
}

// ---------- tokenlar ----------
function setPill(kind, text) {
  $("#pill").className = `pill ${kind}`;
  $("#pill").textContent = text;
}

function tokenHolati() {
  const token = $("#token").value.trim().replace(/^Bearer\s+/i, "");
  if (!token) return setPill("err", "Auth token yo'q"), false;
  const exp = jwtExpires(token);
  if (exp && exp <= new Date()) return setPill("err", `Token muddati tugagan (${hhmm(exp)})`), false;
  setPill("ok", `Ulangan · ${exp ? hhmm(exp) + " gacha" : "token bor"}${$("#cf").value.trim() ? " · Cloudflare" : ""}`);
  return true;
}

// sr.ihma.uz dagi foydalanuvchi ismini yuqori panelda ko'rsatadi
async function profilniKorsat() {
  try {
    const p = await call("/api/tekshir/");
    const name = p.fullName || p.userName || "";
    $("#userName").textContent = name;
    $("#userAvatar").textContent = (name.trim()[0] || "?").toUpperCase();
    $("#userChip").hidden = !name;
  } catch {
    $("#userChip").hidden = true;
  }
}

let extTimer = null;
function olish() {
  setPill("wait", "Kengaytmadan kutilmoqda…");
  window.postMessage({ source: "sr-yordamchi-page", type: "olish" }, location.origin);
  clearTimeout(extTimer);
  extTimer = setTimeout(() => {
    setPill("err", "Kengaytma javob bermadi");
    toast("Kengaytma javob bermadi — u o'rnatilganini tekshiring yoki tokenlarni qo'lda kiriting", "error");
  }, 2500);
}

window.addEventListener("message", (e) => {
  if (e.source !== window || !e.data || e.data.source !== "sr-yordamchi-ext") return;
  clearTimeout(extTimer);
  const d = e.data;
  if (d.xato) {
    setPill("err", "Tokenlar olinmadi");
    toast(d.xato, "error");
    return;
  }
  $("#token").value = d.token || "";
  $("#cf").value = d.cf || "";
  $("#ua").value = d.ua || navigator.userAgent;
  if (d.arizaId) $("#arizaId").value = d.arizaId;
  if (!tokenHolati() || !d.token) return;
  profilniKorsat();
  if (d.arizaId) arizaniYukla();
  else $("#arizaBox").replaceChildren(note(
    "sr.ihma.uz da ochiq ariza topilmadi. Arizani (sr.ihma.uz/applications/…) oching va qayta \"sr.ihma.uz dan olish\" ni bosing yoki ID ni qo'lda kiriting.", "warn"));
});

// ---------- ariza ----------
function info(label, value, full = false) {
  return el("div", { class: `info${full ? " full" : ""}` }, el("span", {}, label), el("b", {}, value || "—"));
}

async function arizaniYukla() {
  const id = $("#arizaId").value.trim();
  if (!/^\d+$/.test(id)) return $("#arizaBox").replaceChildren(note("Ariza ID raqam bo'lishi kerak", "error"));
  if (!tokenHolati()) return;
  $("#form").classList.add("disabled");
  formMsg("");
  $("#arizaBox").replaceChildren(note("Ariza yuklanmoqda…"));
  try {
    const [res, vil] = await Promise.all([call(`/api/ariza/${id}/`), call("/api/viloyatlar/")]);
    state.ariza = res.ariza;
    const a = res.ariza, adr = a.address;
    $("#arizaBox").replaceChildren(
      el("div", { class: "info-grid" },
        info("Arizachi", `${a.applicantName} · ${a.applicantPinFL}`),
        info("Ariza", `№ ${a.externalNo || a.id} · ${a.status || ""}`),
        info("Hozirgi manzil (tizimda)", `${adr.locality}, ${adr.district}, ${adr.region}`),
        info("Xonadon ID", String(a.householdId)),
        el("div", { class: "info full" }, el("span", {}, "Xonadon a'zolari"),
          el("div", { class: "members" }, a.members.map((m) =>
            el("span", { class: "member" }, m.fullName, " ", el("em", {}, `· ${m.relationship || "—"}`)))))),
      res.oldingi ? el("div", { class: "note warn", style: "margin-top:12px" },
        `Diqqat: bu xonadon ${res.oldingi.sana} da allaqachon yuborilgan (o'zgartirish ID ${res.oldingi.ozgartirish_id}).`) : null);

    options($("#sabab"), res.royxatlar.sabablar);
    options($("#turi"), res.royxatlar.xabar_beruvchi_turlari);
    $("#xabarBeruvchi").replaceChildren(el("option", { value: "" }, "— tanlang —"),
      ...a.members.map((m) => el("option", { value: String(m.personId) }, `${m.fullName} · ${m.pinFL}${m.isApplicant ? " (arizachi)" : ""}`)),
      el("option", { value: "boshqa" }, "Boshqa shaxs (xonadon a'zosi emas)"));
    $("#boshqaBox").hidden = true;
    pasportNote("", "");
    $("#telefon").value = formatPhone(a.applicantMobileNumber);
    options($("#viloyat"), vil, adr.regionId);
    await tumanlarniYukla(adr.regionId);
    $("#form").classList.remove("disabled");
  } catch (e) {
    $("#arizaBox").replaceChildren(note(e.message, "error"));
  }
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

function pasportNote(text, kind) {
  $("#pasportNote").className = `hint-line ${kind}`;
  $("#pasportNote").textContent = text;
}

function formMsg(text, kind = "") {
  $("#msg").className = `form-msg ${kind}`;
  $("#msg").textContent = text;
}

// ---------- yuborish ----------
// Brauzerning confirm() oynasi o'rniga sahifadagi modal: Playwright orqali ochilgan brauzer
// confirm() ni ko'rsatmasdan avtomatik bekor qiladi.
function tasdiqla(content) {
  const dlg = $("#confirmDlg");
  $("#confirmText").replaceChildren(content);
  dlg.classList.add("open");
  $("#confirmOk").focus();
  return new Promise((resolve) => {
    const close = (ok) => {
      dlg.classList.remove("open");
      dlg.removeEventListener("click", onClick);
      document.removeEventListener("keydown", onKey);
      resolve(ok);
    };
    const onClick = (e) => {
      const b = e.target.closest("[data-javob]");
      if (b) close(b.dataset.javob === "ok");
      else if (e.target === dlg) close(false);
    };
    const onKey = (e) => { if (e.key === "Escape") close(false); };
    dlg.addEventListener("click", onClick);
    document.addEventListener("keydown", onKey);
  });
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
  const yangi = fd.get("yangi_manzil_nomi") || "— tanlanmagan —";
  const ok = await tasdiqla(el("div", {},
    el("div", { class: "who" }, a.applicantName),
    el("div", { class: "route" }, el("div", {}, eski), el("span", {}, "→"), el("div", { class: "to" }, yangi)),
    el("div", { class: "note warn" }, "Ma'lumotlar sr.ihma.uz ga yuboriladi. Davom etilsinmi?")));
  if (!ok) return;

  $("#btnSend").disabled = true;
  formMsg("Yuborilmoqda: pasport tekshiruvi, PDF yuklash, o'zgartirishni saqlash…");
  try {
    const res = await call("/api/yuborish/", { method: "POST", body: fd });
    formMsg(`Yuborildi. O'zgartirish ID: ${res.ozgartirish_id}. Keyingi arizani sr.ihma.uz da oching.`, "ok");
    toast(`Yuborildi · ID ${res.ozgartirish_id}`, "success");
    $("#form").reset();
    $("#sana").value = new Date().toLocaleDateString("sv-SE");
    $("#pdfInfo").className = "docx-status";
    $("#pdfInfo").textContent = "Fayl tanlanmagan";
    pasportNote("", "");
    $("#form").classList.add("disabled");
  } catch (err) {
    formMsg(err.message, "error");
    toast("Yuborilmadi — xatoni pastda o'qing", "error");
  } finally {
    $("#btnSend").disabled = false;
    tarixniYukla();
  }
}

async function tarixniYukla() {
  try {
    const list = await (await fetch("/api/tarix/")).json();
    $("#statJami").textContent = list.length;
    $("#statOk").textContent = list.filter((t) => t.holat === "yuborildi").length;
    $("#statXato").textContent = list.filter((t) => t.holat !== "yuborildi").length;
    $("#tarix").replaceChildren(...(list.length ? list.map((t) => el("tr", {},
      el("td", {}, el("strong", {}, t.fish)),
      el("td", {}, t.eski),
      el("td", {}, t.yangi),
      el("td", {}, t.holat === "yuborildi"
        ? el("span", { class: "pill pill-good" }, "Yuborildi")
        : [el("span", { class: "pill pill-danger" }, "Xato"), el("span", { class: "xato-matn" }, t.xato)]),
      el("td", {}, t.ozgartirish_id ? String(t.ozgartirish_id) : el("span", { class: "muted" }, "—")),
      el("td", { class: "muted" }, t.vaqt),
      el("td", {}, t.pdf ? el("a", { href: t.pdf, target: "_blank", class: "muted" }, "ochish") : ""),
    )) : [el("tr", {}, el("td", { colspan: "7", class: "empty" }, "Hali hech narsa yuborilmagan"))]));
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
  document.querySelector("[name=pasport_seriya]").value = m ? m.passportSeries || "" : "";
  document.querySelector("[name=pasport_raqam]").value = m ? m.passportNo || "" : "";
  if (!v) pasportNote("", "");
  else if (v === "boshqa") pasportNote("Boshqa shaxsning pasport ma'lumotlarini qo'lda kiriting", "");
  else if (m && m.passportSeries && m.passportNo) pasportNote("✓ Pasport ma'lumoti sr.ihma.uz dan olindi", "ok");
  else pasportNote("Bu a'zoning pasport ma'lumoti sr.ihma.uz da yo'q — qo'lda kiriting", "warn");
});
$("#telefon").addEventListener("blur", (e) => { e.target.value = formatPhone(e.target.value); });
$("#pdfBtn").addEventListener("click", () => $("#pdf").click());
$("#pdf").addEventListener("change", (e) => {
  const f = e.target.files[0];
  const info = $("#pdfInfo");
  if (!f) {
    info.className = "docx-status";
    info.textContent = "Fayl tanlanmagan";
    return;
  }
  const big = f.size > 1024 * 1024;
  info.className = `docx-status ${big ? "error" : "ok"}`;
  info.replaceChildren(`${f.name} · ${(f.size / 1024).toFixed(0)} KB${big ? " — 1 MB dan katta, kichikroq fayl tanlang" : ""}`,
    el("a", { href: URL.createObjectURL(f), target: "_blank" }, "ko'rish"));
});
$("#form").addEventListener("submit", yubor);
$("#sana").value = new Date().toLocaleDateString("sv-SE");

tarixniYukla();
olish(); // sahifa ochilganda kengaytmadan tokenlarni so'raymiz
