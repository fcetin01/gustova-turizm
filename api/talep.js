// Özel umre teklif formu → e-posta (Resend).
// Vercel ortam değişkenleri:
//   RESEND_API_KEY  (zorunlu, secret) — jerseyprintfactory.com'un doğrulandığı Resend hesabından
//   FORM_TO         (isteğe bağlı) — virgülle ayrılmış alıcılar; varsayılan info@gustovaturizm.com
//   FORM_FROM       (isteğe bağlı) — varsayılan "GUSTOVA Form <form@jerseyprintfactory.com>"

const ALANLAR = [
  ["ad", "Ad soyad"],
  ["tel", "Telefon"],
  ["program", "Program"],
  ["gidis", "Gidiş"],
  ["tarih_iso", "Gidiş tarihi (ISO)"],
  ["kisi", "Kişi"],
  ["kalkis", "Kalkış"],
  ["havayolu", "Havayolu"],
  ["yemek", "Otelde yemek"],
  ["oda", "Mekke oda"],
  ["tren", "Tren"],
  ["otel", "Otel"],
  ["ek", "Ek"],
  ["not", "Not"],
  ["kaynak", "Kaynak"],
];

function temiz(s, max) {
  return String(s == null ? "" : s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").trim().slice(0, max);
}
function kacis(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false });
  }

  let b = req.body;
  if (typeof b === "string") { try { b = JSON.parse(b); } catch (e) { b = null; } }
  if (!b || typeof b !== "object") return res.status(400).json({ ok: false, hata: "gecersiz" });

  // Bot tuzağı: gizli alan dolu ya da form 3 sn'den kısa sürede gönderildiyse sessizce "tamam" de.
  if (temiz(b.web, 200) || (Number(b.sure) > 0 && Number(b.sure) < 3000)) {
    return res.status(200).json({ ok: true });
  }

  const v = {};
  for (const [k] of ALANLAR) v[k] = temiz(b[k], k === "not" ? 1500 : 300);
  if (!v.ad || v.tel.replace(/\D/g, "").length < 10 || !v.gidis) {
    return res.status(400).json({ ok: false, hata: "eksik" });
  }

  const key = process.env.RESEND_API_KEY;
  if (!key) return res.status(503).json({ ok: false, hata: "yapilandirma" });

  const to = (process.env.FORM_TO || "info@gustovaturizm.com").split(",").map((s) => s.trim()).filter(Boolean);
  const from = process.env.FORM_FROM || "GUSTOVA Form <form@jerseyprintfactory.com>";

  const satirlar = ALANLAR.filter(([k]) => v[k]).map(([k, et]) => [et, v[k]]);
  // Yapay zekâya yapıştırılacak blok: /umre-teklif komutu + talep alanları (çok satırlı düz metin)
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(v.tarih_iso) ? v.tarih_iso : "";
  const blokSatir = [
    ["Ad", v.ad], ["Telefon", v.tel], ["Program", v.program],
    ["Gidiş tarihi", (iso || v.gidis) + (v.gidis && iso ? " (" + (v.gidis.split("esneklik:")[1] || "").trim() + ")" : "")],
    ["Kişi", v.kisi], ["Kalkış", v.kalkis], ["Havayolu", v.havayolu], ["Tren", v.tren],
    ["Otelde yemek", v.yemek], ["Mekke oda", v.oda], ["Otel", v.otel], ["Ek", v.ek],
    ["Not", v.not.replace(/\s+/g, " ")], ["Kaynak", v.kaynak],
  ].filter(([, d]) => d);
  const blok = "/umre-teklif\n" + blokSatir.map(([et, d]) => et + ": " + d).join("\n");
  const text = "Yeni özel umre teklif talebi (gustovaturizm.com/ozel-umre)\n\n" +
    satirlar.filter(([et]) => et !== "Gidiş tarihi (ISO)").map(([et, d]) => et + ": " + d).join("\n") +
    "\n\n----- Yapay zekâya yapıştır (hızlı teklif) -----\n" + blok + "\n-----";
  const telLink = "tel:" + v.tel.replace(/[^\d+]/g, "");
  const waNo = v.tel.replace(/\D/g, "").replace(/^0/, "90");
  const html =
    '<div style="font-family:Arial,sans-serif;font-size:15px;color:#111">' +
    "<p><b>Yeni özel umre teklif talebi</b> (gustovaturizm.com/ozel-umre)</p>" +
    '<table cellpadding="6" style="border-collapse:collapse">' +
    satirlar.filter(([et]) => et !== "Gidiş tarihi (ISO)").map(([et, d]) =>
      '<tr><td style="color:#666;vertical-align:top;white-space:nowrap">' + kacis(et) +
      '</td><td style="white-space:pre-wrap">' + kacis(d) + "</td></tr>").join("") +
    "</table>" +
    '<p><a href="' + kacis(telLink) + '">Ara</a> · <a href="https://wa.me/' + kacis(waNo) + '">WhatsApp</a></p>' +
    '<p style="margin:22px 0 6px;font-weight:bold;color:#1F3858">🤖 Hızlı teklif — bu kutunun tamamını kopyalayıp GUSTOVA Claude oturumuna yapıştırın:</p>' +
    '<pre style="font:14px/1.5 Menlo,Consolas,monospace;background:#F3F1EA;border:1px solid #DED8C8;border-radius:10px;padding:14px;white-space:pre-wrap;margin:0">' +
    kacis(blok) + "</pre></div>";

  const konu = "Özel umre talebi — " + v.ad + (v.program ? " — " + v.program : "") + (v.gidis ? " — " + v.gidis : "");

  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: "Bearer " + key, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to, subject: konu.slice(0, 200), text, html }),
    });
    if (!r.ok) {
      console.error("Resend", r.status, (await r.text()).slice(0, 300));
      return res.status(502).json({ ok: false, hata: "gonderilemedi" });
    }
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error("Resend hata", e && e.message);
    return res.status(502).json({ ok: false, hata: "gonderilemedi" });
  }
};
