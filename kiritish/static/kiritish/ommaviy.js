// Ommaviy rejim: fuqarolar_royxati.xlsx (build.py) + dalolatnoma PDF'lari -> Excel'ga o'xshash jadval.
// Har bir qator: T/r, PINFL, ariza ID, yangi viloyat / tuman / mahalla, PDF (qo'lda tanlanadi) va "Yuborish".
// Qolganlari avtomatik: murojaatchi — arizachi (pasporti sr.ihma.uz dan), telefon, sana, izoh.
// Yordamchilar (el, call, Combo, lotin, ...) app.js da.
"use strict";

(() => {
  const om = { qatorlar: [], viloyatlar: null, tumanlar: new Map(), mahallalar: new Map() };
  const MB = 1024 * 1024;

  // ---------- tablar: "/" — bitta fuqaro, "/ommaviy/" — ommaviy ----------
  function tabOch(nom) {
    for (const t of document.querySelectorAll(".tab")) t.classList.toggle("active", t.dataset.tab === nom);
    $("#tab-bitta").hidden = nom !== "bitta";
    $("#tab-ommaviy").hidden = nom !== "ommaviy";
  }
  // sarlavhadagi havolalar sahifani qayta yuklamaydi — kiritilgan ma'lumotlar saqlanib qoladi
  for (const b of document.querySelectorAll(".tab")) {
    b.addEventListener("click", (e) => {
      if (e.ctrlKey || e.metaKey || e.shiftKey) return; // yangi tabda ochish
      e.preventDefault();
      tabOch(b.dataset.tab);
      if (location.pathname !== b.getAttribute("href")) history.pushState(null, "", b.getAttribute("href"));
    });
  }
  const urlTab = () => tabOch(location.pathname.startsWith("/ommaviy") ? "ommaviy" : "bitta");
  window.addEventListener("popstate", urlTab); // brauzerning "orqaga" tugmasi
  urlTab();

  // ---------- yordamchilar ----------
  // "Қўрғонтепа тумани" va "Kurgontepa", "Чорвадор МФЙ" va "Чорвадор маҳалла фуқаролар йиғини" bir xil kalitga keladi.
  // "shahar/shahri" olib tashlanmaydi: "Андижон шаҳри" va "Андижон тумани" farqlanishi kerak.
  function nomKaliti(s) {
    const t = lotin(s).toLowerCase()
      .replace(/\([^)]*\)/g, " ")
      .replace(/\b(mahalla|qishloq|ovul) fuqarolar yig\S?ini\b/g, " ")
      .replace(/\b(shahar|shahri|shaxar|shaxri)\b/g, " shahar ")
      .replace(/\b(tumani|viloyati|respublikasi|mfy|mahallasi|mahalla|kfy|qfy)\b/g, " ");
    return qidiruvKaliti(t).replace(/\s+/g, ""); // "Дўнг қишлоқ" = "Дўнғқишлоқ"
  }

  // nomga mos keladiganlar: aniq moslar bo'lsa — faqat ular, aks holda qisman moslar
  function mosNomlar(items, nom) {
    const k = nomKaliti(nom);
    if (!k) return [];
    const keyed = items.map((it) => ({ it, k: nomKaliti(it.name) }));
    const exact = keyed.filter((x) => x.k === k);
    return (exact.length ? exact : keyed.filter((x) => x.k && (x.k.includes(k) || k.includes(x.k)))).map((x) => x.it);
  }

  function nomBoyichaTop(items, nom) {
    const m = mosNomlar(items, nom);
    return m.length === 1 ? m[0] : null;
  }

  // dalolatnomadan o'qilgan yangi manzil: tuman va mahalla nomi
  // (eski Excel ro'yxatlari uchun: "Tuman, [qishloq,] Mahalla[, ko'cha]")
  function excelManzil(r) {
    if ("yangi_tuman" in r) return { tumNomi: r.yangi_tuman || "", mahNomi: r.yangi_mahalla || "" };
    const qism = String(r.yangi_manzil || "").split(",").map((s) => s.trim()).filter(Boolean);
    return { tumNomi: qism.length > 1 ? qism[0] : "", mahNomi: r.yangi_mahalla || qism[qism.length - 1] || "" };
  }

  // "22.09.2026" -> "2026-09-22"
  function isoSana(s) {
    const m = String(s || "").match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
    return m ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : "";
  }

  // "AA 1234567" -> ["AA", "1234567"]
  function pasport(s) {
    const m = String(s || "").toUpperCase().replace(/\s+/g, "").match(/^([A-Z]{2})(\d{7})$/);
    return m ? [m[1], m[2]] : ["", ""];
  }

  function omMsg(text, kind = "") {
    $("#omMsg").className = `form-msg ${kind}`;
    $("#omMsg").textContent = text;
  }

  const saqla = (k, v) => { try { localStorage.setItem(k, v); } catch { /* muhim emas */ } };
  const oqi = (k) => { try { return localStorage.getItem(k) || ""; } catch { return ""; } };

  async function viloyatlar() {
    if (!om.viloyatlar) om.viloyatlar = await call("/api/viloyatlar/");
    return om.viloyatlar;
  }
  async function tumanlar(id) {
    if (!om.tumanlar.has(id)) om.tumanlar.set(id, await call(`/api/tumanlar/${id}/`));
    return om.tumanlar.get(id);
  }
  async function mahallalar(id) {
    if (!om.mahallalar.has(id)) om.mahallalar.set(id, await call(`/api/mahallalar/${id}/`));
    return om.mahallalar.get(id);
  }
  // barcha viloyatlarning tumanlari, viloyat ID si bilan (bir marta yuklanadi)
  async function barchaTumanlar() {
    if (!om.barchaTumanlar) {
      const vil = await viloyatlar();
      const royxat = await Promise.all(vil.map((v) => tumanlar(v.id)));
      om.barchaTumanlar = vil.flatMap((v, i) => royxat[i].map((t) => ({ ...t, regionId: v.id })));
    }
    return om.barchaTumanlar;
  }

  // ---------- fayllar ----------
  $("#omZipBtn").addEventListener("click", () => $("#omZip").click());
  $("#omZip").addEventListener("change", (e) => {
    const f = e.target.files[0];
    $("#omZipInfo").className = `docx-status ${f ? "ok" : ""}`;
    $("#omZipInfo").textContent = f ? `${f.name} · ${(f.size / MB).toFixed(1)} MB` : "ZIP tanlanmagan";
  });

  // qatordagi "PDF" tugmasi bilan tanlangan fayl
  function pdfTanla(q, f) {
    if (q.pdfUrl) URL.revokeObjectURL(q.pdfUrl);
    q.pdf = f || null;
    q.pdfUrl = f ? URL.createObjectURL(f) : "";
    const info = q.dom.pdfInfo;
    if (!f) {
      info.className = "om-pdf";
      info.textContent = "tanlanmagan";
    } else {
      const big = f.size > MB;
      info.className = `om-pdf ${big ? "err" : "ok"}`;
      info.replaceChildren(`${f.name} · ${(f.size / 1024).toFixed(0)} KB${big ? " — 1 MB dan katta" : ""}`,
        el("a", { href: q.pdfUrl, target: "_blank" }, "ko'rish"));
    }
    tayyorlik(q);
  }

  $("#omSabab").addEventListener("change", (e) => { saqla("om.sabab", e.target.value); hammasiTayyorlik(); });
  $("#omTuri").addEventListener("change", (e) => { saqla("om.turi", e.target.value); hammasiTayyorlik(); });

  function umumiyRoyxatlar(r) {
    if ($("#omSabab").options.length > 1) return;
    // sabab: variant bitta bo'lsa — o'zi tanlanadi, aks holda oxirgi tanlov eslab qolinadi
    const s = r.sabablar, v = oqi("om.sabab");
    options($("#omSabab"), s, s.length === 1 ? s[0].id : null);
    if (s.length > 1 && v && s.some((x) => String(x.id) === v)) $("#omSabab").value = v;
    // xabar beruvchi turi — "Bitta fuqaro" bo'limidagi qoida bilan (app.js: avtoTuri)
    options($("#omTuri"), r.xabar_beruvchi_turlari, avtoTuri(r.xabar_beruvchi_turlari));
  }

  // ZIP -> server har bir PDF'ni o'qiydi (OCR) -> jadval; PDF'lar (nomlangan, siqilgan) qatorlarga biriktiriladi
  $("#omYukla").addEventListener("click", async () => {
    const f = $("#omZip").files[0];
    if (!f) return toast("Avval ZIP faylni tanlang", "error");
    const fd = new FormData();
    fd.append("zip", f);
    $("#omYukla").disabled = true;
    $("#omNatija").hidden = true;
    omMsg("");
    try {
      $("#omHolat").textContent = "ZIP yuklanmoqda…";
      const z = await call("/api/zip/", { method: "POST", body: fd });
      const rows = new Array(z.fayllar.length);
      let tayyor = 0, navbat = 0;
      const ishchi = async () => {
        while (navbat < z.fayllar.length) {
          const fl = z.fayllar[navbat++];
          try {
            rows[fl.n] = await call(`/api/zip/${z.id}/${fl.n}/`, { method: "POST" });
          } catch (e) {
            rows[fl.n] = { fish: "", asl_nom: fl.nom, izoh: e.message, yangi_tuman: "", yangi_mahalla: "" };
          }
          $("#omHolat").textContent = `PDF'lar o'qilmoqda (OCR) ${++tayyor}/${z.fayllar.length}…`;
        }
      };
      await Promise.all([ishchi(), ishchi()]); // OCR og'ir — bir vaqtda 2 tadan

      om.qatorlar = rows.map(qatorYarat);
      $("#omQatorlar").replaceChildren(...om.qatorlar.map((q) => q.dom.tr));
      await Promise.all(om.qatorlar.map(async (q) => {
        if (!q.r.pdf_url) return tayyorlik(q);
        const blob = await (await fetch(q.r.pdf_url)).blob();
        pdfTanla(q, new File([blob], q.r.pdf, { type: "application/pdf" }));
      }));
      $("#omNatija").href = `/api/zip/${z.id}/natija/`;
      $("#omNatija").hidden = false;
      $("#omHolat").textContent = `${rows.length} ta dalolatnoma o'qildi`;
    } catch (e) {
      $("#omHolat").textContent = "";
      toast(e.message, "error");
      return;
    } finally {
      $("#omYukla").disabled = false;
    }
    // token bo'lsa: avval yangi manzillar, keyin arizalar
    if (tokenHolati()) toliqYukla();
    else omMsg("Manzil va arizalar uchun avval \"sr.ihma.uz dan olish\" ni bosing, keyin \"Arizalarni qidirish\" ni", "error");
  });

  async function toliqYukla() {
    $("#omQidir").disabled = true;
    try {
      await manzillarniTop();
      await hammasiniQidir();
    } catch (e) {
      omMsg(e.message, "error");
    } finally {
      $("#omQidir").disabled = false;
    }
  }

  // ---------- yangi manzil (arizaga bog'liq emas) ----------
  async function joyQoy(q, vilId, tumId = null, mahId = null) {
    q.C.vil.setItems(await viloyatlar(), vilId);
    q.C.tum.setItems(vilId ? await tumanlar(vilId) : [], tumId);
    q.C.mah.setItems(tumId ? await mahallalar(tumId) : [], mahId);
    tayyorlik(q);
  }

  // Excel'dagi nomlar bo'yicha viloyat/tuman/mahallani topib qo'yadi; topilgan viloyat ID sini qaytaradi.
  // asosiyVil — ro'yxatdagi ko'pchilikning viloyati: bir xil nomli tumanlarni ajratish va
  // tumani ko'rsatilmagan mahallani shu viloyat bo'ylab qidirish uchun.
  async function manzilniTop(q, asosiyVil = null) {
    const { tumNomi, mahNomi } = excelManzil(q.r);
    const hamma = await barchaTumanlar();
    let tumlar = tumNomi ? mosNomlar(hamma, tumNomi) : [];
    if (tumlar.length > 1 && asosiyVil) tumlar = tumlar.filter((t) => t.regionId === asosiyVil);
    let tum = tumlar.length === 1 ? tumlar[0] : null, mah = null;
    if (tum) {
      mah = nomBoyichaTop(await mahallalar(tum.id), mahNomi);
    } else if (asosiyVil && mahNomi) {
      const vt = hamma.filter((t) => t.regionId === asosiyVil);
      const royxat = await Promise.all(vt.map((t) => mahallalar(t.id)));
      const topilgan = vt.flatMap((t, i) => mosNomlar(royxat[i], mahNomi).map((m) => ({ t, m })));
      if (topilgan.length === 1) ({ t: tum, m: mah } = topilgan[0]);
    }
    if (!tum) return null;
    await joyQoy(q, tum.regionId, tum.id, mah ? mah.id : null);
    return tum.regionId;
  }

  async function manzillarniTop() {
    const qs = om.qatorlar.filter((q) => !q.yuborildi && !q.C.mah.value);
    const sanoq = new Map(), keyin = [];
    for (const [i, q] of qs.entries()) {
      $("#omHolat").textContent = `Yangi manzillar aniqlanmoqda ${i + 1}/${qs.length}…`;
      const v = excelManzil(q.r).tumNomi ? await manzilniTop(q) : null;
      if (v) sanoq.set(v, (sanoq.get(v) || 0) + 1);
      else keyin.push(q);
    }
    om.asosiyViloyat = [...sanoq].sort((a, b) => b[1] - a[1])[0]?.[0] ?? om.asosiyViloyat ?? null;
    for (const q of keyin) {
      if (!(await manzilniTop(q, om.asosiyViloyat))) await joyQoy(q, om.asosiyViloyat); // kamida viloyat to'lsin
    }
  }

  // ---------- jadval qatori ----------
  function qatorYarat(r, i) {
    const q = { r, ariza: null, pdf: null, yuborildi: false, oldingi: null, band: false, xato: "" };
    const d = {};
    d.pinfl = el("input", { type: "text", class: "pinfl-input", maxlength: "14", inputmode: "numeric", placeholder: "PINFL" });
    d.pinfl.value = r.pinfl || "";
    d.id = el("input", { type: "text", inputmode: "numeric", placeholder: "ID" });
    d.tanlov = el("select", { hidden: "" });
    d.holat = el("span", { class: "om-holat" });
    d.send = el("button", { type: "button", class: "btn btn-primary" }, "Yuborish");
    d.pdfInput = el("input", { type: "file", accept: "application/pdf,.pdf", hidden: "" });
    d.pdfBtn = el("button", { type: "button", class: "btn btn-pdf", title: r.asl_nom ? `ZIP'da: ${r.asl_nom}` : "" }, "Almashtirish");
    d.pdfInfo = el("span", { class: "om-pdf" }, "tanlanmagan");
    const combo = (ph) => el("div", { class: "combo", "data-placeholder": ph });
    d.vil = combo("Viloyat");
    d.tum = combo("Tuman");
    d.mah = combo("Mahalla");
    d.tdVil = el("td", {}, d.vil);
    d.tdTum = el("td", {}, d.tum);
    d.tdMah = el("td", {}, d.mah);

    d.tr = el("tr", {},
      el("td", { class: "tr" }, String(i + 1)),
      el("td", {}, d.pinfl,
        el("span", { class: "fish", title: [r.hozirgi_mahalla && `Hozirgi: ${r.hozirgi_mahalla}`,
          r.yangi_manzil && `Yangi: ${r.yangi_manzil}`, r.dalolatnoma_sanasi && `Dalolatnoma: ${r.dalolatnoma_sanasi}`]
          .filter(Boolean).join("\n") }, r.fish || `(ism o'qilmadi) ${r.asl_nom || ""}`),
        r.izoh ? el("span", { class: "om-ocr" }, r.izoh) : null),
      el("td", {}, d.id, d.tanlov),
      d.tdVil, d.tdTum, d.tdMah,
      el("td", {}, d.pdfBtn, d.pdfInput, d.pdfInfo),
      el("td", {}, d.send, d.holat));

    q.dom = d;
    q.C = {
      vil: new Combo(d.vil, (id) => tumanTanla(q, id)),
      tum: new Combo(d.tum, (id) => mahallaTanla(q, id)),
      mah: new Combo(d.mah, () => tayyorlik(q)),
    };
    for (const inp of [d.pinfl, d.id]) {
      inp.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); inp.blur(); } });
    }
    // PINFL qo'lda kiritilsa/o'zgartirilsa — ariza shu PINFL bo'yicha qayta qidiriladi
    d.pinfl.addEventListener("change", () => {
      r.pinfl = d.pinfl.value.trim();
      if (tokenHolati()) qidir(q);
    });
    d.id.addEventListener("change", () => arizaYukla(q));
    d.tanlov.addEventListener("change", () => { d.id.value = d.tanlov.value; arizaYukla(q); });
    d.pdfBtn.addEventListener("click", () => d.pdfInput.click());
    d.pdfInput.addEventListener("change", () => pdfTanla(q, d.pdfInput.files[0]));
    d.send.addEventListener("click", async () => {
      if (!umumiyTayyormi() || !(await tasdiqla(tasdiqMatni([q])))) return;
      await yubor(q);
      tarixniYukla();
    });
    return q;
  }

  function holat(q, text, kind = "") {
    q.dom.holat.className = `om-holat ${kind}`;
    q.dom.holat.textContent = text;
  }

  function comboYoq(q, yoq) {
    for (const td of [q.dom.tdVil, q.dom.tdTum, q.dom.tdMah]) td.classList.toggle("disabled", !yoq);
  }

  async function tumanTanla(q, id) {
    q.C.tum.setLoading();
    q.C.mah.setItems([]);
    try {
      q.C.tum.setItems(id ? await tumanlar(id) : []);
    } catch (e) {
      q.C.tum.setItems([]);
      q.xato = e.message;
    }
    tayyorlik(q);
  }

  async function mahallaTanla(q, id) {
    q.C.mah.setLoading();
    try {
      q.C.mah.setItems(id ? await mahallalar(id) : []);
    } catch (e) {
      q.C.mah.setItems([]);
      q.xato = e.message;
    }
    tayyorlik(q);
  }

  // murojaatchi — arizachi; bo'lmasa Excel'dagi fuqaroning o'zi. Pasport sr.ihma.uz dan, bo'lmasa Excel'dan.
  function murojaatchi(q) {
    const a = q.ariza;
    const m = a.members.find((x) => x.isApplicant) || a.members.find((x) => x.pinFL === q.r.pinfl);
    if (!m) return null;
    let [seriya, raqam] = [m.passportSeries || "", m.passportNo || ""];
    if ((!seriya || !raqam) && m.pinFL === q.r.pinfl) [seriya, raqam] = pasport(q.r.pasport);
    return { m, seriya, raqam };
  }

  // ariza faqat PINFL bo'yicha qidiriladi; PINFL yo'q qatorlar bo'sh qoladi (mahallasi baribir tanlanadi)
  async function qidir(q) {
    const pinfl = String(q.r.pinfl || "");
    q.dom.tanlov.hidden = true;
    if (!pinfl) {
      holat(q, "PINFL yo'q");
      return false;
    }
    if (!/^\d{14}$/.test(pinfl)) {
      holat(q, "PINFL 14 ta raqam bo'lishi kerak", "err");
      return false;
    }
    holat(q, "ariza qidirilmoqda…");
    try {
      const list = await call(`/api/ariza-qidir/?pinfl=${pinfl}`);
      if (list.length === 1) {
        q.dom.id.value = list[0].id;
        return arizaYukla(q);
      }
      if (!list.length) {
        holat(q, "ariza topilmadi — ID ni qo'lda yozing", "err");
        return false;
      }
      q.dom.tanlov.replaceChildren(el("option", { value: "" }, `${list.length} ta ariza — tanlang`),
        ...list.map((x) => el("option", { value: String(x.id) }, `${x.raqam || x.id} · ${x.holat} · ${x.sana}`)));
      q.dom.tanlov.hidden = false;
      holat(q, "bir nechta ariza topildi — tanlang", "warn");
    } catch (e) {
      holat(q, e.message, "err");
    }
    return false;
  }

  async function arizaYukla(q) {
    const id = q.dom.id.value.trim();
    if (!id) return false;
    if (!/^\d+$/.test(id)) { holat(q, "Ariza ID raqam bo'lishi kerak", "err"); return false; }
    if (!tokenHolati()) { holat(q, "tokenlar yo'q — \"sr.ihma.uz dan olish\" ni bosing", "err"); return false; }
    q.ariza = null;
    q.xato = "";
    holat(q, "ariza yuklanmoqda…");
    try {
      const res = await call(`/api/ariza/${id}/`);
      const a = q.ariza = res.ariza, adr = a.address;
      q.oldingi = res.oldingi;
      umumiyRoyxatlar(res.royxatlar);
      q.dom.tr.title = `Arizachi: ${a.applicantName}\nHozirgi manzil: ${adr.locality}, ${adr.district}, ${adr.region}`;

      // yangi manzil Excel'dan topilmagan bo'lsa — mahalla arizadagi tuman ichidan qidiriladi
      if (!q.C.mah.value && !q.C.tum.value) {
        const mah = nomBoyichaTop(await mahallalar(adr.districtId), excelManzil(q.r).mahNomi);
        await joyQoy(q, adr.regionId, adr.districtId, mah ? mah.id : null);
      }
      tayyorlik(q);
      return true;
    } catch (e) {
      q.ariza = null;
      holat(q, e.message, "err");
      return false;
    }
  }

  // qator yuborishga tayyormi; tayyor bo'lmasa — nima yetishmasligi
  function kamchiliklar(q) {
    const k = [];
    if (!q.ariza) return ["ariza yuklanmagan"];
    if (!q.C.mah.value) k.push("yangi mahalla tanlanmagan");
    else if (q.C.mah.value === q.ariza.address.localityId) k.push("yangi mahalla hozirgisi bilan bir xil");
    const mj = murojaatchi(q);
    if (!mj) k.push("arizachi topilmadi");
    else if (!mj.seriya || !mj.raqam) k.push("arizachining pasporti sr.ihma.uz da yo'q");
    if (!q.pdf) k.push("PDF tanlanmagan");
    else if (q.pdf.size > MB) k.push(`PDF ${(q.pdf.size / MB).toFixed(1)} MB — 1 MB dan katta`);
    return k;
  }

  // jadval ustidagi umumiy tanlovlar; bo'sh bo'lsa xabar beradi
  function umumiyTayyormi() {
    const k = [];
    if (!$("#omSabab").value) k.push("o'zgartirish sababi");
    if (!$("#omTuri").value) k.push("xabar beruvchi turi");
    if (k.length) omMsg(`Jadval ustida ${k.join(" va ")}ni tanlang`, "error");
    return !k.length;
  }

  function tayyorlik(q) {
    if (q.yuborildi || q.band) return;
    if (!q.ariza) {
      q.dom.send.disabled = true;
      if (!q.dom.holat.textContent) holat(q, "ariza kutilmoqda");
      return;
    }
    const k = kamchiliklar(q);
    q.dom.send.disabled = k.length > 0;
    if (q.xato) holat(q, q.xato, "err");
    else if (k.length) holat(q, k.join("\n"), "warn");
    else if (q.oldingi) holat(q, `oldin yuborilgan (${q.oldingi.sana})`, "warn");
    else holat(q, "tayyor", "ok");
  }

  const hammasiTayyorlik = () => om.qatorlar.forEach(tayyorlik);

  function tasdiqMatni(qs) {
    return el("div", {},
      el("div", { class: "who" }, `${qs.length} ta murojaat sr.ihma.uz ga yuboriladi`),
      ...qs.map((q) => el("div", { class: "route", style: "margin-bottom:8px" },
        el("div", {}, el("b", {}, q.r.fish), el("br"), `${q.ariza.address.locality}, ${q.ariza.address.district}`),
        el("span", {}, "→"),
        el("div", { class: "to" }, `${q.C.mah.text}, ${q.C.tum.text}`))),
      el("div", { class: "note warn" }, "Davom etilsinmi?"));
  }

  async function yubor(q) {
    if (q.band || q.yuborildi) return false;
    const k = kamchiliklar(q);
    if (k.length) { holat(q, k.join("\n"), "err"); return false; }
    const mj = murojaatchi(q);

    const fd = new FormData();
    fd.set("ariza_id", q.ariza.id);
    fd.set("yangi_mahalla_id", q.C.mah.value);
    fd.set("yangi_manzil_nomi", `${q.C.mah.text}, ${q.C.tum.text}`);
    fd.set("sabab_id", $("#omSabab").value);
    fd.set("sabab_nomi", $("#omSabab").selectedOptions[0].textContent);
    fd.set("xabar_beruvchi_turi_id", $("#omTuri").value);
    fd.set("xabar_beruvchi", String(mj.m.personId));
    fd.set("pasport_seriya", mj.seriya);
    fd.set("pasport_raqam", mj.raqam);
    fd.set("telefon", formatPhone(q.r.telefon) || formatPhone(q.ariza.applicantMobileNumber) || DEFAULT_PHONE);
    fd.set("murojaat_sanasi", isoSana(q.r.dalolatnoma_sanasi) || new Date().toLocaleDateString("sv-SE"));
    fd.set("izoh", kochishIzohi(q.C.mah.text));
    fd.set("pdf", q.pdf, q.pdf.name);

    q.band = true;
    q.dom.send.disabled = true;
    comboYoq(q, false);
    holat(q, "yuborilmoqda…");
    try {
      const res = await call("/api/yuborish/", { method: "POST", body: fd });
      q.yuborildi = true;
      q.dom.tr.classList.add("sent");
      q.dom.id.disabled = true;
      q.dom.pdfBtn.disabled = true;
      q.dom.send.textContent = "Yuborildi";
      holat(q, `ID ${res.ozgartirish_id}`, "ok");
      return true;
    } catch (e) {
      holat(q, e.message, "err");
      q.dom.send.disabled = false;
      comboYoq(q, true);
      return false;
    } finally {
      q.band = false;
    }
  }

  // ---------- hammasi uchun ----------
  async function hammasiniQidir() {
    const qs = om.qatorlar.filter((q) => !q.ariza && !q.yuborildi);
    for (const [i, q] of qs.entries()) {
      $("#omHolat").textContent = `Arizalar qidirilmoqda ${i + 1}/${qs.length}…`;
      await (q.dom.id.value.trim() ? arizaYukla(q) : qidir(q));
    }
    const ariza = om.qatorlar.filter((q) => q.ariza).length, manzil = om.qatorlar.filter((q) => q.C.mah.value).length;
    $("#omHolat").textContent = `${om.qatorlar.length} ta fuqaro · ariza: ${ariza} ta · mahalla: ${manzil} ta`;
  }

  // topilmay qolganlar uchun qayta: manzil va ariza
  $("#omQidir").addEventListener("click", () => {
    if (!om.qatorlar.length) return toast("Avval ro'yxatni yuklang", "error");
    if (tokenHolati()) { omMsg(""); toliqYukla(); }
  });

  $("#omSendAll").addEventListener("click", async () => {
    if (!om.qatorlar.length) return toast("Avval ro'yxatni yuklang", "error");
    if (!tokenHolati() || !umumiyTayyormi()) return;
    // oldin yuborilgan xonadonlar ommaviy yuborishga kirmaydi — ularni qatordagi tugma bilan yuborish mumkin
    const qs = om.qatorlar.filter((q) => !q.yuborildi && !q.oldingi && q.ariza && !kamchiliklar(q).length);
    const qolgan = om.qatorlar.filter((q) => !q.yuborildi).length - qs.length;
    if (!qs.length) return omMsg("Yuborishga tayyor qator yo'q — jadvaldagi izohlarni o'qing", "error");
    if (!(await tasdiqla(tasdiqMatni(qs)))) return;

    $("#omSendAll").disabled = true;
    let ok = 0;
    for (const [i, q] of qs.entries()) {
      omMsg(`Yuborilmoqda ${i + 1}/${qs.length}: ${q.r.fish}…`);
      if (await yubor(q)) ok++;
    }
    $("#omSendAll").disabled = false;
    const xatolar = qs.length - ok;
    omMsg(`Yuborildi: ${ok} ta${xatolar ? ` · xato: ${xatolar} ta` : ""}${qolgan ? ` · tayyor emas: ${qolgan} ta` : ""}`,
      xatolar || qolgan ? "error" : "ok");
    toast(`Yuborildi: ${ok}/${qs.length}`, xatolar ? "error" : "success");
    tarixniYukla();
  });
})();
