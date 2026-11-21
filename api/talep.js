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
  const text = "Yeni özel umre teklif talebi (gustovaturizm.com/ozel-umre)\n\n" +
    satirlar.map(([et, d]) => et + ": " + d).join("\n");
  const telLink = "tel:" + v.tel.replace(/[^\d+]/g, "");
  const waNo = v.tel.replace(/\D/g, "").replace(/^0/, "90");
  const html =
    '<div style="font-family:Arial,sans-serif;font-size:15px;color:#111">' +
    "<p><b>Yeni özel umre teklif talebi</b> (gustovaturizm.com/ozel-umre)</p>" +
    '<table cellpadding="6" style="border-collapse:collapse">' +
    satirlar.map(([et, d]) =>
      '<tr><td style="color:#666;vertical-align:top;white-space:nowrap">' + kacis(et) +
      '</td><td style="white-space:pre-wrap">' + kacis(d) + "</td></tr>").join("") +
    "</table>" +
    '<p><a href="' + kacis(telLink) + '">Ara</a> · <a href="https://wa.me/' + kacis(waNo) + '">WhatsApp</a></p></div>';

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
