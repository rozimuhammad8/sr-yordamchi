// SR yordamchi sahifasi. Tokenlar va ariza ID ni "SR yordamchi" kengaytmasi sr.ihma.uz dan olib beradi
// (window.postMessage orqali), so'rovlarni Django server sr.ihma.uz ga yuboradi.
"use strict";

const $ = (sel) => document.querySelector(sel);
const state = { ariza: null, autoIzoh: "", xabar: null, turi: null };
// sr.ihma.uz da arizachining telefoni bo'lmasa qo'yiladigan qiymat
const DEFAULT_PHONE = "+998 90 123 45 67";

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

// ---------- qidiruvli dropdown (viloyat / tuman / mahalla) ----------
// sr.ihma.uz nomlarni kirillda beradi; qidiruv lotin va kirill farqisiz ishlaydi.
const LAT = { а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "yo", ж: "j", з: "z", и: "i", й: "y", к: "k",
  л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "x", ц: "ts", ч: "ch",
  ш: "sh", щ: "sh", ъ: "ʼ", ы: "i", ь: "", э: "e", ю: "yu", я: "ya", ў: "oʻ", қ: "q", ғ: "gʻ", ҳ: "h" };

function lotin(s) {
  const low = String(s || "").toLowerCase();
  let out = "";
  for (let i = 0; i < low.length; i++) {
    const c = low[i];
    // so'z boshida va unlidan keyin "е" -> "ye"
    out += c === "е" && (i === 0 || /[\s\-(«"'ъьаоуэияюёўе.]/.test(low[i - 1])) ? "ye" : (LAT[c] ?? c);
  }
  return out
    .replace(/(^|[\s\-(«".])([a-zʻʼ])/g, (m, p, ch) => p + ch.toUpperCase())
    .replace(/\bMfy\b/g, "MFY")
    .replace(/\b(Tumani|Shahri|Shaxri|Viloyati|Respublikasi)\b/g, (w) => w.toLowerCase());
}

// Qidiruv kaliti: kirill ham, lotin ham bir xil kalitga keladi va keng tarqalgan
// imlo farqlari tenglashtiriladi (navruz = Навро'з, dongqishloq = Дўнқишлоқ, kurgontepa = Қўрғонтепа).
function qidiruvKaliti(s) {
  return lotin(s).toLowerCase()
    .replace(/[ʻʼ'‘’`´]/g, "")          // o' g' -> o g
    .replace(/ye/g, "e").replace(/yo/g, "o").replace(/yu/g, "u").replace(/ya/g, "a")
    .replace(/q/g, "k").replace(/x/g, "h").replace(/ts/g, "s").replace(/dj/g, "j")
    .replace(/u/g, "o")                  // ў (o') ko'pincha "u" deb yoziladi
    .replace(/ng/g, "n")                 // нг / нқ
    .replace(/(.)\1+/g, "$1")            // takror harflar: Ҳаққул = haqul
    .replace(/\s+/g, " ").trim();
}

class Combo {
  constructor(root, onChange) {
    this.root = root;
    this.onChange = onChange;
    this.items = [];
    this.filtered = [];
    this.selected = null;
    this.active = -1;
    this.loading = false;
    this.input = el("input", { type: "text", class: "combo-input", autocomplete: "off", spellcheck: "false",
      placeholder: root.dataset.placeholder || "" });
    this.hidden = root.dataset.name ? el("input", { type: "hidden", name: root.dataset.name }) : null;
    this.panel = el("div", { class: "combo-panel" });
    const arrow = el("button", { type: "button", class: "combo-arrow", tabindex: "-1", "aria-label": "Ro'yxatni ochish" });
    arrow.innerHTML = '<svg viewBox="0 0 12 8"><path d="M0 0h12L6 8z" fill="currentColor"/></svg>';
    root.append(this.input, arrow, this.panel);
    if (this.hidden) root.append(this.hidden);

    this.input.addEventListener("focus", () => this.open(""));
    this.input.addEventListener("input", () => { root.classList.remove("invalid"); this.open(this.input.value); });
    this.input.addEventListener("keydown", (e) => this.key(e));
    this.input.addEventListener("blur", () => this.commit());
    arrow.addEventListener("mousedown", (e) => {
      e.preventDefault();
      if (root.classList.contains("open")) this.close();
      else { this.input.focus(); this.open(""); }
    });
    this.panel.addEventListener("mousedown", (e) => e.preventDefault()); // variant bosilganda fokus inputda qoladi
  }

  get value() { return this.selected ? this.selected.id : null; }
  get text() { return this.selected ? this.selected.name : ""; }

  setItems(items, selectedId = null) {
    this.loading = false;
    this.items = items.map((it) => ({ ...it, sub: lotin(it.name), key: qidiruvKaliti(it.name) }));
    this.select(this.items.find((i) => i.id === selectedId) || null, false);
    if (this.root.classList.contains("open")) this.open(this.input.value === this.text ? "" : this.input.value);
  }

  setLoading() {
    this.setItems([]);
    this.loading = true;
  }

  select(item, fire = true) {
    const changed = (item ? item.id : null) !== this.value;
    this.selected = item;
    this.input.value = item ? item.name : "";
    if (this.hidden) this.hidden.value = item ? item.id : "";
    this.root.classList.remove("invalid");
    if (fire && changed && this.onChange) this.onChange(this.value);
  }

  open(query) {
    const k = qidiruvKaliti(query);
    this.filtered = k ? this.items.filter((i) => i.key.includes(k)) : this.items;
    this.active = this.filtered.indexOf(this.selected);
    if (this.active < 0 && k && this.filtered.length) this.active = 0;
    this.render();
    this.root.classList.add("open");
  }

  close() { this.root.classList.remove("open"); }

  render() {
    if (this.loading) return this.panel.replaceChildren(el("div", { class: "combo-empty loading" }, "Yuklanmoqda…"));
    if (!this.filtered.length) {
      return this.panel.replaceChildren(el("div", { class: "combo-empty" },
        this.items.length ? "Hech narsa topilmadi" : "Avval yuqoridagi maydonni tanlang"));
    }
    this.panel.replaceChildren(...this.filtered.map((it, idx) => {
      const o = el("div", { class: `combo-opt${idx === this.active ? " active" : ""}${it === this.selected ? " selected" : ""}` },
        el("b", {}, it.name), it.sub && it.sub !== it.name ? el("span", {}, it.sub) : null);
      o.addEventListener("click", () => { this.select(it); this.close(); });
      return o;
    }));
    const a = this.panel.children[this.active];
    if (a) a.scrollIntoView({ block: "nearest" });
  }

  key(e) {
    const isOpen = this.root.classList.contains("open");
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!isOpen) return this.open("");
      const n = this.filtered.length;
      if (!n) return;
      this.active = (this.active + (e.key === "ArrowDown" ? 1 : -1) + n) % n;
      this.render();
    } else if (e.key === "Enter") {
      e.preventDefault(); // formani yubormasin
      if (isOpen && this.filtered[this.active]) {
        this.select(this.filtered[this.active]);
        this.close();
      }
    } else if (e.key === "Escape") {
      this.close();
      this.input.value = this.text;
    }
  }

  // fokus ketganda: yozilgan matn bitta variantga mos kelsa — tanlaydi, aks holda oldingi tanlovga qaytadi
  commit() {
    this.close();
    const k = qidiruvKaliti(this.input.value);
    if (!k) { if (this.selected) this.select(null); return; }
    if (this.selected && this.selected.key === k) { this.input.value = this.text; return; }
    const exact = this.items.find((i) => i.key === k);
    const matches = this.items.filter((i) => i.key.includes(k));
    const pick = exact || (matches.length === 1 ? matches[0] : null);
    if (pick) return this.select(pick);
    this.input.value = this.text;
    if (!this.selected) this.root.classList.add("invalid");
  }
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
  xabarniTozala();
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
        `Diqqat: bu xonadon ${res.oldingi.sana} da allaqachon yuborilgan (o'zgartirish ID ${res.oldingi.ozgartirish_id}).`) : "");

    options($("#sabab"), res.royxatlar.sabablar);
    xabarBeruvchiniQoy(a, res.royxatlar.xabar_beruvchi_turlari);
    $("#telefon").value = formatPhone(a.applicantMobileNumber) || DEFAULT_PHONE;
    document.querySelector("[name=izoh]").value = "";
    state.autoIzoh = "";
    C.viloyat.setItems(vil, adr.regionId);
    await tumanlarniYukla(adr.regionId);
    $("#form").classList.remove("disabled");
  } catch (e) {
    $("#arizaBox").replaceChildren(note(e.message, "error"));
  }
}

// Arizachi PINFL'i bo'yicha: bitta ariza topilsa — yuklanadi, bir nechta bo'lsa — qaysi birini yuklash so'raladi
async function pinflBoyichaYukla() {
  const pinfl = $("#pinflQidir").value.trim();
  if (!/^\d{14}$/.test(pinfl)) return $("#arizaBox").replaceChildren(note("PINFL 14 ta raqam bo'lishi kerak", "error"));
  if (!tokenHolati()) return;
  $("#form").classList.add("disabled");
  $("#arizaBox").replaceChildren(note("Arizalar qidirilmoqda…"));
  try {
    const list = await call(`/api/ariza-qidir/?pinfl=${pinfl}`);
    if (!list.length) return $("#arizaBox").replaceChildren(note("Bu PINFL bo'yicha ariza topilmadi", "warn"));
    const tanla = (id) => { $("#arizaId").value = id; arizaniYukla(); };
    if (list.length === 1) return tanla(list[0].id);
    $("#arizaBox").replaceChildren(
      note(`Bu PINFL bo'yicha ${list.length} ta ariza topildi — qaysi birini yuklaymiz?`, "warn"),
      el("div", { class: "ariza-tanlov" }, list.map((x) =>
        el("button", { type: "button", class: "btn", onclick: () => tanla(x.id) },
          el("span", {}, el("b", {}, `№ ${x.raqam || x.id}`), ` · ${x.arizachi || "—"}`),
          el("span", { class: "muted" }, [x.holat, x.sana].filter(Boolean).join(" · "))))));
  } catch (e) {
    $("#arizaBox").replaceChildren(note(e.message, "error"));
  }
}

async function tumanlarniYukla(viloyatId) {
  C.tuman.setLoading();
  C.mahalla.setItems([]);
  C.tuman.setItems(viloyatId ? await call(`/api/tumanlar/${viloyatId}/`) : []);
  birXilmi();
}

async function mahallalarniYukla(tumanId) {
  C.mahalla.setLoading();
  C.mahalla.setItems(tumanId ? await call(`/api/mahallalar/${tumanId}/`) : []);
  birXilmi();
}

function birXilmi() {
  const same = state.ariza && C.mahalla.value && C.mahalla.value === state.ariza.address.localityId;
  $("#sameWarn").textContent = same ? "Yangi mahalla hozirgi mahalla bilan bir xil — sr.ihma.uz buni qabul qilmaydi" : "";
  izohniYangila();
}

// "Чорвадор МФЙ" -> "Fuqaro Chorvador MFYga ko'chib ketgan" (ommaviy.js ham ishlatadi)
function kochishIzohi(mahalla) {
  const s = lotin(mahalla).trim();
  const m = s.match(/^(.*?)\s+(MFY|QFY|KFY|OFY)\.?$/i);
  const [nom, tur] = m ? [m[1], m[2].toUpperCase()] : [s, "MFY"];
  return nom ? `Fuqaro ${nom} ${tur}ga ko'chib ketgan` : "";
}

// Izohni tanlangan yangi mahalla bo'yicha to'ldiradi.
// Foydalanuvchi izohni o'zi o'zgartirgan bo'lsa, uning matniga tegilmaydi.
function izohniYangila() {
  const a = state.ariza;
  if (!a) return;
  const m = C.mahalla.value;
  const text = m && m !== a.address.localityId ? kochishIzohi(C.mahalla.text) : "";
  const izoh = document.querySelector("[name=izoh]");
  if (!izoh.value.trim() || izoh.value === state.autoIzoh) izoh.value = text;
  state.autoIzoh = text;
}

// Xabar beruvchi turi avtomatik: ommaviy bo'limda oxirgi tanlangani, bo'lmasa nomida "o'zi"/"arizachi" bor
// variant, bo'lmasa birinchisi (ommaviy.js ham ishlatadi)
function avtoTuri(items) {
  if (!items.length) return null;
  let saqlangan = "";
  try { saqlangan = localStorage.getItem("om.turi") || ""; } catch { /* muhim emas */ }
  const s = items.find((x) => String(x.id) === saqlangan);
  const nom = items.find((x) => /\b(ozi|arizachi|shahsan)/.test(qidiruvKaliti(x.name)));
  return (s || nom || items[0]).id;
}

// Xabar beruvchi — arizachi; pasporti sr.ihma.uz dan. Pasport yo'q bo'lsagina maydonlar ko'rsatiladi.
function xabarBeruvchiniQoy(a, turlar) {
  const m = a.members.find((x) => x.isApplicant);
  state.xabar = m || null;
  state.turi = avtoTuri(turlar);
  const turiNomi = (turlar.find((x) => x.id === state.turi) || {}).name || "—";
  const seriya = (m && m.passportSeries) || "", raqam = (m && m.passportNo) || "";
  document.querySelector("[name=pasport_seriya]").value = seriya;
  document.querySelector("[name=pasport_raqam]").value = raqam;
  const pasportYoq = !!m && !(seriya && raqam);
  $("#pasportBox1").hidden = $("#pasportBox2").hidden = !pasportYoq;
  $("#xabarInfo").className = `note${!m || pasportYoq ? " warn" : ""}`;
  $("#xabarInfo").textContent = !m ? "Arizada arizachi topilmadi — bu arizani yuborib bo'lmaydi"
    : `Xabar beruvchi: ${m.fullName} · ${turiNomi} · ` +
      (pasportYoq ? "pasporti sr.ihma.uz da yo'q — pastda qo'lda kiriting" : `pasport ${seriya} ${raqam}`);
}

function xabarniTozala() {
  state.xabar = state.turi = null;
  $("#pasportBox1").hidden = $("#pasportBox2").hidden = true;
  $("#xabarInfo").className = "note";
  $("#xabarInfo").textContent = "Ariza yuklanganda xabar beruvchi avtomatik tanlanadi";
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
  if (!state.xabar) return formMsg("Arizada arizachi topilmadi — xabar beruvchini aniqlab bo'lmadi", "error");
  const sel = (id) => $(id).selectedOptions[0];
  const fd = new FormData($("#form"));
  fd.set("ariza_id", a.id);
  fd.set("xabar_beruvchi", String(state.xabar.personId));
  fd.set("xabar_beruvchi_turi_id", state.turi != null ? String(state.turi) : "");
  fd.set("murojaat_sanasi", new Date().toLocaleDateString("sv-SE"));
  fd.set("telefon", formatPhone(fd.get("telefon")));
  fd.set("sabab_nomi", $("#sabab").value ? sel("#sabab").textContent : "");
  fd.set("yangi_manzil_nomi", C.mahalla.value ? `${C.mahalla.text}, ${C.tuman.text}` : "");

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
    for (const c of Object.values(C)) c.setItems([]);
    $("#pdfInfo").className = "docx-status";
    $("#pdfInfo").textContent = "Fayl tanlanmagan";
    xabarniTozala();
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
$("#btnPinfl").addEventListener("click", pinflBoyichaYukla);
$("#pinflQidir").addEventListener("keydown", (e) => e.key === "Enter" && pinflBoyichaYukla());
$("#token").addEventListener("input", tokenHolati);
$("#cf").addEventListener("input", tokenHolati);
$("#showTokens").addEventListener("change", (e) => {
  for (const id of ["#token", "#cf"]) $(id).type = e.target.checked ? "text" : "password";
});
const C = {
  viloyat: new Combo($("#viloyat"), (id) => tumanlarniYukla(id).catch((x) => { $("#sameWarn").textContent = x.message; })),
  tuman: new Combo($("#tuman"), (id) => mahallalarniYukla(id).catch((x) => { $("#sameWarn").textContent = x.message; })),
  mahalla: new Combo($("#mahalla"), birXilmi),
};
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

tarixniYukla();
olish(); // sahifa ochilganda kengaytmadan tokenlarni so'raymiz
